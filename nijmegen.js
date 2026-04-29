// ══════════════════════════════════════════════════════════
// NIJMEEGSE BOEKEN — Gedeeld JavaScript
// ══════════════════════════════════════════════════════════

// ── INSTELLINGEN LADEN ──
let _nbInst = null;
async function nbLaadInstellingen() {
  if (_nbInst) return _nbInst;
  try {
    const r = await fetch('instellingen.json');
    if (r.ok) _nbInst = await r.json();
  } catch(e) {}
  if (!_nbInst) _nbInst = {};
  return _nbInst;
}

function nbTekst(sleutel, standaard) {
  return (_nbInst && _nbInst.teksten && _nbInst.teksten[sleutel]) || standaard || '';
}

// ── PLACEHOLDER: Nijmeegse vlag met boeknaam in zwart vlak ──
function nbPlaceholder(titel) {
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
  const zichtbaar = regels.slice(0, 4);
  const regelH = 22;
  const totaalH = zichtbaar.length * regelH;
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

// ── BOEK URL (slug of id-fallback) ──
function nbBoekUrl(b) {
  return b.slug ? 'Boeken/' + b.slug + '.html' : 'boek.html?id=' + b.id;
}

// ── COVER URL ──
function nbCoverURL(b) {
  if (b.omslag) return b.omslag;
  const isbn = (b.isbn || '').replace(/-/g, '');
  if (isbn) return 'https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean=' + isbn + '&size=l';
  return null;
}

// Set van IDs van de 20 nieuwste boeken
let _nbNieuwIDs = new Set();

// ── BOEK KAART RENDEREN ──
function nbRenderKaart(b, toptienNr) {
  let label;
  if (toptienNr) {
    label = '<span class="nb-label-nr">' + toptienNr + '</span>';
  } else if (_nbNieuwIDs.has(b.id)) {
    label = '<span class="nb-label nb-label-nieuw">Nieuw</span>';
  } else if (b.aanbieding) {
    label = '<span class="nb-label nb-label-aanbieding">Aanbieding</span>';
  } else {
    label = '';
  }
  const prijsOud = b.prijsOud ? nbPrijs(b.prijsOud) : null;
  const coverURL = nbCoverURL(b);
  const boekUrl  = nbBoekUrl(b);
  const coverInhoud = coverURL
    ? '<img src="' + escHtml(coverURL) + '" alt="Omslag ' + escHtml(b.titel) + '" loading="lazy"'
      + ' onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'">'
      + '<div style="display:none;width:100%;height:100%;position:absolute;top:0;left:0;">' + nbPlaceholder(b.titel) + '</div>'
    : nbPlaceholder(b.titel);

  const kaartStijl  = 'display:flex;flex-direction:column;overflow:hidden;background:white;border:1px solid #d6d2ca;border-radius:6px;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;';
  const coverStijl  = 'width:100%;flex-shrink:0;overflow:hidden;position:relative;display:block;';
  const infoStijl   = 'padding:0.7rem;display:flex;flex-direction:column;flex:1;border-top:1px solid #e8e4dc;';
  const footerStijl = 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem;margin-top:auto;';

  return '<div class="nb-kaart" style="' + kaartStijl + '"'
    + ' onclick="location.href=\'' + escHtml(boekUrl) + '\'"'
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
    + '<div class="nb-kaart-cat">' + escHtml(nbCatsLabel(b, 2)) + '</div>'
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
    + '<a class="nb-btn-bestel' + (b.uitverkocht ? ' nb-btn-uitverkocht' : '') + '"'
    + (b.uitverkocht ? '' : ' href="' + escHtml(b.afrekenen) + '" target="_blank" rel="noopener"')
    + ' onclick="event.stopPropagation()">'
    + (b.uitverkocht ? 'Uitverkocht' : 'Bestellen') + '</a>'
    + '</div>'
    + '</div>'
    + '</div>';
}

// ── HTML ESCAPEN ──
function escHtml(t) {
  return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CATEGORIEËN HULPFUNCTIES ──
function nbCats(b) {
  const c = b.categorieën || b.categorie;
  if (Array.isArray(c)) return c.filter(Boolean);
  return c ? [c] : [];
}

function nbCatsLabel(b, max) {
  const cats = nbCats(b).slice(0, max || 999);
  return cats.map(c => c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g,' ')).join(', ');
}

function nbInCategorie(b, slug) {
  return nbCats(b).includes(slug);
}

// ── BOEKEN LADEN (inclusief vaste boeken) ──
async function nbLaadBoeken() {
  try {
    const [r1, r2] = await Promise.all([
      fetch('boeken.json'),
      fetch('boeken-vast.json').catch(() => null),
    ]);
    const boeken = await r1.json();
    const vast   = r2 && r2.ok ? await r2.json() : [];

    const bestaandeIDs   = new Set(boeken.map(b => b.id));
    const bestaandeISBNs = new Set(boeken.map(b => (b.isbn||'').replace(/-/g,'')).filter(Boolean));
    const nieuweVaste = vast.filter(b => !bestaandeIDs.has(b.id)).map(b => {
      const isbn = (b.isbn||'').replace(/-/g,'');
      return { ...b, uitverkocht: isbn ? !bestaandeISBNs.has(isbn) : true };
    });
    const alle = [...boeken, ...nieuweVaste];
    _nbNieuwIDs = new Set(nbNieuwBoeken(alle, 20).map(b => b.id));
    return alle;
  } catch(e) {
    console.error('Kon boeken.json niet laden:', e);
    return [];
  }
}

// ── SIDEBAR VULLEN ──
function nbVulSidebar(boeken, actiefSlug) {
  const el = document.getElementById('nbSidebarCats');
  if (!el) return;

  const tellingen = {};
  boeken.forEach(b => { nbCats(b).forEach(c => { tellingen[c] = (tellingen[c]||0) + 1; }); });

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

  const nieuwsteEl = document.getElementById('nbSidebarNieuwste');
  if (nieuwsteEl) {
    const nieuwste = [...boeken].sort((a, b) => b.id - a.id).slice(0, 5);
    nieuwsteEl.innerHTML = nieuwste.map(b => {
      const cover = nbCoverURL(b)
        ? '<img src="' + escHtml(nbCoverURL(b)) + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.outerHTML=\'<svg viewBox=\\\"0 0 28 42\\\" xmlns=\\\"http://www.w3.org/2000/svg\\\"><rect width=\\\"28\\\" height=\\\"21\\\" fill=\\\"#B21233\\\"/><rect y=\\\"21\\\" width=\\\"28\\\" height=\\\"21\\\" fill=\\\"#1a1a1a\\\"/></svg>\'">'
        : '<svg viewBox="0 0 28 42" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="21" fill="#B21233"/><rect y="21" width="28" height="21" fill="#1a1a1a"/></svg>';
      return '<a href="' + escHtml(nbBoekUrl(b)) + '" class="nb-sb-nieuwste-item">'
        + '<div class="nb-sb-nieuwste-cover">' + cover + '</div>'
        + '<div class="nb-sb-nieuwste-tekst">'
        + '<div class="nb-sb-nieuwste-titel">' + escHtml(b.titel) + '</div>'
        + '<div class="nb-sb-nieuwste-auteur">' + escHtml(b.auteur) + '</div>'
        + '<div class="nb-sb-nieuwste-prijs">' + nbPrijs(b.prijs) + '</div>'
        + '</div>'
        + '</a>';
    }).join('');
  }

  setTimeout(nbFixCoverHoogtes, 150);
}

// ── GEDEELDE HEADER HTML ──
function nbHeaderHTML(actiefNav, categorieën) {
  const nav = [
    { href: 'index.html', label: '<img src="stevenskerk-wit.png" alt="Hoofdpagina" style="height:22px;width:auto;vertical-align:middle;position:relative;top:-1px;">' },
    { href: 'alleboeken.html',   label: 'Alle boeken' },
    { href: 'toptien.html',      label: 'Top Tien' },
    { href: 'nieuw.html',        label: 'Nieuw' },
    { href: 'aanbiedingen.html', label: 'Aanbiedingen' },
    { href: 'categorie-nijmegen-zo-mooi-als-het-was.html', label: 'Nijmegen, zo mooi als het was' },
  ];

  const catItems = (categorieën || []).map(c =>
    '<a href="categorie-' + escHtml(c.slug) + '.html">' + escHtml(c.naam) + '</a>'
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
    + '<span class="nb-badge"><img src="mol.png" alt="" class="nb-mol"> Afhalen bij Roelants</span>'
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
    + '</div></nav>';
}

function nbWelkomHTML() {
  const t1 = nbTekst('welkom', 'Welkom in de winkel voor Nijmeegse boeken, een initiatief van <a href="https://roelants.nl" target="_blank" rel="noopener">Boekhandel Roelants</a>.');
  const t2 = nbTekst('welkom2', '');
  return '<div class="nb-welkom"><div class="nb-welkom-inner">'
    + '<p>' + t1 + '</p>'
    + (t2 ? '<p>' + t2 + '</p>' : '')
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
          <p>${nbTekst('footer', 'Het meest complete overzicht van boeken over Nijmegen en de regio. Een initiatief van Boekhandel Roelants.')}</p>
        </div>
        <div class="nb-footer-blok">
          <h4>Categorieën</h4>
          <ul>${catLinks}</ul>
        </div>
        <div class="nb-footer-blok">
          <h4>Contact</h4>
          <p>
            <img src="mol.png" alt="" class="nb-mol-contact"> Boekhandel Roelants<br>
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

// ── NIEUWSTE BOEKEN (top 20 op jaar desc, id desc) ──
function nbNieuwBoeken(boeken, max) {
  return [...boeken]
    .sort((a, b) => (b.jaar||0) - (a.jaar||0) || (b.id||0) - (a.id||0))
    .slice(0, max || 20);
}

// ── SORTEREN ──
function nbSorteer(boeken, methode) {
  const kopie = [...boeken];
  switch (methode) {
    case 'id-desc':    return kopie.sort((a, b) => (b.id||0) - (a.id||0));
    case 'jaar-desc':  return kopie.sort((a, b) => (b.jaar||0) - (a.jaar||0) || (b.id||0) - (a.id||0));
    case 'jaar-asc':   return kopie.sort((a, b) => (a.jaar||0) - (b.jaar||0) || (a.id||0) - (b.id||0));
    case 'titel-asc':  return kopie.sort((a, b) => (a.titel||'').localeCompare(b.titel||'', 'nl'));
    case 'prijs-asc':  return kopie.sort((a, b) => (a.prijs||0) - (b.prijs||0));
    case 'prijs-desc': return kopie.sort((a, b) => (b.prijs||0) - (a.prijs||0));
    default:           return kopie.sort((a, b) => (b.id||0) - (a.id||0));
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

let nbHuidigeSorteer = 'id-desc';

function nbKiesSorteer(methode) {
  nbHuidigeSorteer = methode;
  document.getElementById('nbSorteerMenu')?.classList.remove('open');
  const label = NB_SORTEER_OPTIES.find(o => o.waarde === methode)?.label || '';
  const btn = document.querySelector('.nb-sorteer-btn strong');
  if (btn) btn.textContent = label;
  if (typeof nbHerrendeer === 'function') nbHerrendeer(methode);
}

// ── PAGINERING ──
const NB_PER_PAGINA = 24;

function nbPaginering(boeken, paginaEl, gridEl, huidige) {
  huidige = huidige || 1;
  const totaal = Math.ceil(boeken.length / NB_PER_PAGINA);
  const van    = (huidige - 1) * NB_PER_PAGINA;
  const tot    = Math.min(van + NB_PER_PAGINA, boeken.length);
  const pagina = boeken.slice(van, tot);

  gridEl.innerHTML = pagina.length
    ? pagina.map(b => nbRenderKaart(b)).join('')
    : '<p class="nb-leeg">Geen boeken gevonden.</p>';
  nbFixCoverHoogtes();
  setTimeout(nbFixCoverHoogtes, 300);

  if (totaal <= 1) { paginaEl.innerHTML = ''; return; }

  let html = '<div class="nb-paginering">';
  html += huidige > 1
    ? '<button class="nb-pag-btn" onclick="nbGaNaarPagina(' + (huidige-1) + ')">&lsaquo; Vorige</button>'
    : '<button class="nb-pag-btn" disabled>&lsaquo; Vorige</button>';

  const nummers = [];
  for (let i = 1; i <= totaal; i++) {
    if (i === 1 || i === totaal || (i >= huidige - 2 && i <= huidige + 2)) nummers.push(i);
    else if (nummers[nummers.length - 1] !== '...') nummers.push('...');
  }
  nummers.forEach(n => {
    if (n === '...') html += '<span class="nb-pag-sep">&hellip;</span>';
    else html += '<button class="nb-pag-btn nb-pag-num' + (n === huidige ? ' actief' : '') + '" onclick="nbGaNaarPagina(' + n + ')">' + n + '</button>';
  });

  html += huidige < totaal
    ? '<button class="nb-pag-btn" onclick="nbGaNaarPagina(' + (huidige+1) + ')">Volgende &rsaquo;</button>'
    : '<button class="nb-pag-btn" disabled>Volgende &rsaquo;</button>';
  html += '<span class="nb-pag-info">' + (van+1) + '–' + tot + ' van ' + boeken.length + '</span>';
  html += '</div>';
  paginaEl.innerHTML = html;
}

window.nbGaNaarPagina = function(nr) {
  window._nbPaginaHuidig = nr;
  const grid  = document.querySelector('.nb-grid[id]');
  const pagEl = document.getElementById('nbPaginering');
  if (grid && pagEl && window._nbPaginaBoeken) {
    nbPaginering(window._nbPaginaBoeken, pagEl, grid, nr);
    window.scrollTo({ top: grid.offsetTop - 80, behavior: 'smooth' });
  }
};

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

function nbZoek() {
  const q = document.getElementById('nbZoekInput')?.value?.trim();
  if (q) window.location.href = `index.html?zoek=${encodeURIComponent(q)}`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'nbZoekInput') nbZoek();
});


// ══════════════════════════════════════════════════════════
// BOEKPAGINA LADEN
// Gedeelde functie voor boek.html en Boeken/{slug}.html pagina's
// ══════════════════════════════════════════════════════════
async function nbLaadBoekPagina(zoekId, zoekSlug) {
  const boeken = await nbLaadBoeken();
  await nbLaadInstellingen();
  const cats = [...new Set(boeken.flatMap(b => (b.categorieën||b.categorie
    ? (Array.isArray(b.categorieën||b.categorie) ? (b.categorieën||b.categorie) : [b.categorieën||b.categorie])
    : [])))].sort().map(s => ({naam: s.charAt(0).toUpperCase()+s.slice(1).replace(/-/g,' '), slug: s}));

  // Zoek het boek (slug heeft voorrang, daarna id)
  let b;
  if (zoekSlug) b = boeken.find(x => x.slug === zoekSlug);
  if (!b && zoekId) b = boeken.find(x => x.id === zoekId);

  document.getElementById('nbHeader').innerHTML = nbHeaderHTML('', cats);
  document.getElementById('nbFooter').innerHTML = nbFooterHTML(cats);

  if (!b) {
    document.getElementById('laadIndicator').style.display = 'none';
    document.getElementById('foutMelding').style.display = 'block';
    return;
  }

  // SEO — dynamisch instellen (voor boek.html; in Boeken/*.html al hardcoded maar vernieuw voor zekerheid)
  const boekUrl      = nbBoekUrl(b);
  const canonicalURL = 'https://nijmeegseboeken.nl/' + boekUrl;
  const pageTitel    = b.titel + ' \u2013 ' + b.auteur + ' | Nijmeegse Boeken';
  const isbn         = (b.isbn||'').replace(/-/g,'');

  document.title = pageTitel;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = (b.beschrijving||'').substring(0,155);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = canonicalURL;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = b.titel + ' \u2013 ' + b.auteur;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = (b.beschrijving||'').substring(0,155);
  if (isbn) {
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) ogImg.content = 'https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean=' + isbn + '&size=l';
  }

  // Schema.org (alleen toevoegen als nog niet aanwezig via hardcoded tag)
  if (!document.querySelector('script[type="application/ld+json"]')) {
    const s = document.createElement('script'); s.type = 'application/ld+json';
    s.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Book",
      "name": b.titel,
      "author": {"@type": "Person", "name": b.auteur},
      "publisher": {"@type": "Organization", "name": b.uitgever},
      "isbn": isbn, "datePublished": String(b.jaar||''),
      "numberOfPages": b.paginas, "inLanguage": "nl",
      "description": b.beschrijving,
      "image": isbn ? 'https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean=' + isbn + '&size=l' : '',
      "offers": {"@type":"Offer","price":b.prijs,"priceCurrency":"EUR","availability":"https://schema.org/InStock","url":b.afrekenen}
    });
    document.head.appendChild(s);
  }

  // Breadcrumb
  const eersteCat = nbCats(b)[0] || 'overig';
  const catNaam   = eersteCat.charAt(0).toUpperCase() + eersteCat.slice(1).replace(/-/g,' ');
  const bcCat = document.getElementById('bcCategorie');
  if (bcCat) { bcCat.textContent = catNaam; bcCat.href = 'categorie-' + eersteCat + '.html'; }
  const bcTit = document.getElementById('bcTitel');
  if (bcTit) bcTit.textContent = b.titel;

  // Breadcrumb schema
  const bc = document.createElement('script'); bc.type = 'application/ld+json';
  bc.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type":"ListItem","position":1,"name":"Nijmeegse Boeken","item":"https://nijmeegseboeken.nl/"},
      {"@type":"ListItem","position":2,"name":catNaam,"item":"https://nijmeegseboeken.nl/categorie-"+eersteCat+".html"},
      {"@type":"ListItem","position":3,"name":b.titel,"item":canonicalURL}
    ]
  });
  document.head.appendChild(bc);

  // Labels
  const lr = document.getElementById('labelRij');
  if (lr) {
    if (_nbNieuwIDs.has(b.id)) lr.innerHTML += '<span class="label-pill label-nieuw">Nieuw</span>';
    if (b.aanbieding) lr.innerHTML += '<span class="label-pill label-aanbieding">Aanbieding</span>';
    nbCats(b).forEach(c => { lr.innerHTML += '<span class="label-pill label-cat">'+escHtml(c.charAt(0).toUpperCase()+c.slice(1).replace(/-/g,' '))+'</span>'; });
  }

  // Cover
  const coverURL = nbCoverURL(b);
  const cc = document.getElementById('coverContainer');
  if (cc) {
    cc.innerHTML = coverURL
      ? '<img src="'+escHtml(coverURL)+'" alt="Omslag van '+escHtml(b.titel)+'" style="width:100%;height:100%;object-fit:cover;"'
        + ' onerror="this.style.display=\'none\';this.parentNode.appendChild(Object.assign(document.createElement(\'div\'),{innerHTML:nbPlaceholder(\''+escHtml(b.titel)+'\'),style:\'width:100%;height:100%\'}))">'
      : nbPlaceholder(b.titel);
  }

  const boekTitelEl = document.getElementById('boekTitel');
  if (boekTitelEl) boekTitelEl.textContent = b.titel;
  const ondertitelEl = document.getElementById('boekOndertitel');
  if (ondertitelEl && b.ondertitel) { ondertitelEl.textContent = b.ondertitel; ondertitelEl.style.display = ''; }
  const auteurEl = document.getElementById('boekAuteur');
  if (auteurEl) auteurEl.textContent = b.auteur;

  const prijsRij = document.getElementById('prijsRij');
  if (prijsRij) {
    const po = b.prijsOud ? '<span class="prijs-oud-groot">'+nbPrijs(b.prijsOud)+'</span>' : '';
    prijsRij.innerHTML = po + '<span class="prijs-groot">'+nbPrijs(b.prijs)+'</span><span style="font-size:0.8rem;color:var(--grijs-muted);align-self:center">incl. BTW</span>';
  }

  const beschEl = document.getElementById('boekBeschrijving');
  if (beschEl) beschEl.textContent = b.beschrijving||'';

  const specs = [['Auteur',b.auteur],['Uitgever',b.uitgever],['Jaar',b.jaar],["Pagina's",b.paginas],['Formaat',b.formaat],['ISBN',(b.isbn||'').replace(/-/g,'')],['Categorie',nbCatsLabel(b)]];
  const specsTable = document.getElementById('specsTable');
  if (specsTable) specsTable.innerHTML = specs.filter(([,v])=>v).map(([k,v])=>'<tr><td>'+k+'</td><td>'+escHtml(String(v))+'</td></tr>').join('');

  // Trefwoorden + categorie-labels
  const catLabels  = nbCats(b).map(slug => ({ tekst: slug.charAt(0).toUpperCase()+slug.slice(1).replace(/-/g,' '), href: 'categorie-'+slug+'.html', isCat: true }));
  const trefLabels = (b.trefwoorden||[]).map(t => ({ tekst: t, href: 'index.html?zoek='+encodeURIComponent(t), isCat: false }));
  const trefEl = document.getElementById('trefwoorden');
  if (trefEl) {
    const alle = [...catLabels, ...trefLabels];
    if (alle.length) trefEl.innerHTML = alle.map(t => '<a href="'+t.href+'" class="trefwoord'+(t.isCat?' trefwoord-cat':'')+'">' + escHtml(t.tekst)+'</a>').join('');
  }

  const btnBestel = document.getElementById('btnBestellen');
  if (btnBestel) {
    if (b.uitverkocht) {
      btnBestel.removeAttribute('href');
      btnBestel.textContent = 'Momenteel uitverkocht';
      btnBestel.style.background = 'var(--grijs-muted)';
      btnBestel.style.cursor = 'default';
      btnBestel.style.pointerEvents = 'none';
    } else {
      btnBestel.href = b.afrekenen;
    }
  }

  // Gerelateerde boeken
  const bCats = nbCats(b);
  const gerelateerd = boeken.filter(x => x.id !== b.id && nbCats(x).some(c => bCats.includes(c))).slice(0, 4);
  const gerGrid = document.getElementById('gereleateerdGrid');
  const gerBlok = document.getElementById('gereleateerdBlok');
  if (gerGrid && gerBlok) {
    if (gerelateerd.length) gerGrid.innerHTML = gerelateerd.map(x => nbRenderKaart(x)).join('');
    else gerBlok.style.display = 'none';
  }

  document.getElementById('laadIndicator').style.display = 'none';
  document.getElementById('paginaInhoud').style.display  = 'block';
}
