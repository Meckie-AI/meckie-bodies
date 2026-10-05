LAMP · Meckie body download pack
================================

An articulated desk-lamp companion that leans in, nods and peeks around objects.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Lamp Design Brief.dc.html   Design brief: views, spring balance, tip check, wiring, BOM, assembly.
  Lamp Viewer.html            Interactive 3D viewer.
  Lamp Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                        26 print-ready STLs, mm, Z up.
  parts-list.csv              Every part with quantity and a buy link.
  firmware/hangar_bay_lamp.yaml   Peripherals, buses and pins.
  support.js, three-d-stage.js    Needed by the HTML files. Keep everything in one folder.

PRINTING
  PLA for base shell, pod, knuckle, hood, trim, floor, tray, turret, arm rails and
  cranks; white PLA liner; translucent PLA diffuser; TPU 95A foot.
  No supports. Inserts: M2 3.2, M2.5 3.6, M3 4.0, M4 5.6, M5 6.4 mm bores.
  Steel ballast ring Ø150 / Ø90 x 14 mm (about 1.24 kg) is laser-cut with 4x M4 tapped holes at R62 and
  4x 9 mm clearance holes at R55 for the tray standoffs.

SERVO ALIGNMENT
  All four STS3215s sit in sleeves or frames with a little travel along their length.
  Measure where your servo's spline sits and add flat printed shims so each spline lands
  on its axis: yaw on the bearing, shoulder and elbow drive on the pod axis, tilt on the
  knuckle axis.

FIT
  From datasheets: STS3215 45.2 x 24.7 x 35, 25T metal horn (4x M3 on 14 mm), 6810, 6802,
  685ZZ, GC9A01 39 mm module, XIAO ESP32-S3 Sense, Pi Zero 2 W. Print the turret and one
  pod half first and seat a servo and the bearing.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/lamp.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Lamp -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
