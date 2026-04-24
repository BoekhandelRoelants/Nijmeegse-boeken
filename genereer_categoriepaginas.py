#!/usr/bin/env python3
"""
Genereert categoriepagina's vanuit boeken.json.

Gebruik:
    python genereer_categoriepaginas.py

Plaatst dit script in dezelfde map als boeken.json en nijmegen.js.
"""

import json
from pathlib import Path

BASIS = Path(__file__).parent
BOEKEN_JSON = BASIS / "boeken.json"


def nbCats(boek):
    """Ondersteunt zowel oud formaat (string) als nieuw (array)."""
    c = boek.get("categorieën") or boek.get("categorie")
    if isinstance(c, list):
        return [x for x in c if x]
    return [c] if c else []


def genereer_pagina(slug, naam, aantal):
    meervoud = "s" if aantal != 1 else ""
    return f"""<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{naam} – Boeken over Nijmegen</title>
  <meta name="description" content="Boeken over Nijmegen in de categorie {naam}. {aantal} titel{meervoud} over {naam.lower()} in en rond Nijmegen.">
  <link rel="canonical" href="https://nijmeegseboeken.nl/categorie-{slug}.html">
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"CollectionPage","name":"{naam} – Nijmeegse Boeken","url":"https://nijmeegseboeken.nl/categorie-{slug}.html"}}
  </script>
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="stylesheet" href="nijmegen.css">
</head>
<body>
<div id="nbHeader"></div>
<main>
  <div class="nb-pagina">
    <aside class="nb-sidebar">
      <div class="nb-sidebar-blok">
        <h3>Nieuwste boeken</h3>
        <div id="nbSidebarNieuwste"></div>
      </div>
      <div class="nb-sidebar-blok">
        <h3>Categorieën</h3>
        <ul id="nbSidebarCats"></ul>
      </div>
    </aside>
    <div class="nb-hoofd">
      <nav class="nb-breadcrumb" aria-label="Kruimelpad">
        <a href="index.html">Nijmeegse Boeken</a> &rsaquo; <span>{naam}</span>
      </nav>
      <div class="nb-paginakop">
        <h1>Boeken over Nijmegen: {naam}</h1>
        <p id="paginaOndertitel">{aantal} titel{meervoud} in deze categorie</p>
      </div>
      <div id="nbSorteerBalk"></div>
      <div class="nb-grid" id="gridCategorie"><p class="nb-leeg">Laden\u2026</p></div>
      <div class="nb-seo" id="nbSeoBlok">
        <h2>{naam} in en rond Nijmegen</h2>
        <p>Ontdek ons aanbod boeken in de categorie {naam.lower()}. Alle titels zijn direct te bestellen via Boekhandel Roelants in Nijmegen.</p>
      </div>
    </div>
  </div>
</main>
<div id="nbFooter"></div>
<script src="nijmegen.js"></script>
<script>
(async () => {{
  const boeken = await nbLaadBoeken();
  const cats = [...new Set(boeken.flatMap(b => (b.categorie\u00ebn||b.categorie ? (Array.isArray(b.categorie\u00ebn||b.categorie) ? (b.categorie\u00ebn||b.categorie) : [b.categorie\u00ebn||b.categorie]) : [])))].sort().map(s => ({{naam: s.charAt(0).toUpperCase()+s.slice(1).replace(/-/g,' '), slug: s}}));
  document.getElementById('nbHeader').innerHTML = nbHeaderHTML('categorie-{slug}.html', cats);
  document.getElementById('nbFooter').innerHTML = nbFooterHTML(cats);
  nbVulSidebar(boeken, '{slug}');
  const gefilterd = boeken.filter(b => nbInCategorie(b, '{slug}'));
  document.getElementById('paginaOndertitel').textContent = gefilterd.length + ' titel' + (gefilterd.length !== 1 ? 's' : '') + ' in deze categorie';
  document.getElementById('nbSorteerBalk').innerHTML = nbSorteerBalk('id-desc');
  window.nbHerrendeer = function(methode) {{
    const gesorteerd = nbSorteer(gefilterd, methode);
    document.getElementById('gridCategorie').innerHTML = gesorteerd.length ? gesorteerd.map(nbRenderKaart).join('') : '<p class="nb-leeg">Geen boeken in deze categorie.</p>';
    nbFixCoverHoogtes(); setTimeout(nbFixCoverHoogtes, 300);
  }}
  nbHerrendeer('id-desc');
  const seoTitel = nbTekst('cat_{slug}_titel', '{naam} in en rond Nijmegen');
  const seoTekst = nbTekst('cat_{slug}_tekst', 'Ontdek ons aanbod boeken in de categorie {naam.lower()}. Alle titels zijn direct te bestellen via Boekhandel Roelants in Nijmegen.');
  document.getElementById('nbSeoBlok').innerHTML = '<h2>' + seoTitel + '</h2><p>' + seoTekst + '</p>';
  nbFixCoverHoogtes();
  setTimeout(nbFixCoverHoogtes, 300);
}})();
</script>
</body>
</html>"""


def main():
    if not BOEKEN_JSON.exists():
        print(f"❌ {BOEKEN_JSON} niet gevonden.")
        return

    boeken = json.loads(BOEKEN_JSON.read_text(encoding="utf-8"))

    # Verzamel alle unieke categorieën
    tellingen = {}
    for b in boeken:
        for slug in nbCats(b):
            tellingen[slug] = tellingen.get(slug, 0) + 1

    if not tellingen:
        print("⚠️  Geen categorieën gevonden in boeken.json.")
        return

    aangemaakt = 0
    for slug in sorted(tellingen):
        naam = slug.replace("-", " ").capitalize()
        aantal = tellingen[slug]
        html = genereer_pagina(slug, naam, aantal)
        bestand = BASIS / f"categorie-{slug}.html"
        bestand.write_text(html, encoding="utf-8")
        print(f"✓ categorie-{slug}.html ({aantal} boek{'en' if aantal != 1 else ''})")
        aangemaakt += 1

    print(f"\nKlaar — {aangemaakt} categoriepagina's gegenereerd.")
    print("Upload de nieuwe .html bestanden naar GitHub.")


if __name__ == "__main__":
    main()
