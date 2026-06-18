'use strict';
// ─────────────────────────────────────────────────────────────
// generate-icons.js — pure-Node PWA icon builder
//
// Builds square, maskable app icons from the Riku sprite so the
// downloadable (PWA / TWA) version has a proper logo. No external
// deps — decodes/encodes PNG with the built-in zlib only.
//
//   node tools/generate-icons.js
//
// Outputs to assets/icons/:
//   icon-192.png, icon-512.png  (maskable, opaque brand background)
//   icon-180.png                (apple-touch-icon)
//   favicon-32.png
//   maskable-512.png            (extra safe-zone padding)
// ─────────────────────────────────────────────────────────────
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const SRC    = path.join(ROOT, 'assets/sprites/riku-idle.png');
const OUTDIR = path.join(ROOT, 'assets/icons');

// ── PNG decode (8-bit RGBA, non-interlaced) ──────────────────
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len  = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error('expected 8-bit RGBA');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line   = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur    = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, data: out };
}

// ── PNG encode (8-bit RGBA, filter 0) ────────────────────────
function encodePNG(width, height, data) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  function chunk(type, payload) {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, payload]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Find the opaque bounding box (trim transparent margins) ───
function bbox(img, alphaThresh = 16) {
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > alphaThresh) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w: img.width, h: img.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Sample source (with bilinear) at floating coords; returns RGBA array
function sample(img, fx, fy) {
  fx = Math.max(0, Math.min(img.width - 1, fx));
  fy = Math.max(0, Math.min(img.height - 1, fy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const dx = fx - x0, dy = fy - y0;
  const g = (x, y, c) => img.data[(y * img.width + x) * 4 + c];
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = g(x0, y0, c) * (1 - dx) + g(x1, y0, c) * dx;
    const bot = g(x0, y1, c) * (1 - dx) + g(x1, y1, c) * dx;
    out[c] = top * (1 - dy) + bot * dy;
  }
  return out;
}

// ── Build one icon ───────────────────────────────────────────
//   size      : output px (square)
//   safeFrac  : fraction of the icon the character may occupy (maskable safe zone)
function buildIcon(src, box, size, safeFrac) {
  const data = Buffer.alloc(size * size * 4);

  // Brand radial gradient background (warm gold → deep orange),
  // matching the home-screen PLAY button.
  const cx = size / 2, cy = size / 2, maxR = size * 0.72;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - cx, y - cy) / maxR);
      const r = Math.round(0xFF * (1 - d) + 0xE0 * d);
      const g = Math.round(0xCF * (1 - d) + 0x4A * d);
      const b = Math.round(0x3A * (1 - d) + 0x12 * d);
      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }

  // Fit the character box into the safe area, preserving aspect ratio.
  const target = size * safeFrac;
  const scale  = Math.min(target / box.w, target / box.h);
  const drawW  = box.w * scale, drawH = box.h * scale;
  const offX   = (size - drawW) / 2;
  const offY   = (size - drawH) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < offX || x >= offX + drawW || y < offY || y >= offY + drawH) continue;
      const sx = box.x + (x - offX) / scale;
      const sy = box.y + (y - offY) / scale;
      const [sr, sg, sb, sa] = sample(src, sx, sy);
      if (sa <= 1) continue;
      const a = sa / 255;
      const i = (y * size + x) * 4;
      data[i]     = Math.round(sr * a + data[i]     * (1 - a));
      data[i + 1] = Math.round(sg * a + data[i + 1] * (1 - a));
      data[i + 2] = Math.round(sb * a + data[i + 2] * (1 - a));
      data[i + 3] = 255;
    }
  }
  return encodePNG(size, size, data);
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  const src = decodePNG(fs.readFileSync(SRC));
  const box = bbox(src);
  console.log(`source ${src.width}x${src.height}  char bbox ${box.w}x${box.h} @ ${box.x},${box.y}`);

  const jobs = [
    ['icon-512.png',     512, 0.80],
    ['icon-192.png',     192, 0.80],
    ['maskable-512.png', 512, 0.62],  // extra padding for aggressive masks
    ['icon-180.png',     180, 0.82],  // apple-touch
    ['favicon-32.png',    32, 0.86],
  ];
  for (const [name, size, frac] of jobs) {
    const png = buildIcon(src, box, size, frac);
    fs.writeFileSync(path.join(OUTDIR, name), png);
    console.log(`  wrote ${name}  (${(png.length / 1024).toFixed(1)} KB)`);
  }
  console.log('done.');
}

main();
