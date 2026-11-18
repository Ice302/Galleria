import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, pad } from '../core/math.js';
import { isFinePointer } from '../core/env.js';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-';

// ───────────── Split-flap departures board ─────────────
function prepareFlaps(el) {
  const label = el.textContent.trim();
  const chars = [...(el.dataset.flap || label.toUpperCase())];
  const real = document.createElement('span');
  real.className = 'sr-only';
  real.textContent = label;
  const flaps = document.createElement('span');
  flaps.className = 'flaps';
  flaps.setAttribute('aria-hidden', 'true');
  let word = null;
  const items = chars.map((ch) => {
    const f = document.createElement('span');
    f.className = ch === ' ' ? 'flap is-space' : 'flap';
    f.textContent = ch === ' ' ? '' : ch;
    if (ch === ' ') {
      flaps.append(f);
      word = null;
    } else {
      if (!word) {
        word = document.createElement('span');
        word.className = 'word';
        flaps.append(word);
      }
      word.append(f);
    }
    return { el: f, ch };
  });
  el.replaceChildren(real, flaps);
  return items;
}

function runFlaps(rows) {
  const items = [];
  rows.forEach((row, r) =>
    row.forEach((it, i) => {
      if (it.ch === ' ') return;
      items.push({ ...it, settle: 180 + r * 110 + i * 42 + Math.random() * 260 });
    })
  );
  const start = performance.now();
  let lastStep = 0;
  const step = (now) => {
    const t = now - start;
    if (now - lastStep > 55) {
      lastStep = now;
      let pending = 0;
      for (const it of items) {
        if (it.done) continue;
        if (t >= it.settle) {
          it.el.textContent = it.ch;
          it.done = true;
        } else {
          it.el.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          pending++;
        }
      }
      if (!pending) return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ───────────── Loupe: see the untouched original under the pointer ─────────────
function initLoupes() {
  for (const frame of document.querySelectorAll('.exhibit__frame[data-loupe]')) {
    const orig = frame.querySelector('.exhibit__orig');
    if (!orig) continue;
    const load = () => {
      if (orig.src) return;
      orig.addEventListener('load', () => orig.classList.add('is-ready'), { once: true });
      orig.srcset = orig.dataset.srcset;
      orig.src = orig.dataset.src;
    };
    const move = (e) => {
      const f = frame.getBoundingClientRect();
      frame.style.setProperty('--fx', `${(e.clientX - f.left).toFixed(1)}px`);
      frame.style.setProperty('--fy', `${(e.clientY - f.top).toFixed(1)}px`);
      // The image sits inside a scaled/parallaxed wrapper: map into its own box.
      const r = orig.getBoundingClientRect();
      if (!r.width) return;
      orig.style.setProperty('--ox', `${(((e.clientX - r.left) / r.width) * orig.offsetWidth).toFixed(1)}px`);
      orig.style.setProperty('--oy', `${(((e.clientY - r.top) / r.height) * orig.offsetHeight).toFixed(1)}px`);
    };
    frame.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      load();
      move(e);
      frame.classList.add('is-loupe');
    });
    frame.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && move(e));
    frame.addEventListener('pointerleave', () => frame.classList.remove('is-loupe'));
  }
}

// ───────────── Velocity-reactive tape marquees ─────────────
function initTapes(scroll, reduced) {
  const tracks = [...document.querySelectorAll('[data-marquee]')];
  if (reduced) return;
  const state = tracks.map((track) => {
    const seed = track.firstElementChild;
    // Fill at least two screen widths so the loop never shows a gap.
    const need = Math.ceil((window.innerWidth * 2.4) / Math.max(seed.offsetWidth, 1));
    for (let i = 0; i < need; i++) track.append(seed.cloneNode(true));
    return { track, unit: seed.offsetWidth, dir: Number(track.dataset.marquee) || 1, x: 0 };
  });
  const tapes = document.querySelector('.tapes');
  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(tapes);
  gsap.ticker.add((_t, dt) => {
    if (!visible) return;
    const boost = clamp(Math.abs(scroll.velocity) * 6, 0, 260);
    for (const s of state) {
      s.x -= (60 + boost) * s.dir * (dt / 1000);
      s.x = ((s.x % s.unit) - s.unit) % s.unit;
      s.track.style.transform = `translate3d(${s.x.toFixed(2)}px,0,0)`;
    }
  });
}

