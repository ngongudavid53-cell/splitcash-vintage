// scripts/gen-assets.mjs
//
// Regenerates Common Pot's raster brand assets from the pot glyph, in pure
// Node (zlib only — no dependencies):
//
//   public/og.png         1200x630  Open Graph / Twitter share card
//   public/icon-180.png    180x180  apple-touch-icon
//   public/icon-192.png    192x192  PWA icon
//   public/icon-512.png    512x512  PWA icon
//
// Run:  node scripts/gen-assets.mjs          (write + verify; warn on failure)
//       node scripts/gen-assets.mjs --strict (exit non-zero if verification fails)
//       node scripts/gen-assets.mjs --selftest (in-memory round trip only)
//
// IMPORTANT: multi-byte integers are written with direct byte assignment
// (writeU32 / readU32 helpers), never Buffer.writeUInt32BE/readUInt32BE.
// Some sandboxes ship an emulated Node whose Buffer.writeUInt32BE silently
// writes zeros, which corrupts every PNG chunk length. Byte assignment is
// plain typed-array arithmetic and works everywhere.
//
// Every asset is verified TWICE:
//   1. in memory — the freshly encoded buffer is decoded and pixel-sampled;
//      this proves the encoder/rasterizer are correct with no disk involved.
//   2. on disk — the written file is read back and checked the same way.
//
// The glyph is hand-rendered from the same shapes as public/icon.svg
// (viewBox 0 0 512 512), rasterized with soft (1px) anti-aliased edges.

import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");
mkdirSync(outDir, { recursive: true });

const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--selftest");

// ---------------------------------------------------------------------------
// Byte-level integer helpers (immune to emulated-Buffer method bugs)
// ---------------------------------------------------------------------------
function writeU32(buf, offset, value) {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function readU32(buf, offset) {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>>
    0
  );
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit, filter 0)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  writeU32(out, 0, data.length);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  writeU32(out, 8 + data.length, crc32(Buffer.concat([Buffer.from(type, "ascii"), data])));
  return out;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Tiny rasterizer
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PAPER = [245, 237, 218]; // #f5edda
const INK = [56, 43, 29]; // #382b1d
const BURNT = [138, 58, 37]; // #8a3a25 (the coins)
const TAPE = [221, 207, 164]; // muted tape tan

