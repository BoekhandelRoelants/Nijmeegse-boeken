#!/usr/bin/env python3
"""
Importeert boekdata van Roelants.nl naar boeken.json en genereert
individuele boekpagina's in de map Boeken/.

Gebruik:
    pip3 install aiohttp beautifulsoup4 playwright playwright-stealth --break-system-packages
    python3 -m playwright install chromium
    python3 importeer_naar_json.py
    python3 importeer_naar_json.py 9789000000001 9789000000002
    python3 importeer_naar_json.py --bestand isbnlijst.txt

Bronnen (op volgorde van prioriteit):
  1. Roelants.nl          — titel, auteur, prijs, uitvoering, beschrijving
  2. Google Books API     — ondertitel, beschrijving (fallback)
  3. Open Library API     — ondertitel (fallback)

Na de import wordt automatisch Boeken/{slug}.html gegenereerd voor elk boek.
"""

import sys
import re
import json
import asyncio
import aiohttp
import unicodedata
from pathlib import Path
from bs4 import BeautifulSoup

# Playwright voor prijzen (laadt JavaScript)
try:
    from playwright.sync_api import sync_playwright
    from playwright_stealth import Stealth
    PLAYWRIGHT_BESCHIKBAAR = True
except ImportError:
    PLAYWRIGHT_BESCHIKBAAR = False
    print("⚠️  Playwright niet geïnstalleerd. Prijzen worden via statische HTML opgehaald.")
    print("   Installeer met: pip3 install playwright playwright-stealth --break-system-packages && python3 -m playwright install chromium")

# ─────────────────────────────────────────────
# INSTELLINGEN
# ─────────────────────────────────────────────
BASIS               = Path(__file__).parent
BOEKEN_JSON         = BASIS / "boeken.json"
BOEKEN_MAP          = BASIS / "Boeken"
GELIJKTIJDIG        = 2
VERTRAGING          = 3.0
VERTRAGING_PLAYWRIGHT = 4.0
TIMEOUT             = 15
MAX_POGINGEN        = 3

STANDAARD_CATEGORIE = "overig"
STANDAARD_KLEUR     = "#B21233"
# ─────────────────────────────────────────────

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


# ══════════════════════════════════════════════════════════
# SLUG GENERATIE
# ══════════════════════════════════════════════════════════

def genereer_slug(tekst: str) -> str:
    """Zet tekst om naar een URL-vriendelijke slug (lowercase, alleen a-z, 0-9, koppeltekens)."""
    tekst = unicodedata.normalize("NFKD", str(tekst or ""))
    tekst = tekst.encode("ascii", "ignore").decode("ascii")
    tekst = tekst.lower()
    tekst = re.sub(r"[^a-z0-9]+", "-", tekst)
    return tekst.strip("-")


def genereer_boek_slug(boek: dict) -> str:
    """
    Unieke slug voor een boek: titel (max 55 tekens) + eerste 10 cijfers van ISBN.
    Als er geen ISBN is: titel + boek-ID.
    Voorbeeld: 'nijmegen-twee-millennia-9789461055'
    """
    titel_slug = genereer_slug(boek.get("titel", "boek"))
    if len(titel_slug) > 55:
        knip = titel_slug[:55].rfind("-")
        titel_slug = titel_slug[:knip] if knip > 20 else titel_slug[:55]
    isbn = normaliseer_isbn(boek.get("isbn", ""))
    suffix = isbn[:10] if isbn else str(boek.get("id", ""))
    return f"{titel_slug}-{suffix}"


def wijs_slugs_toe(boeken: list[dict]) -> list[dict]:
    """
    Geeft een slug aan elk boek dat er nog geen heeft,
    en zorgt voor uniciteit door -2, -3 etc. toe te voegen bij conflicten.
    """
    gebruikte_slugs: dict[str, int] = {}

    # Registreer bestaande slugs eerst
    for b in boeken:
        if b.get("slug"):
            slug = b["slug"]
            gebruikte_slugs[slug] = gebruikte_slugs.get(slug, 0) + 1

    # Ken nieuwe slugs toe
    for b in boeken:
        if not b.get("slug"):
            basis = genereer_boek_slug(b)
            slug = basis
            teller = 2
            while slug in gebruikte_slugs:
                slug = f"{basis}-{teller}"
                teller += 1
            b["slug"] = slug
            gebruikte_slugs[slug] = 1

    return boeken


