import { pad } from '../core/math.js';

// Full-screen viewer built on the native <dialog>: Esc, focus trapping and the
// top layer come for free. Adds ←/→, swipe, click-to-zoom with pan, deep links
// (#work/<id>) and focus restoration.

export function initLightbox({ posters, scroll }) {
  const dlg = document.getElementById('lightbox');
  if (!dlg || typeof dlg.showModal !== 'function' || !posters.length) return { openFromHash() {} };

  const $ = (k) => dlg.querySelector(`[data-lb="${k}"]`);
  const img = $('img');
  const zoomBtn = dlg.querySelector('[data-lb-zoom]');
  const stageEl = dlg.querySelector('.lightbox__stage');
  const html = document.documentElement;
  const n = posters.length;
  const modeBtn = dlg.querySelector('[data-lb-mode]');
  let index = 0;
  let trigger = null;
  // Print (site treatment) or the untouched original; remembered per visitor.
  let showOriginal = false;
  try {
    showOriginal = localStorage.getItem('galleria:original') === '1';
  } catch {}

  $('total').textContent = pad(n);

  function setZoom(on) {
    dlg.classList.toggle('is-zoomed', on);
    zoomBtn.setAttribute('aria-label', on ? 'Zoom out' : 'Zoom in');
    if (!on) img.style.transformOrigin = '';
  }

  function show(i) {
    index = (i + n) % n;
    const p = posters[index];
    setZoom(false);
    img.classList.add('is-loading');
    img.onload = () => img.classList.remove('is-loading');
    img.onerror = () => img.classList.remove('is-loading');
    const original = showOriginal && p.original;
    img.src = original ? p.original : p.src;
    modeBtn.hidden = !p.original;
    modeBtn.setAttribute('aria-pressed', String(!!original));
    modeBtn.textContent = original ? 'View print' : 'View original';
    img.alt = p.alt || p.title;
    img.width = p.width;
    img.height = p.height;
    $('index').textContent = pad(index + 1);
    $('title').textContent = p.title;
    $('desc').textContent = p.description || '';
    $('year').textContent = p.year || '—';
    $('medium').textContent = p.medium || '—';
    $('size').textContent = p.size || `${p.width}×${p.height}`;
    // Warm the neighbours so arrowing feels instant.
    for (const d of [1, -1]) {
      const q = posters[(index + d + n) % n];
      new Image().src = showOriginal && q.original ? q.original : q.src;
    }
    history.replaceState(null, '', `#work/${p.id}`);
  }

  function open(id, from) {
    const i = posters.findIndex((p) => p.id === id);
    if (i < 0) return;
    trigger = from || document.activeElement;
    show(i);
    if (!dlg.open) dlg.showModal();
    scroll.stop();
    html.classList.add('lb-open');
  }

  dlg.addEventListener('close', () => {
    scroll.start();
    html.classList.remove('lb-open');
    setZoom(false);
    history.replaceState(null, '', location.pathname + location.search);
    trigger?.focus?.({ preventScroll: true });
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-open]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a.dataset.open, a);
  });

  dlg.querySelector('[data-lb-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-lb-prev]').addEventListener('click', () => show(index - 1));
  dlg.querySelector('[data-lb-next]').addEventListener('click', () => show(index + 1));
  const toggleMode = () => {
    if (!posters[index].original) return;
    showOriginal = !showOriginal;
    try {
      localStorage.setItem('galleria:original', showOriginal ? '1' : '0');
    } catch {}
    show(index);
  };
  modeBtn.addEventListener('click', toggleMode);

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key.toLowerCase() === 'o' && !e.metaKey && !e.ctrlKey) toggleMode();
    else return;
    e.preventDefault();
  });

  // Click to zoom; while zoomed, the zoom origin follows the pointer.
  zoomBtn.addEventListener('click', (e) => {
    const on = !dlg.classList.contains('is-zoomed');
    if (on) pan(e);
    setZoom(on);
  });
  function pan(e) {
    const r = img.getBoundingClientRect();
    if (!r.width || e.clientX === undefined) return;
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 0), 100);
    const y = Math.min(Math.max(((e.clientY - r.top) / r.height) * 100, 0), 100);
    img.style.transformOrigin = `${x}% ${y}%`;
  }
  stageEl.addEventListener('pointermove', (e) => {
    if (dlg.classList.contains('is-zoomed') && e.pointerType === 'mouse') pan(e);
  });

  // Swipe between works on touch.
  let sx = null;
  let sy = 0;
  stageEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') {
      sx = e.clientX;
      sy = e.clientY;
    }
  });
  stageEl.addEventListener('pointerup', (e) => {
    if (sx === null || dlg.classList.contains('is-zoomed')) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - sy)) show(index + (dx < 0 ? 1 : -1));
    sx = null;
  });

  return {
    open,
    openFromHash() {
      const m = /^#work\/([\w-]+)$/.exec(location.hash);
      if (m) open(m[1]);
    },
  };
}
