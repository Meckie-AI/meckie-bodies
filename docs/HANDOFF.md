# Handoff: Meckie Body Marketplace (open source)

## Overview
Meckie OS runs a household "Meckie" (a character AI) on a Central server. **Bodies** are thin-client robot vehicles it can inhabit: each body runs reflexes and senses locally and streams to Central for thinking. This bundle contains seven complete, open-source body designs. Your job is to build the **Meckie Body Marketplace**: a public website + repository where makers browse bodies, view them in 3D, download print files and parts lists, and get firmware manifests for Meckie OS. The bodies are open source; Meckie OS and Hangar Bay are free to download; the Meckie brain is a paid service.

Build in this order:
1. **Repository structure** for body packs (one folder per body, schema below), with CI that validates every pack.
2. **Marketplace website**: catalog → body page → downloads.
3. **Hangar Bay integration**: the per-body YAML manifest is what Meckie OS firmware generation consumes.

## What's open, what's free, what's paid
- **Bodies: open source.** Hardware is CERN-OHL-S-2.0 (STLs, briefs, geometry, parts lists); code is MIT (viewers, generators, Hangar Bay templates). Anyone may build, modify, share or sell; anyone who distributes a product or a modified design must publish its source. `LICENSE.md` is at the root, and every pack has `LICENSE.txt`.
- **Meckie OS and Hangar Bay: free to download and use, not open source.** They are not in this bundle. The templates target them without granting any rights to them.
- **Meckie brain (Central): a paid service.** A body flashes and runs its reflexes and safety routines without it; it needs a Meckie account to think and talk.
- **Trademark:** "Meckie" is a trademark. Third parties may say "compatible with Meckie OS" but may not name or sell a product "Meckie".
- **The marketplace site itself:** free downloads, no checkout. Supplier links stay plain (no affiliate tags).

## Hangar Bay: known templates for official bodies
Hangar Bay already has a "build whatever" system for custom robots, and that stays as it is. This bundle adds **known templates**: one per official body, so anyone who prints one of these designs picks it by name in Hangar Bay, flashes and goes, with no configuration.

Each pack ships `hangar-bay/<slug>.template.yaml`:
```yaml
template: meckie-hangar-bay/1
known_template: { catalog: meckie-bodies, origin: official, hardware_sha256: <hash of the hardware block> }
body: { id, name, version, license, drives, pack }
targets:            # what to flash: reflex | head | face, with board + firmware/image + flash method
pairing:            # Central auto-discover, Wi-Fi from the Meckie app, brain needs an account
calibration_wizard: # body-specific steps; ends with a required safety_test (heartbeat drop → rest pose)
calibration: {}     # filled in by the wizard
hardware: |         # the full body manifest (peripherals, buses, pins, servos, limits, reflexes, safety)
```

What to build:
- **Marketplace:** each body page has an **"Open in Hangar Bay"** button that deep-links `meckie://hangar-bay/add?template=<raw URL>`, plus a template download.
- **Catalog feed:** publish `bodies.json` at a stable URL so Hangar Bay can list official bodies (name, thumbnail, template URL) in its body picker.
- **Integrity:** `hardware_sha256` lets Hangar Bay mark a template "official, unmodified". An edited template still loads, but is treated as a custom build.
- **Naming:** the board ids (`esp32s3_devkitc_n16r8`, `xiao_esp32s3_sense`, `rpi_zero_2w`) and firmware channels (`meckie-reflex`, `meckie-reflex-lite`, `meckie-head`, `meckie-face`) are placeholders. Map them to Hangar Bay's real build targets.
- **New community bodies:** they get a known template only once accepted into the catalog. Until then they use the builder.

## About the design files
Everything here was produced as **design references in HTML**: briefs, 3D viewers and a print-part generator. They are not production web code. Recreate the marketplace UI in your chosen stack and reuse the data and assets. Some files *are* real deliverables and should ship as-is:
- `stl/*.stl`: print-ready meshes (mm, Z up, watertight, manifold-checked).
- `parts-list.csv`: buy list.
- `firmware/hangar_bay_*.yaml`: firmware manifest.
- `README.txt`: maker instructions per body.

The `*.dc.html` briefs need `support.js` beside them to render. The viewers and print-part pages need `three-d-stage.js` and load three.js / manifold-3d from CDNs. Each pack already includes these files.

If no stack exists yet, a good default is a static site (Astro or Next.js static export) with `bodies.json` as the source of truth, three.js / `<model-viewer>` for 3D, and GitHub Releases or a CDN for pack zips.

## Fidelity
**High fidelity** for the visual system and content. Every brief uses one locked design system, below; match it on the marketplace.

