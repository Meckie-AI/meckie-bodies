#!/usr/bin/env node
// Build site/data/*.json — everything the marketplace needs, in one pass. MIT.
//
//   node tools/site-data.js          write site/data/
//   node tools/site-data.js --check  fail if it is stale
//
// The site is static HTML with no build step, so it cannot parse a brief or run
// a CSG generator in the browser. This does that once, on disk: part names,
// materials and bed orientation come out of the Print Parts generator (the same
// code that makes the STLs, so the Print tab can never disagree with them), the
// buy list out of parts-list.csv, and the flashing plan out of the Hangar Bay
// template.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');
const csv = require('./lib/csv');
const mesh = require('./lib/mesh');

const check = process.argv.includes('--check');
const OUT = path.join(P.ROOT, 'site', 'data');

// "PETG sea foam" / "TPU 95A black" / "CF-nylon" -> the stock you buy.
function material(mat) {
  const m = String(mat || '').toLowerCase();
  if (m.includes('cf-nylon') || m.includes('nylon')) return 'CF-nylon';
  if (m.includes('tpu')) return 'TPU 95A';
  if (m.includes('petg')) return 'PETG';
  return String(mat || 'unspecified');
}

function prettyBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const { loadPack } = await import('./geom.mjs');
  const catalog = P.catalog();
  const index = { schema: 'meckie-marketplace/1', updated: catalog.updated, bodies: [] };

  for (const entry of catalog.bodies) {
    const slug = entry.slug;
    const dir = P.packDir(slug);
    const tpl = P.readTemplate(slug);
    const hw = P.readManifest(slug);
    const manifestText = P.readManifestText(slug);

    // --- printed parts, from the generator that makes the STLs --------------
    const pack = await loadPack(slug);
    const stlDir = path.join(dir, 'stl');
    const stlFiles = fs.readdirSync(stlDir).filter(f => f.endsWith('.stl'));
    const byKey = new Map();
    for (const f of stlFiles) {
      const m = /^.+?-(.+)-x(\d+)\.stl$/.exec(f);
      if (m) byKey.set(m[1], { file: f, qty: Number(m[2]) });
    }

    const parts = [];
    for (const p of pack.parts) {
      // Mirrored parts ship as two STLs from one build function.
      const hits = [...byKey.entries()].filter(([k]) => k === p.key || k.replace(/_(L|R)$/, '') === p.key);
      if (!hits.length) continue;             // e.g. ballast_note: described, not printed
      for (const [key, info] of hits) {
        const full = path.join(stlDir, info.file);
        let tris = null;
        try { tris = mesh.check(full).triangles; } catch (e) { /* reported by validate */ }
        parts.push({
          key, name: p.name + (/_R$/.test(key) ? ' (right)' : /_L$/.test(key) ? ' (left)' : ''),
          qty: info.qty, material: material(p.mat), material_full: p.mat,
          orientation: p.orient, file: info.file,
          bytes: fs.statSync(full).size, size: prettyBytes(fs.statSync(full).size),
          triangles: tris,
        });
      }
    }
    parts.sort((a, b) => a.material.localeCompare(b.material) || a.name.localeCompare(b.name));

    // --- buy list ----------------------------------------------------------
    const rows = csv.records(fs.readFileSync(path.join(dir, 'parts-list.csv'), 'utf8')).rows;
    const buy = rows.map(r => ({
      part: r.part, qty: r.qty, where: r.where, link: r.link, notes: r.notes,
    }));

    // --- what Hangar Bay would do -------------------------------------------
    const targets = Object.entries(tpl.targets || {}).map(([key, t]) => ({
      key, role: t.role || null, host: t.host || null, mcu: t.mcu || null,
      board: t.board || null, platform: t.platform || null,
      flash: t.flash || null, os: t.os || null, provision: t.provision || null,
    }));
    const wizard = (tpl.calibration_wizard || []).map(s => ({
      step: s.step, prompt: s.prompt, required: !!s.required,
      writes: s.writes || null, checks: s.checks || null, auto: !!s.auto,
    }));

    const generatedDir = path.join(dir, 'generated');
    const build = JSON.parse(fs.readFileSync(path.join(generatedDir, 'build.json'), 'utf8'));
    const bodyManifest = JSON.parse(fs.readFileSync(path.join(generatedDir, 'manifest.json'), 'utf8'));

    const doc = {
      ...entry,
      moves: entry.moves, brains: entry.brains, power: entry.power,
      hardware_sha256: tpl.known_template.hardware_sha256,
      version: tpl.body.version,
      drives: tpl.body.drives === true,
      pack_url: tpl.body.pack,
      targets, pairing: tpl.pairing || {}, wizard,
      parts, buy,
      manifest_text: manifestText,
      manifest_json: bodyManifest,
      build_json: build,
      unsupported: build.unsupported || [],
      materials: [...new Set(parts.map(p => p.material))].sort(),
      total_prints: parts.reduce((n, p) => n + p.qty, 0),
      // for the catalog filters
      esp32_only: targets.every(t => t.role),
      servo_type: /sts32/i.test(entry.servos) ? 'serial bus' : /mg90|n20/i.test(entry.servos) ? 'PWM / gearmotor' : 'other',
    };

    const file = path.join(OUT, `${slug}.json`);
    writeIfChanged(file, JSON.stringify(doc, null, 2) + '\n');

    index.bodies.push({
      slug: entry.slug, name: entry.name, class: entry.class, tagline: entry.tagline,
      servos: entry.servos, brains: entry.brains, moves: entry.moves,
      mass_g: entry.mass_g, bom_usd: entry.bom_usd, stl: entry.stl, status: entry.status,
      drives: doc.drives, esp32_only: doc.esp32_only, servo_type: doc.servo_type,
      materials: doc.materials, total_prints: doc.total_prints,
      viewer: entry.viewer, brief: entry.brief,
    });
  }

  writeIfChanged(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  if (check && stale.length) {
    console.error(`${stale.length} site data file(s) out of date:`);
    for (const s of stale) console.error('  ' + path.relative(P.ROOT, s));
    console.error('\nRun: npm run site-data');
    process.exit(1);
  }
  console.log(check
    ? `site data is up to date (${index.bodies.length} bodies)`
    : `wrote site/data for ${index.bodies.length} bodies`);
}

const stale = [];
function writeIfChanged(file, text) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === text) return;
  stale.push(file);
  if (!check) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
