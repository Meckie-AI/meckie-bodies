# Meckie bodies

Open-hardware robot bodies for Meckie OS. A **body** is a thin-client vehicle a
household Meckie can inhabit: it runs its reflexes and senses locally and
streams to Central for thinking. Print one, flash it, and it is a body.

Hardware is **CERN-OHL-S-2.0**, code is **MIT**. Build, modify, share or sell;
if you distribute a product or a modified design, publish its source. Meckie OS
and Hangar Bay are free to download but are not open source, and the Meckie
brain is a paid service — a body flashes and runs its reflexes and safety
routines without an account, but it needs one to think and talk. "Meckie" is a
trademark: you may say "compatible with Meckie OS", but you may not name or sell
a product "Meckie".

## The catalog

| Body | Class | Actuators | Mass | BOM | STLs |
|---|---|---|---|---|---|
| Dial | desk / shelf | 2× STS3215 | 1270 g | ~$289 | 32 |
| Scout | floor runner | 2× N20 encoder gearmotor | 198 g | ~$81 | 19 |
| Rover Lite | tracked explorer | 2× N20 + 2× STS3215 | 774 g | ~$286 | 29 |
| Wobble | self-balancing | 2× N20 + 1× MG90S kickstand | 425 g | ~$154 | 24 |
| Lamp | desk arm | 4× STS3215 | 2251 g | ~$263 | 26 |
| Inchworm | desk arm | 5× STS3215 | 1835 g | ~$266 | 37 |
| Biped Mini | walker | 6× STS3215 (12 V) + 4× STS3032 (6 V, separate bus) | 1161 g | ~$455 | 37 |
| Comet | quadruped | 12× STS3215 + 4× N20 | 1780 g | ~$684 | 41 |

`bodies.json` is the machine-readable catalog. BOM figures are single-unit
retail estimates from October 2026 and **have not been checked against current
listings**.

## Status: designed, not yet built

**No STL in this repo has been sliced or test-printed.** Everything here is
verified by measurement and by CI, not by a working robot:

- 245 STLs: all watertight, single-shell, inside the 220 mm bed, correctly
  named, zero zero-area triangles. Everything prints in **PLA**, with **TPU 95A**
  only where flex is the function. Nothing is painted: what reads as chrome or
  brass is metallic-filled filament.
- 8 manifests and 8 Hangar Bay templates: all parse, all hash-verified, all
  satisfying the sensing and safety rules.
- 8 generated JSON manifests: all valid against the Body SDK's
  `MANIFEST.schema.json` and against Central's own semantic validator.

That is a long way from "it walks". Each pack's `README.txt` lists the first
test prints. Servo spline position along the STS3215/STS3032 case is not
published, so every servo pocket carries 3 mm of shim room — the first build of
each body should measure it and record what it finds.

### Known open items

- **Serial-bus servos need Meckie OS branch `feat/serial-bus-servos`, not yet on
  main.** Six of these eight bodies (dial 2 joints, rover-lite 2, lamp 4,
  inchworm 5, biped-mini 10, comet 12) are built entirely on STS3215/STS3032 serial
  servos. On main, firmware generation has one actuator model — a PWM hobby
  servo per GPIO — so `look_at` cannot be generated for them. The branch adds a
  Feetech STS bus driver that handles all six, keeps biped-mini's 12 V and 6 V
  buses separate, clamps every goal to the joint's declared range, and holds
  position on `stop` rather than cutting torque. **Its register map is not
  verified against hardware** — first power-on should be one joint at low
  torque, behind the calibration `safety_test`.
- **The generator now refuses the builds it used to get wrong.** scout, wobble
  and inchworm tie a display pin to a rail or route it through the I2C expander,
  so it is not a pin number, and generation used to fall back to a default that
  landed on a pin the body already uses — on scout, the **right motor's PWM**,
  so showing a face would have spun a wheel. The branch's pin audit refuses both
  that and any guessed pin that moves the body. Each case is still named, with
  the conflicting signal, in that pack's `generated/build.json`.
- **Three bodies' faces, ears and eyes are not ESP32 firmware at all.** On dial,
  rover-lite and biped-mini the display, mic, speaker and camera all hang off
  the Raspberry Pi (on lamp, the display and audio do). Generated firmware
  covers only the reflex board — servos, drive, sensors — and `show_face`,
  `say` and `frames` are served by the Pi's own software. `build.json` records
  which board hosts what.
