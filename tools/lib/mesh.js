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
const BED = 256;

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

module.exports = { check, triangles, BED };
