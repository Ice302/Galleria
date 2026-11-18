import * as THREE from 'three';
import { createF1 } from './f1.js';
import { createShip } from './ship.js';
import { createF1FromModel, createShipFromModel } from './models.js';
import { createMorph, CAR_PHASE, SHIP_START, SHIP_PHASE } from './morph.js';
import { createEnvironment } from './environment.js';
import { clamp, smoothstep, lerp } from '../core/math.js';
import { speedAt, morphAt, knotsAt, gearbox } from '../core/story-data.js';

// The scroll story lives in "chapter units" u ∈ [0, 5]:
//   0 hero · 1 velocity · 2 transit · 3 scale · 4 boarding
// Camera keyframes, speed and the morph are all pure functions of u, so the
// scene scrubs perfectly in both directions.

const KEYS = [
  { u: 0.0, pos: [8.4, 1.9, 8.9], tgt: [0, 0.45, 0], fov: 30, shift: 0.2, lift: 0.1 },
  { u: 0.75, pos: [6.6, 1.05, 7.4], tgt: [0, 0.45, 0], fov: 30, shift: 0.18, lift: 0.05 },
  { u: 1.35, pos: [0.9, 0.5, 9.4], tgt: [0.4, 0.5, 0], fov: 34, shift: 0.17 },
  { u: 1.9, pos: [-6.6, 1.25, 4.6], tgt: [0.4, 0.55, 0], fov: 36, shift: 0.14 },
  { u: 2.25, pos: [-9.5, 4, 9.5], tgt: [0, 1.2, 0], fov: 38, shift: -0.14 },
  { u: 2.6, pos: [-17, 8, 22], tgt: [0, 2, 0], fov: 38, shift: -0.15 },
  { u: 3.0, pos: [-25, 10, 32], tgt: [0, 2.6, 0], fov: 36, shift: 0.13 },
  { u: 3.6, pos: [10, 7, 39], tgt: [0, 3, 0], fov: 34, shift: 0.13 },
  { u: 4.0, pos: [28, 10, 30], tgt: [-1, 3, 0], fov: 34, shift: -0.12 },
  { u: 4.6, pos: [34, 20, 18], tgt: [-4, 2, 0], fov: 36, shift: -0.1 },
  { u: 5.0, pos: [36, 30, 8], tgt: [-8, 0, 0], fov: 38, shift: 0 },
];

const BG_CAR = new THREE.Color(0x0e0e0e);
const BG_SEA = new THREE.Color(0x0f1312);

const QUALITY = [
  { dpr: 1, density: 0.45 },
  { dpr: 1.25, density: 0.7 },
  { dpr: 1.5, density: 1 },
  { dpr: 1.75, density: 1 },
];

