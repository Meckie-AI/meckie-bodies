#!/usr/bin/env node
// Build a zip a print service's quote page will accept. MIT.
//
//   npm run quote-bundle -- scout          one body
//   npm run quote-bundle -- --all          every body
//
// The point is to get ONE real price without integrating anything. Every
// service has an upload-and-quote page; none of them need an API key for that.
// Drop the zip in, read the number, then set `calibrated` and the per-material
// rates in rates.json so the estimate on the site stops being an industry band
// and starts being a measured one.
//
// What a quote actually needs is the part, how many, and in what. The orders
// manifest carries exactly that, in three forms, because every service asks for
// it differently: a CSV to paste, a README to read, and JSON for later.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');
const mesh = require('./lib/mesh');
const { zipOf } = require('./lib/zip');

const RATES = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'rates.json'), 'utf8'));
const OUT = path.join(P.ROOT, 'quotes');

// Service-side names for what the packs specify. The packs name a filament; a
// service sells a process and a product, and the two are not the same thing.
const SERVICE_MATERIAL = {
  'PLA': {
    ask_for: 'PLA',
    process: 'FDM',
    caveat: 'Colour is cosmetic here and the pack names one per part, but services stock a short list. Quote in whatever they carry; the colour is a filament choice, not a dimension.',
  },
  'TPU 95A': {
    ask_for: 'TPU 95A',
    process: 'FDM, or MJF',
    caveat: 'Services commonly stock 88A, which is softer than the 95A these parts specify. A quote against 88A is a substitution, not a match.',
  },
  // Not used by the official packs. Kept so a contributed pack that names them
  // still gets a sane service-side description rather than its raw filament
  // string passed through to whoever reads the bundle.
  'PETG': {
    ask_for: 'PETG',
    process: 'FDM',
    caveat: 'Protolabs Network stocks PETG in black, grey and white only.',
  },
  'CF-nylon': {
    ask_for: 'carbon-filled nylon (Markforged Onyx, or PA-CF)',
    process: 'industrial FDM',
    caveat: 'Onyx is a specific product, not a generic PA-CF. Confirm the substitution before treating a quote as equivalent.',
  },
};

