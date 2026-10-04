# The body-pack standard

A pack is one folder under `bodies/<slug>/`. CI enforces everything below, so
the fastest way to learn the standard is `npm run validate` on your branch.

```
npm install
npm run validate        # the pack standard, 2300+ checks
npm run check           # validate + both generators are current + the gates still fail
```

## What a pack contains

| File | Purpose |
|---|---|
| `<Name> Design Brief.dc.html` | The full brief. Sections 01–06 including 05b (cost) and 05c (assembly) |
| `<Name> Viewer.html` | three.js viewer. `?view=side\|front\|top\|iso\|rear\|exploded\|xray`, `&pose=`, `&embed=1` |
| `<Name> Print Parts.html` | Live CSG generator. **The geometric source of truth** |
| `stl/<slug>-<part>[_R\|_L]-x<qty>.stl` | Print files. Quantity in the name; mirrored parts carry `_R`/`_L` |
| `parts-list.csv` | `part,qty,where,link,notes` |
| `firmware/hangar_bay_<slug>.yaml` | **The body manifest. The one authored copy** |
| `hangar-bay/<slug>.template.yaml` | Hangar Bay template. Its `hardware:` block is generated |
| `generated/manifest.json`, `generated/build.json` | Generated for Meckie OS |
| `README.txt` | Maker instructions |
| `LICENSE.txt` | CERN-OHL-S-2.0 (hardware) + MIT (code) |
| `support.js`, `three-d-stage.js` | Runtime for the HTML. Must match `shared/` byte for byte |

## Three things are generated. Never hand-edit them.

```
firmware/hangar_bay_<slug>.yaml          <-- you edit this
        |
        |  npm run sync
        v
hangar-bay/<slug>.template.yaml          hardware: block + hardware_sha256
        |
        |  npm run emit
        v
generated/manifest.json, build.json      what Meckie OS consumes
```

Edit the manifest, run `npm run sync && npm run emit`, commit the result. CI
fails if the committed output does not match a fresh run.

### `hardware_sha256`

```
hardware_sha256 = sha256(manifest text, LF endings, exactly one trailing newline)
```

On disk that is the bytes of `firmware/*.yaml`. Inside a template it is the
`hardware:` block dedented two spaces. The same bytes by construction, so
Hangar Bay can verify a template it was handed without having the pack.

Key order, whitespace inside flow mappings and comments are deliberately **not**
normalised. The manifest is a human-authored artifact builders read; a hash over
a reformatted projection of it would not be checking the thing they flashed.

## Non-negotiable design rules

**1. No glue, ever.** Everything screws into heat-set inserts or snaps together.
Press-fits only where a screw or clamp retains them. Every internal component
has a listed mount.

CI reads the 05c assembly table: every joint's method must come from a
mechanical vocabulary (screw, snap, clamp, latch, twist, clip, press, stretch,
and compounds like `Snap + screw`), and an adhesive word may appear in a joint
description only in a sentence that rules it out.

**2. Anything that drives senses ahead and below.** A body with
`drives: true` must declare a peripheral with `role: obstacle` and at least two
with `role: drop_off`, and **every** `drop_off` sensor must be wired into the
`edge` reflex. A body that does not drive declares `sensing_rule.drop_off`
saying why the rule does not apply, rather than leaving the exemption implicit.

Enforced by role, not by name — the names varied between packs and the rule
silently passed bodies that only looked compliant.

**3. The safety reflex.** On heartbeat loss (~500 ms), low battery or servo
over-temperature the body stops, brakes, waits about 2 s, moves slowly to a
safe rest pose, lowers torque and shows a lost-connection face. It resumes
**only on a fresh command**.

CI requires `safety.triggers` to include `heartbeat_lost`, `safety.routine` to
include `wait_2s` and `face_sleepy`, `safety.resume` to be `fresh_command_only`,
and `central.timeout_ms` to be 100–1000.

**4. The calibration wizard ends in a safety test.** `safety_test` must be the
last step and `required: true`. It is the step that proves the body parks itself
when Central goes away, so it is not optional and it is not somewhere in the
middle. Every ToF sensor must also appear in a wizard `checks` list — a builder
must not be able to finish setup with an untested drop sensor.

**5. Fabrication.** Fits a 256 × 256 mm bed. PETG shells, CF-nylon structure,
TPU bumpers and tyres. Bearings at every pivot, metal servo horns, hidden
fasteners. Insert bores: M2 Ø3.2 · M2.5 Ø3.6 · M3 Ø4.0 · M4 Ø5.6 · M5 Ø6.4.

**6. Supplier links stay plain.** No affiliate or campaign tags. Prefer a search
URL over a specific listing: listings rot, searches do not.

## Meshes

Every STL must be binary, watertight (no boundary edges), a single shell, inside
256³, named `-x<qty>.stl`, and free of zero-area triangles. `npm run clean-mesh`
fixes zero-area triangles mechanically.

Edges used by more than two triangles are also a failure, with one exception:
`mesh-exceptions.json` lists 20 files from the original handoff with exact
counts. That list is checked **both ways** — a count that rises fails, and a
count that falls fails too, so a part you fix must have its entry removed. It
cannot decay into a blanket exemption.

Those 20 are all the same kind of defect: two surfaces that abut exactly instead
of overlapping by a few microns, which makes four triangles share one edge. The
meshes are still closed and printable. The fix belongs in the part's build
function in `<Name> Print Parts.html`, not in a post-processor.

## Verify before you print

No STL in this repo has been sliced or test-printed. Each pack's `README.txt`
lists the first test prints. Servo spline position along the STS3215/STS3032
case is not published, so every servo pocket carries 3 mm of shim room; the
first build of each body should measure and record it.

## Submitting a body

Fork, add `bodies/<slug>/` following the standard, run `npm run check`, open a
PR. Hardware must be CERN-OHL-S-2.0 and code MIT, and the pack must include a
Hangar Bay template. A community body gets a known template once it is accepted
into the catalog; until then it uses Hangar Bay's builder.
