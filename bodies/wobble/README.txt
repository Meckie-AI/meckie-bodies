WOBBLE · Meckie body download pack
==================================

A self-balancing two-wheeled friend that rocks and sways while it talks.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Wobble Design Brief.dc.html   Design brief: views, balance check, wiring, BOM, assembly, manifest.
  Wobble Viewer.html            Interactive 3D viewer (views, exploded, x-ray, GLB/OBJ export).
  Wobble Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                          24 print-ready STLs, mm, Z up, in print orientation.
  parts-list.csv                Every part with quantity and a buy link.
  firmware/hangar_bay_wobble.yaml   Peripherals, buses and pins.
  support.js, three-d-stage.js  Needed by the HTML files. Keep everything in one folder.

OPENING THE HTML FILES
  Desktop browser, online. If local files are blocked: python3 -m http.server,
  then open http://localhost:8000

PRINTING
  PETG for the shells, hubs, cradles and trim; CF-nylon for the spine, plates, straps and
  legs; TPU 95A for tyres, feet, bumpers and antenna balls. No supports. Quantities are in
  the file names. Inserts: M2 3.2, M2.5 3.6, M3 4.0 mm bores.

FIT
  From datasheets: N20 gearmotor (12 x 10 gearbox, 3 mm D-shaft, 10 mm), MG90S micro servo
  (tab holes 27.8 apart), GC9A01 39 mm module, XIAO ESP32-S3 Sense, ESP32-S3-DevKitC-1,
  2S pack up to 56 x 30 x 14. The BNO085 and sensor boards are clamped, so any carrier works.
  Print a belly corner with a motor saddle and a wheel hub first.

KICKSTAND
  Each leg pivots on an M3 shoulder screw between two belly lugs. Its short crank passes
  through a wall slot to a Z-bend pushrod from the MG90S. Set the pushrod length so the legs
  lie flat against the body at one end of the servo's travel and touch the floor at the other.

ASSEMBLY ORDER
  1. Inserts into belly, upper shell and spine.
  2. Motors and straps; IMU clamped on the axle line.
  3. Spine into the belly socket (two M3). Boards and battery cradle onto the spine.
  4. Kickstand servo, pushrods, legs.
  5. Display, XIAO, sensors, mics, speaker into the upper shell.
  6. Lower the upper shell over the spine (two M3 at the roof socket), then four M2.5 from below.
  7. Bands, wheels, bumpers, antennae, battery and door.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/wobble.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Wobble -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
