#!/usr/bin/env node
// Rebuild STLs from the Print Parts generator. MIT.
//
//   node tools/reexport.js <slug> <part> [<part>...]   named parts
//   node tools/reexport.js --all                       every part of every pack
//   node tools/reexport.js --verify                    rebuild nothing; compare
//
// The generator is the geometric source of truth, so an STL should always be
// reproducible from it. --verify proves that: it rebuilds each part in memory
// and compares vertex data against the committed file.
//
// Expect small differences even when nothing has changed. The page centres each
// part with three.js in float32 while this does the arithmetic in doubles, so
// vertices can disagree in the last bit - about 2 nanometres. --verify reports
// the largest delta so that noise stays distinguishable from a real change.

const fs = require('fs');
const path = require('path');

const TOL_MM = 1e-5;   // 10 nm: float32 centring noise, nothing real

async function main() {
  const { loadPack, writeStl, topology, cleaned, ROOT } = await import('./geom.mjs');
  const P = require('./lib/packs');

  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const json = argv.includes('--json');
  const verify = argv.includes('--verify') || json;
  const rest = argv.filter(a => !a.startsWith('--'));

  let jobs;
  if (all || verify) {
    jobs = P.slugs().map(slug => ({ slug, keys: null }));
  } else {
    if (rest.length < 2) {
      console.error('usage: reexport.js <slug> <part>...   |   --all   |   --verify');
      process.exit(2);
    }
    jobs = [{ slug: rest[0], keys: rest.slice(1) }];
  }

  let wrote = 0, checked = 0, drift = 0, worst = 0, missing = 0;
  const report = {};

  for (const { slug, keys } of jobs) {
    let pack;
    try { pack = await loadPack(slug); }
    catch (e) {
      // A pack without a Print Parts page has nothing to rebuild from. That is
      // a layout problem the validator reports on its own; here it is just a
      // pack to skip, not a reason to fail the run.
      if (!json) console.error(`  ${slug}: cannot load its generator — ${e.message}`);
      missing++;
      continue;
    }
    const stlDir = path.join(P.packDir(slug), 'stl');
    const onDisk = fs.readdirSync(stlDir).filter(f => f.endsWith('.stl'));

    // part key -> committed filename. Mirrored parts carry _L / _R in the key.
    const fileFor = (key) => {
      const hit = onDisk.find(f => new RegExp(`^${slug}-${key}-x\\d+\\.stl$`).test(f));
      return hit ? path.join(stlDir, hit) : null;
    };

    for (const key of keys || pack.keys) {
      const file = fileFor(key);
      if (!file) {
        if (keys) { console.error(`  ${slug}/${key}: no STL on disk to replace`); missing++; }
        continue;   // --all: parts like 'ballast_note' have no STL on purpose
      }
      let m;
      try { m = pack.mesh(key); }
      catch (e) { console.error(`  ${slug}/${key}: build failed — ${e.message}`); missing++; continue; }

      if (verify) {
        checked++;
        // Compare against the generator with zero-area triangles stripped, the
        // same way meshclean.js strips them from the committed STLs. Without
        // this every cleaned file reads as drift and hides the real cases.
        m = cleaned(m);
        const buf = fs.readFileSync(file);
        const n = buf.readUInt32LE(80);
        if (n !== m.numTri) {
          if (!json) console.log(`  ${slug}/${key}: ${n} triangles on disk, generator makes ${m.numTri}`);
          report[path.relative(ROOT, file)] = { kind: 'triangle count',
            note: `generator makes ${m.numTri} triangles, file has ${n}` };
          drift++; continue;
        }
        let max = 0;
        const np = m.numProp;
        for (let t = 0; t < n; t++) {
          const o = 84 + t * 50;
          const v = [m.triVerts[t * 3], m.triVerts[t * 3 + 1], m.triVerts[t * 3 + 2]];
          for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) {
              const a = buf.readFloatLE(o + 12 + j * 12 + k * 4);
              const b = m.vertProperties[v[j] * np + k];
              const d = Math.abs(a - b);
              if (d > max) max = d;
            }
          }
        }
        if (max > worst) worst = max;
        if (max > TOL_MM) {
          if (!json) console.log(`  ${slug}/${key}: vertices differ by up to ${max.toFixed(6)} mm`);
          // Same bounding box with the axes permuted means the committed file is
          // a rotation of what the generator makes; same box in the same order
          // means it is mirrored or shifted. Both matter for print orientation.
          const np2 = m.numProp, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
          for (let i = 0; i < m.vertProperties.length / np2; i++) {
            for (let d = 0; d < 3; d++) {
              const v = m.vertProperties[i * np2 + d];
              if (v < lo[d]) lo[d] = v;
              if (v > hi[d]) hi[d] = v;
            }
          }
          const gen = [0, 1, 2].map(d => +(hi[d] - lo[d]).toFixed(2));
          const diskDims = require('./lib/mesh').check(file).dims.map(x => +x.toFixed(2));
          const sortKey = a => [...a].sort((x, y) => x - y).join('x');
          const kind = (sortKey(gen) === sortKey(diskDims) && gen.join('x') !== diskDims.join('x'))
            ? 'rotated'
            : gen.join('x') === diskDims.join('x') ? 'mirrored or shifted' : 'different geometry';
          report[path.relative(ROOT, file)] = { kind,
            note: kind === 'rotated'
              ? `axes permuted - generator ${gen.join(' x ')} mm, file ${diskDims.join(' x ')} mm`
              : `generator ${gen.join(' x ')} mm, file ${diskDims.join(' x ')} mm`,
            max_delta_mm: +max.toFixed(2) };
          drift++;
        }
      } else {
        const t = topology(m);
        writeStl(file, m, `meckie-bodies ${slug}/${key}`);
        wrote++;
        console.log(`  ${path.relative(ROOT, file)}  ${m.numTri} tris` +
          (t.nonmanifold ? `  ${t.nonmanifold} non-manifold` : '') +
          (t.degenerate ? `  ${t.degenerate} zero-area (run clean-mesh)` : '') +
          (t.boundary ? `  ${t.boundary} BOUNDARY` : ''));
      }
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  if (verify) {
    console.log(`\nchecked ${checked} parts against the generator; ` +
      `${drift} differ beyond ${TOL_MM} mm (largest delta seen: ${worst.toExponential(2)} mm)`);
    if (drift) process.exit(1);
  } else {
    console.log(`\nrewrote ${wrote} STL(s)` + (missing ? `, ${missing} skipped` : ''));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
