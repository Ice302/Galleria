import { gsap } from 'gsap';
import { pad } from '../core/math.js';

// "Loading tape" screen. Progress is fed by real milestones (fonts, 3D module,
// scene build, shader warm-up) and eased so it never jumps.
export function createPreloader({ reduced }) {
  const el = document.querySelector('.preloader');
  if (!el) return { progress() {}, finish: async () => {} };
  const count = el.querySelector('[data-preload-count]');
  const bar = el.querySelector('[data-preload-bar]');
  let target = 0.05;
  let shown = 0;
  let resolveFull;
  let finishing = null;
  const full = new Promise((r) => (resolveFull = r));

  const tick = () => {
    shown += (target - shown) * (reduced ? 1 : 0.14);
    if (target - shown < 0.002) shown = target;
    count.textContent = pad(Math.round(shown * 100), 3);
    bar.style.transform = `scaleX(${shown.toFixed(3)})`;
    if (shown >= 1) resolveFull();
  };
  gsap.ticker.add(tick);

  return {
    progress(p) {
      target = Math.max(target, Math.min(p, 1));
    },
    async finish() {
      if (finishing) return finishing;
      finishing = this.lift();
      return finishing;
    },
    async lift() {
      target = 1;
      await Promise.race([full, new Promise((r) => setTimeout(r, 900))]);
      gsap.ticker.remove(tick);
      document.documentElement.classList.add('is-loaded');
      await gsap.to(el, {
        yPercent: reduced ? 0 : -100,
        opacity: reduced ? 0 : 1,
        duration: reduced ? 0.2 : 1.1,
        ease: 'expo.inOut',
      });
      el.remove();
    },
  };
}
