// The "Galleria print" treatment: makes posters with very different palettes
// read as one printed series without repainting them.
//
//   1. Tone      — blend toward a palette gradient map (ink → orange → bone)
//                  so shadows become ink and highlights become bone paper.
//   2. Halftone  — a 45° dot screen whose dot size follows the image's
//                  darkness, like an offset print.
//   3. Grain     — fine monochrome paper/film grain.
//   4. Vignette  — a slight darkening toward the edges.
//
// Works on raw RGB(A) pixel buffers; used by scripts/import-posters.mjs.

const INK = [18, 18, 18];
const ORANGE = [255, 90, 31];
const BONE = [233, 230, 223];

export const DEFAULT_FX = { tone: 0.32, halftone: 0.55, grain: 0.2, vignette: 0.5, cell: 0.0042 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function gradientMap(l, out) {
  // ink at 0, orange at 0.48, bone at 1
  if (l < 0.48) {
    const t = l / 0.48;
    out[0] = lerp(INK[0], ORANGE[0], t);
    out[1] = lerp(INK[1], ORANGE[1], t);
    out[2] = lerp(INK[2], ORANGE[2], t);
  } else {
    const t = (l - 0.48) / 0.52;
    out[0] = lerp(ORANGE[0], BONE[0], t);
    out[1] = lerp(ORANGE[1], BONE[1], t);
    out[2] = lerp(ORANGE[2], BONE[2], t);
  }
  return out;
}

// Deterministic per-pixel noise (same output every run).
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function applyPrintFx(px, width, height, channels, fx = DEFAULT_FX) {
  const o = { ...DEFAULT_FX, ...fx };
  const cell = Math.max(3, o.cell * width); // dot pitch scales with output size
  const c45 = Math.SQRT1_2;
  const g = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      let r = px[i];
      let gg = px[i + 1];
      let b = px[i + 2];
      const l = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;

      // 1. Tone toward the palette gradient map.
      gradientMap(l, g);
      r = lerp(r, g[0], o.tone);
      gg = lerp(gg, g[1], o.tone);
      b = lerp(b, g[2], o.tone);

      // 2. Halftone: rotate 45°, find distance to the nearest dot centre.
      if (o.halftone > 0) {
        const u = (x * c45 + y * c45) / cell;
        const v = (-x * c45 + y * c45) / cell;
        const du = u - Math.floor(u) - 0.5;
        const dv = v - Math.floor(v) - 0.5;
        const d = Math.sqrt(du * du + dv * dv); // 0 … 0.707
        const radius = Math.sqrt(1 - l) * 0.56;
        const aa = 0.6 / cell;
        const ink = Math.min(Math.max((radius - d) / aa + 0.5, 0), 1);
        const dark = 1 - 0.38 * ink * o.halftone;
        const paper = (1 - ink) * 0.07 * o.halftone;
        r = lerp(r * dark, BONE[0], paper);
        gg = lerp(gg * dark, BONE[1], paper);
        b = lerp(b * dark, BONE[2], paper);
      }

      // 3. Grain.
      const n = (hash(x, y) - 0.5) * 34 * o.grain;
      r += n;
      gg += n;
      b += n;

      // 4. Vignette.
      if (o.vignette > 0) {
        const vx = x / width - 0.5;
        const vy = y / height - 0.5;
        const k = 1 - Math.max(0, vx * vx + vy * vy - 0.12) * 0.9 * o.vignette;
        r *= k;
        gg *= k;
        b *= k;
      }

      px[i] = clamp(r);
      px[i + 1] = clamp(gg);
      px[i + 2] = clamp(b);
    }
  }
  return px;
}
