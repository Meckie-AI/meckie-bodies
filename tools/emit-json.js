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

const hostOfBus = (hw) => Object.fromEntries(
  Object.entries(hw.buses || {}).filter(([, b]) => b && b.host).map(([n, b]) => [n, b.host]));

// GPIO -> what the pack uses it for, on one host MCU. Partitioning by host is
// not optional: a two-board body has two independent GPIO spaces, and merging
// them invents collisions that do not exist.
const PIN_KEYS = new Set(['tx', 'rx', 'sda', 'scl', 'sclk', 'mosi', 'miso', 'cs', 'dc', 'rst',
  'bl', 'bl_pwm', 'xshut', 'lpn', 'int', 'en', 'ce', 'fault', 'gpio', 'adc_gpio', 'pwm_gpio',
  'nsleep', 'nfault', 'in1', 'in2', 'pwm', 'enc_a', 'enc_b', 'sd', 'dout', 'din', 'bclk',
  'lrclk', 'ws', 'clk', 'data', 'power_en', 'pin']);

function pinOwners(hw, host) {
  const owners = {};
  const hostOf = hostOfBus(hw);
  const walk = (node, h, where) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(x => walk(x, h, where));
    const here = node.host || h;
    for (const [k, v] of Object.entries(node)) {
      if (PIN_KEYS.has(k) && typeof v === 'number') {
        if (here === host) (owners[v] = owners[v] || []).push(`${where}.${k}`);
      } else if (v && typeof v === 'object') {
        walk(v, ['reflex', 'face', 'head', 'audio', 'head_cam'].includes(k) ? k : here, `${where}.${k}`);
      }
    }
  };
  for (const [n, b] of Object.entries(hw.buses || {})) walk(b, (b && b.host) || 'reflex', `bus.${n}`);
  for (const p of hw.peripherals || []) walk(p, p.host || hostOf[p.bus] || 'reflex', p.name);
  if (hw.drive) walk(hw.drive, 'reflex', 'drive');
  if (hw.kickstand) walk(hw.kickstand, 'reflex', 'kickstand');
  return owners;
}
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
  const unsupported = [];

  // Which MCU hosts a peripheral decides whether it belongs in this file at
  // all. Hangar Bay generates PlatformIO ESP32 firmware, so a display or mic
  // wired to the Raspberry Pi is served by the Pi's own software and must NOT
  // appear here - listing it would have the generator resolve Pi GPIO numbers
  // as if they were ESP32 pins, and its pin audit would then compare two
  // different boards' pins against each other.
  const espHosts = new Set(esp.map(([k]) => k));
  const hostOf = hostOfBus(hw);
  const hostOfPart = (p) => p && (p.host || hostOf[p.bus] || 'reflex');
  const onEsp = (p) => espHosts.has(hostOfPart(p));

  const displayAny = peripheral(hw, p => /gc9a01|st7789|ili9341|st7735/.test(p.part || ''));
  const display = displayAny && onEsp(displayAny) ? displayAny : null;
  if (displayAny && !display) {
    unsupported.push({
      what: `display (${displayAny.part})`,
      value: `hosted on ${hostOfPart(displayAny)}`,
      reason: `wired to the ${hostOfPart(displayAny)} board, which is not an ESP32 firmware `
            + 'target, so show_face is served by that board\'s own software and the '
            + 'generator must not resolve its pins',
    });
  }

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

    // A display pin the pack states symbolically ("tied_low", "expander.p4")
    // is not a number, so firmware-gen falls back to its own default
    // (resolveDisplay in droid lib/bodies/firmware-gen.js). On a single-MCU
    // body that default can land on a pin the pack already uses for something
    // else, and the generated firmware would then drive it. Worth naming the
    // actual pin rather than warning in the abstract.
    const FALLBACK = { mosi: 23, sclk: 18, cs: 5, dc: 16, rst: 17, bl: 4 };
    const sym = ['cs', 'rst', 'bl'].filter(k => typeof display[k] === 'string');
    if (sym.length) {
      const owners = pinOwners(hw, hostOfPart(display));
      const collisions = [];
      for (const k of sym) {
        const gpio = FALLBACK[k];
        const owner = (owners[gpio] || []).filter(o => !o.startsWith(`display.`));
        if (owner.length) collisions.push(`${k} would use GPIO ${gpio}, which this body uses for ${owner.join(' and ')}`);
      }
      unsupported.push({
        what: `display ${sym.join('/')}`,
        value: sym.map(k => `${k}=${display[k]}`).join(' '),
        reason: 'tied to a rail or behind the I2C GPIO expander, not an MCU pin, so '
              + 'firmware-gen falls back to its default'
              + (collisions.length
                ? ` — and on this body that collides: ${collisions.join('; ')}`
                : '; the defaults happen not to collide on this body, but they are '
                  + 'still not the pins the hardware uses'),
        collides: collisions.length > 0,
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
      reason: 'needs the Feetech STS serial-bus driver, which lives on the Meckie OS '
            + 'branch feat/serial-bus-servos and is NOT on main yet. On main, '
            + 'fw-templates.js has one actuator model - a PWM hobby servo per GPIO '
            + '(ESP32Servo.h, panServo.write(0..180)) - so look_at cannot be '
            + 'generated for this body from main',
    });
  }
  if (pwm.length) {
    build.servo = { pan: pwm[0].pwm_gpio, axes: 1, part: pwm[0].part, role: 'kickstand' };
  }

  const ledAny = peripheral(hw, p => /ws2812|sk6812/.test(p.part || ''));
  if (ledAny && onEsp(ledAny)) build.led = { pin: ledAny.gpio, part: ledAny.part };

  // Mic and speaker: real I2S pins off the bus they sit on, or nothing. The
  // generator defaults to pins from a different board when these are absent,
  // which on a single-MCU body can land on a motor pin, so an unknown here is
  // recorded rather than left to a fallback.
  const i2sPins = (p) => {
    const bus = (hw.buses || {})[p.bus] || {};
    const out = {};
    if (Number.isFinite(bus.bclk)) out.bclk = bus.bclk;
    const lr = bus.lrclk ?? bus.ws;
    if (Number.isFinite(lr)) out.lrclk = lr;
    if (Number.isFinite(bus.din)) out.din = bus.din;
    if (Number.isFinite(bus.dout)) out.dout = bus.dout;
    return out;
  };

  const micAny = peripheral(hw, p => /ics43434|onboard_pdm|inmp441/.test(p.part || ''));
  if (micAny && onEsp(micAny)) {
    const pins = i2sPins(micAny);
    build.mic_type = micAny.part;
    if (Number.isFinite(micAny.clk)) pins.bclk = micAny.clk;      // PDM mics name it clk
    if (Number.isFinite(micAny.data)) pins.din = micAny.data;
    if (Object.keys(pins).length) build.mic = { pins };
    if (/pdm/.test(micAny.part)) {
      unsupported.push({
        what: `mic (${micAny.part})`,
        value: `clk ${micAny.clk}, data ${micAny.data}`,
        reason: 'the generator\'s audio_up block is I2S; a PDM mic needs a different '
              + 'driver, so audio_up cannot be generated for this body',
      });
    }
  } else if (micAny) {
    unsupported.push({
      what: `mic (${micAny.part})`,
      value: `hosted on ${hostOfPart(micAny)}`,
      reason: `wired to the ${hostOfPart(micAny)} board, which is not an ESP32 firmware target`,
    });
  }

  const spkAny = peripheral(hw, p => /max98357a|pam8302/.test(p.part || ''));
  if (spkAny && onEsp(spkAny)) {
    const pins = i2sPins(spkAny);
    if (Number.isFinite(spkAny.sd)) pins.amp_sd = spkAny.sd;
    build.speaker = spkAny.part;
    if (Object.keys(pins).length) build.speaker_pins = { pins };
    if (typeof spkAny.sd === 'string') {
      unsupported.push({
        what: 'speaker amp shutdown',
        value: `sd=${spkAny.sd}`,
        reason: 'tied to a rail or behind the I2C expander, not an MCU pin',
      });
    }
  } else if (spkAny) {
    unsupported.push({
      what: `speaker (${spkAny.part})`,
      value: `hosted on ${hostOfPart(spkAny)}`,
      reason: `wired to the ${hostOfPart(spkAny)} board, which is not an ESP32 firmware target`,
    });
  }

  const camAny = peripheral(hw, p => /imx708|ov3660|ov2640/.test(p.part || ''));
  if (camAny && onEsp(camAny)) build.camera = true;
  else if (camAny) {
    unsupported.push({
      what: `camera (${camAny.part})`,
      value: `hosted on ${hostOfPart(camAny)}`,
      reason: `wired to the ${hostOfPart(camAny)} board (${camAny.bus}), which is not an `
            + 'ESP32 firmware target',
    });
  }

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
