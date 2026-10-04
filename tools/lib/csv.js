// Minimal RFC 4180 parser. MIT.
//
// A regex will not do: several parts rows carry an escaped quote inside a cell
// (e.g. "1.28"" GC9A01 round display, 240x240"), and matching "([^"]*)"
// globally splits that row into the wrong cells - which looks exactly like a
// missing supplier link.

function parse(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, i = 0;
  const s = text.replace(/\r\n/g, '\n');

  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim() !== '');
}

function records(text) {
  const rows = parse(text);
  const header = rows[0].map(h => h.trim());
  return {
    header,
    rows: rows.slice(1).map((r, i) => {
      const o = { _line: i + 2 };
      header.forEach((h, k) => { o[h] = r[k] === undefined ? '' : r[k]; });
      return o;
    }),
  };
}

module.exports = { parse, records };