export function initExhibition({ scroll, reduced, posters }) {
  const reel = document.getElementById('reel');
  const track = reel.querySelector('.reel__track');
  const exhibits = [...reel.querySelectorAll('.exhibit')];
  const hudIndex = reel.querySelector('[data-reel-index]');
  const hudTitle = reel.querySelector('[data-reel-title]');
  const rail = reel.querySelector('[data-reel-rail]');

  // Image robustness: never show a broken-image icon.
  for (const img of document.querySelectorAll('.exhibit__img, .sheet__pic')) {
    const fail = () => img.classList.add('is-broken');
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) fail();
    img.addEventListener('error', fail, { once: true });
  }

  // Contact sheet: each frame takes its poster's exact shape.
  for (const item of document.querySelectorAll('.sheet__item')) {
    const img = item.querySelector('img');
    const w = Number(img?.getAttribute('width'));
    const h = Number(img?.getAttribute('height'));
    if (w && h) item.style.setProperty('--r', (w / h).toFixed(4));
  }

  // Accent + aspect ratio come from data, set via CSSOM (keeps the CSP strict).
  for (const ex of exhibits) {
    const img = ex.querySelector('img');
    const w = Number(img.getAttribute('width'));
    const h = Number(img.getAttribute('height'));
    if (w && h) ex.style.setProperty('--ratio', (w / h).toFixed(4));
    if (ex.dataset.accent) ex.style.setProperty('--orange', ex.dataset.accent);
  }

  // Board.
  const rows = [...document.querySelectorAll('.board__title')].map(prepareFlaps);
  if (reduced) {
    // Already showing the settled characters.
  } else {
    ScrollTrigger.create({ trigger: '.board', start: 'top 80%', once: true, onEnter: () => runFlaps(rows) });
    gsap.from('.exhibition__title', {
      yPercent: 40,
      opacity: 0,
      duration: 1.1,
      ease: 'expo.out',
      scrollTrigger: { trigger: '.exhibition', start: 'top 70%' },
    });
    gsap.from('.board__row', {
      opacity: 0,
      x: -16,
      duration: 0.6,
      stagger: 0.05,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.board', start: 'top 80%' },
    });
  }

  let active = -1;
  function setActive(i) {
    if (i === active || !exhibits[i]) return;
    active = i;
    reel.dataset.tone = exhibits[i].dataset.tone;
    if (hudIndex) hudIndex.textContent = pad(i + 1);
    if (hudTitle) hudTitle.textContent = posters[i]?.title ?? '';
  }

  let goTo = (i) => scroll.to(exhibits[i], { offset: -80 });

  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 900px)', mobile: '(max-width: 899px)' }, (ctx) => {
    if (ctx.conditions.desktop) {
      const distance = () => Math.max(track.scrollWidth - window.innerWidth, 1);
      const skew = reduced ? null : gsap.quickTo(track, 'skewX', { duration: 0.6, ease: 'power3' });
      let pinned = false;
      const settle = () => pinned && skew?.(clamp(scroll.velocity * -0.12, -3.5, 3.5));
      gsap.ticker.add(settle);
      const tween = gsap.to(track, { x: () => -distance(), ease: 'none' });
      const st = ScrollTrigger.create({
        trigger: reel,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: reduced ? true : 0.8,
        animation: tween,
        invalidateOnRefresh: true,
        anticipatePin: 1,
        onUpdate(self) {
          if (rail) rail.style.transform = `scaleX(${self.progress.toFixed(4)})`;
        },
        onToggle(self) {
          pinned = self.isActive;
          if (!pinned) skew?.(0);
        },
      });

      exhibits.forEach((ex, i) => {
        ScrollTrigger.create({
          trigger: ex,
          containerAnimation: tween,
          start: 'left 62%',
          end: 'right 38%',
          onToggle: (self) => self.isActive && setActive(i),
        });
        if (reduced) return;
        const wipe = ex.querySelector('.exhibit__wipe');
        const img = ex.querySelector('.exhibit__pics');
        const num = ex.querySelector('.exhibit__num');
        const stub = ex.querySelector('.stub');
        gsap.fromTo(
          wipe,
          { scaleX: 1 },
          { scaleX: 0, ease: 'power2.inOut', scrollTrigger: { trigger: ex, containerAnimation: tween, start: 'left 92%', end: 'left 40%', scrub: true } }
        );
        const pass = { trigger: ex, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true };
        gsap.fromTo(img, { xPercent: -4.5 }, { xPercent: 4.5, ease: 'none', scrollTrigger: pass });
        gsap.fromTo(num, { xPercent: 35 }, { xPercent: -35, ease: 'none', scrollTrigger: { ...pass } });
        gsap.fromTo(stub, { y: 60, rotate: 3 }, { y: -30, rotate: -1.5, ease: 'none', scrollTrigger: { ...pass } });
      });

      goTo = (i) => {
        const ex = exhibits[i];
        if (!ex) return;
        const x = ex.offsetLeft + ex.offsetWidth / 2 - window.innerWidth / 2;
        const p = clamp(x / distance(), 0, 1);
        scroll.to(st.start + p * (st.end - st.start), { duration: 1.8 });
      };

      return () => {
        gsap.ticker.remove(settle);
        gsap.set(track, { clearProps: 'transform' });
      };
    }

    // Mobile: a vertical exhibition — no scroll hijacking on phones.
    exhibits.forEach((ex, i) => {
      ScrollTrigger.create({
        trigger: ex,
        start: 'top 55%',
        end: 'bottom 45%',
        onToggle: (self) => self.isActive && setActive(i),
      });
      if (reduced) return;
      gsap.fromTo(
        ex.querySelector('.exhibit__wipe'),
        { scaleX: 1 },
        { scaleX: 0, ease: 'power2.inOut', scrollTrigger: { trigger: ex, start: 'top 85%', end: 'top 40%', scrub: true } }
      );
    });
    goTo = (i) => scroll.to(exhibits[i], { offset: -70 });
    return undefined;
  });

  setActive(0);

  // Board rows jump to their exhibit.
  for (const link of document.querySelectorAll('.board__link')) {
    link.addEventListener('click', (e) => {
      const i = exhibits.findIndex((ex) => ex.dataset.id === link.dataset.work);
      e.preventDefault();
      e.stopPropagation();
      // Portrait works live in Hall B, which positions itself.
      if (i < 0) document.dispatchEvent(new CustomEvent('galleria:goto', { detail: { id: link.dataset.work } }));
      else goTo(i);
    });
  }

  // Contact sheet frames slide in.
  if (!reduced) {
    gsap.from('.sheet__item', {
      opacity: 0,
      y: 40,
      duration: 0.8,
      stagger: 0.06,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.sheet__grid', start: 'top 80%' },
    });
  }

  initTapes(scroll, reduced);
  if (isFinePointer()) initLoupes();

  return { goTo: (i) => goTo(i) };
}
