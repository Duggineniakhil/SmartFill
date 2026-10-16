// Packages the runnable extension into public/SmartFill.zip, the file the
// landing page's "Download extension" button serves. Only files the browser
// loads are included (no .ts sources, source maps or the stale dist/ folder).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = "extension";
const OUT = "public/SmartFill.zip";
const INCLUDE = [/^manifest\.json$/, /^background\/.*\.js$/, /^content\/.*\.js$/, /^popup\/.*\.(html|css|js)$/, /^icons\/.*\.png$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(ROOT)
  .map((path) => relative(ROOT, path).split(sep).join("/"))
  .filter((name) => INCLUDE.some((re) => re.test(name)))
  .sort();

// Minimal ZIP writer (deflate, no extra fields), enough for Chrome's "Load unpacked".
const local = [];
const central = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(join(ROOT, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt32LE(0, 10); // dos time/date
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  local.push(header, nameBuf, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(0, 12);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBuf.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBuf);

  offset += header.length + nameBuf.length + packed.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(OUT, Buffer.concat([...local, centralBuf, end]));
console.log(`wrote ${OUT} (${files.length} files)`);
