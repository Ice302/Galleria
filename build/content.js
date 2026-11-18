// Vite plugin: renders content/site.json + content/posters.json into
// index.html at dev/build time. The gallery is therefore real HTML — it works
// without JavaScript, is indexable, and the client never has to innerHTML
// anything. Every value is validated and escaped on the way in.

import fs from 'node:fs';
import path from 'node:path';
import { loadSignature, signatureSVG } from './signature.js';

const TONES = ['ink', 'bone', 'orange', 'graphite', 'sage'];
const TONE_CYCLE = ['ink', 'orange', 'bone', 'graphite', 'sage'];

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pad = (n, l = 2) => String(n).padStart(l, '0');

function safeUrl(url, fallback = '') {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : fallback;
  } catch {
    return fallback;
  }
}

// Site-relative paths or https URLs only; no traversal, quotes or whitespace.
function safeSrc(src) {
  const s = String(src ?? '');
  if (/^\/[\w\-./%@]+$/.test(s) && !s.includes('..')) return s;
  if (/^https:\/\/[^\s"'<>`]+$/.test(s)) return s;
  return null;
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'work';

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`[galleria] Could not read ${path.basename(file)}: ${e.message}`);
  }
}

function normaliseSite(raw) {
  const email = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(raw.email ?? '') ? raw.email : 'hello@example.com';
  const [emailUser, emailDomain] = email.split('@');
  return {
    siteName: raw.siteName || 'Galleria',
    artist: raw.artist || 'Your Name',
    role: raw.role || 'Poster designer',
    tagline: raw.tagline || 'A moving exhibition of landscape posters.',
    description: raw.description || raw.tagline || '',
    url: safeUrl(raw.url, 'https://example.com/').replace(/\/$/, ''),
    location: raw.location || '',
    availability: raw.availability || 'Open for commissions',
    series: raw.series || '01',
    edition: raw.edition || '001',
    emailUser,
    emailDomain,
    message: {
      label: String(raw.message?.label || 'Message from the artist').slice(0, 60),
      lines: (Array.isArray(raw.message?.lines) ? raw.message.lines : ['Every poster starts as a feeling', 'I could never put into words'])
        .slice(0, 2)
        .map((l) => String(l).slice(0, 90)),
      image: safeSrc(raw.message?.image),
    },
    quote: String(raw.quote || '').slice(0, 280),
    signatureFont: String(raw.signatureFont || 'hurricane'),
    socials: (raw.socials || [])
      .map((s) => ({ label: String(s.label || '').slice(0, 40), url: safeUrl(s.url) }))
      .filter((s) => s.label && s.url),
  };
}

function normalisePosters(raw, warn) {
  if (!Array.isArray(raw)) throw new Error('[galleria] content/posters.json must be an array');
  const seen = new Set();
  const out = [];
  raw.forEach((p, i) => {
    const img = p.image || {};
    const src = safeSrc(img.src);
    if (!src) {
      warn(`poster #${i + 1} (${p.title ?? 'untitled'}) skipped: image.src must be a site path like /posters/x.webp or an https URL`);
      return;
    }
    let id = slug(p.id || p.title || `work-${i + 1}`);
    while (seen.has(id)) id += '-x';
    seen.add(id);
    const width = Math.max(1, Number(img.width) || 1600);
    const height = Math.max(1, Number(img.height) || 1000);
    // Landscape → Hall A (the reel); portrait → Hall B (the portrait slider).
    const format = p.format === 'portrait' || p.format === 'landscape' ? p.format : height > width ? 'portrait' : 'landscape';
    const toSet = (list) =>
      (Array.isArray(list) ? list : [])
        .map((s) => ({ w: Number(s.w), src: safeSrc(s.src) }))
        .filter((s) => s.w > 0 && s.src)
        .sort((a, b) => a.w - b.w);
    const srcset = toSet(img.srcset);
    // The untouched artwork, when the "Galleria print" treatment is applied.
    const original = toSet(img.original);
    out.push({
      id,
      title: String(p.title || 'Untitled').slice(0, 80),
      year: p.year ? String(p.year).slice(0, 12) : '',
      medium: String(p.medium || '').slice(0, 60),
      size: String(p.size || '').slice(0, 40),
      description: String(p.description || '').slice(0, 600),
      alt: String(p.alt || p.title || 'Poster').slice(0, 300),
      status: p.status ? String(p.status).slice(0, 20) : '',
      tone: TONES.includes(p.tone) ? p.tone : TONE_CYCLE[i % TONE_CYCLE.length],
      accent: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '',
      placeholder: Boolean(p.placeholder),
      format,
      src,
      srcset,
      width,
      height,
      large: srcset.length ? srcset[srcset.length - 1].src : src,
      small: srcset.length ? srcset[0].src : src,
      original,
      originalLarge: original.length ? original[original.length - 1].src : null,
    });
  });
  return out;
}