/** Blend a colour over one pixel. `cov` is 0..1 coverage. */
function blendPx(rgba, x, y, w, [r, g, b], cov) {
  if (cov <= 0 || x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  const inv = 1 - cov;
  rgba[i] = Math.round(r * cov + rgba[i] * inv);
  rgba[i + 1] = Math.round(g * cov + rgba[i + 1] * inv);
  rgba[i + 2] = Math.round(b * cov + rgba[i + 2] * inv);
  // keep alpha opaque
}

/**
 * Render one asset.
 * @param {number} w canvas width
 * @param {number} h canvas height
 * @param {number} s  viewBox -> canvas scale
 * @param {number} cx canvas x of viewBox 256
 * @param {number} cy canvas y of viewBox 256
 * @param {boolean} tapes draw the torn-paper tape corners (share card)
 */
function render(w, h, s, cx, cy, tapes) {
  const rgba = Buffer.alloc(w * h * 4);
  // paper background
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = PAPER[0];
    rgba[i + 1] = PAPER[1];
    rgba[i + 2] = PAPER[2];
    rgba[i + 3] = 255;
  }

  const strokeHw = 12 * s; // the icon uses 24-wide strokes
  const frameHw = 7 * s; // the rounded frame is 14-wide, at 18% ink

  const tapesList = tapes
    ? [
        { tx: 100, ty: 26, ang: -12, tw: 66, th: 30 },
        { tx: 412, ty: 26, ang: 12, tw: 66, th: 30 },
      ]
    : [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // canvas -> viewBox coords
      const vx = (x - cx) / s + 256;
      const vy = (y - cy) / s + 256;

      // --- pot bowl: half-width 118 at y=214 tapering to 0 at y=404 ---
      let strokeCov = 0;
      if (vy >= 214 && vy <= 404) {
        const hw = 118 * Math.pow((404 - vy) / 190, 2);
        const dPx = Math.abs(Math.abs(vx - 256) - hw) * s;
        strokeCov = Math.max(strokeCov, clamp(strokeHw + 0.5 - dPx, 0, 1));
      }

      // --- top opening arc: y 92..214, elliptical ---
      if (vy >= 92 && vy <= 214) {
        const t = (214 - vy) / 122;
        const hw = 118 * Math.sqrt(Math.max(0, 1 - t * t));
        const dPx = Math.abs(Math.abs(vx - 256) - hw) * s;
        strokeCov = Math.max(strokeCov, clamp(strokeHw + 0.5 - dPx, 0, 1));
      }

      // --- rim line: y=214, x 96..416 ---
      if (vx >= 96 && vx <= 416) {
        const dPx = Math.abs(vy - 214) * s;
        strokeCov = Math.max(strokeCov, clamp(strokeHw + 0.5 - dPx, 0, 1));
      }

      // --- rounded-rect frame (viewBox 512, corner radius 92) ---
      const qx = Math.abs(vx - 256) - (256 - 92);
      const qy = Math.abs(vy - 256) - (256 - 92);
      const dRect =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        92;
      const frameCov = clamp(frameHw + 0.5 - Math.abs(dRect) * s, 0, 1);

      if (strokeCov > 0) blendPx(rgba, x, y, w, INK, strokeCov);
      if (frameCov > 0) blendPx(rgba, x, y, w, INK, frameCov * 0.18);

      // --- coins (filled circles) ---
      for (const [cxp, cyp] of [
        [198, 300],
        [256, 330],
        [314, 300],
      ]) {
        const dPx = Math.hypot((vx - cxp) * s, (vy - cyp) * s);
        const cov = clamp(17 * s + 0.5 - dPx, 0, 1);
        if (cov > 0) blendPx(rgba, x, y, w, BURNT, cov);
      }

      // --- tape corners (share card only) ---
      for (const tape of tapesList) {
        const rad = (tape.ang * Math.PI) / 180;
        const cosA = Math.cos(-rad);
        const sinA = Math.sin(-rad);
        const lx = (vx - tape.tx) * cosA - (vy - tape.ty) * sinA;
        const ly = (vx - tape.tx) * sinA + (vy - tape.ty) * cosA;
        const dx = Math.abs(lx) - tape.tw / 2;
        const dy = Math.abs(ly) - tape.th / 2;
        const d =
          Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
          Math.min(Math.max(dx, dy), 0);
        const cov = clamp(0.5 - d * s, 0, 1);
        if (cov > 0) blendPx(rgba, x, y, w, TAPE, cov * 0.9);
      }
    }
  }
  return encodePng(w, h, rgba);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
