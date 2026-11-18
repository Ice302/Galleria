#!/usr/bin/env node
// Turns the downloaded Sketchfab models into lean, on-brand web models.
//
//   originals:  models-src/2026_cadillac_mac-26.glb, models-src/cruise_ship.glb
//   output:     public/models/f1.glb, public/models/ship.glb
//
//   npm run models
//
// What it does
//   • F1: drops the sponsor/number decal layers and the hidden cockpit
//     electronics; repaints the livery texture into the Galleria palette
//     (ink / orange / bone), swapping the script logo for "GALLERIA"; turns the
//     tyre lettering into a plain orange band; removes every other texture.
//   • Ship: drops the passenger figures, outline lines, a stray off-model
//     object and invisible faces.
//   • Both: welds, merges by material, simplifies (meshoptimizer), quantises and
//     compresses. Colours are assigned at runtime in src/three/models.js, so the
//     material names are kept.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'models-src');
const OUT = path.join(root, 'public', 'models');

const PALETTE = { ink: [31, 31, 31], orange: [255, 90, 31], bone: [233, 230, 223], tyre: [27, 27, 27] };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});

const triangles = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .filter((p) => p.getMode() === 4)
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

function dropPrimitives(doc, test) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (test(prim)) {
        prim.dispose();
        n++;
      }
    }
  }
  return n;
}

// ───────────── Texture repainting ─────────────

// Morphological closing on one channel inside a box: removes thin dark
// strokes (lettering) sitting on light panels.
function closeRegion(px, w, ch, box, r) {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  let a = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) a[y * bw + x] = px[((y0 + y) * w + x0 + x) * ch];
  const pass = (src, horiz, fn) => {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let v = fn === Math.max ? 0 : 255;
        for (let k = -r; k <= r; k++) {
          const xx = horiz ? x + k : x;
          const yy = horiz ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          v = fn(v, src[yy * bw + xx]);
        }
        dst[y * bw + x] = v;
      }
    }
    return dst;
  };
  a = pass(pass(a, true, Math.max), false, Math.max); // dilate light
  a = pass(pass(a, true, Math.min), false, Math.min); // erode back
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * w + x0 + x) * ch;
      px[i] = px[i + 1] = px[i + 2] = a[y * bw + x];
    }
  }
}

function fillRect(px, w, ch, [x0, y0, x1, y1], v) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.fill(v, (y * w + x) * ch, (y * w + x) * ch + 3);
}

// Luminance → three flat tones. Gradients in the livery become stepped bands.
function paletteMap(px, ch, stops) {
  for (let i = 0; i < px.length; i += ch) {
    const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    const tone = stops.find((s) => l < s.below)?.color ?? stops[stops.length - 1].color;
    px[i] = tone[0];
    px[i + 1] = tone[1];
    px[i + 2] = tone[2];
  }
}

async function repaintLivery(buf) {
  // A light blur first, so the carbon-weave pattern doesn't turn into speckle.
  const { data, info } = await sharp(buf).removeAlpha().blur(1.6).raw().toBuffer({ resolveWithObject: true });
  const { width: w, channels: ch } = info;
  const k = w / 4096;
  const box = (b) => b.map((v) => Math.round(v * k));

  // Scrutineering sticker + red tab → plain dark.
  fillRect(data, w, ch, box([2600, 0, 3310, 270]), 0);
  // Script logos on the two sidepod panels → clean white panels.
  closeRegion(data, w, ch, box([2360, 1640, 3270, 1900]), Math.round(30 * k));
  closeRegion(data, w, ch, box([2370, 2180, 3180, 2450]), Math.round(30 * k));

  // Our own name where the logo was (top panel is mapped upside-down).
  const word = (x, y, rot) =>
    `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="${118 * k}" letter-spacing="${-4 * k}" text-anchor="middle" dominant-baseline="middle" fill="#000">GALLERIA</text>`;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${info.height}">${word(2800 * k, 1782 * k, 175)}${word(2760 * k, 2330 * k, 4.5)}</svg>`
  );
  // (Compositing adds an alpha channel; drop it so the pixel layout stays RGB.)
  const img = await sharp(data, { raw: info }).composite([{ input: svg }]).removeAlpha().raw().toBuffer();

  // Black → ink, white → signal orange, the gradients between → a bone band.
  paletteMap(img, ch, [
    { below: 0.26, color: PALETTE.ink },
    { below: 0.62, color: PALETTE.bone },
    { below: 2, color: PALETTE.orange },
  ]);
  return sharp(img, { raw: info }).resize(2048, 2048, { kernel: 'nearest' }).png({ palette: true, colours: 4 }).toBuffer();
}