function barcode(seed, { height = 56, bars = 46 } = {}) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let x = 0;
  let rects = '';
  for (let i = 0; i < bars; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + (Math.abs(h) % 4);
    if (i % 2 === 0) rects += `<rect x="${x}" width="${w}" height="${height}"/>`;
    x += w;
  }
  return `<svg class="barcode" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="currentColor">${rects}</g></svg>`;
}

function imgTag(p, { sizes, cls, eager = false, useSmall = false }) {
  const srcset = p.srcset.length ? ` srcset="${p.srcset.map((s) => `${esc(s.src)} ${s.w}w`).join(', ')}" sizes="${sizes}"` : '';
  const src = useSmall ? p.small : p.srcset.length ? (p.srcset.find((s) => s.w >= 1400) || p.srcset[p.srcset.length - 1]).src : p.src;
  return `<img class="${cls}" src="${esc(src)}"${srcset} width="${p.width}" height="${p.height}" alt="${esc(p.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" draggable="false">`;
}

function statusFor(p, i, maxYear, yearsVary) {
  if (p.status) return p.status;
  if (i === 0) return 'Now boarding';
  // "New" only means something when the works span more than one year.
  if (yearsVary && p.year && p.year === maxYear) return 'New';
  return 'On display';
}

// Desktop slots for the scattered wall (positions live in studio.css as
// .wall__item--s1 … --s9); "tall" slots suit portrait works.
const WALL_SLOTS = [
  { speed: 0.12, tall: true },
  { speed: -0.18 },
  { speed: 0.05, big: true },
  { speed: 0.22, tall: true },
  { speed: -0.1 },
  { speed: 0.15 },
  { speed: -0.06 },
  { speed: 0.2, tall: true },
  { speed: -0.14 },
];

// "*word*" → emphasised word. Escaped first, so nothing else gets through.
const emphasise = (text) => esc(text).replace(/\*([^*]{1,60})\*/g, '<strong>$1</strong>');