function bundle(slug) {
  const data = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'site', 'data', `${slug}.json`), 'utf8'));
  const stlDir = path.join(P.packDir(slug), 'stl');
  const files = [];

  // STLs, foldered by material: the first thing a quote page asks is what to
  // print each part in, and this answers it before anyone has to.
  for (const p of data.parts) {
    files.push({
      name: `${slug}/${p.material.replace(/[^A-Za-z0-9]/g, '-')}/${p.file}`,
      data: fs.readFileSync(path.join(stlDir, p.file)),
      mtime: fs.statSync(path.join(stlDir, p.file)).mtime,
    });
  }

  const byMat = {};
  for (const p of data.parts) {
    const b = byMat[p.material] || (byMat[p.material] = { parts: 0, volume_cm3: 0, files: 0 });
    b.parts += p.qty; b.volume_cm3 += p.volume_cm3 * p.qty; b.files += 1;
  }

  // CSV: the form most services accept pasted, and the one a human can check.
  const csv = ['file,part,quantity,material,process,volume_cm3,longest_mm']
    .concat(data.parts.map((p) => {
      const dims = mesh.check(path.join(stlDir, p.file)).dims;
      const sm = SERVICE_MATERIAL[p.material] || { ask_for: p.material, process: 'FDM' };
      return [
        p.file, JSON.stringify(p.name), p.qty, JSON.stringify(sm.ask_for),
        sm.process, p.volume_cm3.toFixed(2), Math.max(...dims).toFixed(1),
      ].join(',');
    })).join('\n') + '\n';
  files.push({ name: `${slug}/parts.csv`, data: Buffer.from(csv, 'utf8') });

  const est = data.service_estimate;
  const caveats = [...new Set(data.parts
    .map((p) => (SERVICE_MATERIAL[p.material] || {}).caveat).filter(Boolean))];

  const readme = [
    `${data.name.toUpperCase()} — PARTS FOR QUOTE`,
    '='.repeat(60), '',
    `${data.total_prints} printed pieces from ${data.parts.length} files, in ${data.materials.length} materials.`,
    `Everything fits a 256 x 256 x 256 mm build volume.`,
    '',
    'WHAT TO QUOTE',
    '-'.repeat(60),
    ...Object.entries(byMat).sort().map(([m, b]) => {
      const sm = SERVICE_MATERIAL[m] || { ask_for: m, process: 'FDM' };
      return `  ${sm.ask_for}\n` +
        `    ${b.parts} pieces from ${b.files} files, ${b.volume_cm3.toFixed(0)} cm3 total\n` +
        `    process: ${sm.process}\n` +
        `    folder:  ${m.replace(/[^A-Za-z0-9]/g, '-')}/`;
    }),
    '',
    ...(caveats.length ? ['SUBSTITUTIONS TO CONFIRM', '-'.repeat(60),
      ...caveats.map((c) => '  - ' + c), ''] : []),
    'NOTES FOR WHOEVER QUOTES THIS',
    '-'.repeat(60),
    '  - Quantities are in the filename: -x2 means two of that part.',
    '  - Mirrored parts ship as separate files (_L and _R); they are not the',
    '    same part printed twice.',
    '  - These are cosmetic and structural parts for a small robot. Tolerance',
    '    matters at the bearing seats and servo pockets; the shells do not need',
    '    to be pretty on the inside.',
    '  - None of these has been test-printed. If something looks unprintable,',
    '    that is worth more to us than the quote.',
    '',
    'WHAT WE CURRENTLY ESTIMATE',
    '-'.repeat(60),
    `  $${est.usd_low} - $${est.usd_high}, from ${est.source}.`,
    `  ${est.calibrated ? 'Calibrated against a real order.' : 'NOT calibrated against any real order. That is what this bundle is for.'}`,
    '',
    `Generated by meckie-bodies, ${new Date().toISOString().slice(0, 10)}.`,
    '',
  ].join('\n');
  files.push({ name: `${slug}/README.txt`, data: Buffer.from(readme, 'utf8') });

  // JSON, for when this stops being a manual step.
  files.push({
    name: `${slug}/quote-request.json`,
    data: Buffer.from(JSON.stringify({
      body: slug, name: data.name,
      generated: new Date().toISOString(),
      build_volume_mm: [256, 256, 256],
      by_material: Object.fromEntries(Object.entries(byMat).map(([m, b]) => [m, {
        ...b, volume_cm3: +b.volume_cm3.toFixed(2),
        ask_for: (SERVICE_MATERIAL[m] || {}).ask_for || m,
        process: (SERVICE_MATERIAL[m] || {}).process || 'FDM',
        caveat: (SERVICE_MATERIAL[m] || {}).caveat || null,
      }])),
      parts: data.parts.map((p) => ({
        file: p.file, name: p.name, qty: p.qty,
        material: p.material, ask_for: (SERVICE_MATERIAL[p.material] || {}).ask_for || p.material,
        volume_cm3: p.volume_cm3,
      })),
      our_estimate: est,
    }, null, 2) + '\n', 'utf8'),
  });

  fs.mkdirSync(OUT, { recursive: true });
  const zipPath = path.join(OUT, `${slug}-quote.zip`);
  fs.writeFileSync(zipPath, zipOf(files));
  return { zipPath, files: files.length, byMat, est };
}

const argv = process.argv.slice(2);
const slugs = argv.includes('--all') ? P.slugs() : argv.filter((a) => !a.startsWith('--'));
if (!slugs.length) {
  console.error('usage: npm run quote-bundle -- <slug> [<slug>...]   |   --all');
  console.error(`       bodies: ${P.slugs().join(', ')}`);
  process.exit(2);
}

for (const slug of slugs) {
  if (!P.slugs().includes(slug)) { console.error(`  no body called "${slug}"`); continue; }
  const r = bundle(slug);
  const size = (fs.statSync(r.zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n  ${path.relative(P.ROOT, r.zipPath)}  (${size} MB, ${r.files} entries)`);
  for (const [m, b] of Object.entries(r.byMat).sort()) {
    console.log(`    ${m.padEnd(10)} ${String(b.parts).padStart(3)} pieces  ${b.volume_cm3.toFixed(0).padStart(4)} cm³`);
  }
  console.log(`    we estimate $${r.est.usd_low}–$${r.est.usd_high}${r.est.calibrated ? '' : ' (uncalibrated)'}`);
}

console.log('\n  Upload one to a service\'s quote page — no API or account needed beyond a login.');
console.log('  Then put the real number into rates.json and set "calibrated": true.\n');
