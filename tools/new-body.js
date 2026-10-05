#!/usr/bin/env node
// Scaffold a new body pack from an existing one. MIT.
//
//   npm run new-body -- <slug> "Nice Name" [--from scout]
//
// A pack is ten-odd files that have to agree with each other, and the first
// `npm run check` on an empty folder is seventeen findings - an accurate
// checklist, but a cold start. This copies a working pack instead, so the first
// check passes and you can open the thing in the catalog, then change it a part
// at a time and watch what breaks.
//
// It copies scout by default: the simplest body, one board, 19 parts, no serial
// servos. Pass --from to start somewhere closer to what you are building.
//
// The copy is marked `scaffolded_from` in bodies.json, and validation fails
// while the geometry is still byte-identical to its source. A renamed scout is
// not a new body, and the repo should say so rather than let one through.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const slug = positional[0];
const niceName = positional[1];
const from = flag('from', 'scout');

function die(msg) {
  console.error(msg + '\n');
  console.error('usage: npm run new-body -- <slug> "Nice Name" [--from scout]');
  console.error(`       slugs available to copy: ${P.slugs().join(', ')}`);
  process.exit(2);
}

if (!slug) die('Which slug? That is the folder name and the STL prefix.');
if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
  die(`"${slug}" will not do as a slug: lowercase letters, digits and hyphens, starting with a letter.`);
}
if (P.slugs().includes(slug)) die(`There is already a body called "${slug}".`);
if (fs.existsSync(P.packDir(slug))) die(`bodies/${slug}/ already exists.`);
if (!P.slugs().includes(from)) die(`No body called "${from}" to copy.`);

const name = niceName || slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const srcEntry = P.catalog().bodies.find(b => b.slug === from);
const srcName = srcEntry.name;
const srcDir = P.packDir(from);
const dstDir = P.packDir(slug);

// Identifiers that carry the name. Deliberately explicit rather than a blanket
// search-and-replace: a body's slug can appear in prose inside the brief, and
// rewriting that would quietly corrupt someone's copy. The self-check below
// catches anything this list misses.
const flat = (s) => s.replace(/-/g, '');
const snake = (s) => s.replace(/-/g, '_');
const renames = [
  // Print Parts
  [`window.${flat(from)}Parts`, `window.${flat(slug)}Parts`],
  ['`' + from + '-${', '`' + slug + '-${'],            // exported STL filenames
  [`'${from}-print-parts.zip'`, `'${slug}-print-parts.zip'`],
  // Viewer
  [`<three-d-stage name="${from}"`, `<three-d-stage name="${slug}"`],
  [`window.${flat(from)}={`, `window.${flat(slug)}={`],
  // Brief + manifest
  [`hangar_bay/${from}.yaml`, `hangar_bay/${slug}.yaml`],
  [`body: ${snake(from)}`, `body: ${snake(slug)}`],
  [`id: ${from}`, `id: ${slug}`],
  // Display name
  [`name: ${srcName}`, `name: ${name}`],
  [`${srcName} ·`, `${name} ·`],
  [`${srcName} —`, `${name} —`],
  [`<title>${srcName}`, `<title>${name}`],
  [`// ---------- ${srcName} interfaces`, `// ---------- ${name} interfaces`],
  [`'${srcName} print parts'`, `'${name} print parts'`],
  [`model.name='${srcName}'`, `model.name='${name}'`],
];

function rewrite(text) {
  let out = text;
  for (const [a, b] of renames) out = out.split(a).join(b);
  return out;
}

const TEXT = /\.(html|txt|csv|yaml|json|js|md)$/i;

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    // Rename files that carry the body's name.
    let outName = entry.name
      .replace(new RegExp('^' + srcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' '), name + ' ')
      .replace(new RegExp('^' + from + '-'), slug + '-')
      .replace(`hangar_bay_${from.replace(/-/g, '_')}`, `hangar_bay_${slug.replace(/-/g, '_')}`)
      .replace(`${from}.template.yaml`, `${slug}.template.yaml`);
    const d = path.join(dst, outName);
    if (entry.isDirectory()) { copyTree(s, d); continue; }
    if (TEXT.test(entry.name)) fs.writeFileSync(d, rewrite(fs.readFileSync(s, 'utf8')));
    else fs.copyFileSync(s, d);          // STLs and anything binary, byte for byte
  }
}

copyTree(srcDir, dstDir);

// Self-check: did anything keep the source's name?
//
// The rename list is hand-maintained, and it HAS missed entries - the STL
// filename template kept exporting `scout-…` from a pack called something
// else. A scaffold that silently half-renames is worse than one that refuses,
// so say exactly what is left and where.
{
  const stray = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      // generated/ is rebuilt by `npm run emit`, and the README names its
      // source on purpose. Neither is a missed rename.
      if (e.isDirectory()) { if (e.name !== 'generated') walk(p); continue; }
      if (!TEXT.test(e.name) || e.name === 'README.txt') continue;
      const text = fs.readFileSync(p, 'utf8');
      // Identifier-ish uses of the source slug: not prose, which is the
      // author's to rewrite.
      const re = new RegExp('(?:window\\.|name="|body: |id: |`|\'|/)' + from + '(?![a-z])', 'g');
      const hits = [...text.matchAll(re)];
      // The display name too, but only in the two files that are code rather
      // than prose. The brief talks ABOUT the body and may legitimately name
      // the design it came from.
      if (/ (Print Parts|Viewer)\.html$/.test(e.name)) {
        hits.push(...[...text.matchAll(new RegExp(srcName + '(?![a-z])', 'g'))]);
      }
      if (hits.length) stray.push(`${path.relative(dstDir, p)} (${hits.length}x)`);
    }
  };
  walk(dstDir);
  if (stray.length) {
    console.warn(`\n  Heads up: "${from}" still appears as an identifier in:`);
    for (const s of stray) console.warn('    ' + s);
    console.warn('  Check those before you rely on the pack.\n');
  }
}

