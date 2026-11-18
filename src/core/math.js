export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Linear interpolation through [[x, y], ...] points (sorted by x).
export function piecewise(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return lerp(y0, y1, smoothstep(x0, x1, x));
    }
  }
  return points[points.length - 1][1];
}

export const pad = (n, len = 2) => String(Math.floor(Math.abs(n))).padStart(len, '0');