function decodePng(buffer) {
  let off = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (off < buffer.length) {
    const len = readU32(buffer, off);
    const type = buffer.toString("ascii", off + 4, off + 8);
    const data = buffer.slice(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    off += 12 + len;
  }
  return { width, height, raw: inflateSync(Buffer.concat(idat)) };
}

/**
 * Read one RGBA pixel from the inflated scanlines. The raw buffer holds one
 * filter byte per row before the row's pixels, so a row starts at
 * y * (stride + 1) + 1.
 */
function sample(raw, stride, x, y) {
  const i = y * (stride + 1) + 1 + x * 4;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

function closeTo(actual, expected, tol = 60) {
  return (
    actual.length === expected.length &&
    actual.every((v, i) => Math.abs(v - expected[i]) <= tol)
  );
}

/** Returns a list of problem strings (empty = ok). */
function checkPng(buffer, w, h, samples) {
  const problems = [];
  let width = 0;
  let height = 0;
  let raw = null;
  try {
    ({ width, height, raw } = decodePng(buffer));
  } catch (err) {
    return [`could not decode: ${err && err.message}`];
  }
  const stride = width * 4;
  if (width !== w || height !== h) {
    problems.push(`size mismatch: expected ${w}x${h}, got ${width}x${height}`);
  }
  if (raw.length !== height * (stride + 1)) {
    problems.push(
      `scanline length mismatch: expected ${height * (stride + 1)}, got ${raw.length}`,
    );
  }
  for (const [name, x, y, expected] of samples) {
    const px = sample(raw, stride, x, y);
    if (!closeTo(px, expected)) {
      problems.push(`${name} at (${x},${y}) = [${px}] — expected ~[${expected}]`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------
// The pot glyph spans viewBox x 96..416 (320 wide) and y 92..404 (312 tall),
// exactly like public/icon.svg. For square icons we fill the canvas with it:
// scale = size / 320, centred. Sample points:
//  - paper: a quiet corner
//  - stroke: the bowl's left wall at viewBox (184.4, 256)
//  - coin: the top-left coin at viewBox (198, 300)
//  - tape: a tape corner at viewBox (100, 26) — share card only
const toCanvas = (s, cx, cy) => (vx, vy) => [
  Math.round(cx + (vx - 256) * s),
  Math.round(cy + (vy - 256) * s),
];

const iconAt = (size) => {
  const s = size / 320;
  const c = Math.round(size / 2);
  return { s, cx: c, cy: c, map: toCanvas(s, c, c) };
};

const ogMap = toCanvas(1.24, 600, 316);
const ic180 = iconAt(180);
const ic192 = iconAt(192);
const ic512 = iconAt(512);

const assets = [
  {
    file: "og.png",
    w: 1200,
    h: 630,
    s: 1.24,
    cx: 600,
    cy: 316, // glyph sits slightly below the vertical centre of the card
    tapes: true,
    samples: [
      ["paper corner", 5, 5, PAPER],
      ["bowl stroke", ...ogMap(184.4, 256), INK],
      ["coin", ...ogMap(198, 300), BURNT],
      ["tape corner", ...ogMap(100, 26), TAPE],
    ],
  },
  {
    file: "icon-180.png",
    w: 180,
    h: 180,
    ...ic180,
    tapes: false,
    samples: [
      ["paper corner", 3, 3, PAPER],
      ["bowl stroke", ...ic180.map(184.4, 256), INK],
      ["coin", ...ic180.map(198, 300), BURNT],
    ],
  },
  {
    file: "icon-192.png",
    w: 192,
    h: 192,
    ...ic192,
    tapes: false,
    samples: [
      ["paper corner", 3, 3, PAPER],
      ["bowl stroke", ...ic192.map(184.4, 256), INK],
      ["coin", ...ic192.map(198, 300), BURNT],
    ],
  },
  {
    file: "icon-512.png",
    w: 512,
    h: 512,
    ...ic512,
    tapes: false,
    samples: [
      ["paper corner", 6, 6, PAPER],
      ["bowl stroke", ...ic512.map(184.4, 256), INK],
      ["coin", ...ic512.map(198, 300), BURNT],
    ],
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
let failed = false;

if (SELF_TEST) {
  console.log("self-test: in-memory encode -> decode -> pixel check (no disk writes)…");
  for (const a of assets) {
    const png = render(a.w, a.h, a.s, a.cx, a.cy, a.tapes);
    const problems = checkPng(png, a.w, a.h, a.samples);
    if (problems.length) {
      failed = true;
      for (const p of problems) console.error(`  FAIL ${a.file}: ${p}`);
    } else {
      console.log(`  ok ${a.file} (${a.w}x${a.h}, ${(png.length / 1024).toFixed(1)} KB)`);
    }
  }
  console.log(failed ? "✗ self-test failed" : "✓ self-test passed");
  process.exit(failed ? 1 : 0);
}

console.log("generating + writing assets…");
for (const a of assets) {
  const png = render(a.w, a.h, a.s, a.cx, a.cy, a.tapes);
  writeFileSync(join(outDir, a.file), png);
  const mem = checkPng(png, a.w, a.h, a.samples);
  console.log(`  ${mem.length ? "✗" : "ok"} ${a.file} (memory: ${mem.length ? mem.join("; ") : "valid"})`);
  if (mem.length) {
    failed = true;
    for (const p of mem) console.error(`    memory check failed: ${p}`);
  }
}

console.log("verifying on-disk read-back…");
for (const a of assets) {
  try {
    const buffer = readFileSync(join(outDir, a.file));
    const disk = checkPng(buffer, a.w, a.h, a.samples);
    if (disk.length) {
      console.error(`  ✗ ${a.file} on disk: ${disk.join("; ")}`);
      failed = true;
    } else {
      console.log(`  ok ${a.file} on disk (${(buffer.length / 1024).toFixed(1)} KB)`);
    }
  } catch (err) {
    console.error(`  ✗ ${a.file} on disk: ${err && err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\n✗ verification failed" +
      (STRICT ? "" : "  (run with --strict to exit non-zero on this)"),
  );
  process.exit(STRICT ? 1 : 0);
}
console.log("✓ all assets verified");
