#!/usr/bin/env python3
"""
Importeert boekdata van Roelants.nl naar boeken.json.

Gebruik:
    pip install aiohttp beautifulsoup4
    python importeer_naar_json.py 9789000000001 9789000000002
    python importeer_naar_json.py --bestand isbnlijst.txt

Het script haalt per ISBN op via https://www.roelants.nl/nl/boeken-page/{isbn}/boek:
  - Titel, auteur, beschrijving, pagina's, uitgever, uitvoering
  - Prijs
  - Ondertitel via Google Books / Open Library

Nieuwe boeken worden toegevoegd aan boeken.json.
Bestaande boeken (zelfde ISBN) worden bijgewerkt.
"""

import sys
import re
import json
import asyncio
import aiohttp
import requests
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
    print("   Installeer met: pip3 install playwright playwright-stealth && python3 -m playwright install chromium")

# ─────────────────────────────────────────────
# INSTELLINGEN
# ─────────────────────────────────────────────
BOEKEN_JSON         = Path(__file__).parent / "boeken.json"
GELIJKTIJDIG        = 2          # Max 2 gelijktijdige verzoeken
VERTRAGING          = 3.0        # 3 seconden tussen verzoeken
VERTRAGING_PLAYWRIGHT = 4.0      # Extra wachttijd voor Playwright
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

DESLEGTE_BASIS = "https://www.deslegte.com"


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
    """Statische fallback — zoekt prijs in al geladen HTML."""
    tekst = soup.get_text(" ", strip=True)
    match = re.search(r"€\s*([\d]+[,.][\d]{2})", tekst)
    if match:
        prijs = float(match.group(1).replace(",", "."))
        if 0 < prijs < 1000:
            return prijs
    return None


def _parse_prijs(tekst: str) -> float | None:
    """Parst een prijstekst naar float."""
    match = re.search(r"([\d]+[,.][\d]{2})", tekst.replace("\xa0", ""))
    if match:
        prijs = float(match.group(1).replace(",", "."))
        if 0 < prijs < 1000:
            return prijs
    return None


# Gedeelde Playwright browser instantie — thread-local voor thread-veiligheid
import threading
_pw_local = threading.local()

def _pw_start():
    if not PLAYWRIGHT_BESCHIKBAAR:
        return False
    if not getattr(_pw_local, 'browser', None):
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
    if getattr(_pw_local, 'browser', None):
        _pw_local.browser.close()
        _pw_local.instance.stop()
        _pw_local.browser  = None
        _pw_local.instance = None
        _pw_local.stealth  = None


def haal_prijzen_playwright(isbn: str) -> tuple[float | None, float | None]:
    """
    Haalt actuele prijs (en eventuele van-prijs) op via Playwright.
    Geeft terug: (prijs, prijs_oud) — prijs_oud is None als er geen aanbieding is.
    """
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

        # Van-prijs (origineel, doorgestreept)
        before = page.query_selector('.price-before-discount')
        if before:
            prijs_oud = _parse_prijs(before.inner_text())

        # Huidige prijs — pak alle .price elementen
        prijs_els = page.query_selector_all('.price')
        for el in prijs_els:
            # Sla parent-elementen over die beide prijzen bevatten
            tekst = el.inner_text().strip()
            if not tekst or len(tekst) > 20:
                continue
            # Sla price-before-discount over
            klasse = el.get_attribute('class') or ''
            if 'before-discount' in klasse or 'icon' in klasse:
                continue
            p = _parse_prijs(tekst)
            if p:
                prijs = p
                break

        context.close()

        # Als er geen van-prijs was, is de gevonden prijs de normale prijs
        if prijs_oud and prijs and prijs_oud == prijs:
            prijs_oud = None

        return prijs, prijs_oud

    except Exception as e:
        print(f"    ⚠️  Playwright fout voor {isbn}: {e}")
        try: context.close()
        except: pass
        return None, None


# ── De Slegte fallback ────────────────────────────────────────────────────────

def haal_beschrijving_deslegte(isbn: str) -> str:
    try:
        zoek_url = f"{DESLEGTE_BASIS}/boeken/?q={isbn}"
        r = requests.get(zoek_url, headers=HTTP_HEADERS, timeout=10)
        r.raise_for_status()
        zoek_soup = BeautifulSoup(r.text, "html.parser")

        isbn_span = zoek_soup.find("span", class_="list__item-isbn", string=isbn)
        if not isbn_span:
            return ""
        link = isbn_span.find_parent("a", href=True)
        if not link:
            return ""

        href = link["href"]
        detail_url = DESLEGTE_BASIS + href if href.startswith("/") else href

        r2 = requests.get(detail_url, headers=HTTP_HEADERS, timeout=10)
        r2.raise_for_status()
        detail_soup = BeautifulSoup(r2.text, "html.parser")

        meta = detail_soup.find("meta", itemprop="description")
        if meta and meta.get("content"):
            return meta["content"].strip()
    except Exception:
        pass
    return ""


# ── Ondertitel ophalen ────────────────────────────────────────────────────────

