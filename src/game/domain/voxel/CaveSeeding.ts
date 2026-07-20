/**
 * Deterministic 3D-noise cave-field predicate (plan E6.1, same shape as
 * `OreGemSeeding.ts`). Pure and renderer-free: given a world seed and a
 * surface-height source it decides whether a world point is carved (open
 * cave space) or solid — winding tunnels from two independent "ridge" noise
 * fields crossing near their zero-lines (the classic worm-cave technique),
 * plus rare, bigger chambers from a third, lower-frequency field. Same seed
 * ⇒ bit-identical layout on every machine and peer, matching the ore/gem
 * determinism guarantee this module sits beside.
 *
 * Prime directive: `caveOpennessAt` is hard-gated so nothing is ever carved
 * above `CAVE_SAFE_DEPTH_M` below the local surface, or at/below the world's
 * `SUBTERRANEAN_FLOOR_Y_M` floor — no roll, however lucky, can open a hole at
 * the surface. The engine unions this against the terrain SDF (Math.max,
 * `withCaveCarving` below); cave walls still fall through the existing
 * depth-band/vein material painting (`OreGemSeeding`) unchanged, since a
 * carved sample is simply never materialized as solid.
 *
 * Depth-gated creature spawning inside caves is out of scope here (E6.3
 * biome/depth spawn tables) — the natural seam is `caveOpennessAt`'s `depth`
 * local, already computed per-position for exactly that gate.
 */

import { hashUnitFloat } from "../rng/hash";
import { SUBTERRANEAN_FLOOR_Y_M } from "./VoxelGrid";

/** The surface the depth is measured from (engine adapter: heightfield). */
export interface SurfaceHeight {
  heightAt(wx: number, wz: number): number;
}

/**
 * Worldgen feature-version this cave carving shipped at (`WorldSaveData.
 * worldgenVersion`). A save stamped at/after this value opts into cave
 * carving for its never-before-touched terrain; an older/unstamped save
 * (every world that existed before E6.1) keeps regenerating cave-free,
 * byte-identical to its pre-caves behavior — the prime-directive gate for
 * this feature. See `VoxelTerrain`'s constructor/`init`.
 */
export const CAVES_WORLDGEN_VERSION = 2;

/** No cave ever opens above this many meters below the local surface. */
export const CAVE_SAFE_DEPTH_M = 16;

/** Tunnel/chamber density ramps from the safe floor to these depths, then caps. */
const TUNNEL_FULL_DEPTH_M = 70;
const CHAMBER_FULL_DEPTH_M = 90;

/** Lattice cell sizes (meters) for the underlying value-noise fields. Two
 *  distinct scales for the tunnel pair so their near-zero contours don't
 *  stay parallel (which would carve flat sheets instead of winding tubes). */
const TUNNEL_CELL_A_M = 6;
const TUNNEL_CELL_B_M = 7.3;
const CHAMBER_CELL_M = 22;

const TUNNEL_SALT_A = 0x7a1;
const TUNNEL_SALT_B = 0x3f5;
const CHAMBER_SALT = 0xc17;

/** Threshold the tunnel product must clear to carve, sparse near the safe
 *  floor and easier (denser network) with depth. */
const TUNNEL_THRESHOLD_START = 0.6;
const TUNNEL_THRESHOLD_MIN = 0.42;

/** Chamber field must clear a high bar — rare, big rounded rooms. */
const CHAMBER_THRESHOLD_START = 0.93;
const CHAMBER_THRESHOLD_MIN = 0.82;

/** Meters-scale the raw [-1,1]-ish openness margin is stretched to for the
 *  engine's SDF union; clamped well inside the i8 quantization range. */
const OPENNESS_SCALE_M = 3;
const SOLID_SENTINEL_M = -10;

