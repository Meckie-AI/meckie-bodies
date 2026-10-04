#!/usr/bin/env node
// Add a bogus stl-drift.json entry, for tools/selftest.sh. MIT.
// A drift allowlist that tolerates stale entries is not an allowlist.
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('usage: add-drift-entry.js <bodies/.../part.stl>'); process.exit(2); }
const p = path.resolve(__dirname, '..', '..', 'stl-drift.json');
const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
doc.drift[file] = { kind: 'fixture', note: 'this part actually reproduces fine' };
fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
