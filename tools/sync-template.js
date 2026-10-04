#!/usr/bin/env node
// Push each pack's firmware manifest into its Hangar Bay template and refresh
// known_template.hardware_sha256. MIT.
//
//   node tools/sync-template.js          rewrite templates from the manifests
//   node tools/sync-template.js --check  fail if anything is out of date
//
// The manifest is the source; the template's `hardware:` block is a generated
// copy. Edit firmware/*.yaml and run this, never the other way round.

const fs = require('fs');
const P = require('./lib/packs');

const check = process.argv.includes('--check');
let stale = 0;

for (const slug of P.slugs()) {
  const manifest = P.readManifestText(slug);
  const indented = manifest.replace(/\n$/, '').split('\n')
    .map(l => (l === '' ? '' : '  ' + l)).join('\n') + '\n';
  const want = P.hash(manifest);

  const tplPath = P.templatePath(slug);
  const before = fs.readFileSync(tplPath, 'utf8');

  const marker = '\nhardware: |\n';
  const at = before.indexOf(marker);
  if (at === -1) throw new Error(`${slug}: template has no 'hardware: |' block`);
  const head = before.slice(0, at + marker.length);

  // Replace the hash in place, preserving the trailing comment.
  const rehashed = head.replace(
    /^(\s*hardware_sha256:\s*)[0-9a-f]{64}/m,
    (_, lead) => lead + want
  );
  if (!/hardware_sha256:\s*[0-9a-f]{64}/.test(rehashed)) {
    throw new Error(`${slug}: template has no hardware_sha256 to update`);
  }

  const after = rehashed + indented;
  if (after !== before) {
    stale++;
    if (check) {
      console.error(`stale: ${slug} — template does not match firmware/ manifest`);
    } else {
      fs.writeFileSync(tplPath, after);
      console.log(`synced: ${slug}  hardware_sha256=${want.slice(0, 12)}…`);
    }
  } else if (!check) {
    console.log(`ok:     ${slug}  hardware_sha256=${want.slice(0, 12)}…`);
  }
}

if (check && stale) {
  console.error(`\n${stale} template(s) out of date. Run: npm run sync`);
  process.exit(1);
}
if (check) console.log(`all ${P.slugs().length} templates match their manifests`);
