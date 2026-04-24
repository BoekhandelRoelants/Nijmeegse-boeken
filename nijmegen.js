// ══════════════════════════════════════════════════════════
// NIJMEEGSE BOEKEN — Gedeeld JavaScript
// ══════════════════════════════════════════════════════════

// ── PLACEHOLDER: Nijmeegse vlag met boeknaam in zwart vlak ──
function nbPlaceholder(titel) {
  // Wikkel lange titels over meerdere regels (max 16 tekens per regel)
  const woorden = titel.split(' ');
  const regels = [];
  let huidig = '';
  woorden.forEach(w => {
    if ((huidig + ' ' + w).trim().length > 16 && huidig) {
      regels.push(huidig.trim());
      huidig = w;
    } else {
      huidig = (huidig + ' ' + w).trim();
    }
  });
  if (huidig) regels.push(huidig.trim());
  // Max 4 regels
  const zichtbaar = regels.slice(0, 4);

  const regelH = 22;
  const totaalH = zichtbaar.length * regelH;
  // Gecentreerd in het zwarte vlak (onderste 50% = y 150 t/m 300 in viewBox 0-300)
  const startY = 225 - totaalH / 2;

  const tekstRegels = zichtbaar.map((r, i) =>
    `<text x="100" y="${startY + i * regelH}" text-anchor="middle" font-family="'Nunito','Museo Sans',sans-serif" font-size="14" font-weight="700" fill="white" opacity="0.9">${escHtml(r)}</text>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    <rect width="200" height="150" fill="#B21233"/>
    <rect y="150" width="200" height="150" fill="#1a1a1a"/>
    <rect y="148" width="200" height="4" fill="#6b0e1e"/>
    ${tekstRegels}
  </svg>`;
}


function nbKleurVoor(hex) {
  if (!hex) return '#fff';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) > 140 ? '#222' : '#fff';
}

// ── PRIJS FORMATTEREN ──
function nbPrijs(p) {
  return '€\u202F' + p.toFixed(2).replace('.', ',');
}

// ── BOEK KAART RENDEREN ──
function nbCoverURL(b) {
  // Gebruik handmatig opgegeven omslag als dat er is
  if (b.omslag) return b.omslag;
  // Haal automatisch cover op via ISBN (streepjes verwijderen)
  const isbn = (b.isbn || '').replace(/-/g, '');
  if (isbn) return 'https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean=' + isbn + '&size=l';
  return null;
}

function nbRenderKaart(b) {
  const label = b.nieuw
    ? '<span class="nb-label nb-label-nieuw">Nieuw</span>'
    : b.aanbieding ? '<span class="nb-label nb-label-aanbieding">Aanbieding</span>' : '';
  const prijsOud = b.prijsOud ? nbPrijs(b.prijsOud) : null;
  const coverURL = nbCoverURL(b);
  const coverInhoud = coverURL
    ? '<img src="' + escHtml(coverURL) + '" alt="Omslag ' + escHtml(b.titel) + '" loading="lazy"'
      + ' onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'">'
      + '<div style="display:none;width:100%;height:100%;position:absolute;top:0;left:0;">' + nbPlaceholder(b.titel) + '</div>'
    : nbPlaceholder(b.titel);

  const kaartStijl = 'display:flex;flex-direction:column;overflow:hidden;background:white;'
    + 'border:1px solid #d6d2ca;border-radius:6px;cursor:pointer;'
    + 'transition:transform 0.2s,box-shadow 0.2s;';
  const coverStijl = 'width:100%;flex-shrink:0;overflow:hidden;position:relative;display:block;';
  const infoStijl  = 'padding:0.7rem;display:flex;flex-direction:column;flex:1;border-top:1px solid #e8e4dc;';
  const footerStijl = 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem;margin-top:auto;';

  let html = '<div class="nb-kaart" style="' + kaartStijl + '"'
    + ' onclick="location.href=\'boek.html?id=' + b.id + '\'"'
    + ' itemscope itemtype="https://schema.org/Book"'
    + ' role="link" tabindex="0"'
    + ' aria-label="' + escHtml(b.titel) + ' — ' + escHtml(b.auteur) + ' — ' + nbPrijs(b.prijs) + '">'
    + '<meta itemprop="name" content="' + escHtml(b.titel) + '">'
    + '<meta itemprop="author" content="' + escHtml(b.auteur) + '">'
    + '<meta itemprop="isbn" content="' + escHtml(b.isbn || '') + '">'
    + '<div class="nb-cover" style="' + coverStijl + '">'
    + label + coverInhoud
    + '</div>'
    + '<div class="nb-kaart-info" style="' + infoStijl + '">'
    + '<div class="nb-kaart-cat">' + escHtml(nbCatsLabel(b)) + '</div>'
    + '<div class="nb-kaart-titel">' + escHtml(b.titel) + '</div>'
    + '<div class="nb-kaart-auteur">' + escHtml(b.auteur) + '</div>'
    + '<div class="nb-kaart-footer" style="' + footerStijl + '">'
    + '<div class="nb-prijs-blok">'
    + (prijsOud ? '<span class="nb-prijs-oud">' + prijsOud + '</span>' : '')
    + '<span class="nb-prijs" itemprop="offers" itemscope itemtype="https://schema.org/Offer">'
    + '<span itemprop="price">' + nbPrijs(b.prijs) + '</span>'
    + '<meta itemprop="priceCurrency" content="EUR">'
    + '</span>'
    + '</div>'
    + '<a class="nb-btn-bestel" href="' + escHtml(b.afrekenen) + '" target="_blank" rel="noopener"'
    + ' onclick="event.stopPropagation()">Bestellen</a>'
    + '</div>'
    + '</div>'
    + '</div>';
  return html;
}

