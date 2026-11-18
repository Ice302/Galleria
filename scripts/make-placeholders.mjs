#!/usr/bin/env node
// Generates on-brand placeholder posters (SVG) plus the Open Graph share
// image, and seeds content/posters.json. Safe to re-run: it never touches a
// manifest that already lists real (non-placeholder) posters.
//
//   npm run placeholders

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'posters');
const manifestPath = path.join(root, 'content', 'posters.json');

const C = { orange: '#ff5a1f', ink: '#121212', bone: '#e9e6df', sage: '#c8d9cc', graphite: '#2b2b2b' };
const SANS = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Menlo, monospace";

const text = (x, y, size, fill, str, { weight = 800, anchor = 'start', family = SANS, ls = -0.04 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls * size}">${str}</text>`;
const mono = (x, y, size, fill, str, anchor = 'start') => text(x, y, size, fill, str, { weight: 500, family: MONO, ls: 0.02, anchor });

function frame(w, h, bg, fg, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${bg}"/>
${body}
${mono(w - 60, h - 52, 22, fg, `PLACEHOLDER · ${label} · replace via npm run posters`, 'end')}
</svg>`;
}

const designs = [
  {
    id: 'velocity-study', title: 'Velocity Study', year: 2026, medium: 'Digital print', size: '594 × 420 mm', w: 1800, h: 1200,
    tone: 'orange',
    description: 'A study in forward motion: diagonal speed bands cut across a signal-orange field.',
    svg: (w, h) => {
      let stripes = '';
      for (let i = 0; i < 14; i++) stripes += `<polygon points="${980 + i * 64},${h} ${1010 + i * 64},${h} ${1330 + i * 64},0 ${1300 + i * 64},0" fill="${C.ink}"/>`;
      return frame(w, h, C.orange, C.ink, `${stripes}
        ${text(90, 300, 230, C.ink, 'Velocity')}${text(90, 520, 230, C.ink, 'Study')}
        ${mono(96, 640, 30, C.ink, '180 MIN OF POSTERS IN MOTION AND PLAYBACK')}
        <rect x="96" y="${h - 250}" width="120" height="64" fill="none" stroke="${C.ink}" stroke-width="6"/>${text(112, h - 200, 40, C.ink, 'VHS', { ls: 0 })}
        ${text(260, h - 170, 170, C.ink, 'E-180')}`, '01');
    },
  },
  {
    id: 'harbour-lights', title: 'Harbour Lights', year: 2025, medium: 'Screen print', size: '700 × 394 mm', w: 1920, h: 1080,
    tone: 'ink',
    description: 'One enormous lamp on a black quay — a circle split by a single line of light.',
    svg: (w, h) => frame(w, h, C.ink, C.bone, `
      <circle cx="1240" cy="560" r="430" fill="${C.bone}"/>
      <rect x="1225" y="80" width="30" height="960" fill="${C.ink}"/>
      ${text(110, 330, 190, C.bone, 'Harbour/')}${text(110, 520, 190, C.orange, 'Lights')}
      ${mono(116, 620, 28, C.bone, 'SUPERIOR QUALITY · CALIDAD SUPERIOR')}
      ${text(w - 110, h - 110, 170, C.orange, '240', { anchor: 'end' })}`, '02'),
  },
  {
    id: 'low-tide', title: 'Low Tide', year: 2025, medium: 'Risograph', size: '420 × 297 mm', w: 1800, h: 1200,
    tone: 'bone',
    description: 'Contour lines of a slow sea under a striped, setting sun.',
    svg: (w, h) => {
      let waves = '';
      for (let i = 0; i < 18; i++) {
        const y = 640 + i * 30;
        let d = `M0 ${y}`;
        for (let x = 0; x <= w; x += 40) d += ` L${x} ${(y + Math.sin(x / 120 + i * 0.6) * (8 + i)).toFixed(1)}`;
        waves += `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5"/>`;
      }
      let cuts = '';
      for (let i = 0; i < 6; i++) cuts += `<rect x="1000" y="${470 + i * 28}" width="700" height="${4 + i * 3}" fill="${C.bone}"/>`;
      return frame(w, h, C.bone, C.ink, `<circle cx="1350" cy="560" r="300" fill="${C.orange}"/>${cuts}
        <rect x="0" y="620" width="${w}" height="${h - 620}" fill="${C.bone}"/>${waves}
        ${text(90, 260, 240, C.ink, 'Low Tide')}${mono(96, 340, 30, C.ink, 'EVERYDAY RECORDING · 246 M')}`, '03');
    },
  },
  {
    id: 'signal-noise', title: 'Signal / Noise', year: 2024, medium: 'Giclée print', size: '594 × 420 mm', w: 1697, h: 1200,
    tone: 'graphite',
    description: 'A halftone field that resolves from noise into signal as it crosses the sheet.',
    svg: (w, h) => {
      let dots = '';
      for (let gx = 0; gx < 13; gx++) {
        for (let gy = 0; gy < 9; gy++) {
          const r = 6 + (gx / 12) * 34 * (0.6 + 0.4 * Math.sin(gy * 0.9 + gx * 0.3));
          dots += `<circle cx="${760 + gx * 70}" cy="${180 + gy * 92}" r="${Math.max(r, 4).toFixed(1)}" fill="${C.orange}"/>`;
        }
      }
      return frame(w, h, C.ink, C.bone, `${dots}
        ${text(90, 300, 150, C.bone, 'Signal')}${text(90, 450, 150, C.bone, '/ Noise')}
        ${mono(96, 540, 28, C.bone, 'ITEM E-180HR · 258M')}
        ${text(90, h - 150, 120, C.bone, 'Super EG+')}`, '04');
    },
  },
  {
    id: 'grand-prix-club', title: 'Grand Prix Club', year: 2026, medium: 'Digital print', size: '700 × 394 mm', w: 1920, h: 1080,
    tone: 'orange',
    description: 'Checkered flag geometry for a members-only race weekend.',
    svg: (w, h) => {
      let checks = '';
      const s = 110;
      for (let x = 0; x < 6; x++) for (let y = 0; y < 8; y++) if ((x + y) % 2 === 0) checks += `<rect x="${1180 + x * s}" y="${100 + y * s}" width="${s}" height="${s}" fill="${C.ink}"/>`;
      return frame(w, h, C.orange, C.ink, `${checks}
        ${text(100, 360, 320, C.ink, 'GP')}${text(100, 560, 180, C.ink, 'Club')}
        ${mono(106, 650, 30, C.ink, 'SP 2 HRS · LP 4 HRS · ROUND 07')}
        ${text(100, h - 110, 220, C.ink, '07')}`, '05');
    },
  },
  {
    id: 'atlas-240', title: 'Atlas 240', year: 2024, medium: 'Offset lithograph', size: '420 × 297 mm', w: 1800, h: 1200,
    tone: 'sage',
    description: 'Numerals as architecture — a cropped 240 holding up the page.',
    svg: (w, h) => frame(w, h, C.sage, C.ink, `
      ${text(-60, 1130, 980, C.ink, '240', { ls: -0.07 })}
      <circle cx="1560" cy="230" r="110" fill="${C.orange}"/>
      ${text(1400, 470, 130, C.ink, 'Atlas', { anchor: 'start' })}
      ${mono(1404, 530, 26, C.ink, 'UNIVERSAL TAPE 240')}`, '06'),
  },
  {
    id: 'night-ferry', title: 'Night Ferry', year: 2025, medium: 'Screen print', size: '700 × 394 mm', w: 1920, h: 1080,
    tone: 'ink',
    description: 'The last crossing of the evening, drawn as a stack of lit decks.',
    svg: (w, h) => {
      let decks = '';
      for (let i = 0; i < 6; i++) {
        const y = 560 - i * 52;
        decks += `<rect x="${760 + i * 40}" y="${y}" width="${880 - i * 90}" height="40" fill="${C.bone}"/>`;
        for (let k = 0; k < 18 - i * 2; k++) decks += `<rect x="${790 + i * 40 + k * 44}" y="${y + 12}" width="22" height="14" fill="${(k * 7 + i) % 5 === 0 ? C.orange : C.ink}"/>`;
      }
      let lines = '';
      for (let i = 0; i < 10; i++) lines += `<rect x="0" y="${720 + i * 34}" width="${w}" height="3" fill="${C.sage}" opacity="${(0.7 - i * 0.05).toFixed(2)}"/>`;
      return frame(w, h, C.graphite, C.bone, `${decks}
        <polygon points="700,610 1720,610 1660,720 760,720" fill="${C.ink}"/><rect x="700" y="610" width="1020" height="16" fill="${C.orange}"/>
        <rect x="1180" y="210" width="90" height="120" fill="${C.orange}"/>${lines}
        ${text(110, 260, 170, C.bone, 'Night')}${text(110, 420, 170, C.bone, 'Ferry')}
        ${mono(116, 500, 28, C.bone, 'K4 · E240 · DEPARTS 23:40')}`, '07');
    },
  },
  {
    id: 'paper-moon', title: 'Paper Moon', year: 2026, medium: 'Risograph', size: '420 × 297 mm', w: 1800, h: 1200,
    tone: 'bone',
    description: 'Concentric arches in orange and ink — a moon folded out of paper.',
    svg: (w, h) => {
      let arcs = '';
      const cx = 620;
      const cy = 1200;
      for (let i = 0; i < 5; i++) {
        const r = 720 - i * 120;
        arcs += `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="${i % 2 ? C.bone : i === 0 ? C.orange : C.ink}"/>`;
      }
      return frame(w, h, C.bone, C.ink, `${arcs}
        <rect x="60" y="120" width="440" height="140" fill="${C.orange}"/>
        ${text(1220, 520, 150, C.ink, 'Paper')}${text(1220, 680, 150, C.ink, 'Moon')}
        ${mono(1226, 760, 26, C.ink, 'HIGH QUALITY · HIGH RESOLUTION')}`, '08');
    },
  },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {}
  const hasReal = existing.some((p) => !p.placeholder);

  for (const d of designs) {
    await fs.writeFile(path.join(outDir, `placeholder-${d.id}.svg`), d.svg(d.w, d.h));
  }

  if (hasReal) {
    console.log('content/posters.json already lists real posters — left untouched.');
  } else {
    const manifest = designs.map((d) => ({
      id: d.id,
      title: d.title,
      year: d.year,
      medium: d.medium,
      size: d.size,
      description: d.description,
      alt: `${d.title} — placeholder poster. ${d.description}`,
      tone: d.tone,
      image: { src: `/posters/placeholder-${d.id}.svg`, width: d.w, height: d.h },
      placeholder: true,
    }));
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${manifest.length} placeholder entries to content/posters.json`);
  }

  // 1200×630 share card.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="${C.ink}"/>
    <rect x="0" y="430" width="1200" height="200" fill="${C.orange}"/>
    ${Array.from({ length: 12 }, (_, i) => `<polygon points="${760 + i * 40},430 ${780 + i * 40},430 ${940 + i * 40},0 ${920 + i * 40},0" fill="${C.orange}"/>`).join('')}
    ${text(60, 330, 200, C.bone, 'Galleria')}
    ${mono(66, 395, 26, C.bone, 'A MOVING EXHIBITION OF LANDSCAPE POSTERS')}
    ${text(60, 570, 110, C.ink, 'E-180')}
    ${mono(1140, 570, 24, C.ink, 'SERIES 01 · EDITION 001', 'end')}
  </svg>`;
  await sharp(Buffer.from(og)).png().toFile(path.join(root, 'public', 'og.png'));
  console.log('Wrote public/og.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
