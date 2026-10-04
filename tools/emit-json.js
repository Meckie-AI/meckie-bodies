#!/usr/bin/env node
// Derive the JSON that Meckie OS actually consumes from each pack's YAML. MIT.
//
//   node tools/emit-json.js          write bodies/<slug>/generated/*.json
//   node tools/emit-json.js --check  fail if the committed output is stale
//
// Why two formats. The pack YAML is the open-hardware artifact a builder
// reads: one file, every pin, no toolchain. Meckie OS is JSON and splits what
// the pack fuses - a MANIFEST (what the body can do, the protocol line) and a
// BUILD spec (board, pins, topology, which sits explicitly below that line;
// droid docs/body-sdk/MIGRATION.md:91-94). So the YAML stays authored and this
// generates both views. Neither is hand-edited.
//
// This tool does NOT coerce. Anything in the pack with no honest JSON
// counterpart is listed under `unsupported` in build.json, with the reason, so
// the gap shows up in review instead of silently becoming wrong firmware.

const fs = require('fs');
const path = require('path');
const P = require('./lib/packs');

const check = process.argv.includes('--check');

// Per the catalog's `class`, in the schema's freeform vocabulary.
const KIND = {
  'dial': 'desk', 'scout': 'rover', 'rover-lite': 'rover', 'wobble': 'rover',
  'lamp': 'arm', 'inchworm': 'arm', 'biped-mini': 'walker',
};

const peripheral = (hw, pred) => (hw.peripherals || []).find(pred);
const size = (s) => {
  const m = /^(\d+)x(\d+)$/.exec(String(s || ''));
  return m ? { width: +m[1], height: +m[2] } : null;
};

function buildManifest(slug, tpl, hw, cat) {
  const servos = hw.servos || [];
  const drives = !!hw.drive;
  const display = peripheral(hw, p => /gc9a01|st7789|ili9341|st7735/.test(p.part || ''));
  const speaker = peripheral(hw, p => /max98357a|pam8302/.test(p.part || ''));
  const mics = peripheral(hw, p => /ics43434|onboard_pdm|inmp441/.test(p.part || ''));
  const camera = peripheral(hw, p => /imx708|ov3660|ov2640/.test(p.part || ''));
  const depth = (hw.peripherals || []).filter(p => /vl53/.test(p.part || ''));

  const intents = { stop: {} };
  if (drives) {
    intents.drive = { deadman_ms: (hw.central && hw.central.timeout_ms) || 500 };
  }
  if (servos.length) {
    const look = { actuated: true };
    // Ranges only where the pack states them in degrees. Dial and rover-lite
    // name their joints pan/tilt; the arms and the biped aim with a chain, so
    // a yaw/pitch range would be a claim the pack does not make.
    const pan = servos.find(s => s.name === 'pan');
    const tilt = servos.find(s => s.name === 'tilt');
    if (pan && pan.min_deg !== undefined) look.yaw_range = [pan.min_deg, pan.max_deg];
    if (tilt && tilt.min_deg !== undefined) look.pitch_range = [tilt.min_deg, tilt.max_deg];
    // image_target is deliberately NOT set: the schema requires senses.frames.fov
    // for it, and no pack publishes a camera FOV.
    intents.look_at = look;
  }
  if (speaker) intents.say = { formats: ['pcm_s16le'], mouth_source: 'body' };
  if (display) {
    const d = size(display.size);
    // The schema spells the panel size w/h here; build.json's display block
    // uses width/height, which is what firmware-gen reads.
    intents.show_face = Object.assign({ render: 'states', mouth_source: 'body' },
      d ? { w: d.width, h: d.height } : {});
  }
  if (peripheral(hw, p => /ws2812|sk6812/.test(p.part || ''))) intents.led = {};

  const senses = {};
  if (camera) senses.frames = {};            // no fov: no pack publishes one
  if (mics) {
    senses.audio_up = { format: 'pcm_s16le', mic_type: mics.part };
    const bus = (hw.buses || {})[mics.bus];
    if (bus && bus.rate) senses.audio_up.rate = bus.rate;
    if (mics.count >= 2) senses.audio_up.direction = true;
  }
  senses.state = {};                          // every pack has a gauge or a divider
  if (depth.length) senses.depth = { sensors: depth.length };

  return {
    protocol_version: 1,
    body: {
      kind: KIND[slug],
      name: tpl.body.name,
      vendor: 'Meckie bodies',
      model: slug,
      versions: { hardware: tpl.body.version },
    },
    // Every pack either drives or aims with motors, so every pack is a vehicle.
    // The schema forbids max_occupancy on a vehicle.
    modes: { mode: 'vehicle' },
    intents,
    senses,
    streams: { transports: ['ws'] },
    _generated: {
      by: 'meckie-bodies tools/emit-json.js',
      from: path.relative(P.ROOT, P.manifestPath(slug)),
      hardware_sha256: P.hash(P.readManifestText(slug)),
      note: 'Generated. Edit the pack YAML, then run npm run emit.',
    },
  };
}

