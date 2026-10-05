#!/usr/bin/env node
// What Meckie would charge to print a body, and how long it would take. MIT.
//
//   npm run print-price                 every body
//   npm run print-price -- scout        one body, itemised
//   npm run print-price -- --compare    against an outside service bureau
//
// The arithmetic lives in tools/lib/print-service.js, which site-data.js also
// uses, so the number here and the number on the page come from one place.
// Knobs live in print-service.json.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');
const PS = require('./lib/print-service');

const S = PS.settings;
const doc = (slug) => JSON.parse(fs.readFileSync(path.join(P.ROOT, 'site', 'data', `${slug}.json`), 'utf8'));

const argv = process.argv.slice(2);
const compare = argv.includes('--compare');
const slugs = argv.filter((a) => !a.startsWith('--'));

if (slugs.length === 1) {
  const d = doc(slugs[0]);
  for (const paint of [false, true]) {
    const r = PS.price(d, { paint });
    if (paint && !r.painted_parts) continue;
    console.log(`\n  ${d.name.toUpperCase()}  ${paint ? 'WITH PAINT' : 'UNPAINTED'}`);
    console.log('  ' + '-'.repeat(58));
    const row = (k, v) => console.log(`   ${k.padEnd(28)} ${v}`);
    row('printed mass', `${r.printed_g} g on ${r.plates} plates`);
    row('filament', `$${r.filament_usd.toFixed(2)}`);
    row('machine time', `${r.machine_hours[0]}-${r.machine_hours[1]} h, costing $${(r.machine_hours[1] * S.machine.usd_per_hour).toFixed(2)}`);
    row('handling', `${r.handling_hours} h`);
    if (paint) row('painting', `${r.paint_hours} h for ${r.painted_parts} parts`);
    row('labour', `$${r.labour_usd.toFixed(2)} at $${S.labour.usd_per_hour}/h`);
    row('packaging + post', `$${r.packaging_usd.toFixed(2)}`);
    row('COST', `$${r.cost_usd[0]} - $${r.cost_usd[1]}`);
    row('  of which labour', `${(r.labour_share * 100).toFixed(0)}%`);
    row(`+${(S.failure_allowance * 100).toFixed(0)}% failure +${(S.margin * 100).toFixed(0)}% margin`, '');
    row('ASKING', `$${r.usd_low} - $${r.usd_high}`);
    row('lead time, empty queue', `${r.lead_days_low}-${r.lead_days_high} days`);
    row('an outside bureau', `$${d.service_estimate.usd_low} - $${d.service_estimate.usd_high}`);
  }
  console.log();
} else {
  const list = slugs.length ? slugs : P.slugs();
  console.log('\n  MADE TO ORDER: what to charge\n');
  // The painted column only earns its space if some body actually has painted
  // parts. The official packs have none since paint was dropped for metallic
  // PLA, but a contributed pack may bring it back.
  const anyPaint = list.some((s) => PS.price(doc(s), { paint: true }).painted_parts > 0);
  console.log('   body          mass   hrs       price' + (anyPaint ? '     painted   ' : '   ') +
    '  lead   labour' + (compare ? '    outside bureau' : ''));
  for (const slug of list) {
    const d = doc(slug);
    const u = PS.price(d, { paint: false });
    const p = PS.price(d, { paint: true });
    const money = (r) => `$${r.usd_low}-${r.usd_high}`;
    console.log(`   ${slug.padEnd(12)} ${(u.printed_g + 'g').padStart(5)} ` +
      `${(Math.round(u.machine_hours[0]) + '-' + Math.round(u.machine_hours[1])).padStart(5)} ` +
      `${money(u).padStart(11)} ` +
      (anyPaint ? `${(u.painted_parts ? money(p) : '—').padStart(11)} ` : '') +
      `${(u.lead_days_low + '-' + u.lead_days_high + 'd').padStart(7)} ` +
      `${((u.labour_share * 100).toFixed(0) + '%').padStart(6)}` +
      (compare ? `   $${d.service_estimate.usd_low}-${d.service_estimate.usd_high}`.padStart(18) : ''));
  }
  const cap = Math.round(S.capacity.printers * S.capacity.hours_per_month_per_printer
    * S.capacity.realistic_utilisation / 21);
  console.log(`\n  Labour is most of every line. ${S.capacity.printers} printer is about ${cap} bodies a month.`);
  console.log(`  Knobs: print-service.json. calibrated: ${S.calibrated}` +
    `${S.calibrated ? '' : ' — no body has been printed end to end, so every hour is a guess.'}\n`);
}
