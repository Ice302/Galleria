import * as THREE from 'three';
import { PALETTE } from './materials.js';

// Everything that sells motion: a scrolling track, speed lines, an ocean drawn
// as contour lines with a wake, and a striped sun. All motion is expressed as
// "distance travelled", so it stays smooth whether you scroll or sit still.

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

function createTrack() {
  const group = new THREE.Group();
  const mats = [];
  const scrollers = [];

  const asphalt = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#161616';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const v = 20 + Math.random() * 26;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      // Transverse grid marks every tile: reads as rushing ground.
      ctx.fillStyle = 'rgba(233,230,223,0.07)';
      ctx.fillRect(0, 0, 3, h);
    },
    [50, 8]
  );
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 64),
    new THREE.MeshBasicMaterial({ map: asphalt, transparent: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);
  mats.push(ground.material);
  scrollers.push({ tex: asphalt, tile: 400 / 50 });

  // Solid white edge lines.
  for (const z of [-3.3, 3.3]) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 0.12),
      new THREE.MeshBasicMaterial({ color: PALETTE.bone, transparent: true })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, -0.01, z);
    group.add(line);
    mats.push(line.material);
  }

  // Kerbs: orange / bone stripes.
  const kerbTex = canvasTexture(
    128,
    16,
    (ctx, w, h) => {
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = '#d9d5cc';
      ctx.fillRect(w / 2, 0, w / 2, h);
    },
    [160, 1]
  );
  for (const z of [-3.85, 3.85]) {
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.8), new THREE.MeshBasicMaterial({ map: kerbTex, transparent: true }));
    kerb.rotation.x = -Math.PI / 2;
    kerb.position.set(0, -0.008, z);
    group.add(kerb);
    mats.push(kerb.material);
  }
  scrollers.push({ tex: kerbTex, tile: 400 / 160 });

  // Trackside hoardings with type, whipping past.
  const boardTex = canvasTexture(
    1024,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(0, 0, w * 0.46, h);
      ctx.fillStyle = '#121212';
      ctx.font = '900 86px "Archivo Variable", "Helvetica Neue", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('GALLERIA', 22, h / 2 + 4);
      ctx.fillStyle = '#e9e6df';
      ctx.font = '600 44px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('E-180  ·  HIGH GRADE', w * 0.5, h / 2 + 2);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = '#ff5a1f';
        ctx.beginPath();
        const x = w * 0.9 + i * 16;
        ctx.moveTo(x, h);
        ctx.lineTo(x + 8, h);
        ctx.lineTo(x + 40, 0);
        ctx.lineTo(x + 32, 0);
        ctx.fill();
      }
    },
    [26, 1]
  );
  // The far-side board faces the other way, so it gets its own texture
  // instance scrolling in the opposite local direction.
  const boardTexFar = boardTex.clone();
  boardTexFar.needsUpdate = true;
  for (const [z, tex] of [[-9, boardTex], [9, boardTexFar]]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    board.position.set(0, 0.45, z);
    if (z > 0) board.rotation.y = Math.PI;
    group.add(board);
    mats.push(board.material);
  }
  scrollers.push({ tex: boardTex, tile: 400 / 26 }, { tex: boardTexFar, tile: 400 / 26, dir: -1 });

  return {
    group,
    setOpacity(o) {
      for (const m of mats) m.opacity = o;
      group.visible = o > 0.002;
    },
    setTravel(d) {
      for (const s of scrollers) s.tex.offset.x = (((s.dir ?? 1) * d) / s.tile) % 1;
    },
  };
}

