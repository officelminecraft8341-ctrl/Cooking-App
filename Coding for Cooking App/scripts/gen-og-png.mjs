// Generates public/og-image.png (1200x630) with zero dependencies.
// Branded gradient + soft radial glow; text-free (text lives in og:title /
// og:description). Recompute-with-text can come later if wanted.
import fs from 'node:fs';
import zlib from 'node:zlib';

const W = 1200, H = 630;
// RGB rows with per-pixel filter byte 0
const raw = Buffer.alloc(H * (1 + W * 3));
const hex = (r, g, b) => [r, g, b];
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
// gradient stops (diagonal): #0f172a -> #1e293b -> #7c2d12
const stops = [[15, 23, 42], [30, 41, 59], [124, 45, 18]];
function colorAt(t) {
  const x = t * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  return hex(lerp(stops[i][0], stops[i + 1][0], f), lerp(stops[i][1], stops[i + 1][1], f), lerp(stops[i][2], stops[i + 1][2], f));
}
// radial glow top-left in ember
for (let y = 0; y < H; y += 1) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2;
    let [r, g, b] = colorAt(t);
    // radial ember glow centered (18%, 22%)
    const dx = (x / W - 0.18), dy = (y / H - 0.22);
    const d = Math.sqrt(dx * dx + dy * dy);
    const glow = Math.max(0, 1 - d / 0.55) ** 2 * 0.55;
    r = Math.min(255, Math.round(r + 200 * glow));
    g = Math.min(255, Math.round(g + 90 * glow));
    b = Math.min(255, Math.round(b + 10 * glow));
    // subtle vignette
    const vx = x / W - 0.5, vy = y / H - 0.5;
    const vig = 1 - Math.min(1, Math.sqrt(vx * vx + vy * vy) / 0.9) * 0.25;
    const off = rowStart + 1 + x * 3;
    raw[off] = Math.round(r * vig); raw[off + 1] = Math.round(g * vig); raw[off + 2] = Math.round(b * vig);
  }
}
const idat = zlib.deflateSync(raw, { level: 9 });
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc ^ -1;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync('public/og-image.png', png);
console.log('public/og-image.png', (png.length / 1024).toFixed(1) + 'kb');
