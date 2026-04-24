#!/usr/bin/env python3
"""
Genereert sitemap.xml voor nijmeegseboeken.nl.

Gebruik:
    python genereer_sitemap.py

Plaatst dit script in dezelfde map als boeken.json.
De sitemap.xml wordt opgeslagen in dezelfde map en moet
samen met de andere bestanden naar GitHub worden geüpload.
"""

import json
from pathlib import Path
from datetime import date

BASIS      = Path(__file__).parent
BOEKEN_JSON = BASIS / "boeken.json"
DOMEIN     = "https://nijmeegseboeken.nl"
VANDAAG    = date.today().isoformat()


def nbCats(boek):
    c = boek.get("categorieën") or boek.get("categorie")
    if isinstance(c, list):
        return [x for x in c if x]
    return [c] if c else []


def url(pad, prioriteit="0.8", wijziging="weekly"):
    return (
        f"  <url>\n"
        f"    <loc>{DOMEIN}/{pad}</loc>\n"
        f"    <lastmod>{VANDAAG}</lastmod>\n"
        f"    <changefreq>{wijziging}</changefreq>\n"
        f"    <priority>{prioriteit}</priority>\n"
        f"  </url>"
    )


def main():
    urls = []

    # Vaste pagina's
    urls.append(url("", "1.0", "daily"))
    urls.append(url("nieuw.html", "0.9", "weekly"))
    urls.append(url("toptien.html", "0.8", "weekly"))
    urls.append(url("aanbiedingen.html", "0.8", "weekly"))

    # Categoriepagina's
    if BOEKEN_JSON.exists():
        boeken = json.loads(BOEKEN_JSON.read_text(encoding="utf-8"))

        cats = set()
        for b in boeken:
            for c in nbCats(b):
                cats.add(c)

        for slug in sorted(cats):
            urls.append(url(f"categorie-{slug}.html", "0.7", "weekly"))

        # Boekdetailpagina's
        for b in boeken:
            urls.append(url(f"boek.html?id={b['id']}", "0.6", "monthly"))

    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n"
        "</urlset>"
    )

    uitvoer = BASIS / "sitemap.xml"
    uitvoer.write_text(sitemap, encoding="utf-8")

    print(f"✓ sitemap.xml aangemaakt ({len(urls)} URLs)")
    print(f"  Vaste pagina's : 4")
    print(f"  Categoriepagina's: {len([u for u in urls if 'categorie-' in u])}")
    print(f"  Boekpagina's  : {len([u for u in urls if 'boek.html' in u])}")
    print(f"\nUpload sitemap.xml naar GitHub.")
    print(f"Voeg daarna toe aan uw robots.txt:")
    print(f"  Sitemap: {DOMEIN}/sitemap.xml")


if __name__ == "__main__":
    main()