// The README is the first thing a builder opens, so say what this is.
const readme = path.join(dstDir, 'README.txt');
fs.writeFileSync(readme,
  `${name.toUpperCase()} — SCAFFOLDED FROM ${srcName.toUpperCase()}\n` +
  '='.repeat(60) + '\n\n' +
  `Every file here is still ${srcName}'s, renamed. Nothing about this body is\n` +
  `designed yet, and validation will fail until the geometry differs from\n` +
  `${srcName}'s - a renamed ${srcName} is not a new body.\n\n` +
  'Where to start:\n\n' +
  `  1. ${name} Print Parts.html is the geometry, and the source of truth for\n` +
  '     the STLs. Change one part, then:\n' +
  `       node tools/diagnose-mesh.mjs ${slug}        # is it still manifold?\n` +
  `       node tools/reexport.js ${slug} <part>       # write its STL\n` +
  '       npm run clean-mesh\n\n' +
  `  2. firmware/hangar_bay_${slug.replace(/-/g, '_')}.yaml is the manifest: buses, pins,\n` +
  '     servos, reflexes, safety. Edit it, then:\n' +
  '       npm run sync && npm run emit\n\n' +
  `  3. ${name} Design Brief.dc.html is the brief. Its 05c assembly table is\n` +
  '     checked: every joint needs a mechanical method, never an adhesive.\n\n' +
  '  4. parts-list.csv is the buy list. Plain links, no affiliate tags.\n\n' +
  '  5. Drop "scaffolded_from" from this body\'s entry in bodies.json once it\n' +
  '     is genuinely its own design.\n\n' +
  'Then: npm run check\n\n' +
  '-'.repeat(60) + '\n' +
  `Original ${srcName} notes follow.\n` +
  '-'.repeat(60) + '\n\n' +
  rewrite(fs.readFileSync(path.join(srcDir, 'README.txt'), 'utf8')));

// bodies.json entry, cloned with the paths pointed at the new folder.
const catalog = P.catalog();
const entry = JSON.parse(JSON.stringify(srcEntry));
entry.slug = slug;
entry.name = name;
entry.tagline = `A new body, scaffolded from ${srcName}. Give it a tagline.`;
entry.status = `scaffolded from ${from} · not yet designed`;
entry.scaffolded_from = from;
for (const k of ['folder', 'brief', 'viewer', 'print_parts', 'stl_dir', 'parts_csv', 'manifest', 'hangar_bay_template']) {
  entry[k] = entry[k]
    .split(`bodies/${from}`).join(`bodies/${slug}`)
    .split(`${srcName} `).join(`${name} `)
    .split(`hangar_bay_${from.replace(/-/g, '_')}`).join(`hangar_bay_${slug.replace(/-/g, '_')}`)
    .split(`${from}.template.yaml`).join(`${slug}.template.yaml`);
}
catalog.bodies.push(entry);
fs.writeFileSync(path.join(P.ROOT, 'bodies.json'), JSON.stringify(catalog, null, 2) + '\n');

// Re-export THIS body's STLs from the generator that was copied with it.
//
// Otherwise the new pack inherits its source's drift: scout ships three STLs
// that no longer come back out of its own Print Parts page, and a copy would
// arrive with a reproducibility failure its author did not cause and cannot
// act on. A fresh pack's STLs should be exactly what its generator makes.
//
// Scoped to this slug on purpose. An --all here would rewrite every other
// pack's STLs too, silently erasing the eleven deliberate, recorded drifts in
// stl-drift.json. Scaffolding a body must not touch a body.
console.log(`\n  rebuilding ${slug}'s STLs from its own generator…`);
const { spawnSync } = require('child_process');
// reexport writes what the generator makes, zero-area triangles and all;
// meshclean strips them, as it does for every other pack. It is idempotent and
// only rewrites files that actually carry junk, so it cannot disturb the
// others.
for (const args of [[path.join(__dirname, 'reexport.js'), slug], [path.join(__dirname, 'meshclean.js')]]) {
  const r = spawnSync(process.execPath, args, { cwd: P.ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`  (could not rebuild: ${(r.stderr || '').split('\n')[0]})`);
    console.error(`  Run \`node tools/reexport.js ${slug} && npm run clean-mesh\` by hand.`);
    break;
  }
}

console.log(`\n  bodies/${slug}/ — scaffolded from ${from}\n`);
console.log('  Next:');
console.log('    npm run sync && npm run emit && npm run site-data');
console.log('    npm run check');
console.log(`\n  Then open bodies/${slug}/README.txt, which says where to start.\n`);
console.log(`  Validation will fail with "still an unmodified copy of ${from}" until the`);
console.log('  geometry is your own. That is the point.\n');
