BIPED MINI · Meckie body download pack
======================================

A small two-legged walker that waddles, dances and waves. About 284 mm tall, about 1.16 kg.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Biped Mini Design Brief.dc.html   Design brief: views, torque + stability check, wiring, BOM, assembly.
  Biped Mini Viewer.html            Interactive 3D viewer (concept geometry).
  Biped Mini Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                              37 print-ready STLs, mm, Z up. Leg parts come as _R and _L.
  parts-list.csv                    Parts with quantity and a buy link.
  firmware/hangar_bay_biped_mini.yaml   Peripherals, two servo buses, pins and joint limits.
  support.js, three-d-stage.js      Needed by the HTML files. Keep everything in one folder.

SERVOS
  Pitch joints (hip pitch, knee, ankle pitch): 6x Feetech STS3215 on the 12 V bus.
  Roll joints (hip roll, ankle roll): 4x Feetech STS3032 on a separate 6 V bus (own buck,
  own bus adapter, UART2). Never connect an STS3032 to the 12 V bus.

PRINTING
  CF-nylon for brackets, thighs, shin plates, pelvis, skid, ring and tray; PETG for feet,
  torso, head and trim; TPU 95A for soles, belt, skid shoe and mitts. No supports.
  Inserts: M2 3.2, M2.5 3.6, M3 4.0, M5 6.4 mm bores.

JOINTS
  Every servo slides into a sleeve and is shimmed so its spline sits on the joint axis,
  then a cap closes the sleeve. Pitch idlers: 685ZZ + M5 shoulder bolt + nyloc nut.
  Roll idlers: 683ZZ + M3 shoulder screw + nut. The STS3032 spline position is not
  published, so its pockets have 3 mm of shim room: measure yours first.

JOINT RANGES (collision sweep of these parts)
  Hip roll +/-12, hip pitch -90 to +15, knee 0 to 120, ankle pitch +/-20 (+/-30 with the
  knee bent past 40), ankle roll +/-12 degrees. Sit pose: hips 66, knees 100, ankles 15.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/biped-mini.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Biped Mini -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
