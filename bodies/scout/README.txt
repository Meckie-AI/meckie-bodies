SCOUT · Meckie body download pack
=================================

A tiny two-wheeled floor runner: an excitable puppy that zips over to greet you.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Scout Design Brief.dc.html   Design brief: views, wiring, BOM, assembly, safety reflex, manifest.
  Scout Viewer.html            Interactive 3D viewer (views, exploded, x-ray, GLB/OBJ export).
  Scout Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                         20 print-ready STLs, mm, Z up, in print orientation.
  parts-list.csv               Every part with quantity and a buy link.
  firmware/hangar_bay_scout.yaml   Peripherals, buses and pins for firmware generation.
  support.js, three-d-stage.js Needed by the HTML files. Keep everything in one folder.

OPENING THE HTML FILES
  Open them in a desktop browser while online (three.js loads from a CDN). If a browser
  blocks local files, serve the folder: python3 -m http.server, then open http://localhost:8000

PRINTING
  PLA for shells, hubs, trim, the deck and motor straps; TPU 95A for
  tyres, bumpers and ears. No supports needed. Quantities are in the file names (-x2).
  Insert bores: M2 3.2 mm, M2.5 3.6 mm, M3 4.0 mm (standard short brass heat-set inserts).
 

FIT
  Interfaces are set from datasheets: N20 gearmotor (12 x 10 gearbox, 3 mm D-shaft with a
  2.5 mm flat, 10 mm long), GC9A01 1.28" round module (39 mm board), XIAO ESP32-S3 Sense
  (21 x 17.8 mm), 12 mm steel caster ball, 503450 1S pouch (50 x 34 x 5).
  Sensor boards, the slide switch and small breakouts are clamped or clipped, so any
  VL53L0X / VL53L1X carrier works. Print a lower-shell corner and one wheel hub first to
  check your printer's hole tolerance.

ASSEMBLY ORDER
  1. Inserts into the lower shell, upper shell and deck.
  2. Motors onto their saddles, straps on. Caster ball and cap.
  3. Battery into its floor cradle. Deck on its standoffs; boards on the deck.
  4. Sensor boards and switch clamped to their windows. Speaker ring.
  5. Display and snap ring into the face collar; XIAO cradle onto the camera mount.
  6. Bumpers into the upper-shell rim pockets; close the shells with four M2.5 x 30.
  7. Wheels: hub on the shaft (M2 set screw), tyre snaps on, hubcap clicks in. Ears, tail.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/scout.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Scout -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
