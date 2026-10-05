#!/usr/bin/env node
// The body-pack standard, enforced. MIT.
//
//   npm run validate                 everything
//   npm run validate -- --only=mesh  one group
//   npm run validate -- --warn=mesh  demote a group to warnings
//
// Three of the rules the handoff README specified could not pass as written,
// and are stated differently here. Each one says why, inline.

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const { execFileSync } = require('child_process');
const P = require('./lib/packs');
const mesh = require('./lib/mesh');
const csv = require('./lib/csv');

const argv = process.argv.slice(2);
const only = (argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const warnOnly = new Set((argv.find(a => a.startsWith('--warn=')) || '').slice(7).split(',').filter(Boolean));
const skip = new Set((argv.find(a => a.startsWith('--skip=')) || '').slice(7).split(',').filter(Boolean));

const errors = [];
const warnings = [];
let checks = 0;

function group(name) {
  const skipped = skip.has(name) || (only.length && !only.includes(name));
  const soft = warnOnly.has(name);
  return {
    name, skip: skipped,
    fail(msg) { checks++; (soft ? warnings : errors).push(`[${name}] ${msg}`); },
    pass() { checks++; },
    check(ok, msg) { checks++; if (!ok) (soft ? warnings : errors).push(`[${name}] ${msg}`); },
  };
}

const slugs = P.slugs();
const catalog = P.catalog();

// Read a file, or report it missing and carry on.
//
// A validator that throws ENOENT is useless to the person it exists for: the
// first thing a new body does is not have some of these files yet, and a stack
// trace is not a checklist. Every pack file is opened through here so a missing
// one lands as a finding next to all the others.
function read(g, file, what, encoding = 'utf8') {
  try { return fs.readFileSync(file, encoding); }
  catch (e) {
    g.fail(`${what}: ${e.code === 'ENOENT' ? 'missing' : e.message} — ${path.relative(P.ROOT, file)}`);
    return null;
  }
}
function readDir(g, dir, what) {
  try { return fs.readdirSync(dir); }
  catch (e) {
    g.fail(`${what}: ${e.code === 'ENOENT' ? 'missing directory' : e.message} — ${path.relative(P.ROOT, dir)}`);
    return null;
  }
}

// ---------------------------------------------------------------- catalog ---
{
  const g = group('catalog');
  if (!g.skip) {
    const folders = fs.readdirSync(P.BODIES).filter(f =>
      fs.statSync(path.join(P.BODIES, f)).isDirectory());
    for (const s of slugs) g.check(folders.includes(s), `bodies.json lists ${s} with no folder`);
    for (const f of folders) g.check(slugs.includes(f), `bodies/${f} has no bodies.json entry`);

    for (const b of catalog.bodies) {
      for (const k of ['brief', 'viewer', 'print_parts', 'parts_csv', 'manifest', 'hangar_bay_template', 'stl_dir']) {
        g.check(fs.existsSync(path.join(P.ROOT, b[k])), `${b.slug}: bodies.json ${k} -> missing ${b[k]}`);
      }
      const stls = fs.readdirSync(path.join(P.ROOT, b.stl_dir)).filter(f => f.endsWith('.stl'));
      g.check(stls.length === b.stl, `${b.slug}: bodies.json says ${b.stl} STLs, found ${stls.length}`);
      g.check(b.license && b.license.hardware === 'CERN-OHL-S-2.0' && b.license.code === 'MIT',
        `${b.slug}: bodies.json license block is not CERN-OHL-S-2.0 + MIT`);
    }
  }
}

// ------------------------------------------------------------ pack layout ---
{
  const g = group('layout');
  if (!g.skip) {
    for (const s of slugs) {
      const dir = P.packDir(s);
      const files = readDir(g, dir, `${s}: pack folder`);
      if (!files) continue;
      for (const want of ['README.txt', 'LICENSE.txt', 'parts-list.csv', 'support.js', 'three-d-stage.js']) {
        g.check(files.includes(want), `${s}: missing ${want}`);
      }
      g.check(files.some(f => f.endsWith(' Design Brief.dc.html')), `${s}: no Design Brief`);
      g.check(files.some(f => f.endsWith(' Viewer.html')), `${s}: no Viewer`);
      g.check(files.some(f => f.endsWith(' Print Parts.html')), `${s}: no Print Parts`);

      // Only read what the listing says is there; otherwise the same missing
      // file is reported twice, once by the listing and once by the read.
      const lic = files.includes('LICENSE.txt')
        ? read(g, path.join(dir, 'LICENSE.txt'), `${s}: LICENSE.txt`) : null;
      if (lic !== null) {
        g.check(lic.includes('CERN-OHL-S-2.0') && lic.includes('MIT'),
          `${s}: LICENSE.txt must name CERN-OHL-S-2.0 and MIT`);
      }
    }
    // The HTML runtime is duplicated per pack so a downloaded pack renders on
    // its own. Identical copies or it is a maintenance trap.
    for (const runtime of ['support.js', 'three-d-stage.js']) {
      const master = fs.readFileSync(path.join(P.ROOT, 'shared', runtime));
      for (const s of slugs) {
        const file = path.join(P.packDir(s), runtime);
        const copy = fs.existsSync(file) ? read(g, file, `${s}: ${runtime}`, null) : null;
        if (copy !== null) {
          g.check(copy.equals(master), `${s}: ${runtime} differs from shared/${runtime}`);
        }
      }
    }
  }
}

// -------------------------------------------------------------------- stl ---
{
  const g = group('mesh');
  if (!g.skip) {
    // The README stated one rule - "every edge shared by exactly two triangles"
    // - that conflates three different defects. They are separate here, because
    // they have different causes and different severities:
    //
    //   boundary edges     a hole. Always fatal.
    //   zero-area triangles export junk. Always fatal; tools/meshclean.js fixes
    //                      them mechanically, so there is no reason to carry any.
    //   four-triangle edges two surfaces touching exactly. Still a closed,
    //                      printable solid. Fatal EXCEPT for the 20 files
    //                      enumerated in mesh-exceptions.json with exact counts.
    const allow = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'mesh-exceptions.json'), 'utf8')).nonmanifold;
    const unseen = new Set(Object.keys(allow));

    for (const s of slugs) {
      const dir = path.join(P.packDir(s), 'stl');
      const stls = readDir(g, dir, `${s}: stl/`);
      if (!stls) continue;
      for (const f of stls.filter(x => x.endsWith('.stl')).sort()) {
        const rel = `bodies/${s}/stl/${f}`;
        g.check(/-x\d+\.stl$/.test(f), `${rel}: filename must end -x<qty>.stl`);
        let r;
        try { r = mesh.check(path.join(dir, f)); }
        catch (e) { g.fail(`${rel}: ${e.message}`); continue; }

        g.check(r.watertight, `${rel}: not watertight, ${r.boundary} boundary edge(s)`);
        g.check(r.shells === 1, `${rel}: ${r.shells} separate shells, expected 1`);
        g.check(!r.oversize, `${rel}: ${r.dims.map(d => d.toFixed(0)).join('x')} mm exceeds the ${mesh.BED} mm bed`);
        g.check(r.degenerate === 0,
          `${rel}: ${r.degenerate} zero-area triangle(s) — run node tools/meshclean.js`);

        const budget = allow[rel];
        if (budget === undefined) {
          g.check(r.manifold, `${rel}: ${r.nonmanifold} edge(s) shared by more than two triangles`);
        } else {
          unseen.delete(rel);
          // Exact, both ways. Growth is a regression; a drop means the part was
          // fixed and its entry must go, or the list quietly stops meaning
          // anything.
          g.check(r.nonmanifold === budget,
            r.nonmanifold > budget
              ? `${rel}: ${r.nonmanifold} non-manifold edges, allowlist permits ${budget}`
              : `${rel}: now has ${r.nonmanifold} non-manifold edges (was ${budget}) — `
                + 'remove or lower its entry in mesh-exceptions.json');
        }
      }
    }
    for (const stale of unseen) {
      g.fail(`mesh-exceptions.json lists ${stale}, which no longer exists`);
    }
  }
}