# ══════════════════════════════════════════════════════════
# HTML PAGINA GENERATIE
# ══════════════════════════════════════════════════════════

def _he(tekst) -> str:
    """HTML-attribuut escaping."""
    return str(tekst or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#x27;")


# HTML-template voor Boeken/{slug}.html
# Gebruikt ___PLACEHOLDER___ om conflicten met { } in CSS/JS te vermijden.
BOEK_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="../">
  <title>___TITEL_AUTEUR___ | Nijmeegse Boeken</title>
  <meta name="description" content="___BESCHRIJVING_KORT___">
  <link rel="canonical" href="https://nijmeegseboeken.nl/Boeken/___SLUG___.html">
  <meta property="og:title" content="___TITEL_AUTEUR___">
  <meta property="og:description" content="___BESCHRIJVING_KORT___">
  <meta property="og:type" content="book">
  <meta property="og:locale" content="nl_NL">
  ___OG_IMAGE_TAG___
  <script type="application/ld+json">___SCHEMA_JSON___</script>
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="preload" href="nijmegen.js" as="script">
  <link rel="preconnect" href="https://wscovers1.tlsecure.com">
  <link rel="stylesheet" href="nijmegen.css">
  <style>
    .detail-wrapper {
      max-width: 1200px;
      margin: 1.25rem auto 3rem;
      padding: 0 1.5rem;
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 2.5rem;
      align-items: start;
    }
    .cover-kolom { position: sticky; top: 70px; }
    .cover-groot {
      width: 100%;
      aspect-ratio: 2/3;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 4px 8px 24px rgba(0,0,0,0.18);
      margin-bottom: 1rem;
    }
    .cover-groot img { width: 100%; height: 100%; object-fit: cover; }
    .cover-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 0.75rem; padding: 1.5rem; text-align: center;
    }
    .btn-bestellen {
      display: block; width: 100%;
      background: var(--rood); color: white;
      border: none; border-radius: 6px;
      padding: 0.85rem 1.25rem;
      font-family: var(--font); font-size: 1rem; font-weight: 700;
      cursor: pointer; text-align: center; text-decoration: none;
      transition: background 0.15s; margin-bottom: 0.6rem;
    }
    .btn-bestellen:hover { background: var(--rood-donker); }
    .verzend-info { font-size: 0.78rem; color: var(--grijs-muted); text-align: center; line-height: 1.6; }
    .label-pill {
      border-radius: 20px; padding: 0.25rem 0.85rem;
      font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .label-nieuw { background: var(--rood); color: white; }
    .label-aanbieding { background: var(--zwart); color: white; }
    .label-cat { background: var(--grijs-mid); color: var(--grijs-tekst); }
    .boek-titel-groot {
      font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 700; line-height: 1.2;
      margin-bottom: 0.2rem;
    }
    .boek-ondertitel {
      font-size: 1rem; color: var(--grijs-muted); font-style: italic;
      margin-bottom: 0.6rem; line-height: 1.4;
    }
    .boek-auteur-groot { font-size: 1rem; color: var(--grijs-muted); margin-bottom: 1.25rem; }
    .prijs-rij {
      display: flex; align-items: baseline; gap: 0.75rem;
      margin-bottom: 1.25rem; padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--grijs-mid);
    }
    .prijs-groot { font-size: 2rem; font-weight: 700; color: var(--rood-donker); }
    .prijs-oud-groot { font-size: 1.1rem; color: var(--grijs-muted); text-decoration: line-through; }
    .beschrijving { font-size: 0.95rem; line-height: 1.8; color: var(--grijs-tekst); margin-bottom: 1.75rem; }
    .specs { background: var(--wit); border: 1px solid var(--grijs-rand); border-radius: 6px; overflow: hidden; margin-bottom: 1.75rem; }
    .specs h3 { background: var(--grijs-mid); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.55rem 1rem; color: var(--grijs-tekst); }
    .specs table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
    .specs table tr:not(:last-child) td { border-bottom: 1px solid var(--grijs-mid); }
    .specs table td { padding: 0.5rem 1rem; vertical-align: top; }
    .specs table td:first-child { color: var(--grijs-muted); font-weight: 600; width: 38%; }
    .trefwoorden { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.75rem; }
    .trefwoord { background: var(--grijs-licht); border: 1px solid var(--grijs-rand); border-radius: 4px; padding: 0.2rem 0.65rem; font-size: 0.78rem; color: var(--grijs-tekst); text-decoration: none; transition: background 0.12s, color 0.12s; }
    .trefwoord:hover { background: var(--rood-licht); color: var(--rood); border-color: var(--rood); }
    .trefwoord-cat { background: var(--rood-licht); border-color: var(--rood); color: var(--rood); font-weight: 600; }
    .gerelateerd h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--rood); }
    #laadIndicator { max-width: 1200px; margin: 3rem auto; padding: 0 1.5rem; text-align: center; color: var(--grijs-muted); }
    #foutMelding { max-width: 600px; margin: 3rem auto; padding: 2rem; background: var(--wit); border: 1px solid var(--grijs-rand); border-radius: 8px; text-align: center; }
    #foutMelding h2 { color: var(--rood); margin-bottom: 0.75rem; }
    @media (max-width: 720px) {
      .detail-wrapper { grid-template-columns: 1fr; }
      .cover-kolom { position: static; max-width: 240px; margin: 0 auto; order: 1; }
      .info-kolom { order: 2; }
      .gerelateerd { order: 3; }
    }
  </style>
