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
| Dial | desk / shelf | 2× STS3215 | 1270 g | ~$301 | 32 |
| Scout | floor runner | 2× N20 encoder gearmotor | 198 g | ~$82 | 19 |
| Rover Lite | tracked explorer | 2× N20 + 2× STS3215 | 774 g | ~$285 | 29 |
| Wobble | self-balancing | 2× N20 + 1× MG90S kickstand | 425 g | ~$156 | 24 |
| Lamp | desk arm | 4× STS3215 | 2251 g | ~$269 | 26 |
| Inchworm | desk arm | 5× STS3215 | 1835 g | ~$266 | 37 |
| Biped Mini | walker | 6× STS3215 (12 V) + 4× STS3032 (6 V, separate bus) | 1161 g | ~$459 | 37 |

`bodies.json` is the machine-readable catalog. BOM figures are single-unit
retail estimates from October 2026 and **have not been checked against current
listings**.

## Status: designed, not yet built

**No STL in this repo has been sliced or test-printed.** Everything here is
verified by measurement and by CI, not by a working robot:

- 204 STLs: all watertight, single-shell, inside the 256 mm bed, correctly
  named, zero zero-area triangles.
- 7 manifests and 7 Hangar Bay templates: all parse, all hash-verified, all
  satisfying the sensing and safety rules.
- 7 generated JSON manifests: all valid against the Body SDK's
  `MANIFEST.schema.json` and against Central's own semantic validator.

That is a long way from "it walks". Each pack's `README.txt` lists the first
test prints. Servo spline position along the STS3215/STS3032 case is not
published, so every servo pocket carries 3 mm of shim room — the first build of
each body should measure it and record what it finds.

### Known open items

- **Serial-bus servos are not yet supported by Hangar Bay firmware generation.**
  Meckie OS's template library implements PWM hobby servos only. Five of these
  seven bodies (dial, rover-lite, lamp, inchworm, biped-mini) are built entirely
  on STS3215/STS3032 serial servos, so their `look_at` cannot be generated yet.
  Each pack's `generated/build.json` lists this and everything else Meckie OS
  cannot yet consume, under `unsupported`.
- **Do not flash generated firmware for scout, wobble or inchworm yet.** These
  three tie a display pin to a rail or run it through the I2C GPIO expander, so
  it is not a pin number and the generator falls back to a default that lands on
  a pin the body already uses. On scout the backlight default is GPIO 4, which
  is the **right motor's PWM** — showing a face would spin a wheel. Each case is
  named exactly, with the conflicting signal, in that pack's
  `generated/build.json`.
- **rover-lite shares reflex GPIO 21** between the DRV8833 nFAULT and the servo
  eFuse FLT, while its safety block lists `drv_fault` and `efuse_fault` as
  separate triggers. Its ESP32-S3 has only two unused pins and both are boot
  strapping pins, so this needs a design decision, not a pin swap.
- **4 meshes are not edge-manifold** — down from 20; the other 16 were fixed by
  giving the touching features a small overlap. The remainder are closed and
  printable, and listed with exact counts and coordinates in
  `mesh-exceptions.json`.
- **11 STLs do not reproduce from their generator.** Inherited from the handoff,
  which shipped STLs exported from an earlier revision of the generator it also
  shipped: four parts are rotated, four mirrored or shifted, three differ in
  triangle count. Recorded in `stl-drift.json` and deliberately not regenerated,
  because print orientation is a design call. `node tools/reexport.js --verify`
  checks it.
- **Biped Mini** runs its STS3032 roll joints at about 50% of their short-term
  budget, so the gait planner must keep the CoM within 8 mm of the stance foot.
  It has two servo buses: **never put an STS3032 on the 12 V bus.**
- **Lamp**'s ballast ring is laser-cut steel, Ø150 / Ø90 × 14 mm, not printed.

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
mesh-exceptions.json    the 4 remaining non-manifold meshes, with coordinates
stl-drift.json          the 11 STLs that do not reproduce from their generator
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
