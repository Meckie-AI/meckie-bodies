#!/usr/bin/env node
// Break an STL in one specific way, for tools/selftest.sh. MIT.
//
//   node tools/fixtures/break-mesh.js <hole|degenerate|nonmanifold|oversize|twoshells|rename> <file>
//
// Hand-written byte fixtures would not survive a change to the mesh reader, so
// each case mutates a real pack mesh and writes valid STL back out. selftest.sh
// restores with git checkout.

const fs = require('fs');
const path = require('path');
const mesh = require('../lib/mesh');

const [mode, file] = process.argv.slice(2);
if (!mode || !file) {
  console.error('usage: break-mesh.js <mode> <file.stl>');
  process.exit(2);
}

function write(target, tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write('selftest fixture'.padEnd(80, ' '), 0, 80, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    t.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, o + 12 + j * 12 + k * 4)));
    buf.writeUInt16LE(0, o + 48);
  });
  fs.writeFileSync(target, buf);
}

const tris = mesh.triangles(file);

switch (mode) {
  // Delete one triangle: its three edges drop to one user each.
  case 'hole':
    write(file, tris.slice(1));
    break;

  // Collapse one triangle's second corner onto its first.
  case 'degenerate': {
    const t = tris.map(x => x.map(p => p.slice()));
    t[0][1] = t[0][0].slice();
    write(file, t);
    break;
  }

  // Re-emit an existing triangle with reversed winding: a back-to-back facet,
  // so each of its edges ends up with four users. This is the same defect the
  // 20 allowlisted parts have, which is the point - the fixture reproduces the
  // real failure mode rather than inventing a different one.
  case 'nonmanifold': {
    const flipped = [tris[0][0], tris[0][2], tris[0][1]];
    write(file, tris.concat([flipped]));
    break;
  }

  // Push one vertex past the bed.
  case 'oversize': {
    const t = tris.map(x => x.map(p => p.slice()));
    t[0][0][0] += 400;
    write(file, t);
    break;
  }

  // Translate half the triangles far away: still closed-ish, but two shells.
  case 'twoshells': {
    const half = Math.floor(tris.length / 2);
    const t = tris.map((x, i) => x.map(p => (i < half ? p.slice() : [p[0] + 60, p[1], p[2]])));
    write(file, t);
    break;
  }

  // Shift every vertex 1 mm in x: still a valid, watertight, manifold mesh, so
  // only the reproducibility check can notice.
  case 'shift': {
    const t = tris.map(x => x.map(p => [p[0] + 1, p[1], p[2]]));
    write(file, t);
    break;
  }

  // Rename the part, so an allowlist entry points at a file that is gone.
  case 'rename':
    fs.renameSync(file, path.join(path.dirname(file), 'zz-renamed-x1.stl'));
    break;

  default:
    console.error(`unknown mode: ${mode}`);
    process.exit(2);
}
