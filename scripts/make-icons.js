// Draws the Fire Sale flame icon as PNGs with no image library: node scripts/make-icons.js
// Output: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const BG = [178, 58, 18];
const FG = [255, 247, 237];
const out = join(import.meta.dirname, "..", "public", "icons");
mkdirSync(out, { recursive: true });

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Teardrop: a circle plus a cone up to the apex. Coordinates are in -1..1, y grows downward.
const inDrop = (x, y, cx, cy, r, apex) => {
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  const d = cy - apex;
  const tangentY = apex + (d * d - r * r) / d;
  if (y < apex || y > tangentY) return false;
  return Math.abs(x - cx) <= ((y - apex) * r) / Math.sqrt(d * d - r * r);
};

function png(size, scale) {
  const rows = [];
  const S = 4;
  for (let py = 0; py < size; py++) {
    const row = [0];
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (((px + (sx + 0.5) / S) / size) * 2 - 1) / scale;
          const y = (((py + (sy + 0.5) / S) / size) * 2 - 1) / scale;
          const outer = inDrop(x, y, 0, 0.28, 0.5, -0.78);
          const inner = inDrop(x, y, 0, 0.45, 0.24, -0.05);
          if (outer && !inner) hit++;
        }
      }
      const a = hit / (S * S);
      for (let i = 0; i < 3; i++) row.push(Math.round(BG[i] * (1 - a) + FG[i] * a));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, "icon-192.png"), png(192, 0.85));
writeFileSync(join(out, "icon-512.png"), png(512, 0.85));
writeFileSync(join(out, "icon-maskable-512.png"), png(512, 0.6));
writeFileSync(join(out, "apple-touch-icon.png"), png(180, 0.75));
console.log("icons written to public/icons/");
