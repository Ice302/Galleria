import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PALETTE, toon, flat, createDissolve } from './materials.js';
import { createContactShadow } from './f1.js';

// Imported models (prepared by `npm run models`), restyled for Galleria:
// every original material is replaced with the site's toon + dissolve
// shading, coloured by role. Both objects expose the same interface as the
// procedural createF1() / createShip(), so the stage doesn't care which it gets.
//
//   F1:   "2026 Cadillac MAC-26" by Dave Love — CC BY 4.0
//   Ship: "Cruise Ship" by Gman The Cruise Dude — CC BY 4.0

const BASE = import.meta.env.BASE_URL;
export const MODEL_URLS = { f1: `${BASE}models/f1.glb`, ship: `${BASE}models/ship.glb` };

const CAR_INK = 0x232323;
const SHIP_LENGTH = 27;
// Fraction of the ship's height that sits below the waterline.
const SHIP_DRAFT = 0.085;

export async function loadModels(onProgress = () => {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const done = { f1: 0, ship: 0 };
  const track = (key) => (e) => {
    if (e.total) done[key] = e.loaded / e.total;
    onProgress((done.f1 + done.ship) / 2);
  };
  const [f1, ship] = await Promise.all([
    loader.loadAsync(MODEL_URLS.f1, track('f1')),
    loader.loadAsync(MODEL_URLS.ship, track('ship')),
  ]);
  return { f1: f1.scene, ship: ship.scene };
}

// Quantised attributes can't hold values outside their range once we bake
// transforms in, so copy what we need into plain floats.
function toFloat(src) {
  const g = new THREE.BufferGeometry();
  const get = ['getX', 'getY', 'getZ', 'getW'];
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a[get[k]](i);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g;
}

// Flatten a loaded scene into [{ geometry, name, source }] with every node
// transform (plus `matrix`) baked into the vertices.
function bake(scene, matrix) {
  scene.updateMatrixWorld(true);
  const parts = [];
  const m = new THREE.Matrix4();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = toFloat(o.geometry);
    geometry.applyMatrix4(m.multiplyMatrices(matrix, o.matrixWorld));
    parts.push({ geometry, name: o.material?.name ?? '', source: o.material });
  });
  return parts;
}

function boundsOf(parts) {
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  }
  return box;
}

function translateAll(parts, v) {
  for (const p of parts) p.geometry.translate(v.x, v.y, v.z);
}

// Split one geometry into buckets by triangle centroid (used to separate the
// four wheels, which arrive merged into shared meshes).
function splitByTriangle(geometry, keyOf) {
  const pos = geometry.getAttribute('position');
  const attrs = ['position', 'normal', 'uv'].filter((n) => geometry.getAttribute(n));
  const idx = geometry.index ? geometry.index.array : null;
  const triCount = (idx ? idx.length : pos.count) / 3;
  const buckets = new Map();
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (idx ? idx[t * 3 + k] : t * 3 + k));
    c.set(0, 0, 0);
    for (const i of ids) c.add(v.fromBufferAttribute(pos, i));
    c.multiplyScalar(1 / 3);
    const key = keyOf(c);
    if (!buckets.has(key)) buckets.set(key, Object.fromEntries(attrs.map((n) => [n, []])));
    const b = buckets.get(key);
    for (const i of ids) {
      for (const n of attrs) {
        const a = geometry.getAttribute(n);
        for (let k = 0; k < a.itemSize; k++) b[n].push(a.array[i * a.itemSize + k]);
      }
    }
  }
  const out = new Map();
  for (const [key, b] of buckets) {
    const g = new THREE.BufferGeometry();
    for (const n of attrs) g.setAttribute(n, new THREE.Float32BufferAttribute(b[n], geometry.getAttribute(n).itemSize));
    out.set(key, g);
  }
  return out;
}

// ───────────────────────── F1 ─────────────────────────