// ── HTML ESCAPEN ──
function escHtml(t) {
  return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CATEGORIEËN HULPFUNCTIES ──
function nbCats(b) {
  // Ondersteunt zowel oud formaat (string) als nieuw (array)
  const c = b.categorieën || b.categorie;
  if (Array.isArray(c)) return c.filter(Boolean);
  return c ? [c] : [];
}

function nbCatsLabel(b) {
  return nbCats(b).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
}

function nbInCategorie(b, slug) {
  return nbCats(b).includes(slug);
}

// ── BOEKEN LADEN ──
async function nbLaadBoeken() {
  try {
    const r = await fetch('boeken.json');
    return await r.json();
  } catch(e) {
    console.error('Kon boeken.json niet laden:', e);
    return [];
  }
}

// ── SIDEBAR CATEGORIEËN VULLEN ──
function nbVulSidebar(boeken, actiefSlug) {
  const el = document.getElementById('nbSidebarCats');
  if (!el) return;

  // Tel boeken per categorie (elk boek telt mee voor elke categorie)
  const tellingen = {};
  boeken.forEach(b => {
    nbCats(b).forEach(c => { tellingen[c] = (tellingen[c]||0) + 1; });
  });

  // Unieke categorieën gesorteerd op naam
  const cats = [...new Set(boeken.flatMap(b => nbCats(b)))].sort();

  el.innerHTML = '<li><a href="index.html" class="' + (!actiefSlug ? 'actief' : '') + '">'
    + 'Alle boeken <span class="nb-cat-count">' + boeken.length + '</span>'
    + '</a></li>'
    + cats.map(slug =>
        '<li><a href="categorie-' + escHtml(slug) + '.html" class="' + (actiefSlug === slug ? 'actief' : '') + '">'
        + escHtml(slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '))
        + ' <span class="nb-cat-count">' + (tellingen[slug]||0) + '</span>'
        + '</a></li>'
      ).join('');

  // Nieuwste boeken in sidebar
  const nieuwsteEl = document.getElementById('nbSidebarNieuwste');
  if (nieuwsteEl) {
    const nieuwste = [...boeken].sort((a, b) => b.id - a.id).slice(0, 5);
    nieuwsteEl.innerHTML = nieuwste.map(b => {
    const cover = nbCoverURL(b)
        ? '<img src="' + escHtml(nbCoverURL(b)) + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.outerHTML=\'<svg viewBox=\\\"0 0 28 42\\\" xmlns=\\\"http://www.w3.org/2000/svg\\\"><rect width=\\\"28\\\" height=\\\"21\\\" fill=\\\"#B21233\\\"/><rect y=\\\"21\\\" width=\\\"28\\\" height=\\\"21\\\" fill=\\\"#1a1a1a\\\"/></svg>\'">'
        : '<svg viewBox="0 0 28 42" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="21" fill="#B21233"/><rect y="21" width="28" height="21" fill="#1a1a1a"/></svg>';
      return '<a href="boek.html?id=' + b.id + '" class="nb-sb-nieuwste-item">'
        + '<div class="nb-sb-nieuwste-cover">' + cover + '</div>'
        + '<div class="nb-sb-nieuwste-tekst">'
        + '<div class="nb-sb-nieuwste-titel">' + escHtml(b.titel) + '</div>'
        + '<div class="nb-sb-nieuwste-auteur">' + escHtml(b.auteur) + '</div>'
        + '<div class="nb-sb-nieuwste-prijs">' + nbPrijs(b.prijs) + '</div>'
        + '</div>'
        + '</a>';
    }).join('');
  }

  // Fix coverhoogtes na renderen
  setTimeout(nbFixCoverHoogtes, 150);
}

// ── GEDEELDE HEADER HTML ──
function nbHeaderHTML(actiefNav, categorieën) {
  const nav = [
    { href: 'index.html',        label: 'Alle boeken' },
    { href: 'toptien.html',      label: 'Top Tien' },
    { href: 'nieuw.html',        label: 'Nieuw' },
    { href: 'aanbiedingen.html', label: 'Aanbiedingen' },
  ];

  const catItems = (categorieën || []).map(c =>
    '<a href="categorie-' + escHtml(c.slug) + '.html">'
    + escHtml(c.naam)
    + '</a>'
  ).join('');

  return '<div class="nb-topbar">'
    + '<span>Boekhandel Roelants · Van Broeckhuysenstraat 34, 6511 PJ Nijmegen</span>'
    + '<span><a href="tel:+31243221734">024 322 17 34</a>&nbsp;·&nbsp;<a href="mailto:nijmegen@roelants.nl">nijmegen@roelants.nl</a></span>'
    + '</div>'
    + '<div class="nb-hero"><div class="nb-hero-overlay"></div>'
    + '<div class="nb-hero-inhoud">'
    + '<div class="nb-logo"><a href="index.html">'
    + '<div class="nb-logo-naam">Nijmeegse Boeken</div>'
    + '<div class="nb-logo-sub">Boeken uit en over Nijmegen</div>'
    + '</a></div>'
    + '<div class="nb-hero-rechts">'
    + '<div class="nb-zoekbalk">'
    + '<input type="search" id="nbZoekInput" placeholder="Zoek op titel, auteur, onderwerp\u2026" aria-label="Zoeken">'
    + '<button onclick="nbZoek()" aria-label="Zoeken">\u2315</button>'
    + '</div>'
    + '<div class="nb-badges">'
    + '<span class="nb-badge">\u2713 Gratis verzending vanaf \u20ac30,-</span>'
    + '<span class="nb-badge">\u2713 Afhalen bij Roelants</span>'
    + '</div></div></div></div>'
    + '<nav class="nb-nav" aria-label="Hoofdnavigatie">'
    + '<div class="nb-nav-inner">'
    + nav.map(n => '<a href="' + n.href + '" class="' + (actiefNav === n.href ? 'actief' : '') + '">' + n.label + '</a>').join('')
    + '<div class="nb-nav-dropdown" id="nbCatDropdown">'
    + '<button class="nb-nav-dropdown-btn" onclick="nbToggleDropdown(event)" aria-expanded="false" aria-haspopup="true">'
    + 'Categorie\u00ebn <span class="nb-nav-chevron">&#9660;</span>'
    + '</button>'
    + '<div class="nb-nav-dropdown-menu" id="nbCatMenu" role="menu">'
    + '<div class="nb-nav-dropdown-cols">' + catItems + '</div>'
    + '<a href="index.html" class="nb-nav-dropdown-alle">Alle categorieën →</a>'
    + '</div></div>'
    + '</div></nav>'
    + '<div class="nb-welkom"><div class="nb-welkom-inner">'
    + '<p>Welkom in de winkel voor Nijmeegse boeken, een initiatief van <a href="https://roelants.nl" target="_blank" rel="noopener">Boekhandel Roelants</a>. Gratis verzending binnen Nederland bij bestellingen boven de €30,-, anders €4,95. Uiteraard kunt u uw bestelling zonder verzendkosten ook bij ons in de winkel komen afhalen. We doen ons best om onze voorraad en de website zo volledig mogelijk te houden. Wilt u zeker weten dat het boek op voorraad is, informeer dan vooraf even per mail of telefoon.</p>'
    + '<p>Voor relatiegeschenken in grotere hoeveelheden kunnen wij een aantrekkelijke korting bieden. Neem daarvoor rechtstreeks contact met ons op via <a href="tel:+31243221734">024 322 17 34</a> of <a href="mailto:roelants@roelants.nl">roelants@roelants.nl</a>.</p>'
    + '</div></div>';
}

// ── GEDEELDE FOOTER HTML ──
function nbFooterHTML(categorieën) {
  const catLinks = (categorieën || []).map(c =>
    `<li><a href="categorie-${escHtml(c.slug)}.html">${escHtml(c.naam)}</a></li>`
  ).join('');

  return `
    <footer class="nb-footer">
      <div class="nb-footer-inner">
        <div class="nb-footer-blok">
          <h4>Nijmeegse Boeken</h4>
          <p>Het meest complete overzicht van boeken over Nijmegen en de regio. Een initiatief van Boekhandel Roelants.</p>
        </div>
        <div class="nb-footer-blok">
          <h4>Categorieën</h4>
          <ul>${catLinks}</ul>
        </div>
        <div class="nb-footer-blok">
          <h4>Contact</h4>
          <p>
            Boekhandel Roelants<br>
            Van Broeckhuysenstraat 34<br>
            6511 PJ Nijmegen<br>
            <a href="tel:+31243221734">024 322 17 34</a><br>
            <a href="mailto:nijmegen@roelants.nl">nijmegen@roelants.nl</a>
          </p>
        </div>
      </div>
      <div class="nb-footer-bottom">
        &copy; 2026 Nijmeegse Boeken &mdash; Boekhandel Roelants
      </div>
    </footer>`;
}

// ── COVER HOOGTE FIXER ──
// Zet de hoogte van elke cover expliciet op 1.5x de breedte (2:3 verhouding)
function nbFixCoverHoogtes() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.nb-cover').forEach(el => {
        const w = el.getBoundingClientRect().width;
        if (w > 0) el.style.height = Math.round(w * 1.5) + 'px';
      });
    });
  });
}

