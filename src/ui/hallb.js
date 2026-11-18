import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp } from '../core/math.js';
import { isSmallScreen } from '../core/env.js';

// Hall B: a pinned portrait slider driven by scroll.
//
// Scroll maps to a slide position p ∈ [0, n-1]. Between slide k and k+1
// (t = p - k):
//   • the current poster recedes — slides back, tilts, darkens;
//   • the next one arrives in vertical strips that slide in from alternating
//     directions, each with a glowing orange leading edge, while an orange
//     sweep line crosses the frame;
//   • titles swap letter by letter (old ones rise out, new ones rise in);
//   • the counter rolls, the rail marker glides, the ambient colour crossfades.
// Everything is a pure function of p, so it scrubs both ways.

// Scroll budget in "units" (1 unit = 90% of the viewport height).
const START = 0.35; // rest on the first poster
const HOLD = 0.5; // rest after each transition
const END = 0.4; // rest on the last poster
const UNIT = 0.9;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;
const expoOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function splitTitle(h) {
  const text = h.textContent.trim();
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  const chars = [];
  text.split(/\s+/).forEach((word, wi) => {
    if (wi) vis.append(' ');
    const w = document.createElement('span');
    w.className = 'w';
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      w.append(c);
      chars.push(c);
    }
    vis.append(w);
  });
  h.replaceChildren(sr, vis);
  return chars;
}

function buildStrips(frame, img, count) {
  const wrap = document.createElement('span');
  wrap.className = 'pslide__strips';
  wrap.setAttribute('aria-hidden', 'true');
  const strips = [];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = `pstrip ${i % 2 ? 'pstrip--down' : 'pstrip--up'}`;
    s.style.left = `${(i / count) * 100}%`;
    s.style.width = `${100 / count}%`;
    const clone = img.cloneNode();
    clone.removeAttribute('class');
    clone.alt = '';
    clone.style.width = `${count * 100}%`;
    clone.style.left = `${-i * 100}%`;
    s.append(clone);
    wrap.append(s);
    strips.push({ el: s, img: clone, dir: i % 2 ? -1 : 1 });
  }
  frame.append(wrap);
  return strips;
}

function ambientFor(img) {
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 50;
  const draw = () => {
    const ctx = c.getContext('2d');
    if (!ctx || !img.naturalWidth) return;
    try {
      ctx.filter = 'blur(3px) saturate(1.4)';
    } catch {}
    ctx.drawImage(img, -4, -4, 48, 58);
  };
  if (img.complete) draw();
  else img.addEventListener('load', draw, { once: true });
  return c;
}

