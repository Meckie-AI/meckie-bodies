// Binary STL topology check. MIT. No dependencies on purpose: a mesh gate that
// needs a mesh library is a gate nobody can reproduce by hand.
//
// Vertices are welded at 1e-3 mm (one micron) before edges are counted. That
// matters: STL stores float32, so the same corner written by two triangles can
// differ in the last bit. Without a weld you measure float noise, not topology.
//
// Reported separately, because they are different problems:
//   boundary   edges used by exactly one triangle  -> a hole; not watertight
//   nonmanifold edges used by more than two        -> real topology defect
//   degenerate triangles with two coincident corners -> zero area, no topology
//
// Counting degenerate triangles as non-manifold (the obvious first
// implementation) overstates the damage by about 2x. They are junk worth
// removing, but they are not holes and they are not non-manifold.

const fs = require('fs');

// Build volume every part must fit, in mm. Was 256, which was the figure the
// packs were authored against and nothing actually needed: the largest part in
// the catalog is rover-lite's fender at 210 mm. 220 is the real requirement and
// a far more inclusive claim, since it is the common entry-level bed size.
//
// Note how tight that leaves the worst case. A 210 mm part on a 220 mm bed has
// 5 mm a side, which is not enough for a brim and barely enough for a skirt.
// It fits, and it is the thing to watch when a part near the limit is sliced.
const BED = 220;

function triangles(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 84) throw new Error('shorter than an STL header');
  // An ASCII STL starts with "solid" and has "facet" early on; binary files
  // can also start with "solid", so check for the keyword too.
  if (buf.slice(0, 5).toString('ascii') === 'solid' &&
      buf.slice(0, 512).toString('ascii').includes('facet')) {
    throw new Error('ASCII STL; packs ship binary');
  }
  const n = buf.readUInt32LE(80);
  if (buf.length < 84 + n * 50) throw new Error(`truncated: ${n} triangles declared`);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;           // skip the facet normal
    out[i] = [
      [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)],
      [buf.readFloatLE(o + 12), buf.readFloatLE(o + 16), buf.readFloatLE(o + 20)],
      [buf.readFloatLE(o + 24), buf.readFloatLE(o + 28), buf.readFloatLE(o + 32)],
    ];
  }
  return out;
}

const key = (v) => `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)},${Math.round(v[2] * 1000)}`;

function check(file) {
  const tris = triangles(file);
  const edges = new Map();
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  let degenerate = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];

  for (const t of tris) {
    const k = t.map(key);
    for (let a = 0; a < 3; a++) {
      for (let d = 0; d < 3; d++) {
        if (t[a][d] < lo[d]) lo[d] = t[a][d];
        if (t[a][d] > hi[d]) hi[d] = t[a][d];
      }
      if (!parent.has(k[a])) parent.set(k[a], k[a]);
    }
    if (k[0] === k[1] || k[1] === k[2] || k[2] === k[0]) { degenerate++; continue; }
    union(k[0], k[1]); union(k[1], k[2]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const e = k[a] < k[b] ? k[a] + '|' + k[b] : k[b] + '|' + k[a];
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }

  let boundary = 0, nonmanifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary++;
    else if (count > 2) nonmanifold++;
  }

  const shells = new Set();
  for (const k of parent.keys()) shells.add(find(k));

  const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map(d => (Number.isFinite(d) ? d : 0));

  return {
    triangles: tris.length,
    degenerate,
    boundary,
    nonmanifold,
    shells: shells.size,
    dims,
    oversize: dims.some(d => d > BED),
    watertight: boundary === 0,
    manifold: nonmanifold === 0,
    clean: boundary === 0 && nonmanifold === 0 && degenerate === 0,
  };
}

/**
 * Solid volume in cm3, by the signed-tetrahedron sum.
 *
 * Each triangle makes a tetrahedron with the origin; the signed volumes cancel
 * everywhere except inside the mesh, so a closed surface gives its own volume
 * regardless of where the origin sits. Every STL here is watertight, which is
 * the condition that makes this exact rather than approximate.
 *
 * This is the solid figure. What a printer actually extrudes is less, because
 * of walls and infill - see filament() for that, and do not confuse the two in
 * anything a buyer reads.
 */
function volumeCm3(file) {
  let v = 0;
  for (const [a, b, c] of triangles(file)) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(v) / 1000;          // mm3 -> cm3
}

// Filament densities, g/cm3. Spool figures vary by brand; these are mid-range
// published values.
//
// The official packs specify PLA and TPU only. PETG and CF-nylon stay in the
// table because a contributed pack may name them: new-body.js lets anyone add a
// body, and a density table that only knows our own choices would silently fall
// back to a default for theirs.
const DENSITY = { 'PLA': 1.24, 'TPU 95A': 1.21, 'PETG': 1.27, 'CF-nylon': 1.15 };

/**
 * What a print of this part is likely to consume, as a RANGE.
 *
 * A solid volume times a density is the mass of a 100%-infill part, which
 * nobody prints. The real figure depends on walls and infill, and for a thin
 * shell the walls dominate so heavily that the infill percentage barely moves
 * it. Rather than invent a slicer, this takes the settings the brief states
 * where it states them and returns a band wide enough to be honest.
 *
 * `settings` is the brief's own orientation string, e.g. "Flange down. 2 walls,
 * 20% gyroid." Returns null for infill when the brief does not say.
 */
function filament(volumeCm3, material, settings) {
  const density = DENSITY[material] || 1.24;
  const solidG = volumeCm3 * density;

  const infill = (() => {
    const m = /(\d+)\s*%/.exec(String(settings || ''));
    return m ? Number(m[1]) / 100 : null;
  })();
  const walls = (() => {
    const m = /(\d+)\s*walls?/.exec(String(settings || ''));
    return m ? Number(m[1]) : null;
  })();

  // Fraction of the solid figure that actually gets extruded. The low end is
  // roughly the stated infill plus a wall allowance; the high end allows for
  // parts whose walls swallow most of the section. A part printed solid is
  // exactly itself.
  let lo, hi;
  if (infill !== null && infill >= 1) { lo = 1; hi = 1; }
  else if (infill !== null) {
    const wallAllowance = Math.min(0.45, 0.10 + 0.05 * (walls || 3));
    lo = Math.min(1, infill + wallAllowance * 0.6);
    hi = Math.min(1, infill + wallAllowance * 1.6);
  } else {
    lo = 0.35; hi = 0.65;              // documented default: no settings stated
  }
  return {
    solid_g: +solidG.toFixed(1),
    g_low: +(solidG * lo).toFixed(1),
    g_high: +(solidG * hi).toFixed(1),
    infill, walls,
    assumed: infill === null,
  };
}

module.exports = { check, triangles, volumeCm3, filament, DENSITY, BED };
