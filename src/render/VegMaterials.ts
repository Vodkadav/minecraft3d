/**
 * Vegetation materials (v1: structure-review shading; TexSynth bark/leaf
 * detail + translucency land with the texture milestone).
 *
 * All vegetation geometry carries a `vdata` vec4 attribute:
 *   x hue jitter (−1..1) · y sway flexibility · z sway phase · w baked AO.
 * Hue/AO are consumed here; sway feeds the Phase-6 wind field.
 */

import { DoubleSide, type Texture } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, clamp, float, normalMap, texture, uv, vec3 } from 'three/tsl';
import type { NF, NV3, NV4 } from '../gpu/TSLTypes';

function vdata(): NV4 {
  return attribute('vdata', 'vec4') as unknown as NV4;
}

/** hue jitter: rotate albedo toward yellow (+) / blue-green (−) */
function hueShift(base: NV3, hue: NF, amount: number): NV3 {
  const k = hue.mul(amount);
  const warm = vec3(1.18, 1.0, 0.55);
  const cool = vec3(0.7, 0.95, 1.25);
  const shifted = base
    .mul(warm)
    .mul(clamp(k, 0, 1))
    .add(base.mul(cool).mul(clamp(k.negate(), 0, 1)))
    .add(base.mul(float(1).sub(k.abs())));
  return shifted;
}

export interface BarkMatParams {
  color: { r: number; g: number; b: number };
  roughness?: number;
}

export function barkMaterial(p: BarkMatParams): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const d = vdata();
  const base = vec3(p.color.r, p.color.g, p.color.b);
  mat.colorNode = hueShift(base, d.x, 0.18).mul(d.w.mul(0.75).add(0.25));
  mat.roughness = p.roughness ?? 0.93;
  mat.metalness = 0;
  return mat;
}

/**
 * Synthesized bark material: tileable albedo/cavity + normal/rough/height.
 * Cavity feeds `aoNode` — AO on indirect light only (DEVIATIONS D-1 close).
 */
export function barkTexturedMaterial(tex: {
  texA: Texture;
  texB: Texture;
}): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const d = vdata();
  const a = texture(tex.texA, uv() as never) as unknown as NV4;
  const b = texture(tex.texB, uv() as never) as unknown as NV4;
  const albedo = a.rgb.mul(a.rgb); // sqrt-encoded at bake
  mat.colorNode = hueShift(albedo, d.x, 0.14).mul(d.w.mul(0.45).add(0.55));
  mat.normalNode = normalMap(vec3(b.x, b.y, 1));
  mat.aoNode = a.w;
  mat.roughnessNode = b.z;
  mat.metalness = 0;
  return mat;
}

export interface FoliageMatParams {
  color: { r: number; g: number; b: number; hueVar: number };
}

export function foliageMaterial(p: FoliageMatParams): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const d = vdata();
  const base = vec3(p.color.r, p.color.g, p.color.b);
  mat.colorNode = hueShift(base, d.x, p.color.hueVar).mul(d.w.mul(0.8).add(0.2));
  mat.roughness = 0.62;
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}

/** captured cluster-card material: sqrt-decoded atlas albedo, alpha-tested */
export function foliageCardMaterial(
  atlas: Texture,
  p: FoliageMatParams,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const d = vdata();
  const t = texture(atlas, uv() as never) as unknown as NV4;
  const albedo = t.rgb.mul(t.rgb); // sqrt-encoded at capture
  mat.colorNode = hueShift(albedo, d.x, p.color.hueVar * 0.55).mul(
    d.w.mul(0.75).add(0.25),
  );
  mat.opacityNode = t.w;
  mat.alphaTest = 0.32;
  mat.roughness = 0.62;
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}