</head>
<body>
<div id="nbHeader"></div>
<p id="laadIndicator">Boek wordt geladen\u2026</p>
<div id="foutMelding" style="display:none">
  <h2>Boek niet gevonden</h2>
  <p>Dit boek bestaat niet of is niet meer beschikbaar.<br>
  <a href="index.html" style="color:var(--rood);font-weight:600">Bekijk alle boeken &rarr;</a></p>
</div>
<div id="paginaInhoud" style="display:none">
  <div style="max-width:1200px;margin:1rem auto 0;padding:0 1.5rem">
    <nav class="nb-breadcrumb" aria-label="Kruimelpad">
      <a href="index.html">Nijmeegse Boeken</a> &rsaquo;
      <a id="bcCategorie" href="#">Categorie</a> &rsaquo;
      <span id="bcTitel">Titel</span>
    </nav>
  </div>
  <div class="detail-wrapper">
    <div class="cover-kolom">
      <div class="cover-groot" id="coverContainer"></div>
      <a id="btnBestellen" href="#" target="_blank" rel="noopener" class="btn-bestellen">
        Bestellen bij Roelants &rarr;
      </a>
      <p class="verzend-info">Gratis verzending vanaf &euro;30,-<br>Anders &euro;4,95 &middot; Gratis afhalen bij Boekhandel Roelants</p>
    </div>
    <div class="info-kolom">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem" id="labelRij"></div>
      <h1 class="boek-titel-groot" id="boekTitel"></h1>
      <p class="boek-ondertitel" id="boekOndertitel" style="display:none;"></p>
      <p class="boek-auteur-groot" id="boekAuteur"></p>
      <div class="prijs-rij" id="prijsRij"></div>
      <div class="beschrijving" id="boekBeschrijving"></div>
      <div class="specs"><h3>Boekinformatie</h3><table id="specsTable"></table></div>
      <div class="trefwoorden" id="trefwoorden"></div>
      <div id="gereleateerdBlok">
        <h2 class="gerelateerd">Vergelijkbare boeken</h2>
        <div class="nb-grid" id="gereleateerdGrid"></div>
      </div>
    </div>
  </div>