export function createStage(canvas, { reduced = false, mobile = false, models = null } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setClearColor(BG_CAR, 1);

  const scene = new THREE.Scene();
  scene.background = BG_CAR.clone();
  scene.fog = new THREE.Fog(BG_CAR.clone(), 24, 95);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xe4ece6, 0x161616, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(6, 10, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a3d, 1.6);
  rim.position.set(-8, 3, -6);
  scene.add(rim);

  // Imported models when available; the procedural ones otherwise.
  const build = (fromModel, source, fallback) => {
    if (!source) return fallback();
    try {
      return fromModel(source);
    } catch (err) {
      console.warn('[galleria] model failed, using the built-in one:', err);
      return fallback();
    }
  };
  const car = build(createF1FromModel, models?.f1, createF1);
  const ship = build(createShipFromModel, models?.ship, createShip);
  scene.add(car.group, car.shadow, ship.group);

  const count = mobile ? 9000 : 18000;
  const morph = createMorph(car, ship, count);
  scene.add(morph.points);

  const env = createEnvironment(scene, {
    speedLineCount: mobile ? 360 : 720,
    oceanRows: mobile ? 64 : 96,
    oceanSegments: mobile ? 120 : 200,
  });
  env.speed.lines.visible = !reduced;

  // Spline through camera keyframes, sampled per keyframe segment.
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.tgt)), false, 'centripetal');
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  const telemetry = {
    u: 0,
    kmh: 0,
    gear: 'N',
    rpm: 0,
    morph: 0,
    knots: 0,
    cam: camPos,
  };

  let width = 1;
  let height = 1;
  let uTarget = 0;
  let u = 0;
  let velocity = 0;
  let boost = 0;
  let pointerX = 0;
  let pointerY = 0;
  let px = 0;
  let py = 0;
  let travel = 0;
  let flow = 0;
  let elapsed = 0;
  let active = true;
  let lost = false;

  let quality = QUALITY.length - 1;
  const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  while (quality > 0 && QUALITY[quality].dpr > maxDpr + 0.01) quality--;
  let frames = 0;
  let frameTime = 0;
  let settled = 0;

  function applyQuality() {
    renderer.setPixelRatio(Math.min(QUALITY[quality].dpr, maxDpr));
    morph.setDensity(QUALITY[quality].density);
    resize();
  }

  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function segment(uu) {
    let k = 0;
    while (k < KEYS.length - 2 && uu > KEYS[k + 1].u) k++;
    const a = KEYS[k];
    const b = KEYS[k + 1];
    const f = clamp((uu - a.u) / (b.u - a.u), 0, 1);
    return { k, f, a, b };
  }

  function placeCamera(uu, dt) {
    const { k, f, a, b } = segment(uu);
    const t = (k + f) / (KEYS.length - 1);
    posCurve.getPoint(t, camPos);
    tgtCurve.getPoint(t, camTgt);
    const ef = smoothstep(0, 1, f);
    let fov = lerp(a.fov, b.fov, ef);
    let shift = lerp(a.shift, b.shift, ef);
    let shiftY = lerp(a.lift ?? 0, b.lift ?? 0, ef);

    // Portrait screens: pull back so the subject fits, centre it, lift it.
    const aspect = width / height;
    if (aspect < 1.1) {
      const back = lerp(1, 2.5, clamp((1.1 - aspect) / 0.62, 0, 1));
      camPos.sub(camTgt).multiplyScalar(back).add(camTgt);
      shift = 0;
      shiftY = 0.21;
    } else if (aspect < 1.45) {
      shift *= 0.6;
    }

    // Gentle pointer parallax.
    px += (pointerX - px) * (1 - Math.exp(-dt * 3));
    py += (pointerY - py) * (1 - Math.exp(-dt * 3));
    if (!reduced) {
      const d = camPos.distanceTo(camTgt) / 10;
      camera.position.copy(camPos);
      camera.lookAt(camTgt);
      right.setFromMatrixColumn(camera.matrix, 0);
      up.setFromMatrixColumn(camera.matrix, 1);
      camPos.addScaledVector(right, px * 0.35 * d).addScaledVector(up, -py * 0.2 * d);
      fov += boost * 2.5;
    }

    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    camera.fov = fov;
    camera.setViewOffset(width, height, -shift * width, shiftY * height, width, height);
    camera.updateProjectionMatrix();
  }

  function tick(_time, deltaMS) {
    if (!active || lost) return;
    const dt = Math.min(deltaMS / 1000, 0.05);
    elapsed += dt;

    u += (uTarget - u) * (1 - Math.exp(-dt * 9));
    boost += (clamp(Math.abs(velocity) / 35, 0, 1) - boost) * (1 - Math.exp(-dt * 4));
    if (reduced) boost = 0;

    const m = morphAt(u);
    const kmh = speedAt(u);
    const carSpeed = kmh * 0.12 * (1 + boost * 0.35);
    travel += carSpeed * dt;
    flow += (kmh * 0.12) * dt * 0.6;

    // Car.
    car.update(dt, carSpeed, elapsed, reduced);
    car.group.visible = m < CAR_PHASE + 0.02;
    const cb = car.bounds;
    const amp = car.dissolve.uniforms.uNoise.value.y;
    const cc = 1 - m / CAR_PHASE;
    car.dissolve.uniforms.uCut.value = m <= 0 ? 1e4 : cb.min.x - amp + (cb.max.x - cb.min.x + amp) * cc;
    car.dissolve.setRoot(car.group);
    car.shadow.material.opacity = clamp(cc, 0, 1);
    car.shadow.visible = cc > 0;

    // Ship.
    ship.update(dt, elapsed, reduced);
    ship.group.visible = m > SHIP_START - 0.02;
    const sb = ship.bounds;
    const sAmp = ship.dissolve.uniforms.uNoise.value.y;
    const cs = clamp(1 - (m - SHIP_START) / SHIP_PHASE, 0, 1);
    ship.dissolve.uniforms.uCut.value = m >= 1 ? -1e4 : sb.min.x - sAmp + (sb.max.x - sb.min.x + 2 * sAmp) * cs;
    ship.dissolve.setRoot(ship.group);

    // Morph cloud.
    const mu = morph.uniforms;
    mu.uProgress.value = m;
    mu.uTime.value = elapsed;
    mu.uTurbulence.value = reduced ? 0.15 : 0.6;
    morph.points.visible = m > 0.001 && m < 0.999;

    // Environment.
    const roadO = 1 - smoothstep(2.3, 2.75, u);
    env.track.setOpacity(roadO);
    env.track.setTravel(travel);

    const su = env.speed.uniforms;
    su.uTravel.value = travel * 1.25;
    su.uLen.value = 1 + (kmh / 342) * 6 + boost * 6;
    su.uOpacity.value = clamp((kmh - 50) / 220, 0, 1) * (1 - clamp(m * 2.2, 0, 1)) * (0.8 + boost * 0.4);

    const reveal = smoothstep(2.2, 2.9, u) * 170;
    env.ocean.setReveal(reveal);
    const ou = env.ocean.uniforms;
    ou.uTime.value = elapsed;
    ou.uFlow.value = flow;
    ou.uCalm.value = reduced ? 0.4 : 1;
    ou.uStern.value.set(sb.min.x + ship.group.position.x, sb.max.z);
    ou.uOpacity.value = smoothstep(2.25, 2.7, u);

    const sunO = smoothstep(2.7, 3.1, u);
    const sun = env.sun;
    sun.uniforms.uOpacity.value = sunO;
    sun.uniforms.uTime.value = elapsed;
    sun.mesh.visible = sunO > 0.001;
    sun.mesh.position.set(24, lerp(-40, 13, smoothstep(2.7, 3.6, u)), -210);
    sun.mesh.scale.setScalar(64);
    sun.mesh.quaternion.copy(camera.quaternion);

    // World tone + fog.
    const sea = smoothstep(2.3, 2.9, u);
    scene.background.copy(BG_CAR).lerp(BG_SEA, sea);
    scene.fog.color.copy(scene.background);
    scene.fog.near = lerp(24, 70, sea);
    scene.fog.far = lerp(95, 320, sea);
    env.ocean.setSurfaceColor(scene.background);

    placeCamera(u, dt);
    mu.uProj.value = (height * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    renderer.render(scene, camera);

    // Telemetry for the HUD.
    telemetry.u = u;
    telemetry.kmh = kmh * (1 + boost * 0.04);
    const gb = gearbox(kmh);
    telemetry.gear = gb.gear;
    telemetry.rpm = gb.rpm;
    telemetry.morph = m;
    telemetry.knots = knotsAt(u);

    // Adaptive quality: if frames average slower than ~40fps, step down.
    if (elapsed > 2 && deltaMS > 0 && deltaMS < 100) {
      frameTime += deltaMS;
      frames++;
    }
    if (frames >= 90) {
      const avg = frameTime / frames;
      if (avg > 25 && quality > 0 && settled < 3) {
        quality--;
        settled++;
        applyQuality();
      }
      frames = 0;
      frameTime = 0;
    }
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    document.documentElement.classList.add('no-webgl');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    document.documentElement.classList.remove('no-webgl');
  });

  applyQuality();
  placeCamera(0, 0.016);
  renderer.render(scene, camera);

  return {
    telemetry,
    tick,
    resize,
    setScroll(value) {
      uTarget = clamp(value, 0, 5);
    },
    jumpTo(value) {
      uTarget = u = clamp(value, 0, 5);
    },
    setVelocity(v) {
      velocity = v;
    },
    setPointer(x, y) {
      pointerX = x;
      pointerY = y;
    },
    setActive(v) {
      active = v;
    },
    get active() {
      return active;
    },
    // Compile shaders and upload buffers before the preloader lifts.
    warmUp() {
      const saved = u;
      for (const probe of [0.5, 2.4, 2.7, 3.5]) {
        u = uTarget = probe;
        tick(0, 16);
      }
      u = uTarget = saved;
      tick(0, 16);
    },
    dispose() {
      active = false;
      morph.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
