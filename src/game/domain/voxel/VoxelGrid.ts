/**
 * Voxel lattice conventions for the hybrid terrain (M8, research §3).
 *
 * The world is sampled on a global integer lattice at VOXEL_SIZE_M spacing,
 * origin-aligned with the engine's world origin. Values are signed distances:
 * negative = solid, positive = air. Chunks are CHUNK_CELLS^3 cells and store
 * (CHUNK_CELLS+1)^3 corner samples, so neighboring chunks share their boundary
 * face samples — edits write every overlapping chunk, keeping shared faces
 * bit-identical (the crack-free meshing precondition).
 */

import type { ChunkKey } from "../world/WorldSaveData";

export const VOXEL_SIZE_M = 0.5;
export const CHUNK_CELLS = 16;
export const CHUNK_SAMPLES = CHUNK_CELLS + 1;
export const CHUNK_SAMPLE_COUNT = CHUNK_SAMPLES ** 3;

/** Quantization range: stored i8 saturates at +/- this many meters. */
export const SDF_CLAMP_M = 2;

/** Digging never opens space at or below this world height (plan 8.4). */
export const SUBTERRANEAN_FLOOR_Y_M = 0;

export function voxelChunkKey(cx: number, cy: number, cz: number): ChunkKey {
  return `${cx},${cy},${cz}`;
}

/** Parse a "x,y,z" integer chunk key; null when malformed (untrusted save data). */
export function parseVoxelChunkKey(
  key: ChunkKey,
): readonly [number, number, number] | null {
  const parts = key.split(",");
  if (parts.length !== 3) return null;
  const coords = parts.map((part) => Number(part));
  if (coords.some((c) => !Number.isInteger(c))) return null;
  return [coords[0], coords[1], coords[2]];
}

export function gridToWorld(i: number): number {
  return i * VOXEL_SIZE_M;
}

export function worldToGrid(m: number): number {
  return m / VOXEL_SIZE_M;
}

export function chunkOfSample(i: number): number {
  return Math.floor(i / CHUNK_CELLS);
}

export function chunkSampleOrigin(c: number): number {
  return c * CHUNK_CELLS;
}

/** Row-major index into a chunk's sample arrays. */
export function sampleIndexInChunk(lx: number, ly: number, lz: number): number {
  return (lz * CHUNK_SAMPLES + ly) * CHUNK_SAMPLES + lx;
}

/**
 * Inclusive chunk-coordinate range [min, max] of every chunk whose sample span
 * [16c, 16c+16] overlaps the sample span [a, b] on one axis. Boundary samples
 * (i % 16 === 0) belong to two chunks.
 */
export function chunkRangeOverlappingSamples(
  a: number,
  b: number,
): readonly [number, number] {
  // + 0 normalizes Math.ceil's -0 so chunk coords stringify consistently.
  return [Math.ceil((a - CHUNK_CELLS) / CHUNK_CELLS) + 0, Math.floor(b / CHUNK_CELLS) + 0];
}

/**
 * Quantize a signed distance (meters) to i8, saturating at SDF_CLAMP_M.
 * Sign-preserving: a solid sample never rounds to air (0 counts as air).
 */
export function quantizeSdf(meters: number): number {
  if (meters === 0) return 0;
  const q = Math.round((meters / SDF_CLAMP_M) * 127);
  if (meters < 0) return Math.max(-127, Math.min(-1, q));
  return Math.min(127, Math.max(1, q));
}

export function dequantizeSdf(q: number): number {
  return (q / 127) * SDF_CLAMP_M;
}
