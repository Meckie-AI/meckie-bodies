#!/usr/bin/env node
// Generate the "why these materials" block in each brief's section 06. MIT.
//
//   node tools/add-material-note.js            insert where missing
//   node tools/add-material-note.js --force    replace an existing block
//
// Idempotent and regenerable, because the material decision has already changed
// once: the packs originally specified PETG shells over CF-nylon structure, and
// this file argued at length against PLA. The packs now specify PLA throughout,
// with TPU only where compliance is the part's function, so the block had to be
// rewritten rather than patched. Keeping it generated means the argument and the
// part tally can never drift apart, and the next change is one edit here rather
// than seven.
//
// Every number in the generated text is read from that body's own manifest and
// its site/data entry, so no brief claims a limit its servos do not have.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');

const MARK = 'data-screen-label="06 Material note"';
const force = process.argv.includes('--force');

function blockFor(slug) {
  const hw = P.readManifest(slug);
  const data = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'site', 'data', `${slug}.json`), 'utf8'));

  const tally = {};
  for (const p of data.parts) tally[p.material] = (tally[p.material] || 0) + p.qty;
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const pct = (m) => Math.round(100 * (tally[m] || 0) / total);

  // Name the compliant parts rather than asserting a category. If TPU is only
  // justified where flex IS the function, the brief should say which parts
  // those are and let the reader check the claim.
  const tpuParts = [...new Set(data.parts.filter(p => /tpu/i.test(p.material))
    .map(p => p.name.replace(/ \((left|right)\)$/, '').toLowerCase()))].sort();

  const lim = hw.servo_limits || {};
  const warn = Number(lim.temp_warn_c);
  const hasServoLimits = Number.isFinite(warn);

  // The heat argument, inverted from where it started: PLA's softening point is
  // genuinely low, and the honest framing is that this is a storage and
  // transport caution rather than a running-temperature problem.
  const thermal = hasServoLimits
    ? `PLA's glass transition is about 55 to 60 &deg;C, and this body's servos do not warn until ` +
      `${warn} &deg;C. Indoors that gap never opens: the shell sits near room temperature and the ` +
      `servos are the only thing that gets hot. Left in a closed car in summer, or on a sill in ` +
      `direct sun, the shell can soften while the electronics still consider themselves fine. ` +
      `That is a storage rule, not a design flaw, and it is the main thing PETG would buy back.`
    : `PLA's glass transition is about 55 to 60 &deg;C. Indoors that is never approached. Left in ` +
      `a closed car in summer, or on a sill in direct sun, the shell can soften. That is a storage ` +
      `rule, not a design flaw, and it is the main thing PETG would buy back.`;

  return `
  <section ${MARK} style="display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;align-items:baseline;gap:16px">
      <span style="width:40px;height:40px;border-radius:50%;background:#c8463a;color:#f7f0de;display:flex;align-items:center;justify-content:center;font:700 16px 'Jost'">06b</span>
      <h2 style="margin:0;font:700 30px 'Jost';text-transform:uppercase;letter-spacing:.06em">Why these materials</h2>
    </div>

    <p style="margin:0;max-width:820px;font:400 16px/1.6 'Jost';text-wrap:pretty">Two filaments, and one of them only where flex is the point. The constraint that decided this was not strength: it was that <strong>a stock printer with no modifications should be able to make every rigid part on this body</strong>. PLA needs no hardened nozzle, no dry box, no enclosure and no 260&nbsp;&deg;C hotend, which is the difference between a pack most people can print and a pack most people can only read.</p>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
      <div style="border:2px solid #23292b;border-radius:20px;padding:18px 20px;background:#f7f0de">
        <div style="font:700 17px 'Jost'">PLA</div>
        <div style="font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#3d4344;margin:4px 0 8px">${pct('PLA')}% of the printed pieces</div>
        <div style="font:400 15px/1.5 'Jost';text-wrap:pretty">Everything rigid: shells, structure, brackets, bezels. Stiff, dimensionally accurate, prints unsupported on more surfaces than anything else, and stocked in every colour this body names.</div>
      </div>
      <div style="border:2px solid #23292b;border-radius:20px;padding:18px 20px;background:#f7f0de">
        <div style="font:700 17px 'Jost'">TPU 95A</div>
        <div style="font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#3d4344;margin:4px 0 8px">${pct('TPU 95A')}% of the printed pieces</div>
        <div style="font:400 15px/1.5 'Jost';text-wrap:pretty">Only where compliance is the function and a rigid part would not work at all: ${tpuParts.join(', ')}. Nothing here is TPU for toughness alone.</div>
      </div>
    </div>

    <div style="border:2px solid #23292b;border-radius:20px;padding:22px 24px;background:#f7f0de;display:flex;flex-direction:column;gap:14px">
      <div style="font:700 20px 'Jost';text-transform:uppercase;letter-spacing:.05em">What PLA costs you</div>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty"><strong>Snap hooks are the weak point.</strong> The snap features on this body were drawn to stay under 2.5% strain, which suits PETG. PLA's safe cantilever strain is nearer 1.5%, so the hooks are working harder than the geometry assumed. Print them with the layer lines running across the hook rather than along it, open the shell gently, and treat a hook as a part you may have to reprint. <strong>Nothing in this pack has been test-printed</strong>, so this is the first place to look for trouble and the most useful thing you can report back.</p>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty"><strong>Heat.</strong> ${thermal}</p>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty"><strong>Heat-set inserts.</strong> Every screw lands in a brass insert, and PLA's window is narrower than PETG's: run the iron cooler, around 180 to 200&nbsp;&deg;C, go in slowly, and let the boss cool before loading it. Rushing one slumps the wall around it.</p>
      <p style="margin:0;font:400 15px/1.6 'Jost';color:#3d4344;text-wrap:pretty"><strong>If you want the margin back:</strong> the geometry does not change. Print the shells in PETG and the load-bearing structure in CF-nylon and every part still fits, because that was the original specification and the only thing that changed is which spool is on the shelf. The cost is a hardened nozzle, a dry box, and a printer that holds 260&nbsp;&deg;C. If you have that printer, the tougher parts are yours for a filament swap.</p>
    </div>
  </section>
`;
}

