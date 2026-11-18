import { gsap } from 'gsap';
import { isFinePointer } from '../core/env.js';

// Small pieces: cursor follower, "play tape" tour, rewind, email, VHS mode.

export function initCursor({ reduced }) {
  if (reduced || !isFinePointer()) return;
  const el = document.querySelector('.cursor');
  const label = el?.querySelector('.cursor__label');
  if (!el) return;
  document.documentElement.classList.add('has-cursor');
  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
  let current = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      xTo(e.clientX);
      yTo(e.clientY);
      // The loupe draws its own ring; step out of its way.
      el.classList.toggle('is-hidden', !!e.target.closest?.('[data-loupe]'));
      const target = e.target.closest?.('[data-cursor]') ?? null;
      if (target !== current) {
        current = target;
        el.classList.toggle('is-active', !!target);
        label.textContent = target?.dataset.cursor ?? '';
      }
    },
    { passive: true }
  );
  document.documentElement.addEventListener('mouseleave', () => el.classList.add('is-hidden'));
}

export function initTour({ scroll, reduced }) {
  const btn = document.querySelector('.tour');
  if (!btn) return;
  if (reduced || !scroll.lenis) {
    btn.hidden = true;
    return;
  }
  const label = btn.querySelector('.tour__label');
  const stopEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  let playing = false;

  const interrupt = (e) => {
    if (e.target?.closest?.('.tour')) return;
    stop();
  };

  function stop() {
    if (!playing) return;
    playing = false;
    btn.setAttribute('aria-pressed', 'false');
    label.textContent = 'Play tape';
    scroll.lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    for (const ev of stopEvents) window.removeEventListener(ev, interrupt, true);
  }

  function play() {
    const sheet = document.getElementById('index');
    const target = sheet.getBoundingClientRect().top + window.scrollY;
    if (target - window.scrollY < 200) scroll.lenis.scrollTo(0, { immediate: true, force: true });
    const distance = target - window.scrollY;
    playing = true;
    btn.setAttribute('aria-pressed', 'true');
    label.textContent = 'Pause';
    scroll.lenis.scrollTo(target, {
      duration: Math.max(distance / 480, 4),
      easing: (t) => t,
      force: true,
      onComplete: stop,
    });
    setTimeout(() => {
      if (playing) for (const ev of stopEvents) window.addEventListener(ev, interrupt, { capture: true, passive: true });
    }, 50);
  }

  btn.addEventListener('click', () => (playing ? stop() : play()));
}

export function initRewind({ scroll, reduced }) {
  const rec = document.querySelector('.rec span');
  for (const btn of document.querySelectorAll('[data-rewind]')) {
    btn.addEventListener('click', () => {
      if (rec) rec.textContent = '◀◀';
      const done = () => {
        if (rec) rec.textContent = 'TC';
        document.getElementById('top')?.focus?.({ preventScroll: true });
      };
      if (reduced || !scroll.lenis) {
        window.scrollTo({ top: 0 });
        done();
        return;
      }
      // Rewinding plays the whole story backwards: ship → pixels → car.
      scroll.lenis.scrollTo(0, {
        duration: 5.5,
        easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
        force: true,
        onComplete: done,
      });
    });
  }
}

export function initEmail() {
  for (const a of document.querySelectorAll('[data-email-user]')) {
    const addr = `${a.dataset.emailUser}@${a.dataset.emailDomain}`;
    a.href = `mailto:${addr}`;
    const t = a.querySelector('[data-email-text]');
    if (t) t.textContent = addr;
  }
}

export function initVHS() {
  const html = document.documentElement;
  const live = document.querySelector('[data-announce]');
  let buf = '';
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    buf = (buf + e.key.toLowerCase()).slice(-3);
    if (buf === 'vhs') {
      const on = html.classList.toggle('vhs');
      if (live) live.textContent = on ? 'VHS mode on.' : 'VHS mode off.';
      buf = '';
    }
  });
}
