// Builds an animatable signature as inline SVG.
//
// Default: the artist's name set in a signature typeface (Hurricane), drawn
// as if written. A font is outlines, not pen strokes, so at build time the
// name is rasterised, thinned to its centre line (Zhang–Suen) and traced into
// pen paths. On the page those paths are drawn in order inside a mask that
// reveals the real letterforms — the ink follows the pen. A flourish is added
// underneath.
//
// Put your real signature at content/signature.svg (stroke paths) to use it
// as-is instead. If the font can't be read, a single-stroke Hershey script is
// used.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+\-eE]+$/;
const f1 = (n) => Math.round(n * 10) / 10;

export const SIGNATURE_FONTS = ['hurricane', 'herr-von-muellerhoff', 'mrs-saint-delafield', 'corinthia', 'allison'];

// ───────────── Outline text (raw glyphs; opentype's layout step mis-handles these fonts) ─────────────
async function outline(fontName, text, size) {
  const opentype = await import('opentype.js');
  const file = require.resolve(`@fontsource/${fontName}/files/${fontName}-latin-400-normal.woff`);
  const buf = fs.readFileSync(file);
  const font = (opentype.parse || opentype.default.parse)(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const k = size / font.unitsPerEm;
  let x = 0;
  let d = '';
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const P = (px, py) => {
    const X = x + px * k;
    const Y = -py * k;
    box[0] = Math.min(box[0], X);
    box[1] = Math.min(box[1], Y);
    box[2] = Math.max(box[2], X);
    box[3] = Math.max(box[3], Y);
    return `${f1(X)} ${f1(Y)}`;
  };
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    for (const c of g.path.commands) {
      if (c.type === 'M') d += `M${P(c.x, c.y)}`;
      else if (c.type === 'L') d += `L${P(c.x, c.y)}`;
      else if (c.type === 'Q') d += `Q${P(c.x1, c.y1)} ${P(c.x, c.y)}`;
      else if (c.type === 'C') d += `C${P(c.x1, c.y1)} ${P(c.x2, c.y2)} ${P(c.x, c.y)}`;
      else if (c.type === 'Z') d += 'Z';
    }
    x += g.advanceWidth * k;
  }
  if (!d || !Number.isFinite(box[0])) throw new Error('empty outline');
  return { d, box };
}

// ───────────── Centre lines ─────────────
function thin(img, w, h) {
  // Zhang–Suen thinning; img is 1 for ink.
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  let changed = true;
  const del = [];
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
          if (a !== 1) continue;
          if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * w + x);
        }
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
}

function distance(ink, w, h) {
  // Two-pass chamfer (3/4) distance to background, in pixels.
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = ink[i] ? INF : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y > 0) d[i] = Math.min(d[i], d[i - w] + 3, x > 0 ? d[i - w - 1] + 4 : INF, x < w - 1 ? d[i - w + 1] + 4 : INF);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 3, x < w - 1 ? d[i + w + 1] + 4 : INF, x > 0 ? d[i + w - 1] + 4 : INF);
    }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

const N8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function trace(sk, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x];
  // A diagonal neighbour only counts if no shared orthogonal pixel already
  // connects the two — otherwise every staircase step looks like a junction.
  const nb = (i) => {
    const x = i % w;
    const y = (i - x) / w;
    const out = [];
    for (const [dx, dy] of N8) {
      if (!on(x + dx, y + dy)) continue;
      if (dx && dy && (on(x + dx, y) || on(x, y + dy))) continue;
      out.push((y + dy) * w + x + dx);
    }
    return out;
  };
  const deg = new Map();
  for (let i = 0; i < w * h; i++) if (sk[i]) deg.set(i, nb(i).length);
  const used = new Set();
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const lines = [];
  const walk = (a, b) => {
    const line = [a, b];
    used.add(key(a, b));
    let prev = a;
    let cur = b;
    while (deg.get(cur) === 2) {
      const next = nb(cur).find((n) => n !== prev && !used.has(key(cur, n)));
      if (next === undefined) break;
      used.add(key(cur, next));
      line.push(next);
      prev = cur;
      cur = next;
    }
    return line;
  };
  for (const [i, d] of deg) if (d !== 2) for (const n of nb(i)) if (!used.has(key(i, n))) lines.push(walk(i, n));
  for (const [i, d] of deg) if (d === 2) for (const n of nb(i)) if (!used.has(key(i, n))) lines.push(walk(i, n));
  for (const [i, d] of deg) if (d === 0) lines.push([i, i]);
  return lines.map((l) => {
    const pts = l.map((i) => [i % w, Math.floor(i / w)]);
    // Isolated pieces (dots, short marks) must survive the spur filter.
    pts.isolated = deg.get(l[0]) <= 1 && deg.get(l[l.length - 1]) <= 1;
    return pts;
  });
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let max = 0;
  let idx = 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // Closed loop (letter bowls, descenders): split at the farthest point first,
  // or the whole loop would collapse onto its start.
  if (Math.hypot(dx, dy) < 1.5) {
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max <= eps) return [a, b];
    return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
  }
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

