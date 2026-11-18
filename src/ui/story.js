import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, pad } from '../core/math.js';
import { speedAt, morphAt, knotsAt, gearbox } from '../core/story-data.js';

// Maps scroll position → story units, drives the 3D stage, and keeps every
// HUD readout (cards, timecode, run %, phase timeline, nav) in sync.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function coord(v) {
  const n = v * 100;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '−' : '+'}${i.padStart(5, '0')}.${d}`;
}

export function initStory({ stage, scroll, reduced }) {
  const html = document.documentElement;
  const chapters = [...document.querySelectorAll('.chapter')];
  const exhibition = document.getElementById('exhibition');
  const contact = document.getElementById('contact');
  const stageEl = document.querySelector('.stage');
  const phaseItems = [...document.querySelectorAll('.phases li')];
  const phaseBars = phaseItems.map((li) => li.querySelector('.phases__bar i'));
  const navLinks = [...document.querySelectorAll('.nav a')];
  const logLines = [...document.querySelectorAll('.card__log li')];

  const el = {};
  for (const node of document.querySelectorAll('[data-t]')) (el[node.dataset.t] ||= []).push(node);
  const tc = document.querySelector('[data-tc]');
  const run = document.querySelector('[data-run]');

  let tops = [];
  let heights = [];
  let exTop = Infinity;
  let endTop = Infinity;
  let docMax = 1;

  function measure() {
    const y = window.scrollY;
    tops = chapters.map((c) => c.getBoundingClientRect().top + y);
    heights = chapters.map((c) => Math.max(c.offsetHeight, 1));
    exTop = exhibition.getBoundingClientRect().top + y;
    endTop = contact.getBoundingClientRect().top + y;
    docMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }
  measure();
  ScrollTrigger.addEventListener('refresh', measure);

  function uAt(y) {
    let i = 0;
    while (i < chapters.length - 1 && y >= tops[i + 1]) i++;
    return i + clamp((y - tops[i]) / heights[i], 0, 1);
  }

  // Cheap DOM writes: only touch nodes whose value changed.
  const last = {};
  const text = (key, value) => {
    if (!el[key] || last[key] === value) return;
    last[key] = value;
    for (const n of el[key]) n.textContent = value;
  };
  const bar = (key, v) => {
    const s = clamp(v, 0, 1).toFixed(3);
    if (!el[key] || last[key] === s) return;
    last[key] = s;
    for (const n of el[key]) n.style.transform = `scaleX(${s})`;
  };

  let activePhase = -1;
  let frame = 0;

  function update() {
    const y = window.scrollY;
    const u = uAt(y);
    const inStory = y < exTop;

    if (stage) {
      stage.setScroll(u);
      stage.setVelocity(scroll.velocity);
      if (stage.active !== inStory) {
        stage.setActive(inStory);
        stageEl.classList.toggle('is-off', !inStory);
      }
    }

    // Every other frame is plenty for text.
    if (frame++ % 2) return;

    const t = stage?.telemetry;
    const kmh = t ? t.kmh : speedAt(u);
    const gb = t ? t : gearbox(kmh);
    const m = t ? t.morph : morphAt(u);
    text('kmh', pad(Math.round(kmh), 3));
    text('gear', gb.gear);
    text('rpm', pad(Math.round(gb.rpm / 10) * 10, 5));
    bar('rpmbar', (gb.rpm - 4000) / 8600);
    text('morph', `${pad(Math.round(m * 100), 3)}%`);
    bar('morphbar', m);
    text('knots', (t ? t.knots : knotsAt(u)).toFixed(1).padStart(4, '0'));
    if (t) {
      text('x', coord(t.cam.x));
      text('y', coord(t.cam.y));
      text('z', coord(t.cam.z));
    }
    for (const li of logLines) li.classList.toggle('is-on', m >= Number(li.dataset.at));

    // E-180 tape: the whole page is three hours of timecode at 25 fps.
    const frac = clamp(y / docMax, 0, 1);
    const secs = frac * 3 * 3600;
    if (tc) {
      const v = `${pad(secs / 3600)}:${pad((secs / 60) % 60)}:${pad(secs % 60)}:${pad((secs % 1) * 25)}`;
      if (last.tc !== v) tc.textContent = last.tc = v;
    }
    if (run) {
      const v = pad(Math.round(frac * 100), 3);
      if (last.run !== v) run.textContent = last.run = v;
    }

    // Phase timeline: velocity (hero+velocity), transit, scale (scale+boarding), exhibition.
    const fills = [u / 2, u - 2, (u - 3) / 2, (y - exTop) / Math.max(endTop - exTop, 1)];
    fills.forEach((f, i) => {
      const s = clamp(f, 0, 1).toFixed(3);
      if (last[`p${i}`] !== s) {
        phaseBars[i].style.transform = `scaleX(${s})`;
        last[`p${i}`] = s;
      }
    });
    const phase = y >= exTop - window.innerHeight * 0.4 ? 3 : u >= 3 ? 2 : u >= 2 ? 1 : 0;
    if (phase !== activePhase) {
      activePhase = phase;
      phaseItems.forEach((li, i) => li.classList.toggle('is-active', i === phase));
      phaseItems.forEach((li, i) => li.querySelector('a').toggleAttribute('aria-current', i === phase));
    }
    const navIndex = y >= endTop - window.innerHeight * 0.6 ? 4 : u >= 1 || y >= exTop ? phase : -1;
    if (last.nav !== navIndex) {
      last.nav = navIndex;
      navLinks.forEach((a, i) => a.classList.toggle('is-active', i === navIndex));
    }
  }
  gsap.ticker.add(update);
  update();

  // Static bits: today's date on the boarding pass, live board clock.
  const now = new Date();
  for (const n of document.querySelectorAll('[data-today]')) {
    n.textContent = `${pad(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
  const clock = document.querySelector('[data-clock]');
  const tick = () => {
    const d = new Date();
    if (clock) clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  tick();
  setInterval(tick, 15000);

  // Hero title → individual letters (screen readers keep the whole word).
  const title = document.querySelector('[data-hero-title]');
  const word = title.textContent.trim();
  title.setAttribute('aria-label', word);
  title.replaceChildren(
    ...[...word].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = c;
      return s;
    })
  );
  const chars = title.querySelectorAll('.ch');
  const reveals = document.querySelectorAll('[data-reveal]');

  if (!reduced) {
    gsap.set(chars, { yPercent: 105, opacity: 0 });
    gsap.set(reveals, { y: 18, opacity: 0 });

    // Letters drift apart as the hero scrolls away — a little motion blur in type.
    // (Uses `y` so it composes with the intro's `yPercent`.)
    gsap.to(chars, {
      y: (i) => -title.offsetHeight * (0.12 + i * 0.07),
      ease: 'none',
      scrollTrigger: { trigger: '.chapter--hero', start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });

    for (const card of document.querySelectorAll('[data-card]')) {
      gsap.from(card.children, {
        opacity: 0,
        y: 26,
        duration: 0.8,
        stagger: 0.06,
        ease: 'power3.out',
        scrollTrigger: { trigger: card.closest('.chapter'), start: 'top 72%', toggleActions: 'play none none reverse' },
      });
    }
  }

  return {
    measure,
    intro() {
      if (reduced) return;
      gsap.to(chars, { yPercent: 0, opacity: 1, duration: 1.2, stagger: 0.045, ease: 'expo.out', overwrite: false });
      gsap.to(reveals, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, delay: 0.35, ease: 'power3.out' });
      html.classList.add('is-intro');
    },
  };
}
