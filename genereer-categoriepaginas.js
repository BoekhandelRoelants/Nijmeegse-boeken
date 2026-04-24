// ══════════════════════════════════════════════════════════
// CATEGORIEPAGINA GENERATOR
// Voer dit script uit met Node.js om alle categoriepagina's
// automatisch te genereren vanuit boeken.json:
//   node genereer-categoriepaginas.js
// ══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const boeken = JSON.parse(fs.readFileSync('boeken.json', 'utf8'));

// Unieke categorieën
const cats = [...new Set(boeken.map(b => b.categorie))];

cats.forEach(slug => {
  const naam = slug.charAt(0).toUpperCase() + slug.slice(1);
  const aantal = boeken.filter(b => b.categorie === slug).length;
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${naam} – Boeken over Nijmegen</title>
  <meta name="description" content="Boeken over Nijmegen in de categorie ${naam}. ${aantal} titel${aantal !== 1 ? 's' : ''} over ${naam.toLowerCase()} in en rond Nijmegen.">
  <link rel="canonical" href="https://nijmeegse-boeken.nl/categorie-${slug}.html">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"CollectionPage","name":"${naam} – Nijmeegse Boeken","url":"https://nijmeegse-boeken.nl/categorie-${slug}.html"}
  <\/script>
  <link rel="stylesheet" href="nijmegen.css">
</head>
<body>
<div id="nbHeader"></div>
<main>
  <div class="nb-pagina">
    <aside class="nb-sidebar">
      <div class="nb-sidebar-blok">
        <h3>Categorieën</h3>
        <ul id="nbSidebarCats"></ul>
      </div>
    </aside>
    <div class="nb-hoofd">
      <nav class="nb-breadcrumb" aria-label="Kruimelpad">
        <a href="index.html">Nijmeegse Boeken</a> &rsaquo; <span>${naam}</span>
      </nav>
      <div class="nb-paginakop">
        <h1>Boeken over Nijmegen: ${naam}</h1>
        <p id="paginaOndertitel">${aantal} titel${aantal !== 1 ? 's' : ''} in deze categorie</p>
      </div>
      <div class="nb-grid" id="gridCategorie"><p class="nb-leeg">Laden…</p></div>
      <div class="nb-seo">
        <h2>${naam} in en rond Nijmegen</h2>
        <p>Ontdek ons aanbod boeken in de categorie ${naam.toLowerCase()}. Alle titels zijn direct te bestellen via Boekhandel Roelants in Nijmegen.</p>
      </div>
    </div>
  </div>
</main>
<div id="nbFooter"></div>
<script src="nijmegen.js"><\/script>
<script>
(async () => {
  const boeken = await nbLaadBoeken();
  document.getElementById('nbHeader').innerHTML = nbHeaderHTML('categorie-${slug}.html');
  const cats = [...new Set(boeken.map(b => b.categorie))].map(s => ({naam: s.charAt(0).toUpperCase()+s.slice(1), slug: s}));
  document.getElementById('nbFooter').innerHTML = nbFooterHTML(cats);
  nbVulSidebar(boeken, '${slug}');
  const gefilterd = boeken.filter(b => b.categorie === '${slug}');
  document.getElementById('paginaOndertitel').textContent = gefilterd.length + ' titel' + (gefilterd.length !== 1 ? 's' : '') + ' in deze categorie';
  document.getElementById('gridCategorie').innerHTML = gefilterd.length ? gefilterd.map(nbRenderKaart).join('') : '<p class="nb-leeg">Geen boeken in deze categorie.</p>';
})();
<\/script>
</body>
</html>`;

  const bestandsnaam = `categorie-${slug}.html`;
  fs.writeFileSync(bestandsnaam, html, 'utf8');
  console.log(`✓ ${bestandsnaam} (${aantal} boeken)`);
});

console.log(`\nKlaar — ${cats.length} categoriepagina's gegenereerd.`);