## The body-pack standard (enforce in CI)
Each `bodies/<slug>/` contains:
| File | Purpose |
|---|---|
| `<Name> Design Brief.dc.html` | Full brief (sections below) |
| `<Name> Viewer.html` | three.js viewer. Query params: `?view=side|front|top|iso|rear|exploded|xray&embed=1` plus body-specific `pose`. GLB/OBJ export button. |
| `<Name> Print Parts.html` | Live CSG generator. Previews every printed part and re-exports STLs. Source of truth for geometry. |
| `stl/<slug>-<part>[_R|_L]-x<qty>.stl` | Print files. Quantity is in the name; mirrored leg parts carry _R/_L. |
| `parts-list.csv` | `part,qty,where,link,notes` |
| `firmware/hangar_bay_<slug>.yaml` | Peripherals, buses, pins, servo IDs, joint limits, reflexes, safety routine |
| `hangar-bay/<slug>.template.yaml` | Hangar Bay template: targets to flash, pairing, calibration wizard, embedded manifest |
| `README.txt` | Maker instructions: printing, fit, assembly order, Hangar Bay, buying note |
| `LICENSE.txt` | CERN-OHL-S-2.0 + MIT |
| `support.js`, `three-d-stage.js` | Runtime for the HTML files |

**Brief sections (in order):** masthead with stat grid · 01 concept views · 02 mechanism exploded + joint table + notes · behaviour modes · 03 body layout (x-ray + bus & power topology + body notes) · wiring diagram · 04 load check · 05 parts & mass budget (category bar, running totals) · 05b BOM cost + where to save · 05c assembly (every joint: Screw / Snap / Clamp / Latch / Twist-lock) · 06 print orientation + settings · safety reflex · Hangar Bay manifest (table + YAML) · verify-before-CAD-freeze list.

## Non-negotiable design rules (validate these)
1. **No glue, ever.** Everything screws into heat-set inserts or snaps together. No adhesive, tape, epoxy, foam pads or adhesive cable mounts. Press-fits only when a screw or clamp retains them. Every internal component has a listed mount (screws into inserts or standoffs, snap-in cradle with latch, strap on hooks, or screw-down retainer).
2. **Sensing rule for anything that drives:** at least a forward lidar (VL53L8CX / VL53L1X class) plus drop-off ToF front and rear, shown in the views, BOM, wiring, manifest and safety reflex.
3. **Safety reflex:** on Central heartbeat loss (≈500 ms), low battery or servo over-temperature, the body stops, brakes, waits about 2 s, moves slowly to a safe rest pose, lowers servo torque and shows a "sleepy / lost connection" face. It resumes **only on a fresh command**.
4. **Fabrication:** fits a 256 × 256 mm FDM bed. PLA shells and structure, TPU bumpers, feet and tyres. Bearings at every pivot, metal servo horns, hidden fasteners.
5. **Insert bores:** M2 Ø3.2 · M2.5 Ø3.6 · M3 Ø4.0 · M4 Ø5.6 · M5 Ø6.4 (standard short brass heat-set inserts).

## Catalog (also in `bodies.json`)
| Body | Class | Actuators | Mass | BOM | STLs |
|---|---|---|---|---|---|
| Dial | desk / shelf | 2× STS3215 | 1270 g | ~$301 | 32 |
| Scout | floor runner | 2× N20 encoder gearmotor | 198 g | ~$82 | 19 |
| Rover Lite | tracked explorer | 2× N20 + 2× STS3215 | 774 g | ~$285 | 29 |
| Wobble | self-balancing | 2× N20 + 1× MG90S kickstand | 425 g | ~$156 | 24 |
| Lamp | desk arm | 4× STS3215 | 2251 g | ~$269 | 26 |
| Inchworm | desk arm | 5× STS3215 | 1835 g | ~$266 | 37 |
| Biped Mini | walker | 6× STS3215 (12 V) + 4× STS3032 (6 V, separate bus) | 1161 g | ~$459 | 37 |

BOM figures are single-unit retail estimates (Oct 2026) and have not been checked against current listings. Biped Mini, Inchworm and Rover Lite are over their original cost targets; each brief's 05b section lists savings.

## Screens to build
**1. Catalog.** A grid of body cards: an embedded viewer iframe at `?view=iso&embed=1` (or a pre-rendered thumbnail), name in Jost italic 700, the tagline, and a stat row (class, servos, mass, BOM, STL count). Filters: class, drives / doesn't drive, ESP32-only, servo type, price band.

**2. Body page.** A masthead in the brief's style (double rule, stat grid), then tabs:
- **3D:** viewer with view buttons and the exploded and x-ray views.
- **Build:** the brief embedded or re-rendered from data.
- **Print:** STL list grouped by material with orientation and settings (taken from section 06), plus a "Download all STLs" zip.
- **Parts:** `parts-list.csv` rendered with an "Add Amazon items" action (opens each link) and a separate "Other suppliers" list, with this copy: "This is a convenience: source your own parts anywhere, as long as they match the spec."
- **Hangar Bay:** an "Open in Hangar Bay" button plus a template download. Show the targets to flash and the calibration steps, so builders know what to expect.
- **Firmware:** the raw body manifest with copy and download buttons.

**3. Contribute.** How to submit a new body: fork, add `bodies/<slug>/` following the standard, and CI validates it. Submissions must use CERN-OHL-S-2.0 (hardware) and MIT (code), and must include a Hangar Bay template.