function createSpeedLines(count) {
  const seeds = new Float32Array(count * 2 * 4);
  const ends = new Float32Array(count * 2);
  const pos = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i++) {
    let y;
    let z;
    do {
      y = 0.08 + Math.random() * 5.5;
      z = (Math.random() * 2 - 1) * 16;
    } while (Math.abs(z) < 1.4 && y < 1.4);
    const s = [Math.random(), y, z, Math.random()];
    seeds.set(s, i * 8);
    seeds.set(s, i * 8 + 4);
    ends[i * 2] = 0;
    ends[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTravel: { value: 0 },
      uLen: { value: 2 },
      uSpan: { value: 90 },
      uOpacity: { value: 0 },
      uA: { value: new THREE.Color(PALETTE.bone) },
      uB: { value: new THREE.Color(PALETTE.orange) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aEnd;
      uniform float uTravel;
      uniform float uLen;
      uniform float uSpan;
      uniform float uOpacity;
      varying float vA;
      varying float vHot;
      void main() {
        float speed = 0.7 + aSeed.w * 0.9;
        float x = mod(aSeed.x * uSpan - uTravel * speed, uSpan) - uSpan * 0.5;
        float len = uLen * (0.35 + aSeed.w);
        vec3 p = vec3(x + aEnd * len, aSeed.y, aSeed.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        float edge = 1.0 - smoothstep(uSpan * 0.32, uSpan * 0.5, abs(x));
        vA = uOpacity * edge * (1.0 - aEnd * 0.92) * (0.3 + aSeed.w * 0.7);
        vHot = step(0.86, aSeed.w);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uA;
      uniform vec3 uB;
      varying float vA;
      varying float vHot;
      void main() {
        gl_FragColor = vec4(mix(uA, uB, vHot), vA);
        #include <colorspace_fragment>
      }
    `,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  return { lines, uniforms: material.uniforms };
}

function createOcean({ rows, segments }) {
  const halfX = 110;
  const halfZ = 70;
  const verts = [];
  for (let r = 0; r < rows; r++) {
    const z = -halfZ + (r / (rows - 1)) * halfZ * 2;
    for (let s = 0; s < segments; s++) {
      const x0 = -halfX + (s / segments) * halfX * 2;
      const x1 = -halfX + ((s + 1) / segments) * halfX * 2;
      verts.push(x0, 0, z, x1, 0, z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uCalm: { value: 1 },
      uStern: { value: new THREE.Vector2(-13.2, 2.6) },
      uColor: { value: new THREE.Color(PALETTE.sage) },
      uWake: { value: new THREE.Color(PALETTE.bone) },
      uHot: { value: new THREE.Color(PALETTE.orange) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlow;
      uniform float uReveal;
      uniform float uOpacity;
      uniform float uCalm;
      uniform vec2 uStern;
      varying float vA;
      varying float vWake;
      varying float vRing;

      float wave(vec2 q, float t) {
        return sin(q.x * 0.16 + t * 0.9) * 0.2
             + sin(q.y * 0.23 - t * 0.7 + q.x * 0.05) * 0.16
             + sin((q.x + q.y) * 0.45 + t * 1.6) * 0.05;
      }

      void main() {
        vec2 g = position.xz;
        float t = uTime * uCalm;
        float h = wave(vec2(g.x + uFlow, g.y), t) * uCalm;

        float dist = uStern.x - g.x;
        float behind = smoothstep(0.0, 3.0, dist);
        float halfW = uStern.y + max(dist, 0.0) * 0.36;
        float inWake = behind * (1.0 - smoothstep(halfW * 0.55, halfW, abs(g.y)));
        h += inWake * sin(dist * 1.3 - uTime * 3.5) * 0.12 * exp(-max(dist, 0.0) * 0.03);
        float kelvin = behind * exp(-pow((abs(g.y) - halfW) * 1.1, 2.0)) * exp(-max(dist, 0.0) * 0.018);
        float bow = exp(-pow(length(vec2(g.x - 13.0, g.y) * vec2(0.5, 0.9)), 2.0) * 0.3);

        float r = length(g);
        float reveal = 1.0 - smoothstep(uReveal - 8.0, uReveal, r);
        vRing = exp(-pow((r - uReveal + 4.0) * 0.35, 2.0)) * step(1.0, uReveal) * (1.0 - step(150.0, uReveal));

        vec3 p = vec3(g.x, 0.32 + h + kelvin * 0.22, g.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

        float fade = 1.0 - smoothstep(55.0, 108.0, max(abs(g.x) * 0.9, abs(g.y) * 1.4));
        vWake = clamp(kelvin + inWake * 0.35 + bow * 0.6, 0.0, 1.0);
        vA = uOpacity * reveal * fade * (0.28 + vWake * 0.72);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWake;
      uniform vec3 uHot;
      varying float vA;
      varying float vWake;
      varying float vRing;
      void main() {
        vec3 c = mix(mix(uColor, uWake, vWake), uHot, vRing);
        gl_FragColor = vec4(c, clamp(vA + vRing * 0.8, 0.0, 1.0));
        #include <colorspace_fragment>
      }
    `,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;

  // Sea surface: opaque in the middle (hides the underwater hull), feathered
  // at the rim so the sea spreads over the track instead of cutting a hole.
  const rim = document.createElement('canvas');
  rim.width = rim.height = 256;
  const rctx = rim.getContext('2d');
  const rg = rctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, '#fff');
  rg.addColorStop(0.78, '#fff');
  rg.addColorStop(1, '#000');
  rctx.fillStyle = rg;
  rctx.fillRect(0, 0, 256, 256);
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({ color: 0x101312, transparent: true, alphaMap: new THREE.CanvasTexture(rim) })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.01;
  surface.renderOrder = -1;

  const group = new THREE.Group();
  group.add(surface, lines);
  return {
    group,
    uniforms: material.uniforms,
    setReveal(radius) {
      material.uniforms.uReveal.value = radius;
      const s = Math.max(radius, 0.001);
      surface.scale.set(s, s, 1);
      group.visible = radius > 0.05;
    },
    setSurfaceColor(c) {
      surface.material.color.copy(c);
    },
  };
}

function createSun() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.orange) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float disc = 1.0 - smoothstep(0.995, 1.0, r);
        // Retro horizontal cut lines that thicken toward the bottom.
        float y = vUv.y;
        float bands = 1.0;
        if (y < 0.2) {
          float k = (0.2 - y) / 0.75;
          float f = fract((y + uTime * 0.008) * 8.0);
          bands = step(k * 0.9, f);
        }
        float a = disc * bands * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  return { mesh, uniforms: material.uniforms };
}

export function createEnvironment(scene, { speedLineCount = 700, oceanRows = 90, oceanSegments = 180 } = {}) {
  const track = createTrack();
  const speed = createSpeedLines(speedLineCount);
  const ocean = createOcean({ rows: oceanRows, segments: oceanSegments });
  const sun = createSun();
  scene.add(track.group, speed.lines, ocean.group, sun.mesh);
  return { track, speed, ocean, sun };
}
