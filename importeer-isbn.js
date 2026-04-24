#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// NIJMEEGSE BOEKEN — ISBN Import Script
// ══════════════════════════════════════════════════════════
//
// GEBRUIK:
//   node importeer-isbn.js 9789000000001 9789000000002 9789000000003
//
// Of met een tekstbestand met ISBNs (één per regel):
//   node importeer-isbn.js --bestand isbnlijst.txt
//
// VEREISTEN:
//   - Node.js (installeer via https://nodejs.org)
//   - boeken.json in dezelfde map
//
// Het script:
//   1. Haalt boekdata op via OpenLibrary en Google Books API
//   2. Voegt nieuwe boeken toe aan boeken.json
//   3. Werkt bestaande boeken bij (prijs, beschrijving, etc.)
//   4. Slaat het bijgewerkte boeken.json op
// ══════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── CONFIGURATIE ──
const BOEKEN_JSON = path.join(__dirname, 'boeken.json');
const ROELANTS_BASE = 'https://www.roelants.nl/';
const WSCOVERS_BASE = 'https://wscovers1.tlsecure.com/cover?action=img&source=88300&ean=';

// Standaardwaarden voor nieuwe boeken
const STANDAARD_CATEGORIE = 'overig';
const STANDAARD_KLEUR     = '#B21233';

// ── HULPFUNCTIES ──

function haalURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NijmeegseBoekenImport/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error('HTTP ' + res.statusCode));
        }
      });
    }).on('error', reject);
  });
}

function haalJSON(url) {
  return haalURL(url).then(data => JSON.parse(data));
}

function cleanISBN(isbn) {
  return isbn.replace(/[^0-9X]/g, '');
}