</div>
<div id="nbFooter"></div>
<script src="nijmegen.js"></script>
<script>nbLaadBoekPagina(___BOEK_ID___, '___SLUG___');</script>
</body>
</html>
"""


def genereer_boek_html(boek: dict) -> str:
    """Genereert de HTML voor een boekpagina in Boeken/{slug}.html."""
    isbn       = normaliseer_isbn(boek.get("isbn", ""))
    titel      = boek.get("titel", "")
    auteur     = boek.get("auteur", "")
    beschrijving = boek.get("beschrijving", "")
    slug       = boek.get("slug", "")
    prijs      = boek.get("prijs", 0) or 0

    titel_auteur = f"{titel} \u2013 {auteur}" if auteur else titel
    beschrijving_kort = (
        beschrijving[:155]
        if beschrijving
        else f"Bestel {titel} van {auteur} bij Boekhandel Roelants. Gratis verzending binnen Nederland vanaf \u20ac30,-."
    )

    og_image_tag = ""
    cover_url = ""
    if isbn:
        cover_url = f"https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean={isbn}&size=l"
        og_image_tag = f'<meta property="og:image" content="{cover_url}">'

    schema = {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": titel,
        "author": {"@type": "Person", "name": auteur},
        "publisher": {"@type": "Organization", "name": boek.get("uitgever", "")},
        "isbn": isbn,
        "datePublished": str(boek.get("jaar", "") or ""),
        "inLanguage": "nl",
        "description": beschrijving,
        "offers": {
            "@type": "Offer",
            "price": str(prijs),
            "priceCurrency": "EUR",
            "availability": "https://schema.org/InStock",
            "url": boek.get("afrekenen", ""),
        },
    }
    if boek.get("paginas"):
        schema["numberOfPages"] = boek["paginas"]
    if cover_url:
        schema["image"] = cover_url

    schema_json = json.dumps(schema, ensure_ascii=False)

    html = BOEK_HTML_TEMPLATE
    html = html.replace("___SLUG___",            slug)
    html = html.replace("___BOEK_ID___",         str(boek.get("id", 0)))
    html = html.replace("___TITEL_AUTEUR___",    _he(titel_auteur))
    html = html.replace("___BESCHRIJVING_KORT___", _he(beschrijving_kort))
    html = html.replace("___OG_IMAGE_TAG___",    og_image_tag)
    html = html.replace("___SCHEMA_JSON___",     schema_json)
    return html


def genereer_boekpaginas(boeken: list[dict]):
    """
    Genereert individuele HTML-pagina's voor elk boek in de map Boeken/.
    Verwijdert ook verouderde pagina's voor boeken die niet meer in boeken.json staan.
    """
    BOEKEN_MAP.mkdir(exist_ok=True)

    # Verzamel geldige slugs
    geldige_slugs = {b["slug"] + ".html" for b in boeken if b.get("slug")}

    # Verwijder verouderde pagina's
    verwijderd = 0
    for bestand in BOEKEN_MAP.glob("*.html"):
        if bestand.name not in geldige_slugs:
            bestand.unlink()
            verwijderd += 1

    # Genereer / update pagina's
    aangemaakt = bijgewerkt = 0
    for b in boeken:
        if not b.get("slug"):
            continue
        html = genereer_boek_html(b)
        bestand = BOEKEN_MAP / f"{b['slug']}.html"
        bestaat = bestand.exists()
        bestand.write_text(html, encoding="utf-8")
        if bestaat:
            bijgewerkt += 1
        else:
            aangemaakt += 1

    print(f"\n📄 Boeken/ pagina's: {aangemaakt} nieuw · {bijgewerkt} bijgewerkt · {verwijderd} verwijderd")
    print(f"   URL-voorbeeld: nijmeegseboeken.nl/Boeken/{next((b['slug'] for b in boeken if b.get('slug')), 'slug')}.html")


# ── Hulpfuncties ──────────────────────────────────────────────────────────────

def normaliseer_isbn(waarde) -> str:
    if waarde is None:
        return ""
    tekst = str(waarde).strip()
    if tekst.lower() in ("isbn", "isbns", "isbn-13", "isbn13", ""):
        return ""
    return re.sub(r"[-\s]", "", tekst)


def naar_url(isbn: str) -> str:
    return f"https://www.roelants.nl/nl/boeken-page/{isbn}/boek"


def jaar_uit_datum(datum: str) -> int | None:
    match = re.search(r"\b(\d{4})\b", datum or "")
    return int(match.group(1)) if match else None


def prijs_uit_html(soup) -> float | None:
    tekst = soup.get_text(" ", strip=True)
    match = re.search(r"€\s*([\d]+[,.][\d]{2})", tekst)
    if match:
        prijs = float(match.group(1).replace(",", "."))
        if 0 < prijs < 1000:
            return prijs
    return None


def _parse_prijs(tekst: str) -> float | None:
    match = re.search(r"([\d]+[,.][\d]{2})", tekst.replace("\xa0", ""))
    if match:
        prijs = float(match.group(1).replace(",", "."))
        if 0 < prijs < 1000:
            return prijs
    return None


import threading
_pw_local = threading.local()

def _pw_start():
    if not PLAYWRIGHT_BESCHIKBAAR:
        return False
    if not getattr(_pw_local, "browser", None):
        _pw_local.instance = sync_playwright().start()
        _pw_local.browser  = _pw_local.instance.chromium.launch(headless=True)
        _pw_local.stealth  = Stealth(
            navigator_user_agent_override=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
    return True

def _pw_stop():
    if getattr(_pw_local, "browser", None):
        _pw_local.browser.close()
        _pw_local.instance.stop()
        _pw_local.browser  = None
        _pw_local.instance = None
        _pw_local.stealth  = None


def haal_prijzen_playwright(isbn: str) -> tuple[float | None, float | None]:
    if not _pw_start():
        return None, None
    url = f"https://www.roelants.nl/nl/boeken-page/{isbn}/boek"
    try:
        context = _pw_local.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="nl-NL",
        )
        page = context.new_page()
        _pw_local.stealth.apply_stealth_sync(page)
        page.goto(url, timeout=20000)
        page.wait_for_timeout(int(VERTRAGING_PLAYWRIGHT * 1000))

        prijs_oud = None
        prijs = None

        before = page.query_selector(".price-before-discount")
        if before:
            prijs_oud = _parse_prijs(before.inner_text())

        prijs_els = page.query_selector_all(".price")
        for el in prijs_els:
            tekst = el.inner_text().strip()
            if not tekst or len(tekst) > 20:
                continue
            klasse = el.get_attribute("class") or ""
            if "before-discount" in klasse or "icon" in klasse:
                continue
            p = _parse_prijs(tekst)
            if p:
                prijs = p
                break

        context.close()
        if prijs_oud and prijs and prijs_oud == prijs:
            prijs_oud = None
        return prijs, prijs_oud

    except Exception as e:
        print(f"    ⚠️  Playwright fout voor {isbn}: {e}")
        try: context.close()
        except: pass
        return None, None


# ── Google Books / Open Library ───────────────────────────────────────────────

async def haal_extra_data(sessie: aiohttp.ClientSession, isbn: str) -> dict:
    ondertitel = ""
    beschrijving = ""

    try:
        url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}&maxResults=1"
        async with sessie.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                data = await r.json()
                items = data.get("items", [])
                if items:
                    info = items[0].get("volumeInfo", {})
                    ondertitel   = info.get("subtitle", "").strip()
                    beschrijving = info.get("description", "").strip()
    except Exception:
        pass

    if not ondertitel:
        try:
            url = f"https://openlibrary.org/isbn/{isbn}.json"
            async with sessie.get(url, timeout=aiohttp.ClientTimeout(total=8),
                                  allow_redirects=True) as r:
                if r.status == 200:
                    data = await r.json()
                    ondertitel = data.get("subtitle", "").strip()
        except Exception:
            pass

    return {"ondertitel": ondertitel, "beschrijving": beschrijving}


# ── HTML Parsen ───────────────────────────────────────────────────────────────

def parseer_html(html: str, eind_url: str, isbn: str) -> dict | None:
    if "/boeken-page/" not in eind_url:
        return None

    soup = BeautifulSoup(html, "html.parser")
    if "er is een fout opgetreden" in soup.get_text().lower():
        return None

    h2 = soup.find("h2")
    titel = h2.get_text(strip=True) if h2 else ""

    h3 = soup.find("h3")
    auteur = h3.get_text(strip=True) if h3 else ""

    taal = datum = ""
    paginas = None
    for el in soup.find_all(string=True):
        tekst = el.strip()
        if "|" in tekst and (re.search(r"\d{2}-\d{2}-\d{4}", tekst) or re.search(r"pagina", tekst, re.I)):
            delen = [d.strip() for d in tekst.split("|")]
            if len(delen) >= 1: taal = delen[0]
            if len(delen) >= 2: datum = delen[1]
            if len(delen) >= 3:
                match = re.search(r"(\d+)", delen[2])
                paginas = int(match.group(1)) if match else None
            break

    uitvoering_kandidaten = ["Paperback", "softback", "Hardcover", "Hardback", "Gebonden", "Spiral", "E-book", "Luisterboek"]
    uitvoering = ""
    for el in soup.find_all(string=True):
        tekst = el.strip()
        if any(k.lower() in tekst.lower() for k in uitvoering_kandidaten) and len(tekst) < 60:
            uitvoering = tekst
            break

    uitgever = reeks = ""
    for tr in soup.find_all("tr"):
        cellen = tr.find_all("td")
        if len(cellen) >= 2:
            label  = cellen[0].get_text(strip=True).lower()
            waarde = cellen[1].get_text(strip=True)
            if not uitvoering and "uitvoering" in label: uitvoering = waarde
            if not uitgever and "uitgever" in label: uitgever = waarde
            if not reeks and "reeks" in label: reeks = waarde
            if paginas is None and "aantal pagina" in label:
                try: paginas = int(re.sub(r"\D", "", waarde))
                except ValueError: pass

    SECTIE_PRIORITEIT = ["tekst achterflap", "achterflap", "beschrijving", "annotatie"]

    def haal_sectietekst(header_el) -> str:
        delen = []
        for sibling in header_el.find_next_siblings():
            if sibling.name in ["h2", "h3", "h4"]: break
            tekst = sibling.get_text(separator=" ", strip=True)
            if tekst and len(tekst) > 30: delen.append(tekst)
        return " ".join(delen).strip()

    gevonden_secties = {}
    for el in soup.find_all(["h2", "h3", "h4"]):
        header_tekst = el.get_text(strip=True).lower()
        for sleutel in SECTIE_PRIORITEIT:
            if sleutel in header_tekst and sleutel not in gevonden_secties:
                tekst = haal_sectietekst(el)
                if tekst: gevonden_secties[sleutel] = tekst
                break

    beschrijving = ""
    for sleutel in SECTIE_PRIORITEIT:
        if sleutel in gevonden_secties:
            beschrijving = gevonden_secties[sleutel]
            break

    return {
        "isbn":        isbn,
        "titel":       titel or "Niet gevonden",
        "auteur":      auteur,
        "taal":        taal,
        "datum":       datum,
        "uitvoering":  uitvoering,
        "uitgever":    uitgever,
        "reeks":       reeks,
        "paginas":     paginas,
        "prijs":       prijs_uit_html(soup),
        "beschrijving": beschrijving,
        "bron_beschrijving": "Roelants" if beschrijving else "",
        "url":         eind_url,
    }


# ── Async scraping ────────────────────────────────────────────────────────────

async def haal_boekdata_async(
    sessie: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    isbn: str,
    teller: dict,
    totaal: int,
) -> dict | None:
    url = naar_url(isbn)

    async with semaphore:
        for poging in range(1, MAX_POGINGEN + 1):
            try:
                async with sessie.get(url, allow_redirects=True,
                                      timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as r:
                    if r.status == 404:
                        teller["overgeslagen"] += 1
                        return None
                    if r.status == 403:
                        wacht = poging * 5
                        print(f"  🔒  {isbn} — 403, wacht {wacht}s (poging {poging}/{MAX_POGINGEN})")
                        await asyncio.sleep(wacht)
                        continue
                    if r.status in (429, 503):
                        wacht = poging * 3
                        print(f"  ⏳  {isbn} — HTTP {r.status}, wacht {wacht}s")
                        await asyncio.sleep(wacht)
                        continue
                    if r.status != 200:
                        teller["overgeslagen"] += 1
                        return None
                    html = await r.text()
                    eind_url = str(r.url)
                    await asyncio.sleep(VERTRAGING)
                    break
            except Exception as e:
                if poging == MAX_POGINGEN:
                    teller["fouten"] += 1
                    print(f"  ❌  {isbn} — fout: {e}")
                    return None
                await asyncio.sleep(poging * 2)
        else:
            teller["overgeslagen"] += 1
            return None

    resultaat = parseer_html(html, eind_url, isbn)

    if resultaat is not None:
        extra = await haal_extra_data(sessie, isbn)
        resultaat["ondertitel"] = extra["ondertitel"]
        if not resultaat["beschrijving"] and extra["beschrijving"]:
            resultaat["beschrijving"]      = extra["beschrijving"]
            resultaat["bron_beschrijving"] = "Google Books"

        if PLAYWRIGHT_BESCHIKBAAR:
            loop = asyncio.get_event_loop()
            prijs_pw, prijs_oud_pw = await loop.run_in_executor(None, haal_prijzen_playwright, isbn)
            if prijs_pw:
                resultaat["prijs"]     = prijs_pw
                resultaat["prijs_oud"] = prijs_oud_pw
                if prijs_oud_pw:
                    print(f"    💰 Van €{prijs_oud_pw:.2f} voor €{prijs_pw:.2f}")

    teller["verwerkt"] += 1
    if resultaat is None:
        teller["overgeslagen"] += 1
    else:
        teller["gevonden"] += 1
        bron = resultaat.get("bron_beschrijving", "")
        bron_label = f" [{bron}]" if bron else " [geen beschrijving]"
        print(f"  ✓  {isbn} — {resultaat['titel'][:50]}{bron_label}")

    if teller["verwerkt"] % 10 == 0 or teller["verwerkt"] == totaal:
        pct = teller["verwerkt"] / totaal * 100
        print(f"  [{teller['verwerkt']:4d}/{totaal}] {pct:.0f}% — "
              f"gevonden: {teller['gevonden']}  overgeslagen: {teller['overgeslagen']}")

    return resultaat


async def run(isbns: list[str]) -> list[dict]:
    totaal    = len(isbns)
    teller    = {"verwerkt": 0, "gevonden": 0, "overgeslagen": 0, "fouten": 0}
    semaphore = asyncio.Semaphore(GELIJKTIJDIG)

    connector = aiohttp.TCPConnector(limit=GELIJKTIJDIG, ssl=False)
    async with aiohttp.ClientSession(headers=HTTP_HEADERS, connector=connector) as sessie:
        taken = [haal_boekdata_async(sessie, semaphore, isbn, teller, totaal) for isbn in isbns]
        resultaten_raw = await asyncio.gather(*taken)

    return [r for r in resultaten_raw if r is not None]


# ── boeken.json bijwerken + pagina's genereren ────────────────────────────────

def verwerk_naar_json(resultaten: list[dict]):
    boeken = []
    if BOEKEN_JSON.exists():
        boeken = json.loads(BOEKEN_JSON.read_text(encoding="utf-8"))
        print(f"\n📂 Bestaand boeken.json geladen: {len(boeken)} boeken")
    else:
        print("\n📂 Nieuw boeken.json wordt aangemaakt")

    vast_json  = BASIS / "boeken-vast.json"
    vaste_isbns = set()
    if vast_json.exists():
        vast = json.loads(vast_json.read_text(encoding="utf-8"))
        vaste_isbns = {normaliseer_isbn(b.get("isbn", "")) for b in vast if b.get("isbn")}
        print(f"🔒 {len(vaste_isbns)} vaste boeken beschermd tegen overschrijven")

    volgende_id = max((b.get("id", 0) for b in boeken), default=0) + 1
    toegevoegd = bijgewerkt = overgeslagen_vast = 0

    for r in resultaten:
        isbn = normaliseer_isbn(r["isbn"])

        if isbn in vaste_isbns:
            overgeslagen_vast += 1
            print(f"  🔒 {isbn} — beschermd (staat in boeken-vast.json)")
            continue

        bestaand_idx = next(
            (i for i, b in enumerate(boeken) if normaliseer_isbn(b.get("isbn", "")) == isbn),
            None
        )

        titel      = r["titel"]
        ondertitel = r.get("ondertitel", "") or ""

        uitvoering = r.get("uitvoering", "")
        formaat = "Gebonden"
        if uitvoering:
            if any(k in uitvoering.lower() for k in ["paperback", "softback"]): formaat = "Paperback"
            elif "e-book" in uitvoering.lower(): formaat = "E-book"
            elif "luister" in uitvoering.lower(): formaat = "Luisterboek"

        if bestaand_idx is not None:
            b = boeken[bestaand_idx]
            boeken[bestaand_idx] = {
                **b,
                "categorieën":  b.get("categorieën", [b.get("categorie", STANDAARD_CATEGORIE)]),
                "titel":        titel       or b.get("titel", ""),
                "ondertitel":   ondertitel  or b.get("ondertitel", ""),
                "auteur":       r["auteur"] or b.get("auteur", ""),
                "uitgever":     r["uitgever"] or b.get("uitgever", ""),
                "jaar":         jaar_uit_datum(r["datum"]) or b.get("jaar"),
                "paginas":      r["paginas"] or b.get("paginas"),
                "formaat":      formaat     or b.get("formaat", "Gebonden"),
                "prijs":        r["prijs"]  if r["prijs"] else b.get("prijs", 0),
                "prijsOud":     r.get("prijs_oud") if r.get("prijs_oud") else b.get("prijsOud"),
                "aanbieding":   True if r.get("prijs_oud") else b.get("aanbieding", False),
                "beschrijving": r["beschrijving"] or b.get("beschrijving", ""),
                "isbn":         isbn,
                "afrekenen":    r["url"],
            }
            bijgewerkt += 1
        else:
            boeken.append({
                "id":           volgende_id,
                "uitgelicht":   False,
                "nieuw":        True,
                "aanbieding":   True if r.get("prijs_oud") else False,
                "prijsOud":     r.get("prijs_oud"),
                "titel":        titel,
                "ondertitel":   ondertitel,
                "auteur":       r["auteur"],
                "uitgever":     r["uitgever"],
                "jaar":         jaar_uit_datum(r["datum"]),
                "paginas":      r["paginas"],
                "formaat":      formaat,
                "prijs":        r["prijs"] or 0,
                "categorieën":  [STANDAARD_CATEGORIE],
                "omslag":       None,
                "kleur":        STANDAARD_KLEUR,
                "beschrijving": r["beschrijving"],
                "isbn":         isbn,
                "trefwoorden":  [],
                "afrekenen":    r["url"],
            })
            volgende_id += 1
            toegevoegd += 1

    # ── Slugs toewijzen aan alle boeken (ook bestaande zonder slug) ──
    boeken = wijs_slugs_toe(boeken)

    # ── boeken.json opslaan ──
    BOEKEN_JSON.write_text(json.dumps(boeken, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'═'*50}")
    print(f"✅ Import klaar!")
    print(f"   Nieuw toegevoegd : {toegevoegd}")
    print(f"   Bijgewerkt       : {bijgewerkt}")
    if overgeslagen_vast:
        print(f"   Beschermd (vast) : {overgeslagen_vast}")
    print(f"   Totaal in JSON   : {len(boeken)}")

    # ── Boekpagina's genereren ──
    genereer_boekpaginas(boeken)

    print(f"\n⚠️  Controleer daarna in beheer.html:")
    print(f"   - Categorie instellen (staat nu op '{STANDAARD_CATEGORIE}')")
    print(f"   - Prijs controleren")
    print(f"   - 'Nieuw' vlag aan/uitzetten")
    print(f"\n📤 Push boeken.json + de map Boeken/ naar GitHub.")


# ── Hoofdprogramma ────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args:
        args = ["--bestand", str(BASIS / "isbnlijst.txt")]

    isbns = []
    if args[0] == "--bestand":
        bestand = Path(args[1])
        if not bestand.exists():
            print(f"❌ Bestand niet gevonden: {bestand}")
            sys.exit(1)
        isbns = [
            normaliseer_isbn(r)
            for r in bestand.read_text(encoding="utf-8").splitlines()
            if r.strip() and not r.strip().startswith("#")
        ]
        isbns = [i for i in isbns if i]
        print(f"📋 {len(isbns)} ISBNs geladen uit {bestand.name}")
    else:
        isbns = [normaliseer_isbn(a) for a in args if normaliseer_isbn(a)]

    if not isbns:
        print("❌ Geen geldige ISBNs opgegeven.")
        sys.exit(1)

    print(f"🚀 {len(isbns)} ISBN(s) verwerken via Roelants.nl...\n")
    resultaten = asyncio.run(run(isbns))
    _pw_stop()
    verwerk_naar_json(resultaten)


if __name__ == "__main__":
    main()