// Pen order: start at the leftmost end, then always continue with the
// nearest unwritten stroke — connected strokes follow each other naturally.
function penOrder(lines) {
  const todo = lines.map((_, i) => i);
  const out = [];
  let pen = null;
  while (todo.length) {
    let best = 0;
    let bestD = Infinity;
    let flip = false;
    for (let t = 0; t < todo.length; t++) {
      const l = lines[todo[t]];
      const s = l[0];
      const e = l[l.length - 1];
      const ds = pen ? Math.hypot(s[0] - pen[0], s[1] - pen[1]) : s[0];
      const de = pen ? Math.hypot(e[0] - pen[0], e[1] - pen[1]) : e[0];
      // Gentle bias toward writing left to right.
      const bias = pen ? Math.max(0, pen[0] - Math.min(s[0], e[0])) * 0.6 : 0;
      if (Math.min(ds, de) + bias < bestD) {
        bestD = Math.min(ds, de) + bias;
        best = t;
        flip = de < ds;
      }
    }
    const l = lines[todo.splice(best, 1)[0]];
    const oriented = flip ? [...l].reverse() : l;
    out.push(oriented);
    pen = oriented[oriented.length - 1];
  }
  return out;
}

const cache = new Map();

async function fromFont(name, fontName) {
  const ck = `${fontName}|${name}`;
  if (cache.has(ck)) return cache.get(ck);
  const sharp = (await import('sharp')).default;
  const { d, box } = await outline(fontName, name, 400);
  const pad = 30;
  const bw = box[2] - box[0];
  const bh = box[3] - box[1];
  const scale = Math.min(1500 / bw, 700 / bh);
  const W = Math.ceil(bw * scale + pad * 2);
  const H = Math.ceil(bh * scale + pad * 2);
  const tx = pad - box[0] * scale;
  const ty = pad - box[1] * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/><path fill="#fff" d="${d}" transform="translate(${tx} ${ty}) scale(${scale})"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = data[i] > 127 ? 1 : 0;
  const dist = distance(ink, W, H);
  const sk = ink.slice();
  thin(sk, W, H);

  // Pen width: wide enough to cover the thickest part of any stroke.
  const radii = [];
  for (let i = 0; i < W * H; i++) if (sk[i]) radii.push(dist[i]);
  radii.sort((a, b) => a - b);
  const r97 = radii[Math.floor(radii.length * 0.97)] || 6;
  const rMed = radii[Math.floor(radii.length * 0.5)] || 3;

  const minLen = Math.max(3, r97 * 0.6);
  const lines = penOrder(trace(sk, W, H).filter((l) => l.length >= minLen || l.isolated)).map((l) => simplify(l, 0.9));
  const toUser = ([x, y]) => [(x - tx) / scale, (y - ty) / scale];
  const pens = lines.map((l) => {
    const pts = l.map(toUser);
    if (pts.length < 2 || (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1])) pts.push([pts[0][0] + 0.5, pts[0][1]]);
    return `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}`;
  });

  // Flourish: an underline that sweeps out past the name and kicks up.
  const base = box[3] - bh * 0.12;
  const flourish = `M${f1(box[0] + bw * 0.04)} ${f1(base + bh * 0.02)} C${f1(box[0] + bw * 0.35)} ${f1(base + bh * 0.12)} ${f1(box[0] + bw * 0.8)} ${f1(base + bh * 0.02)} ${f1(box[2] + bw * 0.08)} ${f1(base - bh * 0.16)}`;

  const result = {
    kind: 'font',
    outline: d,
    pens,
    penWidth: ((r97 * 2 + 3) / scale) * 1.15,
    flourish,
    flourishWidth: ((rMed * 2) / scale) * 1.1,
    box: [box[0] - bw * 0.06, box[1] - bh * 0.08, bw * 1.2, bh * 1.22],
  };
  cache.set(ck, result);
  return result;
}

