import * as THREE from 'three';
import { loft } from './loft.js';
import { PALETTE, toon, flat, createDissolve } from './materials.js';

// A stylised modern F1 car, built from lofts and primitives.
// Local frame: +x forward, +y up, z lateral. Length ≈ 5.4 units.

const CAR_INK = 0x232323;

function rod(a, b, radius, material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(radius, radius, len, 6);
  const m = new THREE.Mesh(g, material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

function box(size, pos, material, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.rotation.z = rotZ;
  return m;
}

function flatShape(points, depth, material) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  return new THREE.Mesh(g, material);
}

function numberDecal(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#121212';
  ctx.font = '900 104px "Archivo Variable", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Soft dark blob under the car, standing in for a real shadow.
export function createContactShadow(length, width) {
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sctx = sc.getContext('2d');
  const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = -1;
  return shadow;
}

export function createF1() {
  const dissolve = createDissolve({ dir: 1, noiseScale: 3.2, noiseAmp: 0.45, edge: 0.07 });
  const group = new THREE.Group();
  group.name = 'f1';

  const M = {
    body: toon(PALETTE.bone, dissolve),
    orange: toon(PALETTE.orange, dissolve),
    ink: toon(CAR_INK, dissolve, { sampleColor: 0x5a5a5a }),
    tire: toon(0x1b1b1b, dissolve, { sampleColor: 0x4a4a4a }),
    cover: toon(PALETTE.graphite, dissolve),
    stripe: flat(PALETTE.bone, dissolve),
  };

  // Monocoque: nose cone → cockpit → airbox → gearbox.
  const body = new THREE.Mesh(
    loft(
      [
        { x: 2.85, hw: 0.05, top: 0.27, bottom: 0.19 },
        { x: 2.45, hw: 0.1, top: 0.33, bottom: 0.16 },
        { x: 1.85, hw: 0.16, top: 0.43, bottom: 0.13 },
        { x: 1.15, hw: 0.24, top: 0.56, bottom: 0.11 },
        { x: 0.55, hw: 0.31, top: 0.62, bottom: 0.1 },
        { x: 0.0, hw: 0.33, top: 0.7, bottom: 0.1 },
        { x: -0.55, hw: 0.28, top: 0.84, bottom: 0.11 },
        { x: -1.2, hw: 0.21, top: 0.64, bottom: 0.13 },
        { x: -1.85, hw: 0.14, top: 0.47, bottom: 0.16 },
        { x: -2.25, hw: 0.1, top: 0.38, bottom: 0.2 },
      ],
      { rings: 56, segments: 28, pTop: 2.6, pBottom: 4 }
    ),
    M.body
  );
  group.add(body);

  // Cockpit opening, driver helmet and visor.
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), M.ink);
  cockpit.scale.set(0.52, 0.06, 0.25);
  cockpit.position.set(0.38, 0.63, 0);
  group.add(cockpit);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14), M.orange);
  helmet.position.set(0.22, 0.74, 0);
  group.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), M.ink);
  visor.scale.set(0.06, 0.035, 0.1);
  visor.position.set(0.32, 0.765, 0);
  group.add(visor);

  // Sidepods with intakes.
  const podGeo = loft(
    [
      { x: 0.75, hw: 0.17, top: 0.5, bottom: 0.13 },
      { x: 0.45, hw: 0.25, top: 0.55, bottom: 0.1 },
      { x: -0.2, hw: 0.25, top: 0.52, bottom: 0.1 },
      { x: -0.9, hw: 0.18, top: 0.4, bottom: 0.11 },
      { x: -1.55, hw: 0.07, top: 0.24, bottom: 0.12 },
    ],
    { rings: 30, segments: 24, pTop: 3, pBottom: 5 }
  );
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(podGeo, M.orange);
    pod.position.z = side * 0.5;
    group.add(pod);
    group.add(box([0.04, 0.3, 0.3], [0.765, 0.33, side * 0.52], M.ink));
    // Mirrors.
    group.add(rod([0.86, 0.6, side * 0.26], [0.86, 0.66, side * 0.38], 0.012, M.ink));
    group.add(box([0.07, 0.06, 0.15], [0.86, 0.68, side * 0.44], M.ink));
  }

  // Floor plate, rotated so the shape lies flat in the xz plane.
  const floor = flatShape(
    [
      [1.15, -0.3], [0.85, -0.7], [-1.1, -0.72], [-1.3, -0.5], [-2.0, -0.45],
      [-2.0, 0.45], [-1.3, 0.5], [-1.1, 0.72], [0.85, 0.7], [1.15, 0.3],
    ],
    0.035,
    M.ink
  );
  floor.geometry.rotateX(-Math.PI / 2);
  floor.position.y = 0.06;
  group.add(floor);

  // Engine cover fin with race number.
  const fin = flatShape([[-0.4, 0.84], [-2.1, 0.96], [-2.1, 0.7], [-0.9, 0.7]], 0.02, M.orange);
  fin.position.z = -0.01;
  group.add(fin);
  const decalMat = flat(0xffffff, dissolve, { sampleColor: PALETTE.orange });
  decalMat.map = numberDecal('07');
  decalMat.alphaTest = 0.5;
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), decalMat);
    d.position.set(-1.45, 0.82, side * 0.013);
    if (side < 0) d.rotation.y = Math.PI;
    d.userData.noSample = true;
    group.add(d);
  }

  // Front wing: main plane, two flaps, endplates, pylons.
  group.add(box([0.32, 0.025, 1.85], [2.55, 0.09, 0], M.ink));
  group.add(box([0.2, 0.02, 1.62], [2.42, 0.15, 0], M.orange, -0.35));
  group.add(box([0.16, 0.02, 1.5], [2.3, 0.22, 0], M.orange, -0.6));
  for (const side of [-1, 1]) {
    group.add(box([0.55, 0.24, 0.025], [2.47, 0.17, side * 0.93], M.ink));
    group.add(box([0.06, 0.12, 0.02], [2.6, 0.17, side * 0.08], M.ink));
  }

  // Rear wing, beam wing, diffuser.
  group.add(box([0.34, 0.035, 1.0], [-2.32, 0.93, 0], M.ink, -0.12));
  group.add(box([0.2, 0.025, 1.0], [-2.5, 1.03, 0], M.orange, -0.45));
  group.add(box([0.12, 0.45, 0.04], [-2.2, 0.66, 0], M.ink));
  group.add(box([0.22, 0.025, 0.85], [-2.28, 0.45, 0], M.ink));
  group.add(box([0.5, 0.15, 1.0], [-2.05, 0.12, 0], M.ink, -0.25));
  for (const side of [-1, 1]) group.add(box([0.62, 0.52, 0.025], [-2.38, 0.82, side * 0.51], M.orange));

  // Rain light (blinks while the car is at speed).
  const rainMat = flat(PALETTE.red, dissolve);
  const rain = box([0.03, 0.08, 0.12], [-2.27, 0.36, 0], rainMat);
  rain.userData.noSample = true;
  group.add(rain);

  // Halo.
  const halo = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 0.7, -0.32),
    new THREE.Vector3(0.35, 0.93, -0.28),
    new THREE.Vector3(0.78, 0.96, 0),
    new THREE.Vector3(0.35, 0.93, 0.28),
    new THREE.Vector3(-0.05, 0.7, 0.32),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(halo, 48, 0.028, 8), M.ink));
  const pillar = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.02, 0.6, 0),
    new THREE.Vector3(0.92, 0.84, 0),
    new THREE.Vector3(0.78, 0.96, 0),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(pillar, 12, 0.026, 8), M.ink));

  // Wheels: tyre, coloured sidewall band, cover with a stripe so rotation reads.
  const wheels = [];
  const makeWheel = (r, w) => {
    const g = new THREE.Group();
    const tyre = new THREE.CylinderGeometry(r, r, w, 40, 1);
    tyre.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(tyre, M.tire));
    for (const side of [-1, 1]) {
      const face = new THREE.Group();
      face.position.z = side * (w / 2 + 0.002);
      if (side < 0) face.rotation.y = Math.PI;
      face.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r * 0.8, 40), M.orange));
      face.add(new THREE.Mesh(new THREE.CircleGeometry(r * 0.66, 32), M.cover));
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.24, 0.045), M.stripe);
      stripe.position.z = 0.002;
      face.add(stripe);
      g.add(face);
    }
    return g;
  };
  const wheelSpec = [
    [1.72, 0.33, 0.3, 0.78],
    [-1.62, 0.34, 0.4, 0.76],
  ];
  for (const [x, r, w, z] of wheelSpec) {
    for (const side of [-1, 1]) {
      const wheel = makeWheel(r, w);
      wheel.position.set(x, r, side * z);
      wheel.userData.radius = r;
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // Suspension arms.
  for (const side of [-1, 1]) {
    const s = side;
    group.add(rod([1.75, 0.38, s * 0.14], [1.72, 0.37, s * 0.62], 0.016, M.ink));
    group.add(rod([1.82, 0.2, s * 0.12], [1.72, 0.27, s * 0.62], 0.016, M.ink));
    group.add(rod([1.6, 0.42, s * 0.15], [1.72, 0.3, s * 0.6], 0.014, M.ink));
    group.add(rod([-1.55, 0.42, s * 0.15], [-1.62, 0.41, s * 0.56], 0.016, M.ink));
    group.add(rod([-1.5, 0.22, s * 0.15], [-1.62, 0.28, s * 0.56], 0.016, M.ink));
  }

  const shadow = createContactShadow(6.6, 2.7);

  const bounds = new THREE.Box3().setFromObject(group);

  let blink = 0;
  return {
    group,
    shadow,
    dissolve,
    bounds,
    materials: Object.values(M).concat(decalMat),
    update(dt, speed, time, reduced) {
      for (const w of wheels) w.rotation.z -= (speed * dt) / w.userData.radius;
      blink += dt;
      const on = speed > 8 && !reduced ? Math.sin(blink * Math.PI * 2 * 1.6) > 0 : speed > 8;
      rainMat.color.setHex(on ? PALETTE.red : 0x3a1410);
      // Fine vibration at speed.
      group.position.y = reduced ? 0 : Math.sin(time * 71) * 0.004 * Math.min(speed / 30, 1);
    },
  };
}
