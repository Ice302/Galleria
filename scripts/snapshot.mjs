#!/usr/bin/env node
// Visual check: screenshots every chapter at desktop + mobile sizes and
// reports console errors / CSP violations. Uses your installed Chrome.
//
//   npm run dev            (or: npm run build && npm run preview)
//   node scripts/snapshot.mjs [url] [outDir]

import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'snapshots';
const CHROME =
  process.env.CHROME_PATH ||
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  }[process.platform] ||
  '/usr/bin/google-chrome';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

// [label, element selector, fraction through that element]
const STOPS = [
  ['01-hero', '#top', 0],
  ['02-velocity', '#velocity', 0.25],
  ['03-velocity-late', '#velocity', 0.7],
  ['04-transit-early', '#transit', 0.15],
  ['05-transit-mid', '#transit', 0.45],
  ['06-transit-late', '#transit', 0.75],
  ['07-scale', '#scale', 0.35],
  ['08-boarding', '#boarding', 0.3],
  ['09-tapes', '.tapes', -0.4],
  ['10-board', '.board', -0.1],
  ['11-reel-a', '#reel', 0.0],
  ['12-reel-b', '#reel', 0.35],
  ['13-reel-c', '#reel', 0.7],
  ['14-hallb-a', '#hall-b', 0.04],
  ['15-hallb-b', '#hall-b', 0.14],
  ['16-hallb-c', '#hall-b', 0.24],
  ['17-message', '.message__pin', 0.5],
  ['18-wall-a', '.wall', 0.08],
  ['19-wall-b', '.wall', 0.5],
  ['20-sheet', '#index', 0],
  ['21-contact', '#contact', 0],
];

await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const problems = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`[${vp.name}] ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${vp.name}] pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1600));

  for (const [label, sel, f] of STOPS) {
    const y = await page.evaluate(
      (sel, f) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        // Pinned sections report their spacer's height.
        const box = (el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el).getBoundingClientRect();
        return Math.max(0, box.top + window.scrollY + box.height * f);
      },
      sel,
      f
    );
    if (y === null) continue;
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await new Promise((r) => setTimeout(r, 1300));
    await page.screenshot({ path: `${out}/${vp.name}-${label}.png` });
  }
  await page.close();
}

await browser.close();
console.log(problems.length ? [...new Set(problems)].join('\n') : 'No console errors.');