// ------------------------------------------------------------------ parts ---
{
  const g = group('parts');
  if (!g.skip) {
    const WANT = ['part', 'qty', 'where', 'link', 'notes'];
    for (const s of slugs) {
      const file = path.join(P.packDir(s), 'parts-list.csv');
      if (!fs.existsSync(file)) continue;        // the layout group already said so
      const raw = read(g, file, `${s}: parts-list.csv`);
      if (raw === null) continue;
      const { header, rows } = csv.records(raw);
      g.check(header.join(',') === WANT.join(','),
        `${s}: parts-list.csv header is "${header.join(',')}", expected "${WANT.join(',')}"`);
      g.check(rows.length > 0, `${s}: parts-list.csv has no rows`);
      for (const r of rows) {
        g.check(r.part.trim() !== '', `${s}: parts-list.csv row ${r._line} has no part name`);
        g.check(r.qty.trim() !== '', `${s}: parts-list.csv row ${r._line} has no quantity`);
        const link = r.link.trim();
        g.check(/^https?:\/\//.test(link), `${s}: parts-list.csv row ${r._line} has no link`);
        // Supplier links stay plain: no affiliate or campaign tags.
        g.check(!/[?&](tag|aff|affiliate|utm_[a-z]+)=/i.test(link),
          `${s}: parts-list.csv row ${r._line} link carries a tracking tag`);
      }
    }
  }
}

// --------------------------------------------------------------- no glue ----
{
  const g = group('glue');
  if (!g.skip) {
    // The README's rule was "case-insensitive grep across all pack text". That
    // fails every pack on its own compliant copy: the briefs all say "No glue,
    // tape, epoxy or adhesive cable mounts anywhere." The rule belongs on the
    // 05c assembly table, which is where a joint would actually specify one.
    const ADHESIVE = /\b(glue|glued|gluing|epoxy|adhesive|tape|taped|superglue|cyanoacrylate|cement)\b/i;
    const NEGATED = /\b(no|not|never|without|avoid|nothing)\b/i;
    const METHOD = new Set(['screw', 'snap', 'clamp', 'latch', 'twist', 'lock', 'twist-lock',
      'clip', 'press', 'stretch', 'fit', 'stretch-fit']);

    for (const s of slugs) {
      const packFiles = readDir(g, P.packDir(s), `${s}: pack folder`);
      if (!packFiles) continue;
      const brief = packFiles.find(f => f.endsWith(' Design Brief.dc.html'));
      if (!brief) { g.fail(`${s}: no Design Brief to read the 05c assembly table from`); continue; }
      const text = read(g, path.join(P.packDir(s), brief), `${s}: Design Brief`);
      if (text === null) continue;
      const at = text.search(/assembly\s*=\s*\[/);
      if (at === -1) { g.fail(`${s}: brief has no 05c assembly table`); continue; }

      // Bracket-match the array literal.
      let i = text.indexOf('[', at), depth = 0, end = -1;
      for (let k = i; k < text.length; k++) {
        if (text[k] === '[') depth++;
        else if (text[k] === ']' && --depth === 0) { end = k; break; }
      }
      if (end === -1) { g.fail(`${s}: 05c assembly table is unterminated`); continue; }
      const block = text.slice(i, end + 1);

      const rows = [...block.matchAll(/\{\s*j:\s*'((?:[^'\\]|\\.)*)'\s*,\s*m:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?d:\s*'((?:[^'\\]|\\.)*)'\s*\}/g)];
      g.check(rows.length > 0, `${s}: 05c assembly table has no parseable rows`);

      for (const [, joint, method, detail] of rows) {
        // Every joint is a mechanical method, not an adhesive.
        const tokens = method.toLowerCase().split(/[/+]/).map(t => t.trim().replace(/\s+/g, '-')).filter(Boolean);
        const unknown = tokens.filter(t => !METHOD.has(t) && !t.split('-').every(p => METHOD.has(p)));
        g.check(unknown.length === 0, `${s}: joint "${joint}" uses method "${method}" (unknown: ${unknown.join(', ')})`);

        // An adhesive word in the detail is allowed only where it is ruled out.
        for (const sentence of detail.split(/(?<=[.;])\s+/)) {
          if (ADHESIVE.test(sentence)) {
            g.check(NEGATED.test(sentence),
              `${s}: joint "${joint}" specifies an adhesive: "${sentence.trim()}"`);
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------- yaml ---
{
  const g = group('yaml');
  if (!g.skip) {
    const VIRTUAL = new Set(['encoders', 'servo_load']);
    for (const s of slugs) {
      let tpl, hw;
      try { tpl = P.readTemplate(s); }
      catch (e) {
        g.fail(e.code === 'ENOENT'
          ? `${s}: no hangar-bay/${s}.template.yaml`
          : `${s}: template will not parse: ${e.message.split('\n')[0]}`);
        continue;
      }
      try { hw = P.readManifest(s); }
      catch (e) {
        g.fail(/exactly one firmware/.test(e.message)
          ? `${s}: ${e.message}`
          : `${s}: manifest will not parse: ${e.message.split('\n')[0]}`);
        continue;
      }

      g.check(tpl.template === 'meckie-hangar-bay/1', `${s}: template is "${tpl.template}"`);
      g.check(tpl.known_template && tpl.known_template.catalog === 'meckie-bodies',
        `${s}: known_template.catalog must be meckie-bodies`);

      // Integrity: the embedded block is the manifest, and the hash proves it.
      const text = P.readManifestText(s);
      g.check(P.embeddedManifestText(s) === text,
        `${s}: the template's hardware block differs from firmware/ (run npm run sync)`);
      g.check(tpl.known_template.hardware_sha256 === P.hash(text),
        `${s}: hardware_sha256 does not match the manifest (run npm run sync)`);

      // The calibration wizard must end in a required safety test. This is the
      // one step that proves the body parks itself when Central goes away.
      const steps = tpl.calibration_wizard || [];
      const safety = steps.find(x => x.step === 'safety_test');
      g.check(!!safety, `${s}: calibration_wizard has no safety_test step`);
      g.check(safety && safety.required === true, `${s}: safety_test must be required: true`);
      g.check(steps[steps.length - 1] && steps[steps.length - 1].step === 'safety_test',
        `${s}: safety_test must be the last wizard step`);

      // Pack URLs: a real URL or the honest placeholder, never a fake domain.
      const pack = String(tpl.body.pack || '');
      g.check(pack === 'unpublished' || /^https:\/\//.test(pack), `${s}: body.pack is "${pack}"`);
      g.check(!/\.(example|invalid|test|localhost)(\/|$)/.test(pack), `${s}: body.pack points at a reserved domain`);

      // Targets line up with the MCUs the manifest declares.
      const mcus = Object.keys(hw.mcu || {});
      const targets = Object.keys(tpl.targets || {});
      for (const t of targets) g.check(mcus.includes(t), `${s}: target "${t}" is not an mcu key`);
      for (const m of mcus) g.check(targets.includes(m), `${s}: mcu "${m}" has no target`);

      // Servo IDs are unique per bus, or the bus talks to the wrong joint.
      const buses = {};
      for (const sv of hw.servos || []) {
        const b = sv.bus || 'servo_bus';
        (buses[b] = buses[b] || []).push(sv.id);
      }
      for (const [b, ids] of Object.entries(buses)) {
        g.check(new Set(ids).size === ids.length, `${s}: duplicate servo IDs on ${b}: ${ids.join(',')}`);
      }

      // Pins are unique per host MCU. Partitioning by host matters: the reflex
      // ESP32 and the face Pi have separate GPIO spaces, and comparing the two
      // invents collisions that do not exist.
      const PIN = new Set(['tx', 'rx', 'sda', 'scl', 'sclk', 'mosi', 'miso', 'cs', 'dc', 'rst',
        'bl', 'bl_pwm', 'xshut', 'lpn', 'int', 'en', 'ce', 'fault', 'gpio', 'adc_gpio', 'pwm_gpio',
        'nsleep', 'nfault', 'in1', 'in2', 'pwm', 'enc_a', 'enc_b', 'sd', 'dout', 'din', 'bclk',
        'lrclk', 'ws', 'clk', 'data', 'power_en', 'pin']);
      const used = {};
      const walk = (node, host) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(x => walk(x, host));
        const h = node.host || host;
        for (const [k, v] of Object.entries(node)) {
          if (PIN.has(k) && typeof v === 'number') {
            const at = `${h}:${v}`;
            (used[at] = used[at] || []).push(k);
          } else if (v && typeof v === 'object') {
            walk(v, ['reflex', 'face', 'head', 'audio', 'head_cam'].includes(k) ? k : h);
          }
        }
      };
      for (const [name, bus] of Object.entries(hw.buses || {})) walk(bus, (bus && bus.host) || 'reflex');
      const hostOf = {};
      for (const [name, bus] of Object.entries(hw.buses || {})) if (bus && bus.host) hostOf[name] = bus.host;
      for (const p of hw.peripherals || []) walk(p, p.host || hostOf[p.bus] || 'reflex');
      if (hw.drive) walk(hw.drive, 'reflex');
      if (hw.kickstand) walk(hw.kickstand, 'reflex');
      // A shared pin is legal only where the manifest says so and names every
      // signal on it. Open-drain fault lines genuinely do wire-OR, and on a
      // pin-starved board that is the right call - but it has to be a stated
      // decision, because the cost is that firmware cannot tell the sources
      // apart, and the safety triggers have to reflect that.
      const declaredShare = new Map();
      for (const sp of hw.shared_pins || []) {
        declaredShare.set(`${sp.host || 'reflex'}:${sp.gpio}`, sp);
      }
      for (const [at, keys] of Object.entries(used)) {
        const [host, gpio] = at.split(':');
        if (keys.length <= 1) continue;
        const share = declaredShare.get(at);
        if (!share) {
          g.fail(`${s}: ${host} GPIO ${gpio} assigned to ${keys.length} signals (${keys.join(', ')}) ` +
            'with no shared_pins entry declaring it');
          continue;
        }
        g.check(Array.isArray(share.signals) && share.signals.length === keys.length,
          `${s}: shared_pins GPIO ${gpio} lists ${(share.signals || []).length} signals, ` +
          `but ${keys.length} are wired to it (${keys.join(', ')})`);
        g.check(!!share.wire_or, `${s}: shared_pins GPIO ${gpio} must state how it is shared (wire_or)`);
        declaredShare.delete(at);
      }
      // A share that no longer exists must not keep sitting in the manifest
      // looking like an approved exception.
      for (const [at, sp] of declaredShare) {
        g.fail(`${s}: shared_pins declares ${at}, but only one signal uses that pin`);
      }

      // Every sensor a reflex or a wizard step names must exist.
      const declared = new Set((hw.peripherals || []).map(p => p.name));
      if (hw.balance && hw.balance.imu && hw.balance.imu.name) declared.add(hw.balance.imu.name);
      const named = [];
      for (const r of Object.values(hw.reflexes || {})) {
        if (r.sensor) named.push(r.sensor);
        if (Array.isArray(r.sensors)) named.push(...r.sensors);
      }
      for (const st of steps) if (Array.isArray(st.checks)) named.push(...st.checks);
      for (const n of new Set(named)) {
        g.check(declared.has(n) || VIRTUAL.has(n), `${s}: "${n}" is referenced but never declared`);
      }

      // Every ToF sensor is exercised during calibration, or a builder can
      // finish setup with an untested drop sensor.
      const checked = new Set(steps.flatMap(st => st.checks || []));
      for (const p of (hw.peripherals || []).filter(x => /vl53/.test(x.part || ''))) {
        g.check(checked.has(p.name), `${s}: ${p.name} is never verified by the calibration wizard`);
      }

      // --- the sensing rule ---
      // Stated by ROLE, not by name. The handoff's version ("must declare
      // lidar_fwd plus drop-off front and rear") passed only 2 of 4 driving
      // bodies even though all 4 carried the hardware, because the packs
      // disagreed on names.
      const roles = {};
      for (const p of hw.peripherals || []) if (p.role) (roles[p.role] = roles[p.role] || []).push(p.name);
      if (tpl.body.drives === true) {
        g.check((roles.obstacle || []).length >= 1, `${s} drives: no peripheral with role: obstacle`);
        g.check((roles.drop_off || []).length >= 2,
          `${s} drives: needs a drop-off sensor front and rear, found ${(roles.drop_off || []).length}`);
        const edge = (hw.reflexes || {}).edge;
        g.check(!!edge, `${s} drives: no edge reflex`);
        for (const d of roles.drop_off || []) {
          g.check(edge && Array.isArray(edge.sensors) && edge.sensors.includes(d),
            `${s}: ${d} is declared drop_off but the edge reflex does not use it`);
        }
      } else {
        // A fixed base says so, rather than leaving the exemption implicit.
        g.check(hw.sensing_rule && hw.sensing_rule.drop_off,
          `${s} does not drive: declare sensing_rule.drop_off explaining the exemption`);
      }

      // --- the safety reflex ---
      const safe = hw.safety || {};
      g.check(Array.isArray(safe.triggers) && safe.triggers.includes('heartbeat_lost'),
        `${s}: safety.triggers must include heartbeat_lost`);
      g.check(Array.isArray(safe.routine) && safe.routine.includes('wait_2s'),
        `${s}: safety.routine must wait before moving to a rest pose`);
      g.check(Array.isArray(safe.routine) && safe.routine.includes('face_sleepy'),
        `${s}: safety.routine must show the lost-connection face`);
      g.check(safe.resume === 'fresh_command_only',
        `${s}: safety.resume must be fresh_command_only, not "${safe.resume}"`);
      const to = (hw.central || {}).timeout_ms;
      g.check(to >= 100 && to <= 1000, `${s}: central.timeout_ms is ${to}, expected 100-1000`);
    }
  }
}

// -------------------------------------------------------------- generated ---
{
  const g = group('generated');
  if (!g.skip) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'schema', 'MANIFEST.schema.json'), 'utf8'));
    const validate = ajv.compile(schema);

    for (const s of slugs) {
      const dir = path.join(P.packDir(s), 'generated');
      for (const f of ['manifest.json', 'build.json']) {
        g.check(fs.existsSync(path.join(dir, f)), `${s}: generated/${f} is missing (run npm run emit)`);
      }
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
      let m;
      try { m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); }
      catch (e) { g.fail(`${s}: generated/manifest.json is not valid JSON — ${e.message}`); continue; }
      if (!validate(m)) {
        for (const e of validate.errors) {
          g.fail(`${s}: manifest.json ${e.instancePath || '/'} ${e.message}`);
        }
      } else g.pass();
      // The generated manifest must describe the manifest that is on disk now.
      g.check(m._generated && m._generated.hardware_sha256 === P.hash(P.readManifestText(s)),
        `${s}: generated/manifest.json is stale (run npm run emit)`);
    }
  }
}

// ------------------------------------------------------------ site data ---
{
  const g = group('sitedata');
  if (!g.skip) {
    // Every STL must appear in the site data. This exists because it did not:
    // a non-greedy filename regex mis-split hyphenated slugs, so rover-lite and
    // biped-mini shipped with empty Print tabs hiding 66 files between them,
    // and nothing failed because the download-all zip reads the directory.
    for (const s of slugs) {
      const file = path.join(P.ROOT, 'site', 'data', `${s}.json`);
      if (!fs.existsSync(file)) { g.fail(`${s}: no site/data/${s}.json (run npm run site-data)`); continue; }
      let d;
      try { d = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { g.fail(`${s}: site/data/${s}.json is not valid JSON — ${e.message}`); continue; }

      let stls;
      try { stls = fs.readdirSync(path.join(P.packDir(s), 'stl')).filter(f => f.endsWith('.stl')); }
      catch (e) { g.pass(); continue; }      // layout group reports a missing stl/

      g.check((d.parts || []).length === stls.length,
        `${s}: site data lists ${(d.parts || []).length} parts but ${stls.length} STLs are on disk ` +
        '— run npm run site-data');

      // And every listed part points at a file that is really there.
      for (const p of d.parts || []) {
        g.check(stls.includes(p.file), `${s}: site data names ${p.file}, which is not in stl/`);
      }
    }
  }
}

// --------------------------------------------------------- scaffolding ---
{
  const g = group('scaffold');
  if (!g.skip) {
    // A body scaffolded from another starts as a copy with a new name. Good way
    // to start, bad thing to ship: a renamed scout is not a new body.
    //
    // The test is the GEOMETRY, not the STLs. Comparing exported bytes looked
    // right and was not: a scaffold re-exports its meshes, so a handful of
    // files shift and the comparison lets the whole copy through. The Print
    // Parts page is the design - if it still says what its source says once the
    // renames are undone, nothing has been designed yet.
    for (const b of catalog.bodies) {
      const from = b.scaffolded_from;
      if (!from) continue;
      if (!slugs.includes(from)) {
        g.fail(`${b.slug}: scaffolded_from names "${from}", which is not a body here`);
        continue;
      }
      const srcEntry = catalog.bodies.find(x => x.slug === from);
      const pageOf = (slug, entry) => {
        const dir = P.packDir(slug);
        let files;
        try { files = fs.readdirSync(dir); } catch (e) { return null; }
        const hit = files.find(f => f.endsWith(' Print Parts.html'));
        if (!hit) return null;
        try { return fs.readFileSync(path.join(dir, hit), 'utf8'); } catch (e) { return null; }
      };
      const mine = pageOf(b.slug, b);
      const theirs = pageOf(from, srcEntry);
      if (mine === null || theirs === null) { g.pass(); continue; }  // layout reports it

      // Undo what the scaffold renamed, so only real design changes survive.
      const norm = (text, slug, name) => text
        .split(`window.${slug.replace(/-/g, '')}Parts`).join('@PARTS@')
        .split(name).join('@NAME@')
        .split(slug).join('@SLUG@');
      const same = norm(mine, b.slug, b.name) === norm(theirs, from, srcEntry.name);

      g.check(!same,
        `${b.slug}: still an unmodified copy of ${from} — its Print Parts geometry is ` +
        `${from}'s with the names changed. Design it, then drop "scaffolded_from" from ` +
        'its bodies.json entry.');
    }
  }
}

// ----------------------------------------------------- stl reproducibility ---
{
  const g = group('reproducible');
  if (!g.skip) {
    // The pack standard calls <Body> Print Parts.html the geometric source of
    // truth, so every committed STL should come back out of it. 11 do not, all
    // of them inherited from the handoff - see stl-drift.json. Exact allowlist,
    // same discipline as the mesh one: an unlisted file that drifts fails, and
    // a listed file that stops drifting fails too.
    const expected = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'stl-drift.json'), 'utf8')).drift;
    let actual;
    try {
      actual = JSON.parse(execFileSync(process.execPath,
        [path.join(P.ROOT, 'tools', 'reexport.js'), '--json'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) {
      // A pack with no Print Parts page cannot be rebuilt, which is a finding
      // from the layout group, not a reason to abandon the whole run.
      const detail = String((e.stderr || e.message || '')).split('\n').find(l => l.trim()) || e.message;
      g.fail(`could not check STLs against their generators: ${detail.trim()}`);
      actual = null;
    }
    if (actual) {
      for (const file of Object.keys(actual)) {
        g.check(file in expected,
          `${file}: does not reproduce from its generator and is not in stl-drift.json ` +
          `(${actual[file].kind}: ${actual[file].note})`);
      }
      for (const file of Object.keys(expected)) {
        g.check(file in actual,
          `stl-drift.json lists ${file}, but it now reproduces — remove the entry`);
      }
    }
  }
}

// ----------------------------------------------------------------- report ---
const label = (n) => `${n} ${n === 1 ? 'problem' : 'problems'}`;
if (warnings.length) {
  console.log(`\n${label(warnings.length)} reported as warnings:\n`);
  for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.error(`\n${label(errors.length)} across ${checks} checks:\n`);
  const shown = errors.slice(0, 40);
  for (const e of shown) console.error('  x ' + e);
  if (errors.length > shown.length) console.error(`  … and ${errors.length - shown.length} more`);
  process.exit(1);
}
console.log(`\n${checks} checks passed across ${slugs.length} packs` +
  (warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''));