**Footer (all pages):** "Meckie bodies are open hardware (CERN-OHL-S-2.0) and open code (MIT). Meckie OS is free to download; the Meckie brain is a paid service."

## CI validation to implement
- Every STL parses, is watertight (every edge shared by exactly two triangles), is a single body, and fits 256 × 256 × 256.
- The `-x<qty>` filename suffix is present.
- `parts-list.csv` has the required columns and non-empty links.
- The YAML parses, servo IDs are unique per bus, and pins are unique per MCU. Bodies with `drives: true` must declare `lidar_fwd` plus drop-off front and rear.
- The brief contains a 05c assembly table, and no row uses glue, tape, adhesive or epoxy (case-insensitive grep across all pack text).
- Every body in `bodies.json` has a matching folder, and every folder has a catalog entry.
- Every pack contains `LICENSE.txt` naming CERN-OHL-S-2.0 and MIT.
- Every pack contains `hangar-bay/<slug>.template.yaml` that parses, matches `template: meckie-hangar-bay/1`, includes a required `safety_test` step, and embeds the same manifest as `firmware/`. CI recomputes `hardware_sha256` and fails on a mismatch.

## Design tokens
- **Colours:** background #f1e8d2, cards #f7f0de, frames #ebe2cb, ink #23292b, signal red #c8463a, sea foam #5ea49b. Secondary: brass #c29a48, deep sea foam #2e6a46, steel blue #37598a, muted text #3d4344 / #5a5f60, rules #c9bfa6 / #d8cfb7.
- **Type:** Jost (italic 700 masthead at clamp(56px, 8vw, 104px), 700 headings at 30px uppercase with 0.06em tracking, 400–500 body at 15–17px) and IBM Plex Mono (labels at 11–13px uppercase with 0.08–0.12em tracking, tables at 13–14px).
- **Shape:** 2px ink borders, 20px card radius, 999px pills, 12–14px chip radius.
- **Section header:** a 40px red circle holding the white section number (Jost 700, 16px), then the uppercase title.
- **Masthead:** 3px double bottom rule and a 2-column stat grid with 1px internal rules.
- **Spacing:** 56px between sections, 16–24px gaps inside sections, 48px page padding, 1240px max width.
- **Look:** 1950s atomic-punk retro-futurism, cream / sea foam / signal red with chrome and brass accents. No wood, no emoji.

## Interactions
- **Viewer:** orbit on drag; views via query param; pose switch per body (for example Biped Mini `stand|step|sit|wave`, Inchworm `peek|stretch|curl`, Lamp `attentive|lean|peek|…`); GLB/OBJ export.
- **Print-parts page:** click a part to build it live (manifold-3d CSG), "Download STL" for one part, "All STLs (.zip)" for everything. Port this as the marketplace's "regenerate STLs" tool if you want parametric edits later. The geometry code is plain JS (MIT) in each `* Print Parts.html`, between `// ---------- <Body> interfaces` and `// ---------- viewer`.
- **Brief Tweaks:** briefs expose props such as pose, ballast thickness and arm upgrade. Reproduce them as toggles on the body page if useful.

## Known open items (show on each body page as "Verify before you print")
- No STL has been sliced or test-printed. Each pack's README lists the first test prints.
- Servo spline position along the case (STS3215, STS3032) is not published, so every servo pocket has 3 mm of shim room. The first build per body should measure and record it.
- **Biped Mini:** STS3032 roll joints run at about 50% of their short-term budget, so the gait planner must keep the CoM within 8 mm of the stance foot. Two separate servo buses (12 V and 6 V): never put an STS3032 on 12 V.
- **Inchworm:** joint ranges from the collision sweep are J1 −50° to 95° and J2–J5 about −85° to 35°. The rest pose is a forward bow, not a coil.
- **Lamp:** the steel ballast ring is laser-cut, Ø150 / Ø90 × 14 mm.
- The 3D viewers are concept geometry kept close to the parts; the Print Parts pages are the geometric source of truth.

## Assets
- **3D geometry:** generated in code, no external models.
- **Fonts:** Google Fonts (Jost, IBM Plex Mono).
- **Libraries:** three.js 0.184, manifold-3d 3.0, three-mesh-bvh / three-bvh-csg (viewers), all from CDNs.
- **Laser-cut steel:** ballast parts are described in each README; generate DXF from the Print Parts "ballast" preview part.

## Files
- `LICENSE.md`: CERN-OHL-S-2.0 (hardware), MIT (code), and what is not covered. Each pack also has `LICENSE.txt`.
- `bodies/<slug>/hangar-bay/<slug>.template.yaml`: the known Hangar Bay template for each official body.
- `bodies.json`: the catalog and source of truth for the site (includes `license` and `commercial_use: false`).
- `bodies/<slug>/…`: seven complete packs (dial, scout, rover-lite, wobble, lamp, inchworm, biped-mini).
- `reference/Meckie Parts.dc.html`: the original parts-sourcing page: per-body buy lists, an Amazon list, other-supplier links and the convenience disclaimer. It needs `reference/support.js`.
