import { BufferGeometry, Float32BufferAttribute } from 'three';

// Lofts a closed superellipse cross-section along the x axis.
// Each station: { x, hw (half width), top, bottom } — values are smoothed with
// Catmull-Rom so a handful of stations reads as a continuous, sculpted body.

const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function resample(stations, rings) {
  const keys = Object.keys(stations[0]);
  const n = stations.length;
  const out = [];
  for (let i = 0; i < rings; i++) {
    const f = (i / (rings - 1)) * (n - 1);
    const k = Math.min(Math.floor(f), n - 2);
    const t = f - k;
    const s = {};
    for (const key of keys) {
      s[key] = catmull(
        stations[Math.max(k - 1, 0)][key],
        stations[k][key],
        stations[k + 1][key],
        stations[Math.min(k + 2, n - 1)][key],
        t
      );
    }
    s.hw = Math.max(s.hw, 0.002);
    out.push(s);
  }
  return out;
}

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

export function loft(stations, { rings = 40, segments = 28, pTop = 2.5, pBottom = 2.5, caps = true } = {}) {
  const rs = resample(stations, rings);
  const pos = [];
  const idx = [];

  const ringPoint = (s, j) => {
    const a = (j / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const p = sn >= 0 ? pTop : pBottom;
    const mid = (s.top + s.bottom) / 2;
    const hh = (s.top - s.bottom) / 2;
    return [s.x, mid + spow(sn, 2 / p) * hh, spow(c, 2 / p) * s.hw];
  };

  for (const s of rs) {
    for (let j = 0; j < segments; j++) pos.push(...ringPoint(s, j));
  }
  // Winding depends on whether stations run toward +x or -x.
  const inc = rs[rings - 1].x > rs[0].x;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + ((j + 1) % segments);
      if (inc) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }

  // Caps get their own vertices so their normals stay crisp.
  if (caps) {
    for (const [ri, flip] of [[0, !inc], [rings - 1, inc]]) {
      const s = rs[ri];
      const base = pos.length / 3;
      pos.push(s.x, (s.top + s.bottom) / 2, 0);
      for (let j = 0; j < segments; j++) pos.push(...ringPoint(s, j));
      for (let j = 0; j < segments; j++) {
        const a = base + 1 + j;
        const b = base + 1 + ((j + 1) % segments);
        if (flip) idx.push(base, b, a);
        else idx.push(base, a, b);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