function carRole(name) {
  if (/paint/.test(name)) return 'livery';
  if (/sidewall/.test(name)) return 'sidewall';
  if (/tread/.test(name)) return 'tyre';
  if (/wheel_hub|discs/.test(name)) return 'metal';
  if (/chrome/.test(name)) return 'steel';
  if (/rear_light/.test(name)) return 'light';
  if (/driver_color|cinture/.test(name)) return 'accent';
  return 'carbon';
}
const WHEEL_ROLES = new Set(['sidewall', 'tyre', 'metal']);

export function createF1FromModel(scene) {
  const dissolve = createDissolve({ dir: 1, noiseScale: 3.2, noiseAmp: 0.45, edge: 0.07 });
  const group = new THREE.Group();
  group.name = 'f1';

  // Model nose points along +z; ours along +x.
  const parts = bake(scene, new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const box = boundsOf(parts);
  const centre = box.getCenter(new THREE.Vector3());
  translateAll(parts, new THREE.Vector3(-centre.x, -box.min.y, -centre.z));

  const lightMat = flat(PALETTE.red, dissolve);
  const mats = {};
  const material = (role, source) => {
    if (role === 'light') return lightMat;
    mats[role] ||= {
      // These two textures were repainted into the palette offline.
      livery: () => toon(0xffffff, dissolve, { map: source?.map ?? null, sampleColor: PALETTE.bone }),
      sidewall: () => toon(0xffffff, dissolve, { map: source?.map ?? null, sampleColor: 0x3a3a3a }),
      tyre: () => toon(0x1b1b1b, dissolve, { sampleColor: 0x4a4a4a }),
      metal: () => toon(PALETTE.graphite, dissolve),
      steel: () => toon(PALETTE.graphite, dissolve),
      accent: () => toon(PALETTE.orange, dissolve),
      carbon: () => toon(CAR_INK, dissolve, { sampleColor: 0x5a5a5a }),
    }[role]();
    return mats[role];
  };

  // Wheels: gather the wheel parts, split them per corner, pivot each at its hub.
  const wheelParts = parts.filter((p) => WHEEL_ROLES.has(carRole(p.name)));
  const wheelBox = boundsOf(wheelParts);
  const axleMid = (wheelBox.min.x + wheelBox.max.x) / 2;
  const corner = (c) => `${c.x > axleMid ? 'f' : 'r'}${c.z > 0 ? 'l' : 'r'}`;
  const wheels = new Map();
  for (const p of wheelParts) {
    for (const [key, g] of splitByTriangle(p.geometry, corner)) {
      if (!wheels.has(key)) wheels.set(key, []);
      wheels.get(key).push({ geometry: g, role: carRole(p.name), source: p.source });
    }
  }
  const wheelGroups = [];
  for (const pieces of wheels.values()) {
    const tyres = pieces.filter((w) => w.role === 'tyre' || w.role === 'sidewall');
    const hb = boundsOf(tyres.length ? tyres : pieces);
    const hub = hb.getCenter(new THREE.Vector3());
    const wheel = new THREE.Group();
    wheel.position.copy(hub);
    wheel.userData.radius = Math.max((hb.max.y - hb.min.y) / 2, 0.1);
    for (const w of pieces) {
      w.geometry.translate(-hub.x, -hub.y, -hub.z);
      wheel.add(new THREE.Mesh(w.geometry, material(w.role, w.source)));
    }
    group.add(wheel);
    wheelGroups.push(wheel);
  }

  for (const p of parts) {
    const role = carRole(p.name);
    if (WHEEL_ROLES.has(role)) continue;
    const mesh = new THREE.Mesh(p.geometry, material(role, p.source));
    if (role === 'light') mesh.userData.noSample = true;
    group.add(mesh);
  }

  const size = boundsOf(parts).getSize(new THREE.Vector3());
  const shadow = createContactShadow(size.x * 1.2, size.z * 1.35);
  const bounds = new THREE.Box3().setFromObject(group);

  let blink = 0;
  return {
    group,
    shadow,
    dissolve,
    bounds,
    update(dt, speed, time, reduced) {
      for (const w of wheelGroups) w.rotation.z -= (speed * dt) / w.userData.radius;
      blink += dt;
      const on = speed > 8 && (reduced || Math.sin(blink * Math.PI * 2 * 1.6) > 0);
      lightMat.color.setHex(on ? PALETTE.red : 0x3a1410);
      group.position.y = reduced ? 0 : Math.sin(time * 71) * 0.004 * Math.min(speed / 30, 1);
    },
  };
}

// ───────────────────────── Ship ─────────────────────────

const HULL = /^(jean_blue|material_11)$/;
const hsl = { h: 0, s: 0, l: 0 };

function shipRole(source) {
  const name = source?.name ?? '';
  if (/Lifeboat/i.test(name)) return 'orange';
  if (HULL.test(name)) return 'hull';
  if (/Glass/i.test(name) || source?.transparent) return 'glass';
  if (/Roofing/i.test(name)) return 'deck';
  const c = source?.color ?? new THREE.Color(1, 1, 1);
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s < 0.22) return hsl.l > 0.55 ? 'bone' : hsl.l > 0.2 ? 'graphite' : 'ink';
  const h = hsl.h * 360;
  if (h < 75 || h >= 280) return 'orange'; // reds, oranges, yellows, pinks
  if (h < 175) return 'deck'; // greens
  return hsl.l < 0.35 ? 'ink' : 'deck'; // blues
}