function render(html, site, posters, sig) {
  // Placeholders only ever fill Hall B; everything else lists real works.
  const real = posters.some((p) => !p.placeholder) ? posters.filter((p) => !p.placeholder) : posters;
  const hallA = posters.filter((p) => p.format !== 'portrait');
  const hallB = posters.filter((p) => p.format === 'portrait');
  const total = real.length;
  const years = real.map((p) => p.year).filter(Boolean).sort();
  const maxYear = years[years.length - 1] || '';
  const yearRange = years.length ? (years[0] === maxYear ? maxYear : `${years[0]}–${maxYear}`) : '';
  const now = new Date();
  const countA = hallA.filter((p) => !p.placeholder).length;
  const countB = hallB.filter((p) => !p.placeholder).length;

  const board = real
    .map((p, i) => {
      const st = statusFor(p, i, maxYear, new Set(years).size > 1);
      return `<li class="board__row">
        <a class="board__link" href="#work-${p.id}" data-work="${p.id}" data-cursor="Go">
          <span class="board__no">${pad(i + 1)}</span>
          <span class="board__title" data-flap="${esc(p.title.toUpperCase())}">${esc(p.title)}</span>
          <span class="board__year">${esc(p.year)}</span>
          <span class="board__medium">${esc(p.medium)}</span>
          <span class="board__hall">${p.format === 'portrait' ? 'B' : 'A'}</span>
          <span class="board__status" data-status="${esc(slug(st))}">${esc(st)}</span>
        </a>
      </li>`;
    })
    .join('\n');

  const reel = hallA
    .map(
      (p, i) => `<article class="exhibit" id="work-${p.id}" data-id="${p.id}" data-index="${i}" data-tone="${p.tone}"${p.accent ? ` data-accent="${p.accent}"` : ''} aria-labelledby="work-${p.id}-title">
        <span class="exhibit__num" aria-hidden="true">${pad(i + 1)}</span>
        <figure class="exhibit__figure">
          <a class="exhibit__frame" href="${esc(p.originalLarge || p.large)}" data-open="${p.id}" ${p.original.length ? 'data-loupe' : 'data-cursor="View"'} aria-label="View ${esc(p.title)} full screen">
            <span class="exhibit__pics">
              ${imgTag(p, { sizes: '(max-width: 899px) 92vw, 68vw', cls: 'exhibit__img' })}
              ${
                p.original.length
                  ? `<img class="exhibit__orig" data-src="${esc(p.original[0].src)}" data-srcset="${p.original.map((s) => `${esc(s.src)} ${s.w}w`).join(', ')}" sizes="(max-width: 899px) 92vw, 68vw" width="${p.width}" height="${p.height}" alt="" aria-hidden="true" decoding="async" draggable="false">`
                  : ''
              }
            </span>
            ${p.original.length ? '<span class="exhibit__loupe mono" aria-hidden="true"><span>Original</span></span>' : ''}
          </a>
          <span class="exhibit__wipe" aria-hidden="true"></span>
        </figure>
        <aside class="stub">
          <div class="stub__head mono"><span>Exhibit</span><span>${pad(i + 1)} / ${pad(hallA.length)}</span></div>
          <h3 class="stub__title" id="work-${p.id}-title">${esc(p.title)}</h3>
          <dl class="stub__grid mono">
            <div><dt>Year</dt><dd>${esc(p.year || '—')}</dd></div>
            <div><dt>Seat</dt><dd>${pad(i + 1)}-A</dd></div>
            <div><dt>Medium</dt><dd>${esc(p.medium || '—')}</dd></div>
            <div><dt>Format</dt><dd>${esc(p.size || `${p.width}×${p.height}`)}</dd></div>
          </dl>
          ${p.description ? `<p class="stub__desc">${esc(p.description)}</p>` : ''}
          <div class="stub__code">${barcode(p.id)}<span class="mono">GL ${pad(i + 1)} ${String(p.id).slice(0, 10).toUpperCase()}</span></div>
          ${p.original.length ? '<p class="stub__hint mono">Hover the print to see the original</p>' : ''}
          <p class="stub__foot mono">Galleria · Admit one</p>
        </aside>
      </article>`
    )
    .join('\n');

  // ───────────── Hall B: portrait slider ─────────────
  const slides = hallB
    .map((p, i) => {
      const open = !p.placeholder;
      const frameOpen = open
        ? `<a class="pslide__frame" href="${esc(p.originalLarge || p.large)}" data-open="${p.id}" data-cursor="View" aria-label="View ${esc(p.title)} full screen">`
        : '<div class="pslide__frame">';
      return `<li class="pslide" id="work-${p.id}" data-id="${p.id}" data-index="${i}" data-tone="${p.tone}"${p.accent ? ` data-accent="${p.accent}"` : ''}${p.placeholder ? ' data-placeholder' : ''} aria-labelledby="work-${p.id}-title">
          <figure class="pslide__figure">
            ${frameOpen}${imgTag(p, { sizes: '(max-width: 899px) 72vw, 36vw', cls: 'pslide__img' })}${open ? '</a>' : '</div>'}
          </figure>
          <div class="pslide__info">
            <p class="pslide__kicker mono"><span>B—${pad(i + 1)}</span><span>${p.placeholder ? 'Placeholder' : esc(p.year || '')}</span></p>
            <h3 class="pslide__title" id="work-${p.id}-title">${esc(p.title)}</h3>
            <dl class="pslide__meta mono">
              <div><dt>Medium</dt><dd>${esc(p.medium || '—')}</dd></div>
              <div><dt>Format</dt><dd>${esc(p.size || `${p.width}×${p.height}`)}</dd></div>
            </dl>
            ${p.description ? `<p class="pslide__desc">${esc(p.description)}</p>` : ''}
          </div>
        </li>`;
    })
    .join('\n');
  const rail = hallB
    .map(
      (p, i) => `<li><button class="hallb__thumb" type="button" data-go="${i}" aria-label="Show ${esc(p.title)}">${imgTag(p, { sizes: '64px', cls: 'hallb__thumbimg', useSmall: true }).replace(/ alt="[^"]*"/, ' alt=""')}</button></li>`
    )
    .join('');
  const hallBSection = hallB.length
    ? `<section class="hallb" id="hall-b" aria-labelledby="hallb-title" data-count="${hallB.length}">
      <div class="hallb__pin">
        <div class="hallb__ambient" aria-hidden="true"></div>
        <header class="hallb__head">
          <p class="eyebrow mono"><span class="tag tag--ink">B</span> Hall B · Portrait · ${pad(countB)} work${countB === 1 ? '' : 's'}</p>
          <h2 class="hallb__heading" id="hallb-title">Standing tall.</h2>
        </header>
        <ol class="hallb__slides">${slides}</ol>
        <div class="hallb__counter mono" aria-hidden="true">
          <span class="hallb__digits"><span class="hallb__roll">${hallB.map((_, i) => `<span>${pad(i + 1)}</span>`).join('')}</span></span>
          <span class="hallb__of">/ ${pad(hallB.length)}</span>
        </div>
        <div class="hallb__progress" aria-hidden="true"><i></i></div>
        <ol class="hallb__rail" aria-label="Portrait works">${rail}<li class="hallb__marker" aria-hidden="true"></li></ol>
        <div class="hallb__nav">
          <button class="hallb__btn" type="button" data-step="-1" aria-label="Previous portrait"><span aria-hidden="true">←</span></button>
          <button class="hallb__btn" type="button" data-step="1" aria-label="Next portrait"><span aria-hidden="true">→</span></button>
        </div>
        <p class="hallb__hint mono" aria-hidden="true">Scroll to slide</p>
      </div>
    </section>`
    : '';

  // ───────────── The studio: message + scattered wall ─────────────
  // Your photo if you've set one, otherwise a placeholder that says where it goes.
  const photo = site.message.image
    ? `<img class="message__img" src="${esc(site.message.image)}" alt="${esc(site.artist)}" loading="lazy" decoding="async" draggable="false">`
    : `<img class="message__img message__img--placeholder" src="/portrait-placeholder.svg" width="1600" height="2000" alt="Placeholder for a portrait of ${esc(site.artist)}" loading="lazy" decoding="async" draggable="false">`;
  const line = (text) => `<span>${esc(text)}</span><span>${esc(text)}</span><span>${esc(text)}</span>`;
  const [l1 = '', l2 = ''] = site.message.lines;

  const slots = WALL_SLOTS.map((slot, i) => ({ ...slot, i }));
  // Every format gets a place on the wall: portraits first, then landscape.
  const tall = real.filter((p) => p.format === 'portrait').slice(0, slots.filter((sl) => sl.tall).length);
  const wallWorks = [...tall, ...real.filter((p) => p.format !== 'portrait').slice(0, slots.length - tall.length)];
  // Portrait works take tall slots first, landscape fill the rest in order.
  const free = [...slots];
  const placed = [];
  for (const p of [...wallWorks].sort((a, b) => (b.format === 'portrait') - (a.format === 'portrait'))) {
    const want = p.format === 'portrait' ? free.findIndex((sl) => sl.tall) : free.findIndex((sl) => !sl.tall);
    const [slot] = free.splice(want >= 0 ? want : 0, 1);
    placed.push({ p, slot });
  }
  placed.sort((a, b) => a.slot.i - b.slot.i);
  const wall = placed
    .map(
      ({ p, slot }) => `<li class="wall__item wall__item--s${slot.i + 1}${p.format === 'portrait' ? ' is-tall' : ''}" data-speed="${slot.speed}">
        <a class="wall__link" href="${esc(p.originalLarge || p.large)}" data-open="${p.id}" data-cursor="View" aria-label="View ${esc(p.title)} full screen">
          <span class="wall__cap mono">${esc(p.title)}${p.year ? `, ${esc(p.year)}` : ''}</span>
          <span class="wall__frame">${imgTag(p, { sizes: slot.big ? '(max-width: 899px) 80vw, 36vw' : '(max-width: 899px) 60vw, 22vw', cls: 'wall__img', useSmall: !slot.big })}</span>
        </a>
      </li>`
    )
    .join('\n');

  const studio = `<section class="studio" id="studio" aria-labelledby="message-title">
      <div class="message" id="message">
        <div class="message__pin">
          <p class="message__label mono"><span class="brand__mark" aria-hidden="true">G<i></i><i></i><i></i></span><span id="message-title">${esc(site.message.label)}</span></p>
          <div class="message__lines" aria-hidden="true">
            <p class="message__line message__line--serif">${line(l1)}</p>
            <p class="message__line message__line--sans">${line(l2)}</p>
          </div>
          <p class="sr-only">${esc(l1)} ${esc(l2)} — ${esc(site.artist)}</p>
          <figure class="message__photo">${photo}</figure>
          <div class="message__sig">${signatureSVG(sig, 'message')}</div>
        </div>
      </div>
      <div class="wall" id="wall">
        ${
          site.quote
            ? `<blockquote class="wall__quote"><p>${emphasise(site.quote)}</p><footer><span class="wall__sig">${signatureSVG(sig, 'wall')}</span><cite class="sr-only">${esc(site.artist)}</cite></footer></blockquote>`
            : ''
        }
        <ul class="wall__items">${wall}</ul>
      </div>
    </section>`;

  const sheet = real
    .map(
      (p, i) => `<li class="sheet__item${p.format === 'portrait' ? ' sheet__item--portrait' : ''}">
        <a class="sheet__link" href="${esc(p.originalLarge || p.large)}" data-open="${p.id}" data-cursor="View" aria-label="View ${esc(p.title)} full screen">
          <span class="sheet__img">${imgTag(p, { sizes: '(max-width: 899px) 46vw, 24vw', cls: 'sheet__pic', useSmall: true })}</span>
          <span class="sheet__cap mono"><span>${pad(i + 1)}</span><span>${esc(p.title)}</span><span>${esc(p.year)}</span></span>
        </a>
      </li>`
    )
    .join('\n');

  const socials = site.socials
    .map((s) => `<a class="btn btn--line" href="${esc(s.url)}" rel="noopener noreferrer me" target="_blank">${esc(s.label)}<span class="sr-only"> (opens in a new tab)</span></a>`)
    .join('\n');

  const counts = {};
  for (const y of years) counts[y] = (counts[y] || 0) + 1;
  const ys = Object.keys(counts).sort();
  const maxC = Math.max(1, ...Object.values(counts));
  const bw = 100 / Math.max(ys.length, 1);
  const chart = `<svg class="yearchart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Works per year: ${ys.map((y) => `${y}: ${counts[y]}`).join(', ')}">${ys
    .map((y, i) => {
      const h = (counts[y] / maxC) * 34;
      return `<rect x="${(i * bw + bw * 0.34).toFixed(2)}" y="${(38 - h).toFixed(2)}" width="${(bw * 0.32).toFixed(2)}" height="${h.toFixed(2)}"/>`;
    })
    .join('')}</svg><div class="yearchart__labels mono" aria-hidden="true">${ys.map((y) => `<span>${esc(y)}</span>`).join('')}</div>`;

  const abs = (u) => (u.startsWith('http') ? u : site.url + u);
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: site.siteName,
    description: site.description,
    url: site.url + '/',
    creator: { '@type': 'Person', name: site.artist, jobTitle: site.role, sameAs: site.socials.map((s) => s.url) },
    associatedMedia: real.map((p) => ({
      '@type': 'ImageObject',
      name: p.title,
      description: p.description,
      contentUrl: abs(p.originalLarge || p.large),
      width: p.width,
      height: p.height,
      dateCreated: p.year,
      creator: { '@type': 'Person', name: site.artist },
    })),
  };
  // JSON inside <script> must not be able to close the tag.
  const safeJSON = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const data = real.map((p) => ({
    id: p.id,
    title: p.title,
    year: p.year,
    medium: p.medium,
    size: p.size,
    description: p.description,
    alt: p.alt,
    src: p.large,
    original: p.originalLarge,
    srcset: p.srcset,
    width: p.width,
    height: p.height,
    tone: p.tone,
    accent: p.accent,
    format: p.format,
  }));

  const tokens = {
    'site.siteName': site.siteName,
    'site.artist': site.artist,
    'site.role': site.role,
    'site.tagline': site.tagline,
    'site.description': site.description,
    'site.url': site.url + '/',
    'site.location': site.location,
    'site.availability': site.availability,
    'site.series': site.series,
    'site.edition': site.edition,
    ogImage: site.url + '/og.png',
    emailUser: site.emailUser,
    emailDomain: site.emailDomain,
    count: pad(total),
    countA: pad(countA),
    countB: pad(countB),
    formats: countB ? `${countA} landscape · ${countB} portrait` : `${countA} landscape posters`,
    years: yearRange,
    year: now.getFullYear(),
    month: pad(now.getMonth() + 1),
  };

  return html
    .replace(/<!-- @board -->/g, board)
    .replace(/<!-- @reel -->/g, reel)
    .replace(/<!-- @hallb -->/g, hallBSection)
    .replace(/<!-- @studio -->/g, studio)
    .replace(/<!-- @sheet -->/g, sheet)
    .replace(/<!-- @socials -->/g, socials)
    .replace(/<!-- @yearchart -->/g, chart)
    .replace(/<!-- @barcode:([\w-]+) -->/g, (_, seed) => barcode(seed, { height: 48, bars: 60 }))
    .replace(/<!-- @jsonld -->/g, `<script type="application/ld+json">${safeJSON(jsonld)}</script>`)
    .replace(/<!-- @data -->/g, safeJSON(data))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => (key in tokens ? esc(tokens[key]) : m));
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'", // wasm: the meshopt model decoder
  "style-src 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' blob:", // blob: textures embedded in the .glb models
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

export function galleriaContent({ root }) {
  const contentDir = path.join(root, 'content');
  // (content/signature.svg, if you add one, is picked up the same way.)
  return [
    {
      name: 'galleria-content',
      transformIndexHtml: {
        order: 'pre',
        async handler(html) {
          const warn = (m) => console.warn(`\x1b[33m[galleria]\x1b[0m ${m}`);
          const site = normaliseSite(readJSON(path.join(contentDir, 'site.json')));
          const posters = normalisePosters(readJSON(path.join(contentDir, 'posters.json')), warn);
          if (!posters.length) warn('No posters to show — add some with `npm run posters`.');
          const sig = await loadSignature(site.artist, { file: path.join(contentDir, 'signature.svg'), font: site.signatureFont, warn });
          return render(html, site, posters, sig);
        },
      },
      configureServer(server) {
        server.watcher.add(contentDir);
        server.watcher.on('change', (file) => {
          if (file.startsWith(contentDir)) server.ws.send({ type: 'full-reload' });
        });
      },
    },
    {
      name: 'galleria-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
      },
    },
  ];
}

export { CSP };
