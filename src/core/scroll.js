import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Smooth scrolling that never takes the wheel away from the visitor: Lenis
// only eases native scroll, keyboard/space/page keys still work, and with
// reduced motion we fall back to plain native scrolling.

export function createScroll({ reduced }) {
  let lenis = null;
  // Sections can claim wheel gestures (Hall B steps one poster per gesture).
  // A guard returns true when it has handled the event.
  const guards = [];

  if (!reduced) {
    lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 1,
      touchMultiplier: 1.1,
      anchors: { offset: 0 },
      autoRaf: false,
      virtualScroll: (data) => !guards.some((g) => g(data)),
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    // Native anchors, instantly.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  }

  return {
    lenis,
    get velocity() {
      return lenis ? lenis.velocity : 0;
    },
    get y() {
      return lenis ? lenis.animatedScroll : window.scrollY;
    },
    to(target, opts = {}) {
      if (lenis) {
        lenis.scrollTo(target, opts);
        return;
      }
      if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'auto' });
      else (typeof target === 'string' ? document.querySelector(target) : target)?.scrollIntoView({ block: 'start' });
      opts.onComplete?.();
    },
    addGuard(fn) {
      guards.push(fn);
    },
    stop() {
      lenis?.stop();
    },
    start() {
      lenis?.start();
    },
  };
}