let added = 0, replaced = 0;
for (const slug of P.slugs()) {
  const dir = P.packDir(slug);
  const file = fs.readdirSync(dir).find(f => f.endsWith(' Design Brief.dc.html'));
  if (!file) { console.error(`  ${slug}: no brief`); continue; }
  const full = path.join(dir, file);
  const t = fs.readFileSync(full, 'utf8');

  const at = t.indexOf(MARK);
  if (at !== -1) {
    if (!force) { console.log(`  ${slug}: already has it, skipping (--force to replace)`); continue; }
    // Replace in place: cut the whole <section> the mark sits in.
    const start = t.lastIndexOf('<section', at);
    const end = t.indexOf('</section>', at) + '</section>'.length;
    let s = start; while (s > 0 && /\s/.test(t[s - 1])) s--;
    fs.writeFileSync(full, t.slice(0, s) + '\n' + blockFor(slug) + t.slice(end));
    console.log(`  ${slug}: replaced`);
    replaced++;
    continue;
  }

  // After section 06, before whatever follows it.
  const six = t.indexOf('data-screen-label="06 ');
  if (six === -1) { console.error(`  ${slug}: no section 06 to follow`); continue; }
  const close = t.indexOf('</section>', six);
  if (close === -1) { console.error(`  ${slug}: section 06 is unterminated`); continue; }
  const insert = close + '</section>'.length;

  fs.writeFileSync(full, t.slice(0, insert) + '\n' + blockFor(slug) + t.slice(insert));
  console.log(`  ${slug}: added`);
  added++;
}
console.log(`\n${added} added, ${replaced} replaced`);