async function repaintSidewall(buf) {
  // Smear along the tyre circumference so the lettering becomes a band.
  // (Two pipelines: sharp applies only the last resize of a chain.)
  const thin = await sharp(buf).removeAlpha().resize(8, 1024, { fit: 'fill' }).png().toBuffer();
  const { data, info } = await sharp(thin).resize(1024, 1024, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const red = data[i] - Math.max(data[i + 1], data[i + 2]);
    const c = red > 18 ? PALETTE.orange : PALETTE.tyre;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  }
  return sharp(data, { raw: info }).png({ palette: true, colours: 2 }).toBuffer();
}

// ───────────── Models ─────────────

async function prepareCar() {
  const doc = await io.read(path.join(SRC, '2026_cadillac_mac-26.glb'));
  const before = triangles(doc);

  const DROP = /decals|number_11|steeringwheel|carbon4|generic_lcd|vehicle_revs|indicator|kers_|CLEARLED|glass/;
  const dropped = dropPrimitives(doc, (p) => DROP.test(p.getMaterial()?.getName() ?? ''));

  for (const mat of doc.getRoot().listMaterials()) {
    const name = mat.getName();
    mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null).setOcclusionTexture(null);
    const tex = mat.getBaseColorTexture();
    if (!tex) continue;
    if (/paint/.test(name)) tex.setImage(await repaintLivery(tex.getImage())).setMimeType('image/png');
    else if (/sidewall/.test(name)) tex.setImage(await repaintSidewall(tex.getImage())).setMimeType('image/png');
    else mat.setBaseColorTexture(null);
  }

  await doc.transform(
    prune(),
    dedup(),
    flatten(),
    join(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.0008 }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );
  doc.getRoot().getAsset().extras = {
    ...doc.getRoot().getAsset().extras,
    changes: 'Simplified, decals removed, livery repainted to the Galleria palette.',
  };
  await io.write(path.join(OUT, 'f1.glb'), doc);
  return { before, after: triangles(doc), dropped };
}

async function prepareShip() {
  const doc = await io.read(path.join(SRC, 'cruise_ship.glb'));
  const before = triangles(doc);

  const dropped = dropPrimitives(doc, (p) => {
    const m = p.getMaterial();
    // Passenger figures, invisible faces, and the SketchUp edge lines (318k
    // segments that shimmer at our viewing distance).
    return /^Steve_/.test(m?.getName() ?? '') || (m && m.getBaseColorFactor()[3] < 0.05) || p.getMode() !== 4;
  });
  // A stray object far outside the hull widens the bounds; remove it.
  let stray = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const b = getBounds(node);
    if (b.max[0] > 2700 || b.min[2] < -17400) {
      node.dispose();
      stray++;
    }
  }

  // Faceted export: every face has its own vertices, which blocks
  // simplification. The ship is shaded flat at runtime, so normals and UVs are
  // dropped and vertices welded by position alone.
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) if (semantic !== 'POSITION') prim.setAttribute(semantic, null);
    }
  }

  await doc.transform(
    prune(),
    dedup(),
    flatten(),
    join(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.16, error: 0.004 }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );
  doc.getRoot().getAsset().extras = {
    ...doc.getRoot().getAsset().extras,
    changes: 'Simplified, figures removed, recoloured to the Galleria palette at runtime.',
  };
  await io.write(path.join(OUT, 'ship.glb'), doc);
  return { before, after: triangles(doc), dropped: dropped + stray };
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await fs.mkdir(OUT, { recursive: true });

for (const [label, fn, file] of [
  ['F1', prepareCar, 'f1.glb'],
  ['Ship', prepareShip, 'ship.glb'],
]) {
  const r = await fn();
  const { size } = await fs.stat(path.join(OUT, file));
  console.log(
    `${label}: ${Math.round(r.before).toLocaleString()} → ${Math.round(r.after).toLocaleString()} triangles, ` +
      `${r.dropped} parts removed, ${(size / 1e6).toFixed(2)} MB → public/models/${file}`
  );
}