export function createShipFromModel(scene) {
  const dissolve = createDissolve({ dir: -1, noiseScale: 0.7, noiseAmp: 1.6, edge: 0.32 });
  const group = new THREE.Group();
  group.name = 'ship';

  // Bow points along +z in the source; rotate, then scale to our length.
  const rotate = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const raw = boundsOf(bake(scene, rotate));
  const s = SHIP_LENGTH / (raw.max.x - raw.min.x);
  const parts = bake(scene, new THREE.Matrix4().makeScale(s, s, s).multiply(rotate));
  const box = boundsOf(parts);
  const centre = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  translateAll(parts, new THREE.Vector3(-centre.x, -(box.min.y + height * SHIP_DRAFT), -centre.z));

  // SketchUp exports both sides of every face as coincident triangles with
  // their own materials; drawing front faces only stops them z-fighting.
  const FRONT = THREE.FrontSide;
  const mats = {};
  const make = {
    hull: () =>
      toon(0x1d1d1d, dissolve, {
        side: FRONT,
        sampleColor: 0x5c5c5c,
        bands: [{ from: 0.12, to: 0.3, color: PALETTE.orange }],
      }),
    bone: () => toon(PALETTE.bone, dissolve, { side: FRONT }),
    graphite: () => toon(0x8c8a84, dissolve, { side: FRONT }),
    ink: () => toon(0x1d1d1d, dissolve, { side: FRONT, sampleColor: 0x5c5c5c }),
    orange: () => toon(PALETTE.orange, dissolve, { side: FRONT }),
    deck: () => toon(PALETTE.sage, dissolve, { side: FRONT }),
    glass: () =>
      toon(PALETTE.glass, dissolve, {
        side: FRONT,
        sampleColor: 0x3a3f3e,
        lit: { cell: [0.34, 0.26, 0.34], chance: 0.2 },
      }),
  };
  for (const p of parts) {
    // The prepared ship has no normals (welded by position to simplify well);
    // un-indexing gives every face its own vertices → crisp per-face normals.
    p.geometry = p.geometry.toNonIndexed();
    p.geometry.computeVertexNormals();
    const role = shipRole(p.source);
    mats[role] ||= make[role]();
    group.add(new THREE.Mesh(p.geometry, mats[role]));
  }

  const bounds = new THREE.Box3().setFromObject(group);
  return {
    group,
    dissolve,
    bounds,
    update(_dt, time, reduced) {
      const k = reduced ? 0.35 : 1;
      group.position.y = Math.sin(time * 0.55) * 0.07 * k;
      group.rotation.x = Math.sin(time * 0.43) * 0.012 * k;
      group.rotation.z = Math.sin(time * 0.31 + 1.2) * 0.006 * k;
    },
  };
}