window.addEventListener('resize', () => {
  clearTimeout(window._nbResizeTimer);
  window._nbResizeTimer = setTimeout(nbFixCoverHoogtes, 100);
});

// ── SORTEREN ──
function nbSorteer(boeken, methode) {
  const kopie = [...boeken];
  switch (methode) {
    case 'id-desc':   return kopie.sort((a, b) => (b.id||0) - (a.id||0));
    case 'jaar-desc': return kopie.sort((a, b) => (b.jaar||0) - (a.jaar||0));
    case 'jaar-asc':  return kopie.sort((a, b) => (a.jaar||0) - (b.jaar||0));
    case 'titel-asc': return kopie.sort((a, b) => (a.titel||'').localeCompare(b.titel||'', 'nl'));
    case 'prijs-asc': return kopie.sort((a, b) => (a.prijs||0) - (b.prijs||0));
    case 'prijs-desc':return kopie.sort((a, b) => (b.prijs||0) - (a.prijs||0));
    default:          return kopie.sort((a, b) => (b.id||0) - (a.id||0));
  }
}

const NB_SORTEER_OPTIES = [
  { waarde: 'id-desc',    label: 'Nieuwst toegevoegd' },
  { waarde: 'jaar-desc',  label: 'Jaar (nieuwste eerst)' },
  { waarde: 'jaar-asc',   label: 'Jaar (oudste eerst)' },
  { waarde: 'titel-asc',  label: 'Titel (A–Z)' },
  { waarde: 'prijs-asc',  label: 'Prijs (laag–hoog)' },
  { waarde: 'prijs-desc', label: 'Prijs (hoog–laag)' },
];

