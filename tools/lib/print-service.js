// What Meckie would charge to print a body, and how long it would take. MIT.
//
// Takes the body document rather than a slug, because site-data.js needs this
// while it is still building that document and cannot read it back off disk.
// print-price.js loads the finished file and passes it in. One implementation,
// so the number on the page and the number in the CLI cannot drift.
//
// Separate from rates.json on purpose: that file prices an outside service
// bureau, which has automation and scale. This prices one printer and a person.
// Averaging the two would hide the only interesting finding here, which is that
// labour is most of the cost and paint is most of the labour.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'print-service.json'), 'utf8'));

// Spool prices, USD/kg. Here rather than in print-service.json because they are
// what we pay for stock, not a knob on the pricing policy.
const SPOOL = { PLA: 20, 'TPU 95A': 38, PETG: 23, 'CF-nylon': 75 };

/**
 * @param {object} doc   a body's site/data document (needs .parts and .filament)
 * @param {object} opts  { paint } — whether we finish the chrome and brass parts
 */
function price(doc, { paint = false } = {}) {
  const bm = (doc.filament && doc.filament.by_material) || {};
  const mats = Object.keys(bm);

  const grams = (m) => (bm[m] ? (bm[m].g_low + bm[m].g_high) / 2 : 0);
  const printedG = mats.reduce((n, m) => n + grams(m), 0);
  const filament = mats.reduce((n, m) => n + grams(m) / 1000 * (SPOOL[m] || 25), 0);

  // Machine hours from printed mass, at the stated throughput band. The low
  // hour figure comes from the HIGH throughput, so hours[0] <= hours[1].
  const hours = [printedG / S.machine.grams_per_hour[1], printedG / S.machine.grams_per_hour[0]];
  const machine = hours.map((h) => h * S.machine.usd_per_hour);

  // At least one plate per material: a single extruder cannot mix PLA and TPU,
  // and each additional plate is another thing to attend to.
  const plates = Math.max(1, mats.length);
  const handlingH = S.labour.handling_hours_base + plates * S.labour.handling_hours_per_plate;

  const paintedParts = (doc.parts || [])
    .filter((p) => /paint|finish/i.test(p.material_full || ''))
    .reduce((n, p) => n + p.qty, 0);
  const paintH = paint && paintedParts
    ? S.labour.paint_hours_base + paintedParts * S.labour.paint_hours_per_part
    : 0;

  const labour = (handlingH + paintH) * S.labour.usd_per_hour;
  const packaging = S.packaging.usd_base + (printedG / 100) * S.packaging.usd_per_100g;

  const cost = machine.map((m) => filament + m + labour + packaging);
  const asking = cost.map((c) => c * (1 + S.failure_allowance) * (1 + S.margin));

  // Lead time for an EMPTY queue. Queue depth is added when we actually reply,
  // never baked into a page: it is the one input that changes hour to hour, and
  // a stale promise on a static page is worse than no promise.
  const usableHoursPerDay = 24 * S.capacity.realistic_utilisation;
  const finishDays = paint && paintedParts ? 3 : 1;   // four coats with dry time
  const leadDays = hours.map((h) =>
    Math.ceil(h / usableHoursPerDay) + finishDays + S.capacity.post_days);

  return {
    printed_g: +printedG.toFixed(0),
    plates,
    painted_parts: paintedParts,
    filament_usd: +filament.toFixed(2),
    machine_hours: hours.map((h) => +h.toFixed(1)),
    handling_hours: +handlingH.toFixed(1),
    paint_hours: +paintH.toFixed(1),
    labour_usd: +labour.toFixed(2),
    packaging_usd: +packaging.toFixed(2),
    cost_usd: cost.map((c) => +c.toFixed(2)),
    usd_low: Math.ceil(asking[0]),
    usd_high: Math.ceil(asking[1]),
    lead_days_low: leadDays[0],
    lead_days_high: leadDays[1],
    // Where this is most of the cost, an automated bureau wins on price and the
    // honest pitch has to be convenience rather than value.
    labour_share: +(labour / cost[1]).toFixed(2),
    calibrated: S.calibrated,
  };
}

/** Both options, which is what a page needs to offer a choice. */
function quote(doc) {
  return {
    schema: 'meckie-print-service/1',
    calibrated: S.calibrated,
    unpainted: price(doc, { paint: false }),
    painted: price(doc, { paint: true }),
    capacity_bodies_per_month: Math.round(
      S.capacity.printers * S.capacity.hours_per_month_per_printer
      * S.capacity.realistic_utilisation / 21),   // ~21 machine-hours a body
  };
}

module.exports = { price, quote, SPOOL, settings: S };