// ───────────── Hershey single-stroke fallback ─────────────
function fromHershey(name) {
  const hershey = require('hersheytext');
  const font = hershey.getFontData('scripts');
  const strokes = [];
  let x = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ch of name) {
    if (ch === ' ') {
      x += 9;
      continue;
    }
    const glyph = font.getChar(ch) || font.getChar('?');
    if (!glyph) continue;
    for (const part of glyph.d.split(/(?=M)/)) {
      const nums = part.replace(/[ML]/g, ' ').trim().split(/[\s,]+/).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] + x, nums[i + 1]]);
      if (pts.length < 2) continue;
      for (const [, py] of pts) {
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      strokes.push(`M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}`);
    }
    x += (glyph.width ?? 10) * 2 * 0.84;
  }
  if (!strokes.length) return null;
  const base = maxY - (maxY - minY) * 0.18;
  strokes.push(`M-6 ${f1(base + 6)} C${f1(x * 0.3)} ${f1(base + 14)} ${f1(x * 0.8)} ${f1(base + 4)} ${f1(x + 16)} ${f1(base - 10)}`);
  return { kind: 'strokes', paths: strokes, width: 1.35, box: [-10, minY - 8, x + 34, maxY - minY + 34] };
}

function fromFile(file) {
  const svg = fs.readFileSync(file, 'utf8');
  const view = /viewBox="([\d.\s\-]+)"/.exec(svg);
  const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1].trim()).filter((d) => PATH_DATA.test(d));
  if (!paths.length || !view) return null;
  const box = view[1].trim().split(/\s+/).map(Number);
  return { kind: 'strokes', paths, width: Math.max(box[2], box[3]) / 90, box };
}

export async function loadSignature(name, { file, font = 'hurricane', warn = () => {} } = {}) {
  if (file && fs.existsSync(file)) {
    const own = fromFile(file);
    if (own) return own;
    warn(`${path.basename(file)} has no usable <path d="…"> strokes; using the generated signature.`);
  }
  try {
    return await fromFont(name || 'Galleria', SIGNATURE_FONTS.includes(font) ? font : 'hurricane');
  } catch (e) {
    warn(`signature font unavailable (${e.message}); using the single-stroke script.`);
    return fromHershey(name || 'Galleria');
  }
}

// Each use on the page needs its own mask id.
export function signatureSVG(sig, id) {
  if (!sig) return '';
  const [bx, by, bw, bh] = sig.box;
  const view = `${f1(bx)} ${f1(by)} ${f1(bw)} ${f1(bh)}`;
  if (sig.kind === 'strokes') {
    const paths = sig.paths.map((d) => `<path class="sig__stroke" d="${d}" stroke-width="${f1(sig.width)}"/>`).join('');
    return `<svg class="sig" viewBox="${view}" aria-hidden="true" focusable="false">${paths}</svg>`;
  }
  const m = `sigmask-${id}`;
  const pens = sig.pens.map((d) => `<path class="sig__pen" d="${d}"/>`).join('');
  return `<svg class="sig sig--font" viewBox="${view}" aria-hidden="true" focusable="false"><defs><mask id="${m}" maskUnits="userSpaceOnUse" x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}"><g fill="none" stroke="#fff" stroke-width="${f1(sig.penWidth)}" stroke-linecap="round" stroke-linejoin="round">${pens}</g></mask></defs><path class="sig__fill" d="${sig.outline}" mask="url(#${m})"/><path class="sig__stroke sig__flourish" d="${sig.flourish}" stroke-width="${f1(sig.flourishWidth)}"/></svg>`;
}