function buildSpec(slug, tpl, hw) {
  const reflex = tpl.targets.reflex || {};
  const esp = Object.entries(tpl.targets).filter(([, t]) => t.role);
  const display = peripheral(hw, p => /gc9a01|st7789|ili9341|st7735/.test(p.part || ''));
  const unsupported = [];

  const build = {
    model: slug,
    board: reflex.board,
    body_platform: reflex.platform,
  };
  if (reflex.board_options) {
    if (reflex.board_options['board_upload.flash_size']) {
      build.flash_size = reflex.board_options['board_upload.flash_size'];
    }
    if (reflex.board_options['board_build.arduino.memory_type']) {
      build.arduino = { memory_type: reflex.board_options['board_build.arduino.memory_type'] };
    }
  }

  if (display) {
    const dim = size(display.size) || { width: 240, height: 240 };
    const bus = (hw.buses || {})[display.bus] || {};
    const pins = {};
    for (const k of ['mosi', 'sclk', 'cs']) if (typeof bus[k] === 'number') pins[k] = bus[k];
    for (const k of ['dc', 'rst', 'bl']) if (typeof display[k] === 'number') pins[k] = display[k];
    if (typeof display.bl_pwm === 'number') pins.bl = display.bl_pwm;
    build.display = Object.assign({ controller: display.part }, dim, { pins });
    const sym = ['cs', 'rst', 'bl'].filter(k => typeof display[k] === 'string');
    if (sym.length) {
      unsupported.push({
        what: `display ${sym.join('/')}`,
        value: sym.map(k => `${k}=${display[k]}`).join(' '),
        reason: 'tied to a rail or behind the I2C GPIO expander, not an MCU pin; '
              + 'firmware-gen expects a pin number',
      });
    }
  }

  // --- drive -------------------------------------------------------------
  // firmware-gen's drive block is L298N-shaped: ain1/ain2/ena + bin1/bin2/enb
  // (lib/bodies/firmware-gen.js resolvePins). Every pack here uses a DRV8833,
  // which has no separate enable - PWM rides on the input pins.
  if (hw.drive) {
    const d = hw.drive;
    const L = d.left || {}, R = d.right || {};
    const pins = {};
    if (typeof L.in1 === 'number') { pins.ain1 = L.in1; pins.ain2 = L.in2; }
    if (typeof R.in1 === 'number') { pins.bin1 = R.in1; pins.bin2 = R.in2; }
    build.motors = { driver: (d.motor && d.motor.driver) || null, type: d.type, pins };
    if (!('ain1' in pins)) {
      unsupported.push({
        what: 'drive pins',
        value: JSON.stringify({ left: L, right: R }),
        reason: `${d.type}: motor direction runs through ${L.dir || 'an expander'} rather than a `
              + 'second MCU pin, so the ain1/ain2 + bin1/bin2 shape does not fit',
      });
    } else {
      unsupported.push({
        what: 'motor enable pins (ena/enb)',
        value: 'n/a on a DRV8833',
        reason: 'firmware-gen expects an L298N-style enable; a DRV8833 PWMs the '
              + 'input pins directly, so ena/enb would fall back to defaults 14/32',
      });
    }
  }

  // --- servos ------------------------------------------------------------
  // The hard one. fw-templates.js has exactly one actuator model: ESP32Servo.h
  // with panServo.write(0..180) over a PWM pin. Nothing in lib/bodies/ speaks
  // the Feetech serial protocol. Five packs are built entirely on it.
  const serial = (hw.servos || []).filter(s => /sts\d{4}/.test(s.model || ''));
  const pwm = hw.kickstand && hw.kickstand.servo ? [hw.kickstand.servo] : [];
  if (serial.length) {
    const buses = [...new Set(serial.map(s => s.bus || 'servo_bus'))];
    build.servo_bus = buses.map(name => {
      const b = (hw.buses || {})[name] || {};
      return {
        name, uart: b.uart, tx: b.tx, rx: b.rx, baud: b.baud,
        half_duplex: b.half_duplex, volts: b.volts,
        servos: serial.filter(s => (s.bus || 'servo_bus') === name)
          .map(s => ({ id: s.id, name: s.name, model: s.model,
            min_deg: s.min_deg, max_deg: s.max_deg, rest_deg: s.rest_deg })),
      };
    });
    unsupported.push({
      what: `${serial.length} serial-bus servo(s) on ${buses.length} bus(es)`,
      value: [...new Set(serial.map(s => s.model))].join(', '),
      reason: 'fw-templates.js implements PWM hobby servos only (ESP32Servo.h, '
            + 'panServo.write(0..180)). No Feetech/STS serial protocol exists in '
            + 'lib/bodies/, so look_at cannot be generated for this body yet',
    });
  }
  if (pwm.length) {
    build.servo = { pan: pwm[0].pwm_gpio, axes: 1, part: pwm[0].part, role: 'kickstand' };
  }

  if (peripheral(hw, p => /ws2812|sk6812/.test(p.part || ''))) {
    const led = peripheral(hw, p => /ws2812|sk6812/.test(p.part || ''));
    build.led = { pin: led.gpio, part: led.part };
  }
  const mics = peripheral(hw, p => /ics43434|onboard_pdm/.test(p.part || ''));
  if (mics) build.mic_type = mics.part;
  const spk = peripheral(hw, p => /max98357a|pam8302/.test(p.part || ''));
  if (spk) build.speaker = spk.part;
  if (peripheral(hw, p => /imx708|ov3660/.test(p.part || ''))) build.camera = true;

  // --- topology ----------------------------------------------------------
  if (esp.length > 1) {
    build.topology = {
      boards: esp.map(([key, t]) => ({
        role: t.role, mcu: t.mcu, board: t.board, pack_mcu_key: key,
      })),
    };
    const link = hw.links || (hw.buses && hw.buses.link ? { link: hw.buses.link } : null);
    if (link) build.topology.neck = { declared_in_pack: link };
  }

  // A Pi in the pack is not a generator target at all.
  const pi = Object.entries(tpl.targets).filter(([, t]) => t.host === 'rpi_zero_2w');
  if (pi.length) {
    unsupported.push({
      what: `${pi.length} Raspberry Pi target(s): ${pi.map(([k]) => k).join(', ')}`,
      value: 'rpi_zero_2w',
      reason: 'firmware-gen emits PlatformIO ESP32 builds only. The Pi is imaged '
            + 'by the builder and provisioned separately; it is not a flash target',
    });
  }

  build.transport = 'ws';
  build.unsupported = unsupported;
  build._generated = {
    by: 'meckie-bodies tools/emit-json.js',
    from: path.relative(P.ROOT, P.templatePath(slug)),
    note: '`unsupported` lists what the pack declares that Meckie OS cannot yet '
        + 'consume. Nothing here is coerced to fit.',
  };
  return build;
}

