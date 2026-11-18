// On-brand 4:5 placeholder posters for Hall B. The importer uses them to fill
// the portrait hall up to MIN_PORTRAITS slides, so its transitions have
// something to slide between; each real portrait poster you add replaces one.

import fs from 'node:fs/promises';
import path from 'node:path';

export const MIN_PORTRAITS = 4;

const C = { orange: '#ff5a1f', ink: '#121212', bone: '#e9e6df', sage: '#c8d9cc', graphite: '#2b2b2b' };
const SANS = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Menlo, monospace";
const W = 1600;
const H = 2000;

const t = (x, y, size, fill, str, { weight = 800, anchor = 'start', family = SANS, ls = -0.04, rot = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls * size}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${str}</text>`;
const mono = (x, y, size, fill, str, anchor = 'start') => t(x, y, size, fill, str, { weight: 500, family: MONO, ls: 0.02, anchor });
const frame = (bg, fg, body, n) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}${mono(W - 80, H - 70, 28, fg, `PLACEHOLDER · B${n} · add portrait posters to posters-src/`, 'end')}</svg>`;

const DESIGNS = [
  {
    id: 'tall-order',
    title: 'Tall Order',
    tone: 'orange',
    svg: () => {
      let bars = '';
      for (let i = 0; i < 9; i++) bars += `<rect x="${120 + i * 150}" y="${560 + (i % 3) * 120}" width="70" height="${1200 - (i % 3) * 120}" fill="${C.ink}"/>`;
      return frame(C.orange, C.ink, `${bars}${t(110, 330, 260, C.ink, 'Tall')}${t(110, 540, 260, C.ink, 'Order')}${mono(116, 1880, 32, C.ink, 'VERTICAL STUDY · 4:5')}`, 1);
    },
  },
  {
    id: 'lighthouse',
    title: 'Lighthouse',
    tone: 'ink',
    svg: () => {
      let rings = '';
      for (let i = 0; i < 6; i++) rings += `<circle cx="800" cy="760" r="${180 + i * 110}" fill="none" stroke="${C.orange}" stroke-width="6" opacity="${(0.9 - i * 0.14).toFixed(2)}"/>`;
      return frame(
        C.ink,
        C.bone,
        `${rings}<polygon points="700,1900 900,1900 860,900 740,900" fill="${C.bone}"/><rect x="730" y="820" width="140" height="90" fill="${C.orange}"/>
        <rect x="0" y="1700" width="${W}" height="300" fill="${C.graphite}"/>${t(110, 300, 210, C.bone, 'Light')}${t(110, 480, 210, C.orange, 'house')}`,
        2
      );
    },
  },
  {
    id: 'vertigo',
    title: 'Vertigo',
    tone: 'bone',
    svg: () => {
      let squares = '';
      for (let i = 0; i < 14; i++) {
        const s = 1300 - i * 90;
        squares += `<rect x="${800 - s / 2}" y="${1080 - s / 2}" width="${s}" height="${s}" fill="${i % 2 ? C.bone : C.ink}" transform="rotate(${i * 7} 800 1080)"/>`;
      }
      return frame(C.bone, C.ink, `${squares}<rect x="0" y="0" width="${W}" height="380" fill="${C.bone}"/>${t(110, 300, 240, C.ink, 'Vertigo')}${mono(116, 1880, 32, C.ink, 'DOWN · DOWN · DOWN')}`, 3);
    },
  },
  {
    id: 'skyline',
    title: 'Skyline',
    tone: 'graphite',
    svg: () => {
      let towers = '';
      const hs = [700, 1100, 850, 1300, 600, 950, 1150, 720];
      hs.forEach((h, i) => {
        towers += `<rect x="${80 + i * 185}" y="${1900 - h}" width="160" height="${h}" fill="${i === 3 ? C.orange : C.bone}"/>`;
        for (let k = 0; k < Math.floor(h / 90); k++) towers += `<rect x="${110 + i * 185}" y="${1940 - h + k * 90}" width="100" height="26" fill="${i === 3 ? C.ink : C.graphite}"/>`;
      });
      return frame(C.graphite, C.bone, `<circle cx="1180" cy="520" r="230" fill="${C.orange}"/>${towers}${t(110, 330, 230, C.bone, 'Skyline')}`, 4);
    },
  },
];

export async function portraitPlaceholders(outDir, count) {
  const entries = [];
  for (const d of DESIGNS.slice(0, Math.max(0, count))) {
    const file = `placeholder-portrait-${d.id}.svg`;
    await fs.writeFile(path.join(outDir, file), d.svg());
    entries.push({
      id: `placeholder-${d.id}`,
      title: d.title,
      year: '',
      medium: 'Placeholder',
      size: '4:5',
      description: 'A stand-in so the portrait hall has something to slide between. Add your own portrait posters to posters-src/ and run npm run posters.',
      alt: `${d.title} — placeholder portrait poster`,
      tone: d.tone,
      format: 'portrait',
      image: { src: `/posters/${file}`, width: W, height: H },
      placeholder: true,
    });
  }
  return entries;
}
