#!/usr/bin/env node
// Generates solid-colored 1024x1024 PNG icon files for each environment.
// Uses zero external dependencies — pure Node.js only.
// Run: node scripts/generate-icons.js
//
// Colors:
//   DEV     → deep orange  #e65100 — immediately obvious this is not prod
//   STAGING → amber        #f57f17 — clearly not prod, but calmer
//   PROD    → forest green #1a472a — same as brand color, clean

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

// ── PNG writer ───────────────────────────────────────────────────────────────

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size, r, g, b) {
  // Each scanline: filter_byte(0) + size*3 RGB bytes
  const row = Buffer.allocUnsafe(1 + size * 3);
  row[0] = 0; // filter: None
  for (let x = 0; x < size; x++) { row[1 + x*3] = r; row[2 + x*3] = g; row[3 + x*3] = b; }

  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw, { level: 1 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(filename, size, r, g, b) {
  const filepath = path.join(ASSETS, filename);
  fs.writeFileSync(filepath, makePNG(size, r, g, b));
  console.log(`  created  ${filename}  (${size}x${size}  rgb(${r},${g},${b}))`);
}

// ── Generate icons ───────────────────────────────────────────────────────────

console.log('\nGenerating environment icons...\n');

// DEV — deep orange #e65100
write('icon-dev.png',          1024, 230, 81,   0);
write('adaptive-icon-dev.png', 1024, 230, 81,   0);

// STAGING — amber #f57f17
write('icon-staging.png',          1024, 245, 127, 23);
write('adaptive-icon-staging.png', 1024, 245, 127, 23);

// PROD — forest green #1a472a
write('icon.png',          1024, 26,  71,  42);
write('adaptive-icon.png', 1024, 26,  71,  42);

// Shared splash (green)
write('splash.png', 2048, 26, 71, 42);

console.log('\nDone. Icons are in assets/');
console.log('Tip: replace with branded icons (1024x1024 PNG) before shipping.\n');