let stale = 0;
const summary = [];

for (const slug of P.slugs()) {
  const tpl = P.readTemplate(slug);
  const hw = P.readManifest(slug);
  const cat = P.catalog().bodies.find(b => b.slug === slug);

  const outDir = path.join(P.packDir(slug), 'generated');
  const files = {
    'manifest.json': buildManifest(slug, tpl, hw, cat),
    'build.json': buildSpec(slug, tpl, hw),
  };

  for (const [name, obj] of Object.entries(files)) {
    const file = path.join(outDir, name);
    const text = JSON.stringify(obj, null, 2) + '\n';
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) continue;
    stale++;
    if (check) {
      console.error(`stale: ${path.relative(P.ROOT, file)}`);
    } else {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(file, text);
    }
  }

  const b = files['build.json'];
  summary.push(`${slug.padEnd(12)} intents: ${Object.keys(files['manifest.json'].intents).join(',')
    .padEnd(34)} unsupported: ${b.unsupported.length}`);
}

console.log(summary.join('\n'));
if (check && stale) {
  console.error(`\n${stale} generated file(s) out of date. Run: npm run emit`);
  process.exit(1);
}
console.log(check ? '\ngenerated JSON is up to date' : `\nwrote generated JSON for ${P.slugs().length} packs`);
