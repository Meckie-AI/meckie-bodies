#!/usr/bin/env node
// Locate every non-manifold edge, in millimetres. MIT.
//
//   node tools/diagnose-mesh.mjs            every part listed in mesh-exceptions.json
//   node tools/diagnose-mesh.mjs scout      one pack, every part
//
// Knowing a part is non-manifold is not actionable; knowing the bad edge runs
// from (-23.2, 0, 3.5) to (-23.2, 0, 7) is, because that is a feature you can
// find in the build function.

import fs from 'fs';
import path from 'path';
import { loadPack, topology, ROOT } from './geom.mjs';

const only = process.argv[2];
const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'mesh-exceptions.json'), 'utf8')).nonmanifold;

// bodies/<slug>/stl/<slug>-<key>-x<n>.stl  ->  [slug, key]
const targets = new Map();
for (const file of Object.keys(allow)) {
  const m = /^bodies\/([^/]+)\/stl\/\1-(.+?)-x\d+\.stl$/.exec(file);
  if (!m) { console.error(`cannot parse ${file}`); continue; }
  const [, slug, key] = m;
  if (!targets.has(slug)) targets.set(slug, []);
  targets.get(slug).push({ key: key.replace(/_(L|R)$/, ''), file, mirrored: /_(L|R)$/.test(key) });
}

const slugs = only ? [only] : [...targets.keys()];
const fmt = (v) => '(' + v.map(x => x.toFixed(2).replace(/\.00$/, '')).join(', ') + ')';

for (const slug of slugs) {
  const pack = await loadPack(slug);
  const want = only ? pack.keys.map(k => ({ key: k, file: null })) : targets.get(slug) || [];
  console.log(`\n=== ${slug}`);
  for (const { key, file } of want) {
    if (!pack.keys.includes(key)) { console.log(`  ${key}: no such part (mirror of another?)`); continue; }
    let t;
    try { t = topology(pack.mesh(key)); }
    catch (e) { console.log(`  ${key}: build failed — ${e.message}`); continue; }
    if (!t.nonmanifold && !t.degenerate && !t.boundary) {
      if (only) console.log(`  ${key.padEnd(20)} clean (${t.triangles} tris)`);
      continue;
    }
    const expect = file ? allow[file] : null;
    console.log(`  ${key.padEnd(20)} ${t.nonmanifold} non-manifold` +
      (expect !== null && expect !== t.nonmanifold ? ` (STL has ${expect})` : '') +
      (t.degenerate ? `, ${t.degenerate} degenerate` : '') +
      (t.boundary ? `, ${t.boundary} BOUNDARY` : ''));
    // Group identical geometry so 88 edges do not print as 88 lines.
    const groups = new Map();
    for (const w of t.where) {
      const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1], w.to[2] - w.from[2]);
      const axis = ['x', 'y', 'z'].filter((_, d) => Math.abs(w.to[d] - w.from[d]) > 1e-6).join('') || 'point';
      const g = `${axis} @ len ${len.toFixed(2)}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(w);
    }
    for (const [g, ws] of groups) {
      const sample = ws.slice(0, 3).map(w => `${fmt(w.from)}->${fmt(w.to)}`).join('  ');
      console.log(`      ${ws.length}x along ${g}: ${sample}${ws.length > 3 ? '  …' : ''}`);
    }
  }
}