export function initHallB({ scroll, reduced }) {
  const section = document.getElementById('hall-b');
  if (!section) return null;
  const pin = section.querySelector('.hallb__pin');
  const nodes = [...section.querySelectorAll('.pslide')];
  const n = nodes.length;
  if (!n) return null;

  section.classList.add('hallb--js');
  const stripCount = isSmallScreen() ? 4 : 6;
  const ambient = section.querySelector('.hallb__ambient');
  const live = document.querySelector('[data-announce]');

  const slides = nodes.map((el) => {
    const frame = el.querySelector('.pslide__frame');
    const img = el.querySelector('.pslide__img');
    const figure = el.querySelector('.pslide__figure');
    const w = Number(img.getAttribute('width'));
    const h = Number(img.getAttribute('height'));
    if (w && h) figure.style.setProperty('--ratio', (w / h).toFixed(4));
    const shade = document.createElement('span');
    shade.className = 'pslide__shade';
    const sweep = document.createElement('span');
    sweep.className = 'pslide__sweep';
    const strips = reduced ? [] : buildStrips(frame, img, stripCount);
    frame.append(shade, sweep);
    const glow = ambientFor(img);
    ambient.prepend(glow);
    return {
      el,
      frame,
      img,
      strips,
      shade,
      sweep,
      glow,
      info: el.querySelector('.pslide__info'),
      chars: splitTitle(el.querySelector('.pslide__title')),
      rest: [el.querySelector('.pslide__kicker'), el.querySelector('.pslide__meta'), el.querySelector('.pslide__desc')].filter(Boolean),
      role: '',
    };
  });

  // Load every image in the hall a little before it arrives.
  new IntersectionObserver(
    ([e], obs) => {
      if (!e.isIntersecting) return;
      for (const im of section.querySelectorAll('img')) im.loading = 'eager';
      obs.disconnect();
    },
    { rootMargin: '150% 0px' }
  ).observe(section);

  const roll = section.querySelector('.hallb__roll');
  const progress = section.querySelector('.hallb__progress i');
  const thumbs = [...section.querySelectorAll('.hallb__thumb')];
  const marker = section.querySelector('.hallb__marker');
  const [prevBtn, nextBtn] = section.querySelectorAll('.hallb__btn');
  let thumbStep = 0;
  const measure = () => {
    thumbStep = thumbs.length > 1 ? thumbs[1].getBoundingClientRect().top - thumbs[0].getBoundingClientRect().top : 0;
  };

  // ───── scroll → p ─────
  const seg = 1 + HOLD;
  const total = START + (n - 1) * seg + END;
  const toP = (raw) => {
    const x = raw - START;
    if (x <= 0) return 0;
    const k = Math.floor(x / seg);
    if (k >= n - 1) return n - 1;
    return k + clamp(x - k * seg, 0, 1);
  };
  const restFor = (i) => (i <= 0 ? START * 0.5 : START + (i - 1) * seg + 1 + HOLD * 0.5);

  let target = 0;
  let p = 0;
  let drawn = -1;
  let shown = -1;

  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(total * UNIT * window.innerHeight)}`,
    pin,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      target = toP(self.progress * total);
    },
    onRefresh: measure,
  });

  function setRole(s, role) {
    if (s.role === role) return;
    s.role = role;
    s.el.classList.toggle('is-cur', role === 'cur');
    s.el.classList.toggle('is-in', role === 'in');
  }

  function chars(list, t, dir) {
    // dir = -1: leaving (rise out), +1: arriving (rise in).
    const m = Math.max(list.length - 1, 1);
    for (let j = 0; j < list.length; j++) {
      const local = clamp(t * 1.5 - (j / m) * 0.5, 0, 1);
      const y = dir < 0 ? -112 * easeIn(local) : 112 * (1 - expoOut(local));
      list[j].style.transform = `translate3d(0, ${y.toFixed(2)}%, 0)`;
    }
  }

  function rest(list, v, dy) {
    for (let j = 0; j < list.length; j++) {
      const local = clamp(v * 1.3 - j * 0.12, 0, 1);
      list[j].style.opacity = local.toFixed(3);
      list[j].style.transform = `translate3d(0, ${((1 - local) * dy).toFixed(1)}px, 0)`;
    }
  }

  function render(pv) {
    const k = Math.min(Math.floor(pv + 1e-6), n - 1);
    const t = k >= n - 1 ? 0 : pv - k;
    const e = easeInOut(t);

    slides.forEach((s, i) => {
      if (i === k) {
        setRole(s, 'cur');
        if (reduced) {
          s.frame.style.opacity = (1 - t).toFixed(3);
          s.frame.style.transform = '';
        } else {
          s.frame.style.opacity = '';
          s.frame.style.transform = `translate3d(${(-7 * e).toFixed(2)}%, ${(3 * e).toFixed(2)}%, 0) scale(${(1 - 0.13 * e).toFixed(4)}) rotate(${(-3.5 * e).toFixed(2)}deg)`;
        }
        s.shade.style.opacity = (0.7 * e).toFixed(3);
        s.sweep.style.opacity = '0';
        if (reduced) for (const c of s.chars) c.style.transform = '';
        else chars(s.chars, clamp(t / 0.55, 0, 1), -1);
        rest(s.rest, 1 - clamp(t / 0.4, 0, 1), -18);
        s.info.style.opacity = reduced ? (1 - clamp(t * 2, 0, 1)).toFixed(3) : '';
        s.glow.style.opacity = (1 - e).toFixed(3);
      } else if (i === k + 1 && t > 0) {
        setRole(s, 'in');
        s.shade.style.opacity = '0';
        if (reduced) {
          s.frame.style.transform = '';
          s.frame.style.opacity = t.toFixed(3);
          s.img.style.visibility = 'visible';
        } else {
          s.frame.style.opacity = '';
          s.frame.style.transform = `scale(${(1.05 - 0.05 * easeOut(t)).toFixed(4)})`;
          const last = s.strips.length - 1 || 1;
          s.strips.forEach((strip, j) => {
            const local = clamp((t - (j / last) * 0.38) / 0.62, 0, 1);
            const q = expoOut(local);
            const y = strip.dir * (1 - q) * 106;
            strip.el.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0)`;
            strip.img.style.transform = `translate3d(0, ${(-y * 0.35).toFixed(2)}%, 0) scale(${(1 + 0.12 * (1 - q)).toFixed(4)})`;
            strip.el.style.setProperty('--lip', local > 0 && local < 1 ? (1 - q).toFixed(3) : '0');
          });
          s.sweep.style.opacity = Math.sin(Math.PI * clamp(t * 1.1, 0, 1)).toFixed(3);
          s.sweep.style.transform = `translate3d(${(clamp(t * 1.1, 0, 1) * s.frame.offsetWidth).toFixed(1)}px, 0, 0)`;
        }
        if (reduced) for (const c of s.chars) c.style.transform = '';
        else chars(s.chars, clamp((t - 0.32) / 0.68, 0, 1), 1);
        rest(s.rest, clamp((t - 0.5) / 0.5, 0, 1), 22);
        s.info.style.opacity = reduced ? clamp(t * 2 - 1, 0, 1).toFixed(3) : '';
        s.glow.style.opacity = e.toFixed(3);
      } else {
        setRole(s, '');
        s.glow.style.opacity = '0';
      }
    });

    const r = reduced ? Math.round(pv) : k + e;
    roll.style.transform = `translate3d(0, ${(-r).toFixed(4)}em, 0)`;
    progress.style.transform = `scaleX(${(n > 1 ? pv / (n - 1) : 1).toFixed(4)})`;
    if (marker) marker.style.transform = `translate3d(0, ${(r * thumbStep).toFixed(1)}px, 0)`;

    const near = Math.round(pv);
    if (near !== shown) {
      shown = near;
      thumbs.forEach((th, i) => th.classList.toggle('is-active', i === near));
      if (prevBtn) prevBtn.disabled = near <= 0;
      if (nextBtn) nextBtn.disabled = near >= n - 1;
    }
  }

  let announced = 0;
  gsap.ticker.add((_t, dt) => {
    p = reduced ? target : p + (target - p) * (1 - Math.exp(-(dt / 1000) * 11));
    if (Math.abs(target - p) < 0.0004) p = target;
    if (Math.abs(p - drawn) > 0.0002) {
      drawn = p;
      render(p);
    }
    // Announce a slide once it has settled.
    if (p === target && Number.isInteger(p) && p !== announced && st.isActive && live) {
      announced = p;
      live.textContent = `Hall B, ${p + 1} of ${n}: ${slides[p].chars.map((c) => c.textContent).join('')}`;
    }
  });

  // ───── Stopper ─────
  // A transition never stops halfway. Wheel: each gesture moves exactly one
  // poster and stops on it; the momentum of that gesture is ignored. At the
  // first/last poster the wheel scrolls out of the hall as normal. Touch,
  // keys and the scrollbar: when scrolling pauses mid-transition, the slide
  // finishes in the direction you were going.
  const restY = (i) => st.start + (restFor(clamp(i, 0, n - 1)) / total) * (st.end - st.start);
  const inside = () => window.scrollY >= st.start - 2 && window.scrollY <= st.end + 2;
  const easeSettle = (x) => 1 - (1 - x) ** 4;
  let stepping = false;
  let quiet = false;
  let lastWheel = 0;
  let dir = 1;
  let wasInside = false;
  let arrived = true;
  let safety;

  function settle(i, duration) {
    const idx = clamp(i, 0, n - 1);
    stepping = true;
    quiet = true;
    clearTimeout(safety);
    safety = setTimeout(() => (stepping = false), duration * 1000 + 500);
    scroll.to(restY(idx), {
      duration,
      easing: easeSettle,
      lock: true,
      force: true,
      onComplete: () => {
        stepping = false;
        clearTimeout(safety);
      },
    });
  }

  // From the last poster, one gesture glides out of the hall.
  function exit() {
    stepping = true;
    quiet = true;
    clearTimeout(safety);
    safety = setTimeout(() => (stepping = false), 1400);
    scroll.to(st.end + 4, {
      duration: 0.9,
      easing: easeSettle,
      lock: true,
      force: true,
      onComplete: () => {
        stepping = false;
        clearTimeout(safety);
      },
    });
  }

  function goTo(i) {
    const idx = clamp(i, 0, n - 1);
    settle(idx, 1.05 + 0.22 * Math.abs(idx - Math.round(p)));
  }

  scroll.addGuard(({ deltaY, event }) => {
    if (!event.type.includes('wheel') || event.ctrlKey) return false;
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    if (!inside() || Math.abs(deltaY) < 1) return false;
    const d = deltaY > 0 ? 1 : -1;
    const cur = Math.round(target);
    // Arriving with momentum: land on the first (or last) poster.
    if (!arrived) {
      arrived = true;
      if (event.cancelable) event.preventDefault();
      settle(d > 0 ? 0 : n - 1, 0.8);
      return true;
    }
    if (d < 0 && cur <= 0 && !stepping) return false; // scroll out above
    if (event.cancelable) event.preventDefault();
    if (stepping || (quiet && gap < 220)) return true;
    quiet = false;
    if (d > 0 && cur >= n - 1) exit();
    else settle(cur + d, 1.05);
    return true;
  });

  let idle;
  let lastY = window.scrollY;
  let touching = false;
  function queueSnap() {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (stepping || touching || !inside()) return;
      const pv = toP(st.progress * total);
      const k = Math.floor(pv);
      const t = pv - k;
      if (t < 0.002 || t > 0.998) return;
      const to = dir > 0 ? (t > 0.1 ? k + 1 : k) : t < 0.9 ? k : k + 1;
      settle(to, reduced ? 0 : 0.45 + 0.6 * Math.abs(to - pv));
    }, 160);
  }
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (y !== lastY) dir = y > lastY ? 1 : -1;
      lastY = y;
      const now = inside();
      if (now && !wasInside) arrived = performance.now() - lastWheel > 220;
      wasInside = now;
      queueSnap();
    },
    { passive: true }
  );
  window.addEventListener('touchstart', () => (touching = true), { passive: true });
  window.addEventListener(
    'touchend',
    () => {
      touching = false;
      queueSnap();
    },
    { passive: true }
  );

  section.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    const step = e.target.closest('[data-step]');
    if (go) goTo(Number(go.dataset.go));
    else if (step) goTo(Math.round(p) + Number(step.dataset.step));
  });
  // Tabbing into a slide brings it on stage.
  section.addEventListener('focusin', (e) => {
    const slide = e.target.closest('.pslide');
    if (slide) goTo(Number(slide.dataset.index));
  });
  window.addEventListener('keydown', (e) => {
    if (!st.isActive || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowRight') goTo(Math.round(p) + 1);
    else if (e.key === 'ArrowLeft') goTo(Math.round(p) - 1);
    else return;
    e.preventDefault();
  });
  // Departures board rows for portrait works land here.
  document.addEventListener('galleria:goto', (e) => {
    const i = slides.findIndex((s) => s.el.dataset.id === e.detail?.id);
    if (i >= 0) goTo(i);
  });

  measure();
  render(0);
  return { goTo };
}

