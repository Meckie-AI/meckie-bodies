#!/usr/bin/env node
// Add the "why these materials" block to each brief's section 06. MIT.
//
// One-shot, kept in the tree as the record of what was added and on what
// evidence. Every number in the generated text is read from that body's own
// manifest and parts list, so no brief claims a limit its servos do not have.
//
// Why this exists: the packs specified PETG throughout and never said why, and
// PLA was not mentioned anywhere, not even to rule it out. It is the first
// question anyone with a printer asks.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');

const MARK = 'data-screen-label="06 Material note"';

function blockFor(slug) {
  const hw = P.readManifest(slug);
  const data = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'site', 'data', `${slug}.json`), 'utf8'));

  const tally = {};
  for (const p of data.parts) tally[p.material] = (tally[p.material] || 0) + p.qty;
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const pct = (m) => Math.round(100 * (tally[m] || 0) / total);

  const lim = hw.servo_limits || {};
  const warn = Number(lim.temp_warn_c);
  const trip = Number(lim.temp_trip_c);
  const hasServoLimits = Number.isFinite(warn) && Number.isFinite(trip);

  const serial = (hw.servos || []).length;
  const drives = !!hw.drive;
  const balances = !!hw.balance;
  // A walker has legs and a gait rather than a drive block, and spends its
  // early life falling over while the gait is tuned. Impact, not creep.
  const walks = !!(hw.legs || hw.gait);

  // The decisive argument, where this body supplies the numbers for it.
  const thermal = hasServoLimits
    ? `This body's servos warn at ${warn} °C and cut torque at ${trip} °C. PLA's glass ` +
      `transition is about 55 to 60 °C, which is <strong>below the temperature its own ` +
      `thermal protection is still treating as normal</strong>. The shell would start going ` +
      `soft while the servos inside it were still inside their rated envelope. PETG softens ` +
      `around 80 to 85 °C, which puts the enclosure above the limits of what it encloses.`
    : `PLA's glass transition is about 55 to 60 °C. A closed shell over a motor driver and a ` +
      `battery, on a desk in a sunny window or carried in a car, reaches that without trying. ` +
      `PETG softens around 80 to 85 °C, so the enclosure stays ahead of what it encloses.`;

  // Creep matters most where a pose is held; impact where the thing falls over.
  const second = (drives || balances || walks)
    ? `<strong>Impact.</strong> PLA is brittle and this body is going to hit things, and ` +
      `fall over while its gait or balance is being tuned. PETG yields where PLA snaps.`
    : serial >= 4
    ? `<strong>Creep.</strong> PLA deforms slowly under a steady room-temperature load. This ` +
      `arm holds a pose for hours at a time, with the mass of a head on a moment arm. Over ` +
      `weeks that sags. PETG holds.`
    : `<strong>Creep.</strong> PLA deforms slowly under a steady load, and a body that holds ` +
      `a pose rather than returning to rest is loaded all day. PETG holds its shape.`;

  return `
  <section ${MARK} style="display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;align-items:baseline;gap:16px">
      <span style="width:40px;height:40px;border-radius:50%;background:#c8463a;color:#f7f0de;display:flex;align-items:center;justify-content:center;font:700 16px 'Jost'">06b</span>
      <h2 style="margin:0;font:700 30px 'Jost';text-transform:uppercase;letter-spacing:.06em">Why these materials</h2>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
      <div style="border:2px solid #23292b;border-radius:20px;padding:18px 20px;background:#f7f0de">
        <div style="font:700 17px 'Jost'">PETG</div>
        <div style="font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#3d4344;margin:4px 0 8px">${pct('PETG')}% of the printed pieces</div>
        <div style="font:400 15px/1.5 'Jost';text-wrap:pretty">Shells and enclosures. Heat tolerance, toughness at a snap hook, and a wide enough window to take a heat-set insert without slumping the boss around it.</div>
      </div>
      <div style="border:2px solid #23292b;border-radius:20px;padding:18px 20px;background:#f7f0de">
        <div style="font:700 17px 'Jost'">CF-nylon</div>
        <div style="font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#3d4344;margin:4px 0 8px">${pct('CF-nylon')}% of the printed pieces</div>
        <div style="font:400 15px/1.5 'Jost';text-wrap:pretty">Structure: the parts that actually carry load. Stiffness and fatigue life where a bracket or a yoke is the thing holding the body together.</div>
      </div>
      <div style="border:2px solid #23292b;border-radius:20px;padding:18px 20px;background:#f7f0de">
        <div style="font:700 17px 'Jost'">TPU 95A</div>
        <div style="font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#3d4344;margin:4px 0 8px">${pct('TPU 95A')}% of the printed pieces</div>
        <div style="font:400 15px/1.5 'Jost';text-wrap:pretty">Anything compliant: tyres, bumpers, feet. Grip and a surface that absorbs a knock instead of transmitting it into the shell.</div>
      </div>
    </div>

    <div style="border:2px solid #23292b;border-radius:20px;padding:22px 24px;background:#f7f0de;display:flex;flex-direction:column;gap:14px">
      <div style="font:700 20px 'Jost';text-transform:uppercase;letter-spacing:.05em">Why not PLA</div>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty">${thermal}</p>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty">${second}</p>
      <p style="margin:0;font:400 16px/1.6 'Jost';text-wrap:pretty"><strong>Snap fits.</strong> Nothing here is glued. Every shell closes on cantilever hooks and latches that flex each time it is opened, and that is the exact geometry PLA fails at. The same goes for the brass inserts every screw lands in: setting one means a 200 °C iron against the wall, and PLA's narrow window lets the boss slump where PETG holds its shape.</p>
      <p style="margin:0;font:400 15px/1.6 'Jost';color:#3d4344;text-wrap:pretty"><strong>Where PLA is genuinely better:</strong> it is stiffer, it holds a dimension more tightly, and it prints more easily without supports. If you are making a test fit, a mock-up, or a part that never gets warm and never flexes, print it in PLA. It is the production shells that want PETG.</p>
    </div>
  </section>
`;
}

let n = 0;
for (const slug of P.slugs()) {
  const dir = P.packDir(slug);
  const file = fs.readdirSync(dir).find(f => f.endsWith(' Design Brief.dc.html'));
  if (!file) { console.error(`  ${slug}: no brief`); continue; }
  const full = path.join(dir, file);
  let t = fs.readFileSync(full, 'utf8');
  if (t.includes(MARK)) { console.log(`  ${slug}: already has it, skipping`); continue; }

  // After section 06, before whatever follows it.
  const at = t.indexOf('data-screen-label="06 ');
  if (at === -1) { console.error(`  ${slug}: no section 06 to follow`); continue; }
  const close = t.indexOf('</section>', at);
  if (close === -1) { console.error(`  ${slug}: section 06 is unterminated`); continue; }
  const insert = close + '</section>'.length;

  fs.writeFileSync(full, t.slice(0, insert) + '\n' + blockFor(slug) + t.slice(insert));
  console.log(`  ${slug}: added`);
  n++;
}
console.log(`\n${n} brief(s) updated`);
