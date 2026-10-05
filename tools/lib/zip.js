// Minimal stored (uncompressed) zip writer. MIT.
//
// Small enough to not want a dependency: STLs are already dense binary, so
// deflate buys little, and "stored" keeps this to a few dozen lines. Shared so
// the marketplace serves the same bytes however it is mounted.

const zlib = require('zlib');

function zipOf(files) {
  const chunks = [], central = [];
  let offset = 0;
  const dos = (d) => {
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { time, date };
  };
  for (const { name, data, mtime } of files) {
    const nm = Buffer.from(name, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(data) : crc32(data);
    const { time, date } = dos(mtime || new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    chunks.push(local, nm, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nm.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nm);
    offset += local.length + nm.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, end]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}


module.exports = { zipOf, crc32 };
