// Shared pack helpers. MIT.
//
// A pack's body manifest lives in exactly one place on disk:
//   bodies/<slug>/firmware/hangar_bay_<slug_snake>.yaml
//
// The Hangar Bay template embeds the same text, indented two spaces, under
// `hardware: |`. tools/sync-template.js generates that copy, so the two can
// never drift. Nothing hand-edits the embedded block.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const BODIES = path.join(ROOT, 'bodies');

function slugs() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'bodies.json'), 'utf8'))
    .bodies.map(b => b.slug);
}

function catalog() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'bodies.json'), 'utf8'));
}

function packDir(slug) {
  return path.join(BODIES, slug);
}

function manifestPath(slug) {
  const dir = path.join(packDir(slug), 'firmware');
  const hits = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
  if (hits.length !== 1) {
    throw new Error(`${slug}: expected exactly one firmware/*.yaml, found ${hits.length}`);
  }
  return path.join(dir, hits[0]);
}

function templatePath(slug) {
  return path.join(packDir(slug), 'hangar-bay', `${slug}.template.yaml`);
}

// --- the canonical manifest text ------------------------------------------
//
// `hardware_sha256` is the SHA-256 of the manifest text: LF line endings,
// exactly one trailing newline, no other normalisation. On disk that is the
// bytes of firmware/<name>.yaml. Inside a template it is the `hardware:` block
// dedented by two spaces. The two are the same bytes by construction, so
// Hangar Bay can verify a template it was handed without the pack.
//
// Deliberately NOT canonicalised: key order, whitespace inside flow mappings,
// comments. The manifest is a human-authored artifact that builders read, and
// a hash over a reformatted projection of it would not be checking the thing
// they actually flashed.

function canonical(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

function hash(text) {
  return crypto.createHash('sha256').update(canonical(text), 'utf8').digest('hex');
}

function readManifestText(slug) {
  return canonical(fs.readFileSync(manifestPath(slug), 'utf8'));
}

function readManifest(slug) {
  return yaml.load(readManifestText(slug));
}

function readTemplate(slug) {
  return yaml.load(fs.readFileSync(templatePath(slug), 'utf8'));
}

// The embedded block, dedented back to canonical form.
function embeddedManifestText(slug) {
  const raw = fs.readFileSync(templatePath(slug), 'utf8');
  const marker = '\nhardware: |\n';
  const at = raw.indexOf(marker);
  if (at === -1) throw new Error(`${slug}: template has no 'hardware: |' block`);
  const lines = raw.slice(at + marker.length).split('\n');
  const out = [];
  for (const line of lines) {
    if (line === '') { out.push(''); continue; }
    if (line.startsWith('  ')) { out.push(line.slice(2)); continue; }
    break; // dedent ends the block scalar
  }
  return canonical(out.join('\n'));
}

module.exports = {
  ROOT, BODIES, slugs, catalog, packDir,
  manifestPath, templatePath,
  canonical, hash,
  readManifestText, readManifest, readTemplate, embeddedManifestText,
};
