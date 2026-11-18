import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// Car → ship particle morph. Both models are surface-sampled with the same
// number of points, matched by rank along x (nose ↔ bow, gearbox ↔ stern),
// then flown between surfaces in a shader driven by a single progress value.
// Timing mirrors the dissolve sweeps: the car breaks up nose-first during
// m ∈ [0, 0.4] and the ship assembles bow-first during m ∈ [0.55, 0.95].

export const CAR_PHASE = 0.4;
export const SHIP_START = 0.55;
export const SHIP_PHASE = 0.4;

function surfaceSampler(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noSample) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.userData.sampleColor ?? o.material.color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  });
  const merged = mergeGeometries(parts, false);
  return new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
}

function samplePoints(root, count, accept = () => true) {
  const sampler = surfaceSampler(root);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0, guard = 0; i < count && guard < count * 20; guard++) {
    sampler.sample(p, undefined, c);
    if (!accept(p)) continue;
    pos.set([p.x, p.y, p.z], i * 3);
    col.set([c.r, c.g, c.b], i * 3);
    i++;
  }
  return { pos, col };
}

const vertexShader = /* glsl */ `
  attribute vec3 aEnd;
  attribute vec3 aColorA;
  attribute vec3 aColorB;
  attribute vec4 aTiming; // leave, arrive, rand, rand

  uniform float uProgress;
  uniform float uTime;
  uniform float uProj;
  uniform float uSizeA;
  uniform float uSizeB;
  uniform float uTurbulence;
  uniform mat4 uMatA;
  uniform mat4 uMatB;
  uniform vec3 uHotA;
  uniform vec3 uHotB;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float leave = aTiming.x;
    float arrive = aTiming.y;
    float t = clamp((uProgress - leave) / (arrive - leave), 0.0, 1.0);
    float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
    float arc = sin(t * 3.14159265);

    vec3 a = (uMatA * vec4(position, 1.0)).xyz;
    vec3 b = (uMatB * vec4(aEnd, 1.0)).xyz;
    vec3 p = mix(a, b, e);

    // Burst outward from the length axis, swirl, rise and drift.
    vec3 radial = normalize(vec3(0.0, a.y - 0.3 + 0.001, a.z + 0.001));
    float ang = (aTiming.w - 0.5) * 2.4 * arc;
    float ca = cos(ang), sa = sin(ang);
    radial = vec3(radial.x, radial.y * ca - radial.z * sa, radial.y * sa + radial.z * ca);
    p += radial * arc * (0.8 + aTiming.z * 3.0);
    p.y += arc * (0.5 + aTiming.w * 1.5);
    p.x += arc * (aTiming.z - 0.5) * 4.0;
    p += arc * uTurbulence * vec3(
      sin(uTime * 1.7 + aTiming.z * 40.0),
      sin(uTime * 1.3 + aTiming.w * 23.0),
      cos(uTime * 1.1 + aTiming.z * 31.0));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = mix(uSizeA, uSizeB, e) * (1.0 + arc * 0.8);
    gl_PointSize = clamp(size * uProj / -mv.z, 1.0, 28.0);

    vec3 hot = aTiming.z > 0.62 ? uHotA : uHotB;
    vColor = mix(mix(aColorA, aColorB, e), hot, arc * 0.75);
    vAlpha = smoothstep(leave - 0.004, leave + 0.02, uProgress) * (1.0 - smoothstep(arrive, arrive + 0.045, uProgress));
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, vAlpha);
    #include <colorspace_fragment>
  }
`;

export function createMorph(car, ship, count) {
  const A = samplePoints(car.group, count);
  const B = samplePoints(ship.group, count, (p) => p.y > 0.25);

  const order = (arr) => Array.from({ length: count }, (_, i) => i).sort((i, j) => arr[i * 3] - arr[j * 3]);
  const oa = order(A.pos);
  const ob = order(B.pos);

  // Shuffle the matched pairs so any drawRange prefix is a uniform subset
  // (used by the adaptive-quality step-down).
  const pairs = oa.map((ia, k) => [ia, ob[k]]);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  const ca = car.bounds;
  const sb = ship.bounds;
  const carLen = ca.max.x - ca.min.x;
  const shipLen = sb.max.x - sb.min.x;

  const start = new Float32Array(count * 3);
  const end = new Float32Array(count * 3);
  const colA = new Float32Array(count * 3);
  const colB = new Float32Array(count * 3);
  const timing = new Float32Array(count * 4);
  const lift = new THREE.Color(0xe9e6df);
  const tmp = new THREE.Color();

  pairs.forEach(([ia, ib], k) => {
    start.set(A.pos.subarray(ia * 3, ia * 3 + 3), k * 3);
    end.set(B.pos.subarray(ib * 3, ib * 3 + 3), k * 3);
    // Lift very dark samples so the cloud reads on a dark stage.
    tmp.fromArray(A.col, ia * 3).lerp(lift, 0.18);
    colA.set([tmp.r, tmp.g, tmp.b], k * 3);
    tmp.fromArray(B.col, ib * 3).lerp(lift, 0.12);
    colB.set([tmp.r, tmp.g, tmp.b], k * 3);

    const nxA = (A.pos[ia * 3] - ca.min.x) / carLen;
    const nxB = (B.pos[ib * 3] - sb.min.x) / shipLen;
    const r1 = Math.random();
    const r2 = Math.random();
    const leave = THREE.MathUtils.clamp((1 - nxA) * CAR_PHASE + (r1 - 0.5) * 0.03, 0, CAR_PHASE + 0.02);
    let arrive = SHIP_START + (1 - nxB) * SHIP_PHASE + (r2 - 0.5) * 0.05;
    arrive = THREE.MathUtils.clamp(Math.max(arrive, leave + 0.28), 0, 0.985);
    timing.set([leave, arrive, Math.random(), Math.random()], k * 4);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  geo.setAttribute('aColorA', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('aColorB', new THREE.BufferAttribute(colB, 3));
  geo.setAttribute('aTiming', new THREE.BufferAttribute(timing, 4));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uProj: { value: 800 },
      uSizeA: { value: 0.034 },
      uSizeB: { value: 0.13 },
      uTurbulence: { value: 0.6 },
      uMatA: { value: car.group.matrixWorld },
      uMatB: { value: ship.group.matrixWorld },
      uHotA: { value: new THREE.Color(0xff5a1f) },
      uHotB: { value: new THREE.Color(0xe9e6df) },
    },
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  return {
    points,
    count,
    uniforms: material.uniforms,
    setDensity(fraction) {
      geo.setDrawRange(0, Math.max(1000, Math.floor(count * fraction)));
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
