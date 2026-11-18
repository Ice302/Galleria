import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft } from './loft.js';
import { PALETTE, toon, flat, createDissolve } from './materials.js';

// A stylised cruise ship. Same local frame as the car (+x = bow), roughly
// five times longer, so the morph reads as "speed becomes scale".

const TIER_H = 0.5;
const DECK_BASE = 2.3;

function plan(x0, x1, hw, frontR) {
  // Deck outline in the xz plane: square stern, elliptical bow end.
  const s = new THREE.Shape();
  s.moveTo(x0 + 0.15, -hw);
  s.lineTo(x1 - frontR, -hw);
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    s.lineTo(x1 - frontR + Math.cos(a) * frontR, Math.sin(a) * hw);
  }
  s.lineTo(x0 + 0.15, hw);
  s.lineTo(x0, hw - 0.15);
  s.lineTo(x0, -hw + 0.15);
  s.closePath();
  return s;
}

function extrudeUp(shape, y, h) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function nameDecal(text, sub) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e6df';
  ctx.font = '800 112px "Archivo Variable", "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 72);
  ctx.font = '500 34px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = '#ff5a1f';
  ctx.fillText(sub, 12, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createShip() {
  const dissolve = createDissolve({ dir: -1, noiseScale: 0.7, noiseAmp: 1.6, edge: 0.32 });
  const group = new THREE.Group();
  group.name = 'ship';

  // Hull: ink below, orange boot stripe, bone topsides.
  const hullMat = toon(0x1d1d1d, dissolve, {
    sampleColor: 0x5c5c5c,
    bands: [
      { from: 1.2, to: 1.5, color: PALETTE.orange },
      { from: 1.5, to: 20, color: PALETTE.bone },
    ],
  });
  const hull = new THREE.Mesh(
    loft(
      [
        { x: -13.2, hw: 2.15, top: 2.45, bottom: 0.3 },
        { x: -12.6, hw: 2.45, top: 2.4, bottom: -0.7 },
        { x: -10.5, hw: 2.6, top: 2.35, bottom: -1.3 },
        { x: -4, hw: 2.65, top: 2.3, bottom: -1.45 },
        { x: 5, hw: 2.65, top: 2.3, bottom: -1.45 },
        { x: 9.5, hw: 2.3, top: 2.4, bottom: -1.3 },
        { x: 12.2, hw: 1.2, top: 2.6, bottom: -0.6 },
        { x: 13.6, hw: 0.1, top: 2.8, bottom: 0.9 },
      ],
      { rings: 72, segments: 44, pTop: 10, pBottom: 3 }
    ),
    hullMat
  );
  group.add(hull);

  // Superstructure: stepped tiers, window grid + sage decks drawn in-shader.
  const tierMat = toon(PALETTE.bone, dissolve, {
    windows: { base: DECK_BASE, tier: TIER_H, step: 0.32, deck: PALETTE.sage },
  });
  const tiers = [
    [-12.0, 9.6, 2.5],
    [-11.2, 9.2, 2.55],
    [-10.4, 8.8, 2.55],
    [-9.6, 8.3, 2.5],
    [-8.6, 7.8, 2.45],
    [-7.2, 7.2, 2.35],
    [-5.5, 6.4, 2.1],
  ];
  const tierGeo = mergeGeometries(
    tiers.map(([x0, x1, hw], i) => extrudeUp(plan(x0, x1, hw, Math.min(2.2, hw * 0.95)), DECK_BASE + i * TIER_H, TIER_H))
  );
  group.add(new THREE.Mesh(tierGeo, tierMat));
  const topY = DECK_BASE + tiers.length * TIER_H;

  // Bridge with wings.
  const bridgeMat = toon(0x1d1d1d, dissolve, {
    sampleColor: 0x5c5c5c,
    bands: [{ from: topY + 0.18, to: topY + 0.28, color: PALETTE.orange }],
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.46, 5.9), bridgeMat);
  bridge.position.set(5.7, topY + 0.23, 0);
  group.add(bridge);

  // Funnel: orange, raked aft, black cap.
  const funnelMat = toon(PALETTE.orange, dissolve, {
    bands: [{ from: topY + 2.15, to: topY + 4, color: 0x1d1d1d }],
  });
  const fs = new THREE.Shape([
    new THREE.Vector2(-4.4, topY),
    new THREE.Vector2(-1.9, topY),
    new THREE.Vector2(-2.7, topY + 2.6),
    new THREE.Vector2(-4.9, topY + 2.6),
  ]);
  const funnelGeo = new THREE.ExtrudeGeometry(fs, {
    depth: 1.3,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.16,
    bevelSegments: 3,
  });
  funnelGeo.translate(0, 0, -0.65);
  group.add(new THREE.Mesh(funnelGeo, funnelMat));

  // Lifeboats — orange, as they should be.
  const boats = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const g = new THREE.CapsuleGeometry(0.22, 0.72, 4, 10);
      g.rotateZ(Math.PI / 2);
      g.translate(-8 + i * 1.75, DECK_BASE + TIER_H * 1.55, side * 2.78);
      boats.push(g);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(boats), toon(PALETTE.orange, dissolve)));

  // Pool, waterslide, mast.
  const inkMat = toon(0x1d1d1d, dissolve, { sampleColor: 0x5c5c5c });
  const pool = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 1.5), toon(0x34504c, dissolve));
  pool.position.set(0.7, topY + 0.02, 0);
  group.add(pool);

  const helix = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 5;
    helix.push(new THREE.Vector3(-6.6 + Math.cos(a) * 0.8, topY + 2.0 - t * 1.9, Math.sin(a) * 0.8));
  }
  group.add(
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 160, 0.08, 8), toon(PALETTE.orange, dissolve))
  );

  const mastGeo = [];
  const mast = new THREE.CylinderGeometry(0.06, 0.08, 2.1, 8);
  mast.translate(4.9, topY + 1.05, 0);
  mastGeo.push(mast);
  const yard = new THREE.BoxGeometry(0.08, 0.08, 1.6);
  yard.translate(4.9, topY + 1.6, 0);
  mastGeo.push(yard);
  const radar = new THREE.BoxGeometry(0.16, 0.06, 1.0);
  radar.translate(4.9, topY + 2.15, 0);
  mastGeo.push(radar);
  group.add(new THREE.Mesh(mergeGeometries(mastGeo), inkMat));

  const lampMat = flat(PALETTE.orange, dissolve);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat);
  lamp.position.set(4.9, topY + 2.28, 0);
  lamp.userData.noSample = true;
  group.add(lamp);

  // Name on the hull.
  const decalMat = flat(0xffffff, dissolve, { sampleColor: PALETTE.bone });
  decalMat.map = nameDecal('GALLERIA', 'E-180 · PORT OF LANDSCAPE');
  decalMat.alphaTest = 0.4;
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), decalMat);
    d.position.set(-7.6, 0.78, side * 2.672);
    if (side < 0) d.rotation.y = Math.PI;
    d.userData.noSample = true;
    group.add(d);
  }

  const bounds = new THREE.Box3().setFromObject(group);

  let clock = 0;
  return {
    group,
    dissolve,
    bounds,
    update(dt, time, reduced) {
      clock += dt;
      const k = reduced ? 0.35 : 1;
      group.position.y = Math.sin(time * 0.55) * 0.07 * k;
      group.rotation.x = Math.sin(time * 0.43) * 0.012 * k;
      group.rotation.z = Math.sin(time * 0.31 + 1.2) * 0.006 * k;
      lampMat.color.setHex(reduced || Math.sin(clock * Math.PI) > -0.2 ? PALETTE.orange : 0x3a1a10);
    },
  };
}
