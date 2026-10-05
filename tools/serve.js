#!/usr/bin/env node
// The marketplace, locally. MIT.
//
//   npm run site            http://localhost:4173
//   PORT=5000 npm run site
//
// No dependencies and no build step, matching how meckie.ai itself is served
// (marketing-server.js + static HTML). Everything it serves is a real file in
// this repo, so what you see locally is what a visitor would get.
//
// Routes:
//   /                             catalog
//   /body/<slug>                  body page
//   /contribute                   how to submit one
//   /bodies.json                  the catalog feed Hangar Bay reads
//   /api/bodies/<slug>/template   the known template, as JSON
//   /api/bodies/<slug>/stl.zip    every STL for one body, zipped on the fly
//   /packs/...                    the packs themselves (viewers, briefs, STLs)

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const P = require('./lib/packs');

const PORT = Number(process.env.PORT || 4173);
const SITE = path.join(P.ROOT, 'site');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.stl': 'model/stl', '.csv': 'text/csv; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.zip': 'application/zip',
};

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(code, Object.assign({ 'Content-Type': type }, extra));
  res.end(body);
};

// Serve a file, refusing anything that climbs out of its root.
function sendFile(res, root, rel) {
  const full = path.resolve(root, '.' + path.posix.resolve('/', rel));
  if (!full.startsWith(path.resolve(root))) return send(res, 403, 'forbidden');
  let st;
  try { st = fs.statSync(full); } catch (e) { return send(res, 404, 'not found'); }
  if (st.isDirectory()) return sendFile(res, root, path.posix.join(rel, 'index.html'));
  const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

// --- the known template, as JSON --------------------------------------------
//
// The pack authors a YAML template, but Meckie OS is JSON throughout and has no
// YAML parser. So the marketplace serves the template in the form Hangar Bay
// can actually consume: the generated manifest + build spec, the flashing plan,
// the calibration wizard, and the hash that proves the manifest is the official
// one. Same content, no new dependency on the consumer's side.
function templateJson(slug) {
  const tpl = P.readTemplate(slug);
  const dir = P.packDir(slug);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'generated', f), 'utf8'));
  return {
    template: 'meckie-hangar-bay/1',
    known_template: {
      catalog: 'meckie-bodies',
      origin: 'official',
      hardware_sha256: tpl.known_template.hardware_sha256,
    },
    body: tpl.body,
    targets: tpl.targets,
    pairing: tpl.pairing,
    calibration_wizard: tpl.calibration_wizard,
    calibration: tpl.calibration,
    manifest: read('manifest.json'),
    build: read('build.json'),
    // The manifest exactly as authored, so a consumer can recompute the hash
    // itself rather than trusting this endpoint's word for it.
    hardware: P.readManifestText(slug),
  };
}

// --- a zip, written by hand (stored, no compression) -------------------------
// Small enough to not want a dependency: STLs are already dense binary, so
// deflate buys little, and "stored" keeps this to a few dozen lines.
function zipOf(files) {
  const chunks = [], central = [];
  let offset = 0;
  const dos = (d) => {
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { time, date };
  };
  for (const { name, data, mtime } of files) {
    const nm = Buffer.from(name, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(data) : crc32(data);
    const { time, date } = dos(mtime || new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    chunks.push(local, nm, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nm.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nm);
    offset += local.length + nm.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, end]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = decodeURIComponent(url.pathname);
  const slugs = P.slugs();

  // Hangar Bay reads this to list official bodies in its picker. CORS is open
  // on purpose: the whole point is that another local app can fetch it.
  if (p === '/bodies.json') {
    const cat = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'site', 'data', 'index.json'), 'utf8'));
    const origin = `http://${req.headers.host || `localhost:${PORT}`}`;
    cat.bodies = cat.bodies.map(b => Object.assign({}, b, {
      template_url: `${origin}/api/bodies/${b.slug}/template`,
      page_url: `${origin}/body/${b.slug}`,
      thumbnail_url: `${origin}/packs/${b.slug}/${path.basename(b.viewer)}?view=iso&embed=1`,
    }));
    return send(res, 200, JSON.stringify(cat, null, 2), TYPES['.json'],
      { 'Access-Control-Allow-Origin': '*' });
  }

  let m = /^\/api\/bodies\/([a-z0-9-]+)\/template$/.exec(p);
  if (m && slugs.includes(m[1])) {
    return send(res, 200, JSON.stringify(templateJson(m[1]), null, 2), TYPES['.json'],
      { 'Access-Control-Allow-Origin': '*' });
  }

  m = /^\/api\/bodies\/([a-z0-9-]+)\/stl\.zip$/.exec(p);
  if (m && slugs.includes(m[1])) {
    const dir = path.join(P.packDir(m[1]), 'stl');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.stl')).sort().map(f => ({
      name: `${m[1]}/${f}`, data: fs.readFileSync(path.join(dir, f)), mtime: fs.statSync(path.join(dir, f)).mtime,
    }));
    const zip = zipOf(files);
    return send(res, 200, zip, TYPES['.zip'],
      { 'Content-Disposition': `attachment; filename="${m[1]}-stl.zip"` });
  }

  // The packs themselves: viewers, briefs, STLs, CSVs, manifests.
  if (p.startsWith('/packs/')) return sendFile(res, P.BODIES, p.slice('/packs'.length));

  // Pages. Query and hash carry the state, so these are static files.
  if (p === '/' || p === '/index.html') return sendFile(res, SITE, '/index.html');
  if (p === '/contribute' || p === '/contribute/') return sendFile(res, SITE, '/contribute.html');
  m = /^\/body\/([a-z0-9-]+)\/?$/.exec(p);
  if (m) {
    if (!slugs.includes(m[1])) return send(res, 404, 'no such body');
    return sendFile(res, SITE, '/body.html');
  }

  return sendFile(res, SITE, p);
});

server.listen(PORT, () => {
  console.log(`\n  Meckie bodies — the marketplace, locally`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  catalog feed   http://localhost:${PORT}/bodies.json`);
  console.log(`  a template     http://localhost:${PORT}/api/bodies/scout/template\n`);
});