- **rover-lite shares reflex GPIO 21** between the DRV8833 nFAULT and the servo
  eFuse FLT, while its safety block lists `drv_fault` and `efuse_fault` as
  separate triggers. Its ESP32-S3 has only two unused pins and both are boot
  strapping pins, so this needs a design decision, not a pin swap.
- **8 meshes are not edge-manifold** — four inherited from the original handoff
  (down from 20; the other 16 were fixed by giving the touching features a small
  overlap) and four that arrived with Comet. All are closed and printable, and
  listed with exact counts and coordinates in `mesh-exceptions.json`.
- **26 STLs do not reproduce from their generator.** Inherited from the
  handoffs, which shipped STLs exported from an earlier revision of the generator
  they also shipped: parts are variously rotated, mirrored or shifted, or differ
  slightly in triangle count. Recorded in `stl-drift.json` and deliberately not regenerated,
  because print orientation is a design call. `node tools/reexport.js --verify`
  checks it.
- **Biped Mini** runs its STS3032 roll joints at about 50% of their short-term
  budget, so the gait planner must keep the CoM within 8 mm of the stance foot.
  It has two servo buses: **never put an STS3032 on the 12 V bus.**
- **Lamp**'s ballast ring is laser-cut steel, Ø150 / Ø90 × 14 mm, not printed.
- **Comet**'s chassis deck prints in two pieces. At 250 mm it was the only part
  in the catalog that did not fit a 220 mm bed, and it cannot be rotated into
  fitting. It splits on a stepped lap at x = -20 and bolts together with two M3s
  into bosses on the rear half — no glue, like everything else here. The halves
  are a CSG split of the original solid rather than two drawn parts, so they
  provably reassemble: `deck_front` 150 mm, `deck_rear` 110 mm, zero overlap.
- **Comet**'s wheel feet take a bought Ø30 silicone tyre over a printed PLA hub,
  which is why it has only one TPU part. Scout prints its tyres instead. Both
  are deliberate.

## Working in this repo

```
npm install
npm run validate      # the pack standard
npm run check         # validate + generators current + the gates still fail
npm run sync          # regenerate template hardware blocks and hashes
npm run emit          # regenerate the JSON Meckie OS consumes
npm run clean-mesh    # strip zero-area triangles from the STLs
npm run selftest      # break each rule on purpose, prove CI catches it
npm run reexport      # rebuild STLs from the Print Parts generator, in Node
npm run diagnose      # locate non-manifold edges, in mm
```

`CONTRIBUTING.md` is the pack standard: what a pack contains, what is generated
from what, the design rules CI enforces, and how to submit a body.

### Layout

```
bodies/<slug>/          one pack per body
shared/                 the master copy of the per-pack HTML runtime
schema/                 MANIFEST.schema.json, vendored from the Body SDK
tools/                  validators and generators
docs/HANDOFF.md         the original design handoff, as received
mesh-exceptions.json    the 8 remaining non-manifold meshes, with coordinates
stl-drift.json          the 26 STLs that do not reproduce from their generator
```

### Viewing a body

The briefs and viewers are HTML that runs from disk — open
`bodies/<slug>/<Name> Viewer.html` in a browser. Viewers take
`?view=side|front|top|iso|rear|exploded|xray`, `&pose=`, and `&embed=1`.
`<Name> Print Parts.html` rebuilds every printed part live and re-exports STLs;
it is the geometric source of truth.

These pages load three.js, manifold-3d and three-bvh-csg from a CDN, and the
briefs compile JSX in the browser. They are design references, not production
web code — fine to read, not a basis for a website.

`tools/geom.mjs` runs the Print Parts geometry in Node instead, with three and
manifold-3d from npm, so parts can be rebuilt and measured without a browser.
That is what makes `npm run reexport` and `npm run diagnose` possible.

## Provenance

The seven packs arrived as a single design handoff (`docs/HANDOFF.md`). The
first commit in this repo is that bundle verbatim, so every change since is a
reviewable diff against what was delivered. The handoff's own brief for a public
marketplace website is **not** built here; this repo is the packs and the
standard that keeps them honest.
