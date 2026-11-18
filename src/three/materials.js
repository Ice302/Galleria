import * as THREE from 'three';

export const PALETTE = {
  orange: 0xff5a1f,
  ink: 0x121212,
  bone: 0xe9e6df,
  sage: 0xc8d9cc,
  graphite: 0x2b2b2b,
  glass: 0x1a1e1d,
  red: 0xe8261c,
};

let ramp;
function toonRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([72, 150, 210, 255]), 4, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

// One dissolve "sweep" shared by every material of a model. Moving uCut along
// the model's local x axis eats the surface away (dir = 1) or builds it up
// (dir = -1) behind a glowing, noisy edge.
export function createDissolve({ dir = 1, noiseScale = 1.6, noiseAmp = 0.5, edge = 0.18 } = {}) {
  return {
    uniforms: {
      uCut: { value: 1e4 * dir },
      uDir: { value: dir },
      uNoise: { value: new THREE.Vector2(noiseScale, noiseAmp) },
      uEdge: { value: edge },
      uEdgeColor: { value: new THREE.Color(PALETTE.orange).multiplyScalar(1.4) },
      uRootInv: { value: new THREE.Matrix4() },
    },
    setRoot(root) {
      root.updateWorldMatrix(true, false);
      this.uniforms.uRootInv.value.copy(root.matrixWorld).invert();
    },
  };
}

const NOISE = /* glsl */ `
float dHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

function patch(material, dissolve, opts) {
  const extra = {};
  if (opts.bands) {
    opts.bands.slice(0, 2).forEach((b, i) => {
      extra[`uBand${i}`] = { value: new THREE.Vector3(b.from, b.to, 1) };
      extra[`uBandColor${i}`] = { value: new THREE.Color(b.color) };
    });
    for (let i = opts.bands.length; i < 2; i++) {
      extra[`uBand${i}`] = { value: new THREE.Vector3(0, 0, 0) };
      extra[`uBandColor${i}`] = { value: new THREE.Color() };
    }
  }
  if (opts.windows) {
    const w = opts.windows;
    extra.uWin = { value: new THREE.Vector3(w.base, w.tier, w.step) };
    extra.uWinGlass = { value: new THREE.Color(PALETTE.glass) };
    extra.uWinLit = { value: new THREE.Color(PALETTE.orange) };
    extra.uDeck = { value: new THREE.Color(w.deck ?? PALETTE.sage) };
  }
  // Scattered lit cells on glass (used by imported models that have their own
  // window geometry): a stable pseudo-random subset glows orange.
  if (opts.lit) {
    extra.uLitCell = { value: new THREE.Vector3(...opts.lit.cell) };
    extra.uLitChance = { value: 1 - opts.lit.chance };
    extra.uWinLit = { value: new THREE.Color(PALETTE.orange) };
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, dissolve.uniforms, extra);
    if (opts.bands) shader.defines = { ...shader.defines, D_BANDS: '' };
    if (opts.windows) shader.defines = { ...shader.defines, D_WINDOWS: '' };
    if (opts.lit) shader.defines = { ...shader.defines, D_LIT: '' };

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform mat4 uRootInv;\nvarying vec3 vLocal;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 dW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dW = instanceMatrix * dW;
        #endif
        vLocal = (uRootInv * modelMatrix * dW).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uCut;
        uniform float uDir;
        uniform vec2 uNoise;
        uniform float uEdge;
        uniform vec3 uEdgeColor;
        #ifdef D_BANDS
          uniform vec3 uBand0; uniform vec3 uBandColor0;
          uniform vec3 uBand1; uniform vec3 uBandColor1;
        #endif
        #ifdef D_WINDOWS
          uniform vec3 uWin; uniform vec3 uWinGlass; uniform vec3 uDeck;
        #endif
        #ifdef D_LIT
          uniform vec3 uLitCell; uniform float uLitChance;
        #endif
        #if defined(D_WINDOWS) || defined(D_LIT)
          uniform vec3 uWinLit;
        #endif
        varying vec3 vLocal;
        ${NOISE}
        void main() {
          float dn = dNoise(vLocal * uNoise.x) * 0.75 + dNoise(vLocal * uNoise.x * 4.0) * 0.25;
          float dd = (uCut - vLocal.x) * uDir + dn * uNoise.y;
          if (dd < 0.0) discard;
          float dLit = 0.0;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef D_BANDS
          diffuseColor.rgb = mix(diffuseColor.rgb, uBandColor0, uBand0.z * step(uBand0.x, vLocal.y) * step(vLocal.y, uBand0.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, uBandColor1, uBand1.z * step(uBand1.x, vLocal.y) * step(vLocal.y, uBand1.y));
        #endif
        #ifdef D_WINDOWS
          vec3 dN = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
          float dSide = 1.0 - step(0.55, abs(dN.y));
          float dTier = (vLocal.y - uWin.x) / uWin.y;
          float dFy = fract(dTier);
          float dAlong = abs(dN.x) > abs(dN.z) ? vLocal.z : vLocal.x;
          float dFx = fract(dAlong / uWin.z);
          float dWin = step(0.3, dFy) * step(dFy, 0.74) * step(0.14, dFx) * dSide;
          float dCell = floor(dAlong / uWin.z) + floor(dTier) * 37.0 + (dN.z + dN.x > 0.0 ? 11.0 : 0.0);
          dLit = dWin * step(0.84, dHash(vec3(dCell, 3.1, 7.7)));
          diffuseColor.rgb = mix(diffuseColor.rgb, uWinGlass, dWin);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDeck, step(0.55, dN.y));
        #endif
        #ifdef D_LIT
          dLit = step(uLitChance, dHash(floor(vLocal / uLitCell) + 0.5));
        #endif`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        #if defined(D_WINDOWS) || defined(D_LIT)
          gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uWinLit, 1.0)).rgb, dLit * 0.92);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uEdgeColor, 1.0)).rgb, 1.0 - smoothstep(0.0, uEdge, dd));`
      );
  };
  material.customProgramCacheKey = () => `dissolve-${opts.bands ? 'b' : ''}${opts.windows ? 'w' : ''}${opts.lit ? 'l' : ''}`;
  return material;
}

export function toon(color, dissolve, opts = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side: opts.side ?? THREE.DoubleSide });
  if (opts.map) m.map = opts.map;
  m.userData.sampleColor = new THREE.Color(opts.sampleColor ?? color);
  return dissolve ? patch(m, dissolve, opts) : m;
}

export function flat(color, dissolve, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  m.userData.sampleColor = new THREE.Color(opts.sampleColor ?? color);
  return dissolve ? patch(m, dissolve, opts) : m;
}
