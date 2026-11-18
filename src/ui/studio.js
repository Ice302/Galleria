import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp } from '../core/math.js';
import { isSmallScreen } from '../core/env.js';

// The studio: "message from the artist" + the scattered wall.
//   • topographic contour lines behind both (marching squares over noise)
//   • message pinned while two lines of type slide in opposite directions,
//     the framed image opens up and the signature is drawn stroke by stroke
//   • the background turns from ink to paper as the wall arrives
//   • wall works drift at different speeds; the one at the centre of the
//     screen (or under the pointer) comes into colour

const INK = [14, 14, 14];
const BONE = [233, 230, 223];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

// ───────────── Signature ─────────────
export function prepareSignature(svg) {
  if (!svg) return () => {};
  // Pen paths (inside the font signature's mask) first, then the flourish.
  const strokes = [...svg.querySelectorAll('.sig__pen, .sig__stroke')].map((el) => ({ el, len: el.getTotalLength() || 1 }));
  const sum = strokes.reduce((a, s) => a + s.len, 0) || 1;
  let acc = 0;
  for (const s of strokes) {
    s.a = acc / sum;
    acc += s.len;
    s.b = acc / sum;
    s.el.style.strokeDasharray = `${s.len} ${s.len}`;
  }
  let last = -1;
  const draw = (q) => {
    if (Math.abs(q - last) < 0.0005) return;
    last = q;
    for (const s of strokes) {
      const l = clamp((q - s.a) / (s.b - s.a), 0, 1);
      s.el.style.strokeDashoffset = (s.len * (1 - l)).toFixed(2);
      s.el.style.opacity = l > 0.002 ? '1' : '0';
    }
  };
  draw(0);
  return draw;
}

// ───────────── Topographic lines ─────────────
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const field = (x, y) => noise(x, y) * 0.62 + noise(x * 2.1 + 17, y * 2.1 + 9) * 0.28 + noise(x * 4.3 + 3, y * 4.3 + 41) * 0.1;

function contours(w, h) {
  const cell = Math.max(w, 900) / 72;
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const scale = 1 / 520;
  const g = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) g[j * cols + i] = field(i * cell * scale, j * cell * scale);
  const levels = [0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72];
  const f = (n) => Math.round(n);
  let d = '';
  for (const lv of levels) {
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = g[j * cols + i];
        const b = g[j * cols + i + 1];
        const c = g[(j + 1) * cols + i + 1];
        const e = g[(j + 1) * cols + i];
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (e > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * cell;
        const y = j * cell;
        const top = [x + cell * ((lv - a) / (b - a)), y];
        const right = [x + cell, y + cell * ((lv - b) / (c - b))];
        const bottom = [x + cell * ((lv - e) / (c - e)), y + cell];
        const left = [x, y + cell * ((lv - a) / (e - a))];
        const segs = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
          5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
          9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
          13: [[bottom, right]], 14: [[left, bottom]],
        }[idx];
        for (const [p, q] of segs) d += `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
      }
    }
  }
  return d;
}

function initTopo(host) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'topo');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(NS, 'path');
  svg.append(path);
  host.prepend(svg);
  let size = [0, 0];
  const draw = () => {
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    if (!w || !h || (Math.abs(w - size[0]) < 40 && Math.abs(h - size[1]) / h < 0.05)) return;
    size = [w, h];
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    path.setAttribute('d', contours(w, h));
  };
  let timer;
  ScrollTrigger.addEventListener('refresh', () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 60);
  });
  draw();
}

export function initStudio({ reduced }) {
  const studio = document.getElementById('studio');
  if (!studio) return;
  studio.classList.add('studio--js');
  initTopo(studio);

  const message = studio.querySelector('.message');
  const pin = studio.querySelector('.message__pin');
  const [line1, line2] = studio.querySelectorAll('.message__line');
  const photo = studio.querySelector('.message__photo');
  const img = studio.querySelector('.message__img');
  const label = studio.querySelector('.message__label');
  const drawBig = prepareSignature(studio.querySelector('.message__sig .sig'));
  const drawSmall = prepareSignature(studio.querySelector('.wall__sig .sig'));
  const wall = studio.querySelector('.wall');
  const quote = studio.querySelector('.wall__quote');
  const items = [...studio.querySelectorAll('.wall__item')];

  if (reduced) {
    drawBig(1);
    drawSmall(1);
  } else {
    // Lines drift in opposite directions from the moment the section appears.
    const lines = gsap.timeline({
      scrollTrigger: { trigger: message, start: 'top bottom', end: () => `+=${window.innerHeight * 2.8}`, scrub: true, invalidateOnRefresh: true },
      defaults: { ease: 'none' },
    });
    lines.fromTo(line1, { xPercent: -4 }, { xPercent: -40 }, 0).fromTo(line2, { xPercent: -40 }, { xPercent: -6 }, 0);

    // The frame opens and the image settles as the section arrives.
    gsap.fromTo(photo, { clipPath: 'inset(14% 14% 14% 14%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)',
      ease: 'none',
      scrollTrigger: { trigger: message, start: 'top 85%', end: 'top top', scrub: true },
    });
    gsap.fromTo(img, { scale: 1.3 }, { scale: 1.04, ease: 'none', scrollTrigger: { trigger: message, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from(label, { opacity: 0, y: -16, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: message, start: 'top 40%', toggleActions: 'play none none reverse' } });

    // Pinned: the signature is written while the message holds.
    ScrollTrigger.create({
      trigger: message,
      start: 'top top',
      end: () => `+=${window.innerHeight * 1.6}`,
      pin,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => drawBig(clamp((self.progress - 0.08) / 0.72, 0, 1)),
    });

    // Paper: the background turns from ink to bone as the wall arrives.
    ScrollTrigger.create({
      trigger: wall,
      start: 'top 85%',
      end: 'top 25%',
      scrub: true,
      onUpdate: (self) => {
        const e = self.progress * self.progress * (3 - 2 * self.progress);
        studio.style.setProperty('--studio-bg', rgb(mix(INK, BONE, e)));
        studio.style.setProperty('--topo', e > 0.5 ? rgb(INK, 0.09 * (e - 0.5) * 2) : rgb(BONE, 0.07 * (1 - e * 2)));
      },
      onLeaveBack: () => {
        studio.style.setProperty('--studio-bg', rgb(INK));
        studio.style.setProperty('--topo', rgb(BONE, 0.07));
      },
    });

    if (quote) {
      gsap.from(quote, { opacity: 0, y: 40, ease: 'none', scrollTrigger: { trigger: wall, start: 'top 60%', end: 'top 25%', scrub: true } });
      ScrollTrigger.create({
        trigger: quote,
        start: 'top 70%',
        end: 'bottom 35%',
        scrub: true,
        onUpdate: (self) => drawSmall(self.progress),
      });
    }

    // Each work drifts at its own speed.
    const k = isSmallScreen() ? 0.35 : 1;
    for (const item of items) {
      const speed = Number(item.dataset.speed) || 0;
      gsap.fromTo(item, { y: speed * 380 * k }, { y: speed * -380 * k, ease: 'none', scrollTrigger: { trigger: wall, start: 'top bottom', end: 'bottom top', scrub: true } });
    }
  }

  // Only the work nearest the middle of the screen comes into colour.
  let visible = false;
  let focused = null;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(wall);
  gsap.ticker.add(() => {
    if (!visible) return;
    const mid = window.innerHeight / 2;
    let best = null;
    let bestD = window.innerHeight * 0.32;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    if (best !== focused) {
      focused?.classList.remove('is-focus');
      best?.classList.add('is-focus');
      focused = best;
    }
  });
}
