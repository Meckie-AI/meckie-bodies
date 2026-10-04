#!/usr/bin/env node
// Remove the junk triangles that CSG export leaves behind. MIT.
//
//   node tools/meshclean.js --dry   report what would change
//   node tools/meshclean.js         rewrite the STLs in place
//
// Two defect classes, both safe to remove from a closed mesh:
//
//   zero-area triangles  two corners coincide at 1 micron. They carry no
//                        surface and no topology. Dropping them cannot open a
//                        hole, because an edge they contribute is traversed
//                        twice by the same degenerate triangle.
//   duplicate triangles  the same corner triple emitted twice. One copy is
//                        the surface; the second is a stray. Removing the
//                        extra copy restores its three edges to two users.
//
// What this does NOT do is move geometry. Several parts have two surfaces that
// touch exactly along a line, which makes four triangles share one edge. That
// is a modelling decision in the generator (coincident features that should
// overlap by a few microns instead of abutting), not export junk, so it is
// reported and left alone rather than "fixed" by nudging vertices under the
// designer's feet.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');
const mesh = require('./lib/mesh');

const dry = process.argv.includes('--dry');
const key = (v) => `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)},${Math.round(v[2] * 1000)}`;

function clean(tris) {
  const out = [];
  const seen = new Map();          // winding-sensitive triple -> count
  let degenerate = 0, duplicate = 0;

  for (const t of tris) {
    const k = t.map(key);
    if (k[0] === k[1] || k[1] === k[2] || k[2] === k[0]) { degenerate++; continue; }
    // Canonical rotation, winding preserved: the smallest corner first.
    let r = 0;
    if (k[1] < k[0] && k[1] <= k[2]) r = 1;
    else if (k[2] < k[0] && k[2] < k[1]) r = 2;
    const id = [k[r], k[(r + 1) % 3], k[(r + 2) % 3]].join('|');
    if (seen.has(id)) { duplicate++; continue; }
    seen.set(id, true);
    out.push(t);
  }
  return { tris: out, degenerate, duplicate };
}

function writeStl(file, tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write('meckie-bodies cleaned export'.padEnd(80, ' '), 0, 80, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    // Recompute the facet normal from the winding; the stored one is advisory
    // and several exports carry a stale value.
    const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
    const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map(c => c / len);
    n.forEach((c, j) => buf.writeFloatLE(c, o + j * 4));
    t.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, o + 12 + j * 12 + k * 4)));
    buf.writeUInt16LE(0, o + 48);
  });
  fs.writeFileSync(file, buf);
}

let files = 0, changed = 0, degTotal = 0, dupTotal = 0;
const remaining = [];

for (const slug of P.slugs()) {
  const dir = path.join(P.packDir(slug), 'stl');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.stl')).sort()) {
    const file = path.join(dir, f);
    files++;
    const before = mesh.check(file);
    const r = clean(mesh.triangles(file));
    degTotal += r.degenerate;
    dupTotal += r.duplicate;

    if (r.degenerate || r.duplicate) {
      changed++;
      if (!dry) writeStl(file, r.tris);
      const after = dry ? null : mesh.check(file);
      console.log(`${slug}/${f}: -${r.degenerate} zero-area, -${r.duplicate} duplicate` +
        (after ? `  nonmanifold ${before.nonmanifold} -> ${after.nonmanifold}` +
                 (after.watertight ? '' : `  WATERTIGHT LOST (${after.boundary})`) : ''));
    }
    const final = dry ? before : mesh.check(file);
    if (final.nonmanifold) remaining.push(`${slug}/${f}: ${final.nonmanifold} edge(s) with four triangles`);
    if (!final.watertight) remaining.push(`${slug}/${f}: ${final.boundary} boundary edge(s) — NOT WATERTIGHT`);
  }
}

console.log(`\n${changed} of ${files} files ${dry ? 'would be' : ''} rewritten: ` +
  `${degTotal} zero-area and ${dupTotal} duplicate triangles removed`);
if (remaining.length) {
  console.log(`\n${remaining.length} defect(s) a clean cannot fix (coincident surfaces in the generator):`);
  for (const r of remaining) console.log('  - ' + r);
} else {
  console.log('\nevery mesh is closed, single-shell and edge-manifold');
}
