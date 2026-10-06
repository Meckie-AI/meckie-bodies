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
const printService = require('./lib/print-service');
const mesh = require('./lib/mesh');

const check = process.argv.includes('--check');

// Every price the catalog shows comes from rates.json. Loaded once so the
// estimate and the quote bundle can never disagree about what a cm3 costs.
const RATES = JSON.parse(fs.readFileSync(path.join(path.dirname(__dirname), 'rates.json'), 'utf8'));

/**
 * What a service would charge to print this body, as a range.
 *
 * Priced on the SOLID volume, not the filament estimate: a service picks its
 * own walls and infill, so the mass that matters to someone at their own
 * printer is not the figure a service bills against.
 */
function serviceEstimate(parts) {
  let low = RATES.setup_usd, high = RATES.setup_usd;
  const unpriced = new Set();
  for (const p of parts) {
    const r = RATES.materials[p.material];
    if (!r) { unpriced.add(p.material); continue; }
    low += p.volume_cm3 * p.qty * r.usd_per_cm3_low;
    high += p.volume_cm3 * p.qty * r.usd_per_cm3_high;
  }
  return {
    usd_low: Math.round(low),
    usd_high: Math.round(high),
    setup_usd: RATES.setup_usd,
    currency: RATES.currency,
    source: RATES.source,
    calibrated: RATES.calibrated,
    unpriced_materials: [...unpriced],
  };
}
const OUT = path.join(P.ROOT, 'site', 'data');

// "PLA sea foam" / "TPU 95A black" / "PLA metallic silver" -> the stock you buy.
//
// The official packs specify PLA and TPU only. PETG and CF-nylon are still
// recognised rather than folded into PLA, because a contributed pack may name
// them and classifying someone else's PETG as PLA would misprice it and tell
// them to buy the wrong spool.
function material(mat) {
  const m = String(mat || '').toLowerCase();
  if (m.includes('cf-nylon') || m.includes('nylon')) return 'CF-nylon';
  if (m.includes('tpu')) return 'TPU 95A';
  if (m.includes('petg')) return 'PETG';
  if (m.includes('pla')) return 'PLA';
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
    // Anchor the slug. A non-greedy prefix stops at the FIRST hyphen, so
    // rover-lite-esp_cradle-x1.stl yielded the key "lite-esp_cradle", matched
    // no part, and left rover-lite and biped-mini with no parts at all: empty
    // Print tabs hiding 29 and 37 files, while the download-all zip kept
    // working so nothing looked broken.
    const nameRe = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(.+)-x(\\d+)\\.stl$`);
    const byKey = new Map();
    for (const f of stlFiles) {
      const m = nameRe.exec(f);
      if (m) byKey.set(m[1], { file: f, qty: Number(m[2]) });
      else console.warn(`  ${slug}: ${f} does not match <slug>-<part>-x<qty>.stl`);
    }

    const parts = [];
    for (const p of pack.parts) {
      // Mirrored parts ship as several STLs from one build function. The
      // suffix names which copy: _L/_R for a left/right pair, _A/_B where a
      // quadruped's four legs take two mirrored pairs (comet's abduction
      // cradles are "A: FR + RL, B: FL + RR"). Without _A/_B those STLs match
      // no part, and the Print tab silently omits them the way a bad slug
      // regex once hid 29 and 37 files.
      const hits = [...byKey.entries()].filter(([k]) => k === p.key || k.replace(/_(L|R|A|B)$/, '') === p.key);
      if (!hits.length) continue;             // e.g. ballast_note: described, not printed
      for (const [key, info] of hits) {
        const full = path.join(stlDir, info.file);
        let tris = null;
        try { tris = mesh.check(full).triangles; } catch (e) { /* reported by validate */ }
        const mat = material(p.mat);
        const vol = mesh.volumeCm3(full);
        // Settings come from the brief's own orientation line, so the estimate
        // can never disagree with what the page tells you to print.
        const fil = mesh.filament(vol, mat, p.orient);
        parts.push({
          key, name: p.name + (/_R$/.test(key) ? ' (right)' : /_L$/.test(key) ? ' (left)' : ''),
          qty: info.qty, material: mat, material_full: p.mat,
          orientation: p.orient, file: info.file,
          bytes: fs.statSync(full).size, size: prettyBytes(fs.statSync(full).size),
          triangles: tris,
          volume_cm3: +vol.toFixed(2),
          filament: fil,
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
      // What it takes to print this body, per material. Quantities are counted
      // in: a part marked -x2 is two prints and two parts' worth of filament.
      filament: (() => {
        const by = {};
        for (const p of parts) {
          const b = by[p.material] || (by[p.material] = { volume_cm3: 0, solid_g: 0, g_low: 0, g_high: 0, assumed: 0, parts: 0 });
          b.volume_cm3 += p.volume_cm3 * p.qty;
          b.solid_g += p.filament.solid_g * p.qty;
          b.g_low += p.filament.g_low * p.qty;
          b.g_high += p.filament.g_high * p.qty;
          b.parts += p.qty;
          if (p.filament.assumed) b.assumed += p.qty;
        }
        const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) =>
          [k, typeof v === 'number' ? +v.toFixed(1) : v]));
        const out = { by_material: Object.fromEntries(Object.entries(by).map(([m, b]) => [m, round(b)])) };
        out.total = round(Object.values(by).reduce((a, b) => ({
          volume_cm3: a.volume_cm3 + b.volume_cm3, solid_g: a.solid_g + b.solid_g,
          g_low: a.g_low + b.g_low, g_high: a.g_high + b.g_high,
          assumed: a.assumed + b.assumed, parts: a.parts + b.parts,
        }), { volume_cm3: 0, solid_g: 0, g_low: 0, g_high: 0, assumed: 0, parts: 0 }));
        return out;
      })(),
      // What a service would charge. Not a quote; see rates.json.
      service_estimate: serviceEstimate(parts),
      // for the catalog filters
      esp32_only: targets.every(t => t.role),
      servo_type: /sts32/i.test(entry.servos) ? 'serial bus' : /mg90|n20/i.test(entry.servos) ? 'PWM / gearmotor' : 'other',
    };

    // What it would cost to have US print it, as opposed to a service bureau.
    // Attached after the literal because it needs the finished document: the
    // price is driven by printed mass and painted-part count, both of which
    // are computed above.
    doc.print_service = printService.quote(doc);

    writeIfChanged(path.join(OUT, `${slug}.json`), JSON.stringify(doc, null, 2) + '\n');

    // The Hangar Bay template, pre-rendered as JSON.
    //
    // The pack authors YAML, but every consumer is JSON: Meckie OS has no YAML
    // parser, and neither does the marketing site that mounts this catalog.
    // Generating it here means the template is parsed exactly once, by the repo
    // that owns the format, and everyone else just serves a file.
    writeIfChanged(path.join(OUT, `${slug}.template.json`), JSON.stringify({
      template: 'meckie-hangar-bay/1',
      known_template: {
        catalog: 'meckie-bodies', origin: 'official',
        hardware_sha256: tpl.known_template.hardware_sha256,
      },
      body: tpl.body,
      targets: tpl.targets,
      pairing: tpl.pairing,
      calibration_wizard: tpl.calibration_wizard,
      calibration: tpl.calibration,
      manifest: bodyManifest,
      build,
      // The manifest exactly as authored, so a consumer can recompute the hash
      // itself rather than trusting whoever served this.
      hardware: manifestText,
    }, null, 2) + '\n');

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
