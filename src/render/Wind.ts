/**
 * Hierarchical wind (Phase 6) — one global wind field sampled by all
 * vegetation (spec GPU-systems #11).
 *
 * Field model: uniform direction + traveling gust fronts. Gusts are two
 * octaves of the baked fbm advected along the wind direction (85 m fronts
 * + 17 m busy detail), so the canopy surges in waves instead of metronome
 * rocking; amplitude is attenuated under dense canopy (sheltered interior,
 * exposed rim — the canopy map doubles as exposure).
 *
 * Hierarchy (all vertex-stage, shadows get the same displacement):
 *   - whole-plant sway: low-frequency, gust-driven, scaled by the BAKED
 *     per-vertex flexibility (vdata.y: 0 at the trunk base → 1 at branch
 *     tips, Phase-4 growth bake) — trunks lean a little, crowns wave.
 *   - branch/card flutter: 3–5 Hz, per-vertex phase (vdata.z baked along
 *     the branch run) + per-instance phase, fading out past ~200 m (sub-
 *     pixel at range; avoids TRAA shimmer).
 *   - grass: cantilever bend (tip², GroundRing) + fine shimmer.
 *
 * Context is a module singleton like sunU/caustics: set it before any
 * vegetation material builds; absent context (gallery) → no wind.
 */

import { Vector2 } from 'three';
import type { StorageTexture } from 'three/webgpu';
import { attribute, float, texture, time, uniform, vec2, vec3 } from 'three/tsl';
import type { NF, NV2, NV3, NV4 } from '../gpu/TSLTypes';
import { PERIOD_FBM } from '../gpu/passes/NoiseBake';
import { canopyAt } from '../gpu/passes/Scatter';

/** global wind state (uniforms — live-tunable; ?wind=N sets strength) */
export const windU = {
  /** unit horizontal direction the wind BLOWS TOWARD */
  dir: uniform(new Vector2(0.78, 0.63).normalize()),
  /** 0 = still air, 1 = strong breeze (≈ Beaufort 6 visually) */
  strength: uniform(0.45),
};

export interface WindCtx {
  noiseA: StorageTexture;
  canopyTex: StorageTexture | null;
}

let ctx: WindCtx | null = null;

export function setWindContext(c: WindCtx | null): void {
  ctx = c;
}
export function windContext(): WindCtx | null {
  return ctx;
}

/**
 * Traveling gust factor at a world position, 0..1 (vertex-stage safe:
 * explicit mip level). Two advected fbm octaves — fronts + busy detail.
 */
export function gustAt(xz: NV2): NF {
  if (!ctx) throw new Error('wind context not set');
  const d = vec2(windU.dir as unknown as NV2);
  const p1 = xz.sub(d.mul(time.mul(10.5))).div(85 * PERIOD_FBM);
  const g1 = (texture(ctx.noiseA, p1, 0) as unknown as NV4).y;
  const p2 = xz.sub(d.mul(time.mul(7.2))).div(17 * PERIOD_FBM);
  const g2 = (texture(ctx.noiseA, p2, 0) as unknown as NV4).y;
  return g1.mul(0.6).add(g2.mul(0.4));
}

/** canopy shelter: interiors see ~40% of the open-field wind */
export function windExposure(xz: NV2): NF {
  if (!ctx) throw new Error('wind context not set');
  if (!ctx.canopyTex) return float(1);
  return float(1).sub(canopyAt(ctx.canopyTex, xz).mul(0.6));
}

/**
 * Per-vertex wind displacement for instanced vegetation. Reads the baked
 * vdata flex/phase attributes; `instPhase` decorrelates instances and
 * `dist` fades the high-frequency flutter out at range.
 */
export function vegWindOffset(
  origin: NV3,
  instPhase: NF,
  dist: NF,
  k: number,
): NV3 {
  const vd = attribute('vdata', 'vec4') as unknown as NV4;
  const flex = vd.y;
  const d = vec2(windU.dir as unknown as NV2);
  const strength = windU.strength as unknown as NF;

  const gust = gustAt(origin.xz);
  const amp = strength
    .mul(gust.mul(0.95).add(0.25))
    .mul(windExposure(origin.xz))
    .mul(k);

  // slow surge so steady wind still breathes (per-instance phase)
  const pump = time
    .mul(1.1)
    .add(instPhase.mul(6.2832))
    .sin()
    .mul(0.22)
    .add(0.78);
  const sway = amp.mul(pump).mul(flex).mul(0.5);

  // branch flutter: per-vertex phase from the growth bake + cross-wind
  // wobble; gone by ~220 m (sub-pixel, would only feed TRAA shimmer)
  const flutAtten = float(1).sub(dist.sub(80).div(140).clamp(0, 1));
  const f1 = time
    .mul(gust.mul(1.6).add(3.4))
    .add(vd.z.mul(6.2832))
    .add(instPhase.mul(9.4))
    .sin();
  const f2 = time
    .mul(2.3)
    .add(vd.z.mul(12.566))
    .sin();
  const flut = amp.mul(flex).mul(flutAtten).mul(0.16);

  const dx = d.x.mul(sway).add(d.x.mul(f1).sub(d.y.mul(f2.mul(0.6))).mul(flut));
  const dz = d.y.mul(sway).add(d.y.mul(f1).add(d.x.mul(f2.mul(0.6))).mul(flut));
  // cantilever arc: tips dip slightly as they deflect
  const dy = sway.add(flut.mul(f1.abs())).mul(flex).mul(-0.18);
  return vec3(dx, dy, dz);
}