function nbSorteerBalk(huidig) {
  huidig = huidig || 'id-desc';
  const label = NB_SORTEER_OPTIES.find(o => o.waarde === huidig)?.label || 'Sorteren';
  return '<div class="nb-sorteer-wrap">'
    + '<button class="nb-sorteer-btn" onclick="nbToggleSorteer(event)" aria-expanded="false">'
    + 'Sorteren: <strong>' + label + '</strong> &#9660;'
    + '</button>'
    + '<div class="nb-sorteer-menu" id="nbSorteerMenu">'
    + NB_SORTEER_OPTIES.map(o =>
        '<button onclick="nbKiesSorteer(\'' + o.waarde + '\')" class="nb-sorteer-optie'
        + (o.waarde === huidig ? ' actief' : '') + '">'
        + o.label + '</button>'
      ).join('')
    + '</div>'
    + '</div>';
}

function nbToggleSorteer(e) {
  e.stopPropagation();
  const menu = document.getElementById('nbSorteerMenu');
  const btn  = e.currentTarget;
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
}

document.addEventListener('click', () => {
  document.getElementById('nbSorteerMenu')?.classList.remove('open');
  document.querySelector('.nb-sorteer-btn')?.setAttribute('aria-expanded', 'false');
});

// Huidige sortering bijhouden per pagina
let nbHuidigeSorteer = 'id-desc';

function nbKiesSorteer(methode) {
  nbHuidigeSorteer = methode;
  document.getElementById('nbSorteerMenu')?.classList.remove('open');

  // Update knoptekst
  const label = NB_SORTEER_OPTIES.find(o => o.waarde === methode)?.label || '';
  const btn = document.querySelector('.nb-sorteer-btn strong');
  if (btn) btn.textContent = label;

  // Herrender alle zichtbare grids
  if (typeof nbHerrendeer === 'function') nbHerrendeer(methode);
}

// ── DROPDOWN TOGGLE ──
function nbToggleDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('nbCatMenu');
  const btn  = document.getElementById('nbCatDropdown').querySelector('.nb-nav-dropdown-btn');
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
}

document.addEventListener('click', () => {
  const menu = document.getElementById('nbCatMenu');
  const btn  = document.getElementById('nbCatDropdown')?.querySelector('.nb-nav-dropdown-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
});

// ── ZOEKEN (navigeert naar index met query) ──
function nbZoek() {
  const q = document.getElementById('nbZoekInput')?.value?.trim();
  if (q) window.location.href = `index.html?zoek=${encodeURIComponent(q)}`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'nbZoekInput') nbZoek();
});