function wacht(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── DATA OPHALEN VIA OPENIBRARY ──
async function haalOpenLibrary(isbn) {
  try {
    const data = await haalJSON(
      'https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn + '&format=json&jscmd=data'
    );
    const boek = data['ISBN:' + isbn];
    if (!boek) return null;

    const auteurs = (boek.authors || []).map(a => a.name).join(', ');
    const uitgevers = (boek.publishers || []).map(p => p.name).join(', ');
    const beschrijving = typeof boek.notes === 'string' ? boek.notes
      : boek.excerpts ? boek.excerpts[0]?.text || '' : '';

    return {
      titel:     boek.title || null,
      auteur:    auteurs || null,
      uitgever:  uitgevers || null,
      jaar:      boek.publish_date ? parseInt(boek.publish_date) || null : null,
      paginas:   boek.number_of_pages || null,
      beschrijving: beschrijving || null,
    };
  } catch(e) {
    return null;
  }
}

// ── DATA OPHALEN VIA GOOGLE BOOKS ──
async function haalGoogleBooks(isbn) {
  try {
    const data = await haalJSON(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn
    );
    const item = data.items && data.items[0];
    if (!item) return null;
    const info = item.volumeInfo || {};

    return {
      titel:       info.title || null,
      auteur:      (info.authors || []).join(', ') || null,
      uitgever:    info.publisher || null,
      jaar:        info.publishedDate ? parseInt(info.publishedDate) || null : null,
      paginas:     info.pageCount || null,
      beschrijving: info.description || null,
    };
  } catch(e) {
    return null;
  }
}

// ── PRIJS OPHALEN VIA ROELANTS.NL ──
async function haalRoelantsPrijs(isbn) {
  try {
    // Roelants gebruikt ISBN als directe URL: roelants.nl/{isbn}.html
    const html = await haalURL(ROELANTS_BASE + isbn + '.html');

    // Zoek prijs in HTML (patroon: € 24,95 of €24.95)
    const prijsMatch = html.match(/€\s*([\d]+[,.][\d]{2})/);
    if (prijsMatch) {
      const prijs = parseFloat(prijsMatch[1].replace(',', '.'));
      if (!isNaN(prijs) && prijs > 0) return prijs;
    }

    // Alternatief patroon
    const prijsMatch2 = html.match(/price['":\s]+([0-9]+\.[0-9]{2})/i);
    if (prijsMatch2) {
      const prijs = parseFloat(prijsMatch2[1]);
      if (!isNaN(prijs) && prijs > 0) return prijs;
    }

    return null;
  } catch(e) {
    return null;
  }
}

// ── BESTELURL OPBOUWEN ──
function bouwBestelURL(isbn, titel) {
  // Roelants URL-formaat: titel-in-slug-isbn.html
  if (titel) {
    const slug = titel.toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-').replace(/-+/g, '-')
      .substring(0, 60).replace(/-$/, '');
    return ROELANTS_BASE + slug + '-' + isbn + '.html';
  }
  return ROELANTS_BASE + isbn + '.html';
}

// ── HOOFD IMPORT FUNCTIE ──
async function importeerISBN(isbn) {
  const schoon = cleanISBN(isbn);
  if (schoon.length < 10) {
    console.log('  ✗ Ongeldig ISBN: ' + isbn);
    return null;
  }

  console.log('\n📖 Verwerken: ' + schoon);

  // Haal data op (OpenLibrary eerst, dan Google Books als fallback)
  let boekData = await haalOpenLibrary(schoon);
  if (!boekData || !boekData.titel) {
    console.log('  → OpenLibrary: geen resultaat, probeer Google Books...');
    boekData = await haalGoogleBooks(schoon);
  }

  if (!boekData || !boekData.titel) {
    console.log('  ✗ Geen boekdata gevonden voor ISBN ' + schoon);
    return null;
  }

  console.log('  ✓ Titel: ' + boekData.titel);
  if (boekData.auteur) console.log('  ✓ Auteur: ' + boekData.auteur);

  // Haal prijs op van Roelants
  const prijs = await haalRoelantsPrijs(schoon);
  if (prijs) {
    console.log('  ✓ Prijs (Roelants): €' + prijs.toFixed(2));
  } else {
    console.log('  ⚠ Prijs niet gevonden op Roelants.nl — stel handmatig in');
  }

  return {
    isbn:        schoon,
    titel:       boekData.titel,
    auteur:      boekData.auteur || '',
    uitgever:    boekData.uitgever || '',
    jaar:        boekData.jaar || null,
    paginas:     boekData.paginas || null,
    prijs:       prijs || 0,
    beschrijving: boekData.beschrijving || '',
    afrekenen:   bouwBestelURL(schoon, boekData.titel),
  };
}

// ── BOEKEN.JSON BIJWERKEN ──
async function verwerkISBNs(isbns) {
  // Laad bestaand boeken.json
  let boeken = [];
  if (fs.existsSync(BOEKEN_JSON)) {
    boeken = JSON.parse(fs.readFileSync(BOEKEN_JSON, 'utf8'));
    console.log('📂 Bestaand boeken.json geladen: ' + boeken.length + ' boeken');
  } else {
    console.log('📂 Nieuw boeken.json wordt aangemaakt');
  }

  const volgendeID = Math.max(...boeken.map(b => b.id || 0), 0) + 1;
  let idTeller = volgendeID;
  let toegevoegd = 0;
  let bijgewerkt = 0;
  let mislukt   = 0;

  for (const isbn of isbns) {
    const data = await importeerISBN(isbn);

    if (!data) {
      mislukt++;
      await wacht(500);
      continue;
    }

    const schoonISBN = cleanISBN(isbn);
    const bestaandIndex = boeken.findIndex(b =>
      cleanISBN(b.isbn || '') === schoonISBN
    );

    if (bestaandIndex >= 0) {
      // Bijwerken — behoud handmatig ingestelde velden
      const bestaand = boeken[bestaandIndex];
      boeken[bestaandIndex] = {
        ...bestaand,
        titel:       data.titel       || bestaand.titel,
        auteur:      data.auteur      || bestaand.auteur,
        uitgever:    data.uitgever    || bestaand.uitgever,
        jaar:        data.jaar        || bestaand.jaar,
        paginas:     data.paginas     || bestaand.paginas,
        prijs:       data.prijs > 0   ? data.prijs : bestaand.prijs,
        beschrijving: data.beschrijving || bestaand.beschrijving,
        afrekenen:   data.afrekenen   || bestaand.afrekenen,
        isbn:        schoonISBN,
      };
      console.log('  ↻ Bijgewerkt in boeken.json');
      bijgewerkt++;
    } else {
      // Nieuw boek toevoegen
      boeken.push({
        id:          idTeller++,
        uitgelicht:  false,
        nieuw:       true,
        aanbieding:  false,
        prijsOud:    null,
        titel:       data.titel,
        auteur:      data.auteur,
        uitgever:    data.uitgever,
        jaar:        data.jaar,
        paginas:     data.paginas,
        formaat:     'Gebonden',
        prijs:       data.prijs,
        categorie:   STANDAARD_CATEGORIE,
        omslag:      null,
        kleur:       STANDAARD_KLEUR,
        beschrijving: data.beschrijving,
        isbn:        schoonISBN,
        trefwoorden: [],
        afrekenen:   data.afrekenen,
      });
      console.log('  + Toegevoegd aan boeken.json');
      toegevoegd++;
    }

    // Respecteer API limieten
    await wacht(300);
  }

  // Sla op
  fs.writeFileSync(BOEKEN_JSON, JSON.stringify(boeken, null, 2), 'utf8');

  console.log('\n' + '═'.repeat(50));
  console.log('✓ Klaar!');
  console.log('  Nieuw toegevoegd: ' + toegevoegd);
  console.log('  Bijgewerkt:       ' + bijgewerkt);
  console.log('  Mislukt:          ' + mislukt);
  console.log('  Totaal in JSON:   ' + boeken.length);
  console.log('\nboeken.json opgeslagen. Upload naar GitHub om de website bij te werken.');
  console.log('\n⚠ Controleer in beheer.html:');
  console.log('  - Categorie instellen (staat nu op "' + STANDAARD_CATEGORIE + '")');
  console.log('  - Prijs controleren');
  console.log('  - "Nieuw" vlag aan/uitzetten');
}

// ── INVOER VERWERKEN ──
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Gebruik: node importeer-isbn.js 9789000000001 9789000000002');
    console.log('Of:      node importeer-isbn.js --bestand isbnlijst.txt');
    process.exit(1);
  }

  let isbns = [];

  if (args[0] === '--bestand') {
    const bestand = args[1];
    if (!fs.existsSync(bestand)) {
      console.error('Bestand niet gevonden: ' + bestand);
      process.exit(1);
    }
    isbns = fs.readFileSync(bestand, 'utf8')
      .split('\n')
      .map(r => r.trim())
      .filter(r => r && !r.startsWith('#'));
    console.log('📋 ' + isbns.length + ' ISBNs geladen uit ' + bestand);
  } else {
    isbns = args;
  }

  await verwerkISBNs(isbns);
}

main().catch(err => {
  console.error('Fout:', err.message);
  process.exit(1);
});