function ramp01(depth: number, start: number, full: number): number {
  if (depth < start) return 0;
  return Math.min((depth - start) / (full - start), 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep(0,1,t) — cheap C1-continuous ease for the noise interpolation. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 3D value noise in [0, 1): hash-seeded lattice corners at `cellM` spacing,
 * trilinearly interpolated with smoothstep easing. Deterministic per
 * (seed, salt, position).
 */
function valueNoise3D(
  seed: number,
  wx: number,
  wy: number,
  wz: number,
  cellM: number,
  salt: number,
): number {
  const x = wx / cellM;
  const y = wy / cellM;
  const z = wz / cellM;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);

  let value = 0;
  for (let i = 0; i < 8; i++) {
    const dx = i & 1;
    const dy = (i >> 1) & 1;
    const dz = (i >> 2) & 1;
    const wxi = dx ? fx : 1 - fx;
    const wyi = dy ? fy : 1 - fy;
    const wzi = dz ? fz : 1 - fz;
    const weight = wxi * wyi * wzi;
    if (weight === 0) continue;
    value += weight * hashUnitFloat(seed, x0 + dx, y0 + dy, z0 + dz, salt);
  }
  return value;
}

/** 1 at the field's midline (0.5), 0 at its extremes — a "near zero-crossing" ridge. */
function ridge(v: number): number {
  return 1 - Math.abs(v * 2 - 1);
}

/** Winding-tunnel strength in [0, 1]: high only where two independent ridge
 *  fields cross near their midlines together (worm-cave technique). */
export function tunnelStrength(seed: number, wx: number, wy: number, wz: number): number {
  const a = ridge(valueNoise3D(seed, wx, wy, wz, TUNNEL_CELL_A_M, TUNNEL_SALT_A));
  const b = ridge(valueNoise3D(seed, wx, wy, wz, TUNNEL_CELL_B_M, TUNNEL_SALT_B));
  return a * b;
}

/** Rare-chamber field in [0, 1): a single lower-frequency value noise. */
export function chamberStrength(seed: number, wx: number, wy: number, wz: number): number {
  return valueNoise3D(seed, wx, wy, wz, CHAMBER_CELL_M, CHAMBER_SALT);
}

/**
 * Continuous cave "openness" at a world position: positive inside carved
 * space (magnitude ~ how deep past the threshold, in engine SDF meters),
 * negative/solid otherwise. Hard-gated to strongly solid above the safe
 * depth or at/below the world's subterranean floor — the surface (and the
 * bottom of the world) can never be breached by any noise roll.
 */
export function caveOpennessAt(
  seed: number,
  wx: number,
  wy: number,
  wz: number,
  surfaceY: number,
): number {
  if (wy <= SUBTERRANEAN_FLOOR_Y_M) return SOLID_SENTINEL_M;
  const depth = surfaceY - wy;
  if (depth < CAVE_SAFE_DEPTH_M) return SOLID_SENTINEL_M;

  const tunnelT = ramp01(depth, CAVE_SAFE_DEPTH_M, TUNNEL_FULL_DEPTH_M);
  const tunnelThreshold = lerp(TUNNEL_THRESHOLD_START, TUNNEL_THRESHOLD_MIN, tunnelT);
  const tunnelMargin = tunnelStrength(seed, wx, wy, wz) - tunnelThreshold;

  const chamberT = ramp01(depth, CAVE_SAFE_DEPTH_M, CHAMBER_FULL_DEPTH_M);
  const chamberThreshold = lerp(CHAMBER_THRESHOLD_START, CHAMBER_THRESHOLD_MIN, chamberT);
  const chamberMargin = chamberStrength(seed, wx, wy, wz) - chamberThreshold;

  const margin = Math.max(tunnelMargin, chamberMargin);
  return Math.max(SOLID_SENTINEL_M, Math.min(1, margin) * OPENNESS_SCALE_M * 10);
}

/** Predicate form: is this world point carved (open cave space)? */
export function isCaveCarved(
  seed: number,
  wx: number,
  wy: number,
  wz: number,
  surfaceY: number,
): boolean {
  return caveOpennessAt(seed, wx, wy, wz, surfaceY) > 0;
}

/**
 * Compose a terrain SDF with cave carving: union (`Math.max`) so a carved
 * point reads as air regardless of the terrain's own solidity. The safe-depth
 * and subterranean-floor gates inside `caveOpennessAt` are the only thing
 * standing between this and a surface hole, so they are never bypassed here.
 */
export function withCaveCarving(
  seed: number,
  surface: SurfaceHeight,
  terrainSdfAt: (wx: number, wy: number, wz: number) => number,
): (wx: number, wy: number, wz: number) => number {
  return (wx, wy, wz) => {
    const terrain = terrainSdfAt(wx, wy, wz);
    const surfaceY = surface.heightAt(wx, wz);
    return Math.max(terrain, caveOpennessAt(seed, wx, wy, wz, surfaceY));
  };
}
