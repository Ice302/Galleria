export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const isSmallScreen = () => window.matchMedia('(max-width: 899px)').matches;

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ok = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

// Posters are rendered into the page at build time; this reads the same data.
export function readPosterData() {
  try {
    const el = document.getElementById('poster-data');
    const data = JSON.parse(el?.textContent || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
