#!/usr/bin/env node
// Import your posters.
//
//   1. Put original files in  posters-src/   (jpg, png, webp, tiff, avif)
//   2. Run                    npm run posters
//   3. Edit titles/years/etc. in content/posters.json (re-running keeps your edits)
//
// For each image this writes web-sized WebP files to public/posters/:
//   <id>-800/1600/2400.webp           the "Galleria print" version shown on the site
//   <id>-original-1600/2400.webp      the untouched artwork (loupe + viewer toggle)
// It auto-rotates using EXIF, then strips ALL metadata (camera, GPS, etc.).
// Originals are never uploaded — only the resized copies end up on the site.
//
// The print treatment (tone, halftone, grain, vignette) is configured by
// "posterPrint" in content/site.json; set "enabled": false to skip it.
//
// Landscape files go to Hall A (the reel), portrait files to Hall B (the
// portrait slider). Override per poster with "format" in posters.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { applyPrintFx, DEFAULT_FX } from './lib/print-fx.mjs';
import { portraitPlaceholders, MIN_PORTRAITS } from './lib/portrait-placeholders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'posters-src');
const outDir = path.join(root, 'public', 'posters');
const manifestPath = path.join(root, 'content', 'posters.json');
const sitePath = path.join(root, 'content', 'site.json');

const WIDTHS = [800, 1600, 2400];
const ORIGINAL_WIDTHS = [1600, 2400];
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
const TONES = ['ink', 'orange', 'bone', 'graphite', 'sage'];

const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'poster';

const titleCase = (s) =>
  s
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeWebp(pipeline, file, quality) {
  await pipeline.webp({ quality, effort: 5 }).toFile(path.join(outDir, file));
  return `/posters/${file}`;
}

async function main() {
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const files = (await fs.readdir(srcDir))
    .filter((f) => EXT.has(path.extname(f).toLowerCase()) && !f.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!files.length) {
    console.log(`No images found. Put your poster files in:\n  ${path.relative(process.cwd(), srcDir)}/\nthen run npm run posters again.`);
    return;
  }

  const site = await readJSON(sitePath, {});
  const print = { enabled: true, ...DEFAULT_FX, ...(site.posterPrint || {}) };
  const manifest = await readJSON(manifestPath, []);
  const real = manifest.filter((p) => !p.placeholder);
  // Entries are matched by source file first, so ids and titles can be edited freely.
  const byFile = new Map(real.filter((p) => p.file).map((p) => [p.file, p]));
  const byId = new Map(real.map((p) => [p.id, p]));
  const placeholders = manifest.length - real.length;

  const result = [];
  const seen = new Set();
  for (const [i, file] of files.entries()) {
    const base = path.basename(file, path.extname(file));
    const prev = byFile.get(file) || byId.get(slug(base)) || {};
    let id = prev.id || slug(base);
    while (seen.has(id)) id += '-2';
    seen.add(id);

    const src = path.join(srcDir, file);
    const meta = await sharp(src, { failOn: 'none' }).metadata();
    // .rotate() applies EXIF orientation; swap dimensions for 90° rotations.
    const rotated = meta.orientation && meta.orientation >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;
    if (!width || !height) {
      console.warn(`  ! ${file}: could not read dimensions, skipped`);
      continue;
    }
    const format = prev.format === 'portrait' || prev.format === 'landscape' ? prev.format : height > width ? 'portrait' : 'landscape';

    // sharp drops metadata unless .withMetadata() is called — that's what we want.
    const base2400 = sharp(src, { failOn: 'none' }).rotate().removeAlpha().resize({ width: Math.min(width, 2400), withoutEnlargement: true });
    const { data, info } = await base2400.raw().toBuffer({ resolveWithObject: true });

    const srcset = [];
    for (const w of [...new Set(WIDTHS.map((v) => Math.min(v, width)))]) {
      // Treat at each output size so the halftone pitch stays crisp.
      const { data: px, info: inf } = await sharp(data, { raw: info }).resize({ width: w }).raw().toBuffer({ resolveWithObject: true });
      if (print.enabled) applyPrintFx(px, inf.width, inf.height, inf.channels, print);
      srcset.push({ w, src: await writeWebp(sharp(px, { raw: inf }), `${id}-${w}.webp`, 80) });
    }
    const original = [];
    if (print.enabled) {
      for (const w of [...new Set(ORIGINAL_WIDTHS.map((v) => Math.min(v, width)))]) {
        original.push({ w, src: await writeWebp(sharp(data, { raw: info }).resize({ width: w }), `${id}-original-${w}.webp`, 84) });
      }
    }

    const { dominant } = await sharp(src).stats();
    const outW = Math.min(width, 1600);
    const outH = Math.round((height / width) * outW);
    result.push({
      id,
      file,
      title: prev.title ?? titleCase(base),
      year: prev.year ?? new Date().getFullYear(),
      medium: prev.medium ?? 'Poster',
      size: prev.size ?? '',
      description: prev.description ?? '',
      alt: prev.alt ?? `${prev.title ?? titleCase(base)} — poster`,
      tone: prev.tone ?? TONES[i % TONES.length],
      color: prev.color ?? hex(dominant),
      format,
      ...(prev.status ? { status: prev.status } : {}),
      image: {
        src: srcset.find((s) => s.w >= 1600)?.src ?? srcset[srcset.length - 1].src,
        width: outW,
        height: outH,
        srcset,
        ...(original.length ? { original } : {}),
      },
      order: manifest.indexOf(prev) >= 0 ? manifest.indexOf(prev) : 1e6 + i,
    });
    console.log(`  ✓ ${file} → ${id} · Hall ${format === 'portrait' ? 'B (portrait)' : 'A (landscape)'} · ${srcset.map((s) => s.w).join('/')} px`);
  }

  // Keep the order you set in posters.json; new files go to the end.
  result.sort((a, b) => a.order - b.order);
  for (const r of result) delete r.order;

  // Hall B needs a few slides to slide between: fill it with placeholders
  // until there are enough real portrait posters.
  const portraits = result.filter((r) => r.format === 'portrait').length;
  if (portraits > 0 && portraits < MIN_PORTRAITS) {
    const fill = await portraitPlaceholders(outDir, MIN_PORTRAITS - portraits);
    result.push(...fill);
    console.log(`\nHall B has ${portraits} portrait poster${portraits > 1 ? 's' : ''}; added ${fill.length} placeholder${fill.length > 1 ? 's' : ''} until you have ${MIN_PORTRAITS}.`);
  }

  await fs.writeFile(manifestPath, JSON.stringify(result, null, 2) + '\n');
  const realCount = result.filter((r) => !r.placeholder).length;
  console.log(`\nWrote ${realCount} posters to content/posters.json${placeholders ? ` (replaced ${placeholders} old placeholders)` : ''}.`);
  console.log('Next: edit titles, years, media and descriptions there — re-running this keeps your edits.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
