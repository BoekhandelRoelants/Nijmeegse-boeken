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
function nbRenderKaart(b) {
  const label = b.nieuw
    ? `<span class="nb-label nb-label-nieuw">Nieuw</span>`
    : b.aanbieding ? `<span class="nb-label nb-label-aanbieding">Aanbieding</span>` : '';
  const prijsOud = b.prijsOud ? nbPrijs(b.prijsOud) : null;

  const coverInhoud = b.omslag
    ? `<img src="${b.omslag}" alt="Omslag ${escHtml(b.titel)}" loading="lazy">`
    : nbPlaceholder(b.titel);

  return `
    <a class="nb-kaart" href="boek.html?id=${b.id}"
       itemscope itemtype="https://schema.org/Book"
       aria-label="${escHtml(b.titel)} — ${escHtml(b.auteur)} — ${nbPrijs(b.prijs)}">
      <meta itemprop="name" content="${escHtml(b.titel)}">
      <meta itemprop="author" content="${escHtml(b.auteur)}">
      <meta itemprop="isbn" content="${escHtml(b.isbn||'')}">
      <div class="nb-cover">
        ${label}${coverInhoud}
      </div>
      <div class="nb-kaart-info">
        <div class="nb-kaart-cat">${escHtml(b.categorie)}</div>
        <div class="nb-kaart-titel">${escHtml(b.titel)}</div>
        <div class="nb-kaart-auteur">${escHtml(b.auteur)}</div>
        <div class="nb-kaart-footer">
          <div class="nb-prijs-blok">
            ${prijsOud ? `<span class="nb-prijs-oud">${prijsOud}</span>` : ''}
            <span class="nb-prijs" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
              <span itemprop="price">${nbPrijs(b.prijs)}</span>
              <meta itemprop="priceCurrency" content="EUR">
            </span>
          </div>
          <a class="nb-btn-bestel" href="${escHtml(b.afrekenen)}" target="_blank" rel="noopener"
             onclick="event.stopPropagation()">Bestellen</a>
        </div>
      </div>
    </a>`;
}

// ── HTML ESCAPEN ──
function escHtml(t) {
  return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

  // Tel boeken per categorie
  const tellingen = {};
  boeken.forEach(b => { tellingen[b.categorie] = (tellingen[b.categorie]||0) + 1; });

  // Unieke categorieën in volgorde van voorkomen
  const cats = [...new Set(boeken.map(b => b.categorie))];

  el.innerHTML = `
    <li><a href="index.html" class="${!actiefSlug ? 'actief' : ''}">
      Alle boeken <span class="nb-cat-count">${boeken.length}</span>
    </a></li>
    ${cats.map(slug => `
      <li><a href="categorie-${escHtml(slug)}.html" class="${actiefSlug === slug ? 'actief' : ''}">
        ${escHtml(slug.charAt(0).toUpperCase() + slug.slice(1))}
        <span class="nb-cat-count">${tellingen[slug]||0}</span>
      </a></li>
    `).join('')}`;
}

// ── GEDEELDE HEADER HTML ──
function nbHeaderHTML(actiefNav) {
  const nav = [
    { href: 'index.html',        label: 'Alle boeken' },
    { href: 'nieuw.html',        label: 'Nieuw' },
    { href: 'aanbiedingen.html', label: 'Aanbiedingen' },
  ];

  return `
    <div class="nb-topbar">
      <span>Boekhandel Roelants · Van Broeckhuysenstraat 34, 6511 PJ Nijmegen</span>
      <span>
        <a href="tel:+31243221734">024 322 17 34</a>
        &nbsp;·&nbsp;
        <a href="mailto:nijmegen@roelants.nl">nijmegen@roelants.nl</a>
      </span>
    </div>
    <div class="nb-hero">
      <div class="nb-hero-overlay"></div>
      <div class="nb-hero-inhoud">
        <div class="nb-logo">
          <a href="index.html">
            <div class="nb-logo-naam">Nijmeegse Boeken</div>
            <div class="nb-logo-sub">Boeken uit en over Nijmegen</div>
          </a>
        </div>
        <div class="nb-hero-rechts">
          <div class="nb-zoekbalk">
            <input type="search" id="nbZoekInput" placeholder="Zoek op titel, auteur, onderwerp…" aria-label="Zoeken">
            <button onclick="nbZoek()" aria-label="Zoeken">⌕</button>
          </div>
          <div class="nb-badges">
            <span class="nb-badge">✓ Gratis verzending vanaf €30,-</span>
            <span class="nb-badge">✓ Afhalen bij Roelants</span>
          </div>
        </div>
      </div>
    </div>
    <nav class="nb-nav" aria-label="Hoofdnavigatie">
      <div class="nb-nav-inner">
        ${nav.map(n => `<a href="${n.href}" class="${actiefNav === n.href ? 'actief' : ''}">${n.label}</a>`).join('')}
      </div>
    </nav>
    <div class="nb-welkom">
      <div class="nb-welkom-inner">
        <p>Welkom in de winkel voor Nijmeegse boeken, een initiatief van <a href="https://roelants.nl" target="_blank" rel="noopener">Boekhandel Roelants</a>. Gratis verzending binnen Nederland bij bestellingen boven de €30,-, anders €4,95. Uiteraard kunt u uw bestelling zonder verzendkosten ook bij ons in de winkel komen afhalen. We doen ons best om onze voorraad en de website zo volledig mogelijk te houden. Wilt u zeker weten dat het boek op voorraad is, informeer dan vooraf even per mail of telefoon.</p>
        <p>Voor relatiegeschenken in grotere hoeveelheden kunnen wij een aantrekkelijke korting bieden. Neem daarvoor rechtstreeks contact met ons op via <a href="tel:+31243221734">024 322 17 34</a> of <a href="mailto:roelants@roelants.nl">roelants@roelants.nl</a>.</p>
      </div>
    </div>`;
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

// ── ZOEKEN (navigeert naar index met query) ──
function nbZoek() {
  const q = document.getElementById('nbZoekInput')?.value?.trim();
  if (q) window.location.href = `index.html?zoek=${encodeURIComponent(q)}`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'nbZoekInput') nbZoek();
});
