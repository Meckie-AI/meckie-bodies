// Run a pack's Print Parts geometry in Node. MIT.
//
// The Print Parts page is the geometric source of truth, but it was written to
// run in a browser. Everything above its `// ---------- viewer` marker is pure
// geometry though - three.js primitives, a three->Manifold converter, and CSG -
// with no DOM in it. So the page can be sliced at that marker and the geometry
// half evaluated here, with three and manifold-3d from npm instead of a CDN.
//
// That buys a lot: parts can be rebuilt, measured and re-exported from a script
// with no browser, so STL regeneration is reproducible and can run in CI.
//
//   import { loadPack } from './geom.mjs';
//   const pack = await loadPack('scout');
//   pack.keys                 // part keys
//   pack.manifold('face_bezel')  // the Manifold, pre-centering
//   pack.mesh('face_bezel')      // {numTri, vertProperties, triVerts}, centred like the page

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printPartsFile(slug) {
  const dir = path.join(ROOT, 'bodies', slug);
  const hit = fs.readdirSync(dir).find(f => f.endsWith(' Print Parts.html'));
  if (!hit) throw new Error(`${slug}: no Print Parts page`);
  return path.join(dir, hit);
}

// Everything between the manifold handshake and the viewer is geometry.
function sliceGeometry(html, slug) {
  const open = html.indexOf('const {Manifold,Mesh}=MF;');
  if (open === -1) throw new Error(`${slug}: cannot find the manifold handshake`);
  const close = html.indexOf('// ---------- viewer');
  if (close === -1) throw new Error(`${slug}: cannot find the viewer marker`);
  if (close < open) throw new Error(`${slug}: viewer marker precedes the geometry`);
  return html.slice(open + 'const {Manifold,Mesh}=MF;'.length, close);
}

export async function loadPack(slug) {
  const html = fs.readFileSync(printPartsFile(slug), 'utf8');
  const body = sliceGeometry(html, slug);

  const src = `import * as THREE from 'three';
import Module from 'manifold-3d';
const MF = await Module();
MF.setup();
const { Manifold, Mesh } = MF;
${body}
export { PARTS, toM, toG, Manifold, Mesh, THREE };
`;

  // Written beside node_modules so the bare 'three' / 'manifold-3d' specifiers
  // resolve, then imported as a module so top-level await works.
  const tmp = path.join(ROOT, `.geom-${slug}-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  let mod;
  try {
    mod = await import(`file://${tmp}`);
  } finally {
    fs.unlinkSync(tmp);
  }

  const { PARTS, toM, toG } = mod;
  const cache = new Map();

  const manifold = (key) => {
    if (cache.has(key)) return cache.get(key);
    const p = PARTS.find(q => q.key === key);
    if (!p) throw new Error(`${slug}: no part "${key}"`);
    const m = toM(p.fn());
    cache.set(key, m);
    return m;
  };

  // The page centres each part in X/Y and drops it to z=0 before export, so the
  // STLs carry those coordinates. Match it, or re-exports move every part.
  const mesh = (key) => {
    const raw = manifold(key).getMesh();
    const vp = Float32Array.from(raw.vertProperties);
    const np = raw.numProp;
    const n = vp.length / np;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < 3; d++) {
        const v = vp[i * np + d];
        if (v < lo[d]) lo[d] = v;
        if (v > hi[d]) hi[d] = v;
      }
    }
    const shift = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < 3; d++) vp[i * np + d] += shift[d];
    }
    return { numTri: raw.numTri, numProp: np, vertProperties: vp, triVerts: raw.triVerts };
  };

  return {
    slug,
    parts: PARTS,
    keys: PARTS.map(p => p.key),
    part: (key) => PARTS.find(q => q.key === key),
    manifold, mesh,
  };
}

// Drop zero-area triangles, exactly as tools/meshclean.js does to the STLs.
//
// Needed for any honest comparison against a committed file: the generator
// still emits those triangles, the committed STLs have had them stripped, and
// comparing raw counts makes every cleaned file look like it drifted - which
// hides the handful that actually did.
export function cleaned(m) {
  const np = m.numProp;
  const key = (i) => {
    const o = i * np;
    return `${Math.round(m.vertProperties[o] * 1000)},${Math.round(m.vertProperties[o + 1] * 1000)},${Math.round(m.vertProperties[o + 2] * 1000)}`;
  };
  const keep = [];
  for (let t = 0; t < m.numTri; t++) {
    const v = [m.triVerts[t * 3], m.triVerts[t * 3 + 1], m.triVerts[t * 3 + 2]];
    const k = v.map(key);
    if (k[0] === k[1] || k[1] === k[2] || k[2] === k[0]) continue;
    keep.push(v);
  }
  const triVerts = new Uint32Array(keep.length * 3);
  keep.forEach((v, i) => { triVerts[i * 3] = v[0]; triVerts[i * 3 + 1] = v[1]; triVerts[i * 3 + 2] = v[2]; });
  return { numTri: keep.length, numProp: np, vertProperties: m.vertProperties, triVerts };
}

// --- topology of a manifold mesh (same rules as tools/lib/mesh.js) ----------

export function topology(m) {
  const np = m.numProp;
  const key = (i) => {
    const o = i * np;
    return `${Math.round(m.vertProperties[o] * 1000)},${Math.round(m.vertProperties[o + 1] * 1000)},${Math.round(m.vertProperties[o + 2] * 1000)}`;
  };
  const edges = new Map();
  let degenerate = 0;
  for (let t = 0; t < m.numTri; t++) {
    const v = [m.triVerts[t * 3], m.triVerts[t * 3 + 1], m.triVerts[t * 3 + 2]].map(key);
    if (v[0] === v[1] || v[1] === v[2] || v[2] === v[0]) { degenerate++; continue; }
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const e = v[a] < v[b] ? `${v[a]}|${v[b]}` : `${v[b]}|${v[a]}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  const bad = [...edges.entries()].filter(([, c]) => c > 2);
  const holes = [...edges.entries()].filter(([, c]) => c === 1);
  return {
    triangles: m.numTri,
    degenerate,
    nonmanifold: bad.length,
    boundary: holes.length,
    // Where the trouble is, in mm, so it can be found in the build function.
    where: bad.map(([e, c]) => {
      const [a, b] = e.split('|').map(s => s.split(',').map(v => +v / 1000));
      return { from: a, to: b, triangles: c };
    }),
  };
}

// --- binary STL out ---------------------------------------------------------

export function writeStl(file, m, header = 'meckie-bodies regenerated') {
  const np = m.numProp;
  const buf = Buffer.alloc(84 + m.numTri * 50);
  buf.write(header.slice(0, 79).padEnd(80, ' '), 0, 80, 'ascii');
  buf.writeUInt32LE(m.numTri, 80);
  const at = (i, d) => m.vertProperties[i * np + d];
  for (let t = 0; t < m.numTri; t++) {
    const o = 84 + t * 50;
    const v = [m.triVerts[t * 3], m.triVerts[t * 3 + 1], m.triVerts[t * 3 + 2]];
    const p = v.map(i => [at(i, 0), at(i, 1), at(i, 2)]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    buf.writeFloatLE(nx / len, o); buf.writeFloatLE(ny / len, o + 4); buf.writeFloatLE(nz / len, o + 8);
    p.forEach((q, j) => q.forEach((c, k) => buf.writeFloatLE(c, o + 12 + j * 12 + k * 4)));
    buf.writeUInt16LE(0, o + 48);
  }
  fs.writeFileSync(file, buf);
}

export { ROOT };
