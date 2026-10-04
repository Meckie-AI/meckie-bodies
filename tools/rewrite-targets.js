#!/usr/bin/env node
// One-shot: replace the handoff's invented targets: blocks with real ones.
// Kept in the tree as the record of what was mapped to what. MIT.
//
// The handoff shipped placeholder board ids (esp32s3_devkitc_n16r8,
// xiao_esp32s3_sense, rpi_zero_2w) and invented firmware channels
// (meckie-reflex@stable, meckie-reflex-lite@stable, meckie-head@stable,
// meckie-face@stable). None of those exist. What does exist:
//
//   - Hangar Bay's generator names PlatformIO envs by board ROLE, and honours
//     an explicit `board` when the pack supplies one
//     (droid lib/bodies/firmware-gen.js:171-177).
//   - Its OTA endpoint accepts exactly 'head' and 'body' (routes.js:286).
//   - The platform is pinned espressif32@6.6.0 (firmware-gen.js:183), which
//     ships esp32-s3-devkitc-1 and seeed_xiao_esp32s3 and has no N16R8
//     variant board - so 16 MB flash + 8 MB octal PSRAM must be build options.
//   - There is no firmware channel concept anywhere, and no Meckie-built Pi
//     image. The Pi runs stock Raspberry Pi OS plus the body client, imaged by
//     the builder. It is not a Hangar Bay flash target.
//
// Target keys now match the manifest's mcu: keys exactly, which fixes two
// mismatches the handoff shipped: lamp declared mcu.head_cam but targets.head,
// and inchworm declared mcu.audio (speech + motion clips) but targets.face.

const fs = require('fs');
const P = require('./lib/packs');

const DEVKIT = `    role: body                      # PlatformIO env + OTA target id
    mcu: esp32s3
    board: esp32-s3-devkitc-1       # espressif32@6.6.0
    platform: espressif32@6.6.0
    board_options:                  # DevKitC-1 N16R8: 16 MB flash, 8 MB octal PSRAM
      board_upload.flash_size: 16MB
      board_build.arduino.memory_type: qio_opi
      build_flags: [-DBOARD_HAS_PSRAM]
    flash: { method: usb_serial, tool: esptool_js, erase: true }`;

const XIAO_BODY = `    role: body                      # single board: drive, sense, safety, face
    mcu: esp32s3
    board: seeed_xiao_esp32s3       # espressif32@6.6.0
    platform: espressif32@6.6.0
    flash: { method: usb_serial, tool: esptool_js, erase: true }`;

const XIAO_HEAD = `    role: head                      # PlatformIO env + OTA target id
    mcu: esp32s3
    board: seeed_xiao_esp32s3       # espressif32@6.6.0
    platform: espressif32@6.6.0
    flash: { method: usb_serial, tool: esptool_js, erase: true }`;

const PI = `    host: rpi_zero_2w               # not a Hangar Bay flash target
    os: raspberrypi-os-bookworm-lite-64
    provision: meckie-body-client   # installed on first boot, pairs over the LAN
    flash: { method: sd_card, tool: rpi_imager, by: builder }`;

// slug -> ordered [mcu key, block]. Keys must match the manifest's mcu: keys.
const TARGETS = {
  'dial':       [['reflex', DEVKIT], ['face', PI]],
  'scout':      [['reflex', XIAO_BODY]],
  'rover-lite': [['reflex', DEVKIT], ['face', PI]],
  'wobble':     [['reflex', DEVKIT], ['head', XIAO_HEAD]],
  'lamp':       [['reflex', DEVKIT], ['head_cam', XIAO_HEAD], ['face', PI]],
  'inchworm':   [['reflex', DEVKIT], ['head', XIAO_HEAD], ['audio', PI]],
  'biped-mini': [['reflex', DEVKIT], ['face', PI]],
};

for (const slug of P.slugs()) {
  const spec = TARGETS[slug];
  if (!spec) throw new Error(`no target mapping for ${slug}`);

  // Every key must be a real mcu key in that pack's manifest.
  const mcu = Object.keys(P.readManifest(slug).mcu || {});
  const keys = spec.map(([k]) => k);
  const unknown = keys.filter(k => !mcu.includes(k));
  const unmapped = mcu.filter(k => !keys.includes(k));
  if (unknown.length || unmapped.length) {
    throw new Error(`${slug}: targets ${JSON.stringify(keys)} vs mcu ${JSON.stringify(mcu)}` +
      (unknown.length ? ` — unknown: ${unknown}` : '') +
      (unmapped.length ? ` — mcu with no target: ${unmapped}` : ''));
  }

  const path = P.templatePath(slug);
  const text = fs.readFileSync(path, 'utf8');
  const start = text.indexOf('\ntargets:\n');
  const end = text.indexOf('\npairing:\n');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${slug}: cannot locate the targets: block`);
  }
  const block = '\ntargets:\n' + spec.map(([k, b]) => `  ${k}:\n${b}`).join('\n') + '\n';
  fs.writeFileSync(path, text.slice(0, start) + block + text.slice(end + 1));
  console.log(`${slug.padEnd(12)} targets: ${keys.join(', ')}`);
}
