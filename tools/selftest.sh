#!/usr/bin/env bash
# Prove the gates can fail. A check that cannot fail is not a check.
#
# Each case breaks one thing, asserts validate.js catches it with the expected
# message, then restores from git. Run on a clean tree.
set -u
cd "$(dirname "$0")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "selftest needs a clean tree (it restores fixtures with git checkout)" >&2
  exit 1
fi
if [ -n "$(git ls-files --others --exclude-standard -- bodies/)" ]; then
  echo "selftest needs bodies/ free of untracked files; it removes them when restoring" >&2
  git ls-files --others --exclude-standard -- bodies/ >&2
  exit 1
fi

# git checkout restores tracked files but leaves anything a fixture created
# (the rename case makes a new file). Clear only untracked files under bodies/,
# which the guard above proved were absent to begin with.
restore() {
  git checkout -- . 2>/dev/null
  git ls-files --others --exclude-standard -- bodies/ | while IFS= read -r f; do rm -f "$f"; done
}

pass=0; fail=0

try() {           # try <name> <expected substring> <command...>
  local name="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1
  local out; out="$(node tools/validate.js 2>&1)"
  restore
  if printf '%s' "$out" | grep -qF -- "$want"; then
    printf '  ok    %s\n' "$name"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n       expected to see: %s\n' "$name" "$want"; fail=$((fail+1))
  fi
}

# A gate that only fires on broken input is useless if it also fires on good
# input, so establish the baseline first. rover-lite's GPIO 21 collision is a
# known open item, so one failure is expected here until that is resolved.
echo "baseline:"
base="$(node tools/validate.js 2>&1 | grep -c '^  x ' || true)"
printf '  clean tree reports %s problem(s)\n\n' "$base"

echo "negative cases:"

try "invalid YAML in a template" "will not parse" \
  perl -i -pe 's/writes: "servos\[\]\.offset_deg"/writes: servos[].offset_deg/' bodies/dial/hangar-bay/dial.template.yaml

try "tampered manifest (hash mismatch)" "hardware_sha256 does not match" \
  perl -i -pe 's/timeout_ms: 500/timeout_ms: 400/' bodies/dial/firmware/hangar_bay_dial.yaml

try "embedded block drifts from firmware/" "differs from firmware" \
  perl -i -pe 's/doctrine: thin-client/doctrine: thin_client/ if $. < 45' bodies/scout/hangar-bay/scout.template.yaml

try "safety_test made optional" "safety_test must be required" \
  perl -i -pe 's/(step: safety_test.*)required: true/${1}required: false/' bodies/wobble/hangar-bay/wobble.template.yaml

try "resume relaxed from fresh_command_only" "must be fresh_command_only" \
  perl -i -pe 's/resume:   fresh_command_only/resume:   auto/' bodies/lamp/firmware/hangar_bay_lamp.yaml

try "drop-off sensor dropped from a driving body" "needs a drop-off sensor front and rear" \
  perl -i -pe 's/, role: drop_off//g' bodies/scout/firmware/hangar_bay_scout.yaml

try "drop sensor no longer wired to the edge reflex" "edge reflex does not use it" \
  perl -i -pe 's/sensors: \[drop_front, drop_rear\], drop_mm: 25, action: \[brake/sensors: [drop_front], drop_mm: 25, action: [brake/' bodies/scout/firmware/hangar_bay_scout.yaml

try "reflex points at an undeclared sensor" "referenced but never declared" \
  perl -i -pe 's/sensor: lidar_fwd, stop_mm: 80/sensor: lidar_nope, stop_mm: 80/' bodies/scout/firmware/hangar_bay_scout.yaml

try "two signals on one GPIO" "assigned to 2 signals" \
  perl -i -pe 's/int: 7, rst: 6, location: hips/int: 7, rst: 7, location: hips/' bodies/biped-mini/firmware/hangar_bay_biped_mini.yaml

try "duplicate servo IDs on a bus" "duplicate servo IDs" \
  perl -i -pe 's/\{ id: 3, name: j3_pitch/{ id: 2, name: j3_pitch/' bodies/inchworm/firmware/hangar_bay_inchworm.yaml

try "a joint assembled with glue" "specifies an adhesive" \
  perl -i -pe "s/m: 'Clamp', bg: aP, d: 'Each N20 sits on a saddle/m: 'Clamp', bg: aP, d: 'Each N20 is held with epoxy on a saddle/" "bodies/scout/Scout Design Brief.dc.html"

try "glue used as the joint method" "unknown: glue" \
  perl -i -pe "s/m: 'Screw', bg: aS, d: 'D-bore hub/m: 'Glue', bg: aS, d: 'D-bore hub/" "bodies/scout/Scout Design Brief.dc.html"

try "a fake domain in body.pack" "reserved domain" \
  perl -i -pe 's{pack: unpublished.*}{pack: https://bodies.meckie.example/dial}' bodies/dial/hangar-bay/dial.template.yaml

try "affiliate tag on a supplier link" "tracking tag" \
  perl -i -pe 's{(amazon\.com/dp/B0C69FFVHH)}{$1?tag=meckie-20}' bodies/scout/parts-list.csv

try "a supplier link removed" "has no link" \
  perl -i -pe 's{"https://www\.adafruit\.com/search\?q=LSM6DSOX"}{""}' bodies/scout/parts-list.csv

try "catalog STL count drifts from the folder" "bodies.json says" \
  perl -i -pe 's/"stl": 19,/"stl": 18,/' bodies.json

try "a pack runtime file diverges from shared/" "differs from shared" \
  perl -i -pe 's/^/\/\/ local edit\n/ if $. == 1' bodies/lamp/support.js

try "stale generated JSON" "is stale" \
  perl -i -pe 's/heartbeat_hz: 10/heartbeat_hz: 9/' bodies/wobble/firmware/hangar_bay_wobble.yaml

try "target key that is not an mcu key" "is not an mcu key" \
  perl -i -pe 's/^  head_cam:/  head_nope:/' bodies/lamp/hangar-bay/lamp.template.yaml

# --- mesh fixtures, built in Node so the bytes are valid STL -----------------
try "a hole punched in a mesh" "not watertight" \
  node tools/fixtures/break-mesh.js hole bodies/dial/stl/dial-yoke-x1.stl

try "zero-area triangles reintroduced" "zero-area triangle" \
  node tools/fixtures/break-mesh.js degenerate bodies/dial/stl/dial-yoke-x1.stl

try "a new non-manifold file (not on the allowlist)" "shared by more than two" \
  node tools/fixtures/break-mesh.js nonmanifold bodies/dial/stl/dial-yoke-x1.stl

try "an allowlisted file gets worse" "allowlist permits" \
  node tools/fixtures/break-mesh.js nonmanifold bodies/scout/stl/scout-face_bezel-x1.stl

try "a part grown past the print bed" "exceeds the" \
  node tools/fixtures/break-mesh.js oversize bodies/dial/stl/dial-yoke-x1.stl

try "a mesh split into two shells" "separate shells" \
  node tools/fixtures/break-mesh.js twoshells bodies/dial/stl/dial-yoke-x1.stl

try "an allowlist entry for a part that is gone" "no longer exists" \
  node tools/fixtures/break-mesh.js rename bodies/scout/stl/scout-face_bezel-x1.stl

echo
if [ "$fail" -gt 0 ]; then
  echo "$fail of $((pass+fail)) gates did NOT fire. A gate that cannot fail is not a gate."
  exit 1
fi
echo "all $pass gates fire on broken input"
