DIAL · Meckie body download pack
=====================================

A shelf or desk Meckie with a pan/tilt head shaped like a 1950s portable TV.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Dial Design Brief.dc.html   Full design brief: views, mechanism, wiring, load check,
                                  BOM, assembly, print settings, safety reflex, manifest.
  Dial Viewer.html            Interactive 3D viewer (views, exploded, x-ray, GLB/OBJ export).
  Dial Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                            32 print-ready STLs, mm, Z up, in print orientation.
  parts-list.csv                  Every part with quantity and a buy link.
  firmware/hangar_bay_dial.yaml   Peripherals, buses and pins for firmware generation.
  support.js, three-d-stage.js    Needed by the HTML files. Keep everything in one folder.

OPENING THE HTML FILES
  Open them in a desktop browser (Chrome, Edge, Firefox, Safari) while online; the 3D
  files load three.js from a CDN. If a browser blocks local files, serve the folder:
  python3 -m http.server, then open http://localhost:8000

PRINTING
  Materials: PETG for shells and trim, CF-nylon for structure, TPU 95A for the foot and strap.
  Each STL is in its print orientation except: swivel tier (flip top face to the bed)
  and yoke (lay it on its back). No supports needed. Quantities are in the file names (-x2).
  Insert bores: M2 3.2 mm, M2.5 3.6 mm, M3 4.0 mm, M4 5.6 mm, M5 6.4 mm, standard short
  brass heat-set inserts. Chrome parts: gloss black, chrome-effect spray, gloss clear.

TEST-FIT FIRST
  Print the base pan rim, one cabinet corner and the pan servo sleeve first to check your
  printer's hole tolerance. Interfaces are set from datasheets: STS3215 45.2 x 24.7 x 35
  (held in clamp sleeves), 25T metal disc horn with 4x M3 on a 14 mm circle, 2.8" ST7789
  glass 69.2 x 50 (active 57.6 x 43.2), Pi Zero 58 x 23, Camera Module 3 21 x 12.5,
  6810 bearing 50 x 65 x 7. Bus adapter and charger screw to the 10 mm insert grid.

TILT SERVO NOTE
  The tilt servo passes through the chassis window: clamp sleeve on the chassis rear face,
  stop strap on the front face. The cap at the back of the sleeve sets how far forward the
  servo sits. Measure your servo: the spline centre must end up 6 mm in front of the
  cabinet seam. Add flat shims (printed or washers) between the cap and the servo's rear
  end until it does. Shims of 0 to 3.8 mm are possible, which covers servos whose spline
  centre is 10.2 to 14.0 mm from the front end of the case. Check yours before printing.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/dial.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Dial -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

Not affiliated with any store. License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
