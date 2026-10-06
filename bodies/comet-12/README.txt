COMET-12 · Meckie body download pack
=====================================

A compact companion quadruped with wheel feet that skate-walk at human pace.
About 1,780 g with the 2200 mAh pack, about $684 in parts.
Everything screws into heat-set inserts or snaps together. No glue anywhere.

WHAT'S IN HERE
  COMET-12 Design Brief.dc.html   Design brief: views, linkage, load check, wiring, BOM, assembly, safety, manifest.
  COMET-12 Viewer.html            Interactive 3D viewer (concept geometry; print parts are the source of truth).
  COMET-12 Print Parts.html       Print-part generator: preview every part, re-export STLs.
  stl/                            40 print-ready STLs, mm, Z up. _A/_B and _R/_L are mirrored pairs.
  parts-list.csv                  Parts with quantity and a buy link.
  firmware/hangar_bay_comet_12.yaml   Peripherals, buses, pins, servo IDs, joint limits.
  hangar-bay/comet-12.template.yaml   Known Hangar Bay template for this design.
  support.js, three-d-stage.js    Needed by the HTML files. Keep everything in one folder.

LEGS
  Each leg: abduction servo in a cradle under the deck, hip-pitch and knee servos stacked in
  the hip bracket. The knee is driven by an 18 mm crank and pushrod to a 23 mm shin horn.
  Leg parts by position:
    abd_cradle, hip_bracket:  _A = front-right + rear-left, _B = front-left + rear-right
    thigh_outer, thigh_inner, shin:  _R = right legs, _L = left legs
  Pushrods: front 149.5 mm, rear 129.2 mm centre to centre.

PRINTING
  PLA for brackets, cradles, thighs, shins, cranks, deck and mounts; PLA for shell,
  pods, hatch, cartridge and trim; TPU 95A for the foot bumpers. No supports.
  Inserts: M2 3.2, M2.5 3.6, M3 4.0, M4 5.6 mm bores.

JOINT RANGES (collision sweep of these parts)
  Abduction +/-12, hip pitch +/-20, knee +/-30 degrees from stance. Rear legs: keep thigh and
  knee bent the same way together under about 40 degrees.

HANGAR BAY (choose your body, flash, go)
  hangar-bay/comet-12.template.yaml is the known Hangar Bay template for this design.
  In Meckie OS: Hangar Bay -> Add body -> COMET-12 -> Flash -> Calibrate -> Pair.
  Changed the design? Use Hangar Bay's builder instead.

BUYING PARTS
  parts-list.csv links one good option for each part. This is a convenience: source your own
  parts anywhere, as long as they match the spec in the brief.

License: hardware CERN-OHL-S-2.0, code MIT (see LICENSE.txt).
Design files are provided as-is; build at your own risk.