async def haal_ondertitel(sessie: aiohttp.ClientSession, isbn: str) -> str:
    try:
        url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}&maxResults=1"
        async with sessie.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                data = await r.json()
                items = data.get("items", [])
                if items:
                    ondertitel = items[0].get("volumeInfo", {}).get("subtitle", "")
                    if ondertitel:
                        return ondertitel.strip()
    except Exception:
        pass

    try:
        url = f"https://openlibrary.org/isbn/{isbn}.json"
        async with sessie.get(url, timeout=aiohttp.ClientTimeout(total=8),
                              allow_redirects=True) as r:
            if r.status == 200:
                data = await r.json()
                ondertitel = data.get("subtitle", "")
                if ondertitel:
                    return ondertitel.strip()
    except Exception:
        pass

    return ""


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
        if "|" in tekst and (re.search(r"\d{2}-\d{2}-\d{4}", tekst) or
                              re.search(r"pagina", tekst, re.I)):
            delen = [d.strip() for d in tekst.split("|")]
            if len(delen) >= 1:
                taal = delen[0]
            if len(delen) >= 2:
                datum = delen[1]
            if len(delen) >= 3:
                match = re.search(r"(\d+)", delen[2])
                paginas = int(match.group(1)) if match else None
            break

    uitvoering_kandidaten = [
        "Paperback", "softback", "Hardcover", "Hardback", "Gebonden",
        "Spiral", "E-book", "Luisterboek"
    ]
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
            label = cellen[0].get_text(strip=True).lower()
            waarde = cellen[1].get_text(strip=True)
            if not uitvoering and "uitvoering" in label:
                uitvoering = waarde
            if not uitgever and "uitgever" in label:
                uitgever = waarde
            if not reeks and "reeks" in label:
                reeks = waarde
            if paginas is None and "aantal pagina" in label:
                try:
                    paginas = int(re.sub(r"\D", "", waarde))
                except ValueError:
                    pass

    SECTIE_PRIORITEIT = ["tekst achterflap", "achterflap", "beschrijving", "annotatie"]

    def haal_sectietekst(header_el) -> str:
        delen = []
        for sibling in header_el.find_next_siblings():
            if sibling.name in ["h2", "h3", "h4"]:
                break
            tekst = sibling.get_text(separator=" ", strip=True)
            if tekst and len(tekst) > 30:
                delen.append(tekst)
        return " ".join(delen).strip()

    gevonden_secties = {}
    for el in soup.find_all(["h2", "h3", "h4"]):
        header_tekst = el.get_text(strip=True).lower()
        for sleutel in SECTIE_PRIORITEIT:
            if sleutel in header_tekst and sleutel not in gevonden_secties:
                tekst = haal_sectietekst(el)
                if tekst:
                    gevonden_secties[sleutel] = tekst
                break

    beschrijving = ""
    for sleutel in SECTIE_PRIORITEIT:
        if sleutel in gevonden_secties:
            beschrijving = gevonden_secties[sleutel]
            break

    prijs = prijs_uit_html(soup)

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
        "prijs":       prijs,
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
                async with sessie.get(
                    url, allow_redirects=True,
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT)
                ) as r:
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
        resultaat["ondertitel"] = await haal_ondertitel(sessie, isbn)
        if not resultaat["beschrijving"]:
            beschrijving_deslegte = haal_beschrijving_deslegte(isbn)
            if beschrijving_deslegte:
                resultaat["beschrijving"] = beschrijving_deslegte
                resultaat["bron_beschrijving"] = "De Slegte"

        # Haal prijs op via Playwright in aparte thread (sync API in async context)
        if PLAYWRIGHT_BESCHIKBAAR:
            loop = asyncio.get_event_loop()
            prijs_pw, prijs_oud_pw = await loop.run_in_executor(
                None, haal_prijzen_playwright, isbn
            )
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
        print(f"  ✓  {isbn} — {resultaat['titel'][:50]}")

    if teller["verwerkt"] % 10 == 0 or teller["verwerkt"] == totaal:
        pct = teller["verwerkt"] / totaal * 100
        print(f"  [{teller['verwerkt']:4d}/{totaal}] {pct:.0f}% — "
              f"gevonden: {teller['gevonden']}  overgeslagen: {teller['overgeslagen']}")

    return resultaat


async def run(isbns: list[str]) -> list[dict]:
    totaal = len(isbns)
    teller = {"verwerkt": 0, "gevonden": 0, "overgeslagen": 0, "fouten": 0}
    semaphore = asyncio.Semaphore(GELIJKTIJDIG)

    connector = aiohttp.TCPConnector(limit=GELIJKTIJDIG, ssl=False)
    async with aiohttp.ClientSession(headers=HTTP_HEADERS, connector=connector) as sessie:
        taken = [
            haal_boekdata_async(sessie, semaphore, isbn, teller, totaal)
            for isbn in isbns
        ]
        resultaten_raw = await asyncio.gather(*taken)

    return [r for r in resultaten_raw if r is not None]


# ── boeken.json bijwerken ─────────────────────────────────────────────────────

