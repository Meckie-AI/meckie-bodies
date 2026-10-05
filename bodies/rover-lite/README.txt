ROVER LITE · Meckie body download pack
======================================

A fully printed small tracked explorer, the desk-sized cousin of the full Rover.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Rover Lite Design Brief.dc.html   Design brief: views, wiring, BOM, assembly, safety reflex, manifest.
  Rover Lite Viewer.html            Interactive 3D viewer (views, exploded, x-ray, GLB/OBJ export).
  Rover Lite Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                              29 print-ready STLs, mm, Z up, in print orientation.
  parts-list.csv                    Every part with quantity and a buy link.
  firmware/hangar_bay_rover_lite.yaml   Peripherals, buses and pins.
  support.js, three-d-stage.js      Needed by the HTML files. Keep everything in one folder.

OPENING THE HTML FILES
  Desktop browser, online (three.js loads from a CDN). If local files are blocked:
  python3 -m http.server, then open http://localhost:8000

PRINTING
  PLA for hull, deck, fenders, drum, trim, frames, wheels, sprockets,
  turntable, yoke and trays; black TPU 95A for the tracks. No supports. Quantities are in the
  file names (-x6 road wheels). Exceptions to "as exported": flip the deck lid top face down,
  lay the yoke on its back. Inserts: M2 3.2, M2.5 3.6, M3 4.0, M5 6.4 mm bores.

FIT
  From datasheets: STS3215 45.2 x 24.7 x 35, 25T metal horn (4x M3 on 14 mm), 6806 bearing
  30 x 42 x 7, 683ZZ 3 x 7 x 3, N20 3 mm D-shaft, GC9A01 39 mm module, Camera Module 3,
  3S pack up to 72 x 34 x 22. Track: 64 pads at 6.86 mm; the idler slides +/-3 mm on a
  jack screw to set tension. Print one road wheel, a sprocket and the track first.

TILT SERVO
  The servo sits in the sleeve on the left drum cap. Its spline must land on the drum axis:
  measure your servo and add flat shims at the end of the sleeve until it does.

PAN SERVO
  The pan servo stands on the hull floor in a U-frame with 4 mm of travel along its length.
  Its spline must land on the bearing axis: slide it until the turntable spigot drops freely
  into the 6806, then fill the gap to the end wall with flat printed shims. The deck pads
  clamp it down by about 0.2 mm when the deck is screwed on.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/rover-lite.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Rover Lite -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
