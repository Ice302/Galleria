import { clamp, piecewise, smoothstep } from './math.js';

// Story timing in chapter units u ∈ [0, 5]: 0 hero · 1 velocity · 2 transit ·
// 3 scale · 4 boarding. Shared by the 3D stage and the HUD so the numbers on
// the cards always match what the scene is doing.

export const MORPH_START = 2.15;
export const MORPH_END = 2.95;

// km/h along the story; the ship phase cruises at ~22 knots.
export const SPEED = [
  [0, 46], [0.8, 80], [1.25, 220], [1.8, 342], [2.15, 342], [2.6, 110], [3.0, 41], [5, 41],
];

const GEARS = [0, 70, 120, 165, 205, 245, 280, 315];

export const speedAt = (u) => piecewise(SPEED, u);
export const morphAt = (u) => clamp((u - MORPH_START) / (MORPH_END - MORPH_START), 0, 1);
export const knotsAt = (u) => smoothstep(2.85, 3.3, u) * 22.6;

export function gearbox(kmh) {
  let g = 0;
  while (g < GEARS.length && kmh >= GEARS[g] + 1) g++;
  const lo = GEARS[Math.max(g - 1, 0)];
  const hi = GEARS[g] ?? 360;
  return {
    gear: kmh < 3 ? 'N' : String(Math.max(g, 1)),
    rpm: 4200 + clamp((kmh - lo) / (hi - lo), 0, 1) * 8300,
  };
}