def verwerk_naar_json(resultaten: list[dict]):
    # Laad bestaand boeken.json
    boeken = []
    if BOEKEN_JSON.exists():
        boeken = json.loads(BOEKEN_JSON.read_text(encoding="utf-8"))
        print(f"\n📂 Bestaand boeken.json geladen: {len(boeken)} boeken")
    else:
        print("\n📂 Nieuw boeken.json wordt aangemaakt")

    # Laad vaste boeken — deze worden nooit overschreven
    vast_json = BASIS / "boeken-vast.json"
    vaste_isbns = set()
    if vast_json.exists():
        vast = json.loads(vast_json.read_text(encoding="utf-8"))
        vaste_isbns = {normaliseer_isbn(b.get("isbn","")) for b in vast if b.get("isbn")}
        print(f"🔒 {len(vaste_isbns)} vaste boeken beschermd tegen overschrijven")

    volgende_id = max((b.get("id", 0) for b in boeken), default=0) + 1
    toegevoegd = bijgewerkt = overgeslagen_vast = 0

    for r in resultaten:
        isbn = normaliseer_isbn(r["isbn"])

        # Sla vaste boeken over
        if isbn in vaste_isbns:
            overgeslagen_vast += 1
            print(f"  🔒 {isbn} — beschermd (staat in boeken-vast.json)")
            continue

        bestaand_idx = next(
            (i for i, b in enumerate(boeken) if normaliseer_isbn(b.get("isbn","")) == isbn),
            None
        )

        # Titel en ondertitel apart bewaren
        titel = r["titel"]
        ondertitel = r.get("ondertitel", "") or ""

        # Formaat afleiden uit uitvoering
        uitvoering = r.get("uitvoering", "")
        formaat = "Gebonden"
        if uitvoering:
            if any(k in uitvoering.lower() for k in ["paperback", "softback"]):
                formaat = "Paperback"
            elif "e-book" in uitvoering.lower():
                formaat = "E-book"
            elif "luister" in uitvoering.lower():
                formaat = "Luisterboek"

        if bestaand_idx is not None:
            # Bijwerken — behoud handmatig ingestelde velden
            b = boeken[bestaand_idx]
            boeken[bestaand_idx] = {
                **b,
                "categorieën": b.get("categorieën", [b.get("categorie", STANDAARD_CATEGORIE)]),
                "titel":       titel       or b.get("titel", ""),
                "ondertitel":  ondertitel  or b.get("ondertitel", ""),
                "auteur":      r["auteur"] or b.get("auteur", ""),
                "uitgever":    r["uitgever"] or b.get("uitgever", ""),
                "jaar":        jaar_uit_datum(r["datum"]) or b.get("jaar"),
                "paginas":     r["paginas"] or b.get("paginas"),
                "formaat":     formaat     or b.get("formaat", "Gebonden"),
                "prijs":       r["prijs"]  if r["prijs"] else b.get("prijs", 0),
                "prijsOud":    r.get("prijs_oud") if r.get("prijs_oud") else b.get("prijsOud"),
                "aanbieding":  True if r.get("prijs_oud") else b.get("aanbieding", False),
                "beschrijving": r["beschrijving"] or b.get("beschrijving", ""),
                "isbn":        isbn,
                "afrekenen":   r["url"],
            }
            bijgewerkt += 1
        else:
            # Nieuw boek toevoegen
            boeken.append({
                "id":          volgende_id,
                "uitgelicht":  False,
                "nieuw":       True,
                "aanbieding":  True if r.get("prijs_oud") else False,
                "prijsOud":    r.get("prijs_oud"),
                "titel":       titel,
                "ondertitel":  ondertitel,
                "auteur":      r["auteur"],
                "uitgever":    r["uitgever"],
                "jaar":        jaar_uit_datum(r["datum"]),
                "paginas":     r["paginas"],
                "formaat":     formaat,
                "prijs":       r["prijs"] or 0,
                "categorieën": [STANDAARD_CATEGORIE],
                "omslag":      None,
                "kleur":       STANDAARD_KLEUR,
                "beschrijving": r["beschrijving"],
                "isbn":        isbn,
                "trefwoorden": [],
                "afrekenen":   r["url"],
            })
            volgende_id += 1
            toegevoegd += 1

    BOEKEN_JSON.write_text(
        json.dumps(boeken, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n{'═'*50}")
    print(f"✅ Klaar!")
    print(f"   Nieuw toegevoegd : {toegevoegd}")
    print(f"   Bijgewerkt       : {bijgewerkt}")
    if overgeslagen_vast:
        print(f"   Beschermd (vast) : {overgeslagen_vast}")
    print(f"   Totaal in JSON   : {len(boeken)}")
    print(f"\n📄 boeken.json opgeslagen.")
    print(f"\n⚠️  Controleer daarna in beheer.html:")
    print(f"   - Categorie instellen (staat nu op '{STANDAARD_CATEGORIE}')")
    print(f"   - Prijs controleren")
    print(f"   - 'Nieuw' vlag aan/uitzetten")


# ── Hoofdprogramma ────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    # Standaard: gebruik isbnlijst.txt in dezelfde map
    if not args:
        args = ["--bestand", str(Path(__file__).parent / "isbnlijst.txt")]

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
