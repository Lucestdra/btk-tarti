/**
 * Generate Thundrly extension icons in 16/32/48/128 px PNGs.
 *
 * The icon now mirrors the in-panel logo: a light rounded tile containing
 * four signal dots converging into one cerulean verdict dot.
 *
 * Run: `npm run icons:build` (from extension/).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const INK = { r: 0x00, g: 0x32, b: 0x49 };
const ACCENT = { r: 0x00, g: 0x7e, b: 0xa7 };
const SURFACE = { r: 0xf7, g: 0xfb, b: 0xfb };
const BORDER = { r: 0xcc, g: 0xdb, b: 0xdc };
const SIZES = [16, 32, 48, 128];
const INPUT_Y = [9, 16.5, 23.5, 31];

function setPixel(png, x, y, color, alpha = 255) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = alpha;
}

function blend(base, overlay, alpha) {
  return {
    r: Math.round(base.r * (1 - alpha) + overlay.r * alpha),
    g: Math.round(base.g * (1 - alpha) + overlay.g * alpha),
    b: Math.round(base.b * (1 - alpha) + overlay.b * alpha),
  };
}

function roundedRectAlpha(x, y, size, radius) {
  const left = radius;
  const right = size - radius;
  const top = radius;
  const bottom = size - radius;
  const dx = x < left ? left - x : x > right ? x - right : 0;
  const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= radius - 0.75) return 1;
  if (dist >= radius + 0.75) return 0;
  return Math.max(0, Math.min(1, radius + 0.75 - dist));
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = wx * vx + wy * vy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function lineAlpha(px, py, ax, ay, bx, by, strokeWidth) {
  const d = distToSegment(px, py, ax, ay, bx, by);
  const half = strokeWidth / 2;
  if (d <= half - 0.25) return 1;
  if (d >= half + 0.5) return 0;
  return Math.max(0, Math.min(1, (half + 0.5 - d) / 0.75));
}

function circleAlpha(px, py, cx, cy, r) {
  const d = Math.hypot(px - cx, py - cy);
  if (d <= r - 0.25) return 1;
  if (d >= r + 0.5) return 0;
  return Math.max(0, Math.min(1, (r + 0.5 - d) / 0.75));
}

function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = size * 0.24;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = roundedRectAlpha(x + 0.5, y + 0.5, size, radius);
      if (alpha <= 0) {
        setPixel(png, x, y, SURFACE, 0);
        continue;
      }

      let color = SURFACE;
      const edgeAlpha = alpha < 1 ? 0.55 : 0;
      if (edgeAlpha > 0) color = blend(color, BORDER, edgeAlpha);

      const vx = ((x + 0.5) / size) * 40;
      const vy = ((y + 0.5) / size) * 40;

      for (const inputY of INPUT_Y) {
        const a = lineAlpha(vx, vy, 11.5, inputY, 29, 20, 1.3) * 0.32;
        if (a > 0) color = blend(color, INK, a);
      }
      for (const inputY of INPUT_Y) {
        const a = circleAlpha(vx, vy, 11, inputY, 2.1);
        if (a > 0) color = blend(color, INK, a);
      }
      const verdictAlpha = circleAlpha(vx, vy, 29, 20, 5);
      if (verdictAlpha > 0) color = blend(color, ACCENT, verdictAlpha);

      setPixel(png, x, y, color, Math.round(alpha * 255));
    }
  }

  return PNG.sync.write(png);
}

for (const size of SIZES) {
  const buf = renderIcon(size);
  const path = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, buf);
  console.log(`Wrote ${path} (${buf.length} bytes)`);
}
