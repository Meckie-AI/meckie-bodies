INCHWORM · Meckie body download pack
====================================

A desk-mounted serpentine critter that stretches, peeks and bows down to rest.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  Inchworm Design Brief.dc.html   Design brief: views, torque + tip check, wiring, BOM, assembly.
  Inchworm Viewer.html            Interactive 3D viewer.
  Inchworm Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                            37 print-ready STLs, mm, Z up.
  parts-list.csv                  Parts with quantity and a buy link.
  firmware/hangar_bay_inchworm.yaml   Peripherals, buses, pins and joint limits.
  support.js, three-d-stage.js    Needed by the HTML files. Keep everything in one folder.

PRINTING
  CF-nylon for the five frames, base floor/tower, tray and caps; PETG for shells, head,
  dome and trim; TPU 95A for the foot and prolegs; natural (translucent) PETG for the glow ribs,
  base glow ring and antenna tips (100% infill for an even glow). No supports.
  Inserts: M2 3.2, M2.5 3.6, M3 4.0, M4 5.6 mm bores. Steel disc Ø160 x 6 is laser-cut
  with 4x M4 tapped holes at R62.

JOINTS
  Every link frame is a U-bracket around the previous servo plus a sleeve for the next.
  Horn side: 4x M3 on 14 mm. Idler side: 685ZZ in the ear, M5 shoulder bolt, nyloc nut.
  Shim each servo along its length so its spline sits on the joint axis.

JOINT RANGES (from a collision sweep of these parts)
  J1 -50 to 95 deg, J2-J5 about -85 to 35 deg. The firmware file uses these with a margin.
  The plump shells mean it bows down to rest rather than coiling into a spiral.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/inchworm.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> Inchworm -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
