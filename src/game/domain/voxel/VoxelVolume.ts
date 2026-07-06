/**
 * Sparse SDF voxel volume over a procedural baseline (M8.1, research §3).
 *
 * Chunks materialize only when an edit touches them; everything else samples
 * the baseline on demand, so unmodified terrain is never stored (delta-only
 * persistence, research §7). Sign convention: negative = solid, positive = air.
 *
 * Carving is CSG toward air (max), filling toward solid (min), both applied on
 * the quantized lattice so every chunk overlapping a shared face stores
 * bit-identical values — the precondition for crack-free meshing.
 */

import { err, ok, type Result } from "../Result";
import type { ChunkDelta, ChunkKey } from "../world/WorldSaveData";
import {
  decodeVoxelChunk,
  encodeVoxelChunk,
  type VoxelCodecError,
} from "./VoxelChunkCodec";
import {
  CHUNK_CELLS,
  CHUNK_SAMPLE_COUNT,
  chunkRangeOverlappingSamples,
  chunkSampleOrigin,
  dequantizeSdf,
  gridToWorld,
  parseVoxelChunkKey,
  quantizeSdf,
  sampleIndexInChunk,
  SUBTERRANEAN_FLOOR_Y_M,
  voxelChunkKey,
  worldToGrid,
} from "./VoxelGrid";

/** Port: the procedural ground truth the volume edits against (engine adapter: heightfield). */
export interface VoxelBaseline {
  /** Signed distance in meters at a world position: negative = solid, positive = air. */
  sdfAt(wx: number, wy: number, wz: number): number;
}

/**
 * Port: material id for a solid sample (depth-seeded ore/gem layers, plan 8.4).
 * The tuned deterministic implementation is Opus-owned [O]; 0 = default stone.
 */
export interface MaterialSampler {
  materialAt(wx: number, wy: number, wz: number): number;
}

export type VoxelLoadError =
  | { readonly kind: "BadKey"; readonly key: ChunkKey }
  | { readonly kind: "Codec"; readonly key: ChunkKey; readonly error: VoxelCodecError };

interface Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  rev: number;
  /** True once the current edit batch bumped `rev` (one bump per batch). */
  revBumped: boolean;
  edited: boolean;
  readonly sdf: Int8Array;
  readonly material: Uint8Array;
  readonly editedMask: Uint8Array;
}

const MASK_BYTES = Math.ceil(CHUNK_SAMPLE_COUNT / 8);

export class VoxelVolume {
  private readonly chunks = new Map<ChunkKey, Chunk>();
  private readonly dirty = new Set<ChunkKey>();

  constructor(
    private readonly baseline: VoxelBaseline,
    private readonly materials: MaterialSampler = { materialAt: () => 0 },
  ) {}

  /** Signed distance (meters) at a lattice sample; baseline where unedited. */
  sdfAtGrid(ix: number, iy: number, iz: number): number {
    const chunk = this.chunkHolding(ix, iy, iz);
    if (chunk === null) {
      return this.baseline.sdfAt(gridToWorld(ix), gridToWorld(iy), gridToWorld(iz));
    }
    return dequantizeSdf(chunk.sdf[this.localIndex(chunk, ix, iy, iz)]);
  }

  materialAtGrid(ix: number, iy: number, iz: number): number {
    const chunk = this.chunkHolding(ix, iy, iz);
    if (chunk === null) {
      return this.materials.materialAt(gridToWorld(ix), gridToWorld(iy), gridToWorld(iz));
    }
    return chunk.material[this.localIndex(chunk, ix, iy, iz)];
  }

  isSampleEdited(ix: number, iy: number, iz: number): boolean {
    const chunk = this.chunkHolding(ix, iy, iz);
    if (chunk === null) return false;
    const index = this.localIndex(chunk, ix, iy, iz);
    return (chunk.editedMask[index >> 3] & (1 << (index & 7))) !== 0;
  }

  /** Open a spherical air pocket; a no-op below the subterranean floor. */
  carveSphere(wx: number, wy: number, wz: number, radius: number): void {
    this.applyBrush(wx, wy, wz, radius, (sample, brush) => Math.max(sample, brush), 0);
  }

  /** Place solid matter with `materialId` inside the sphere. */
  fillSphere(
    wx: number,
    wy: number,
    wz: number,
    radius: number,
    materialId: number,
  ): void {
    this.applyBrush(wx, wy, wz, radius, (sample, brush) => Math.min(sample, -brush), materialId);
  }

  modifiedChunkKeys(): readonly ChunkKey[] {
    const keys: ChunkKey[] = [];
    for (const [key, chunk] of this.chunks) if (chunk.edited) keys.push(key);
    return keys;
  }

  /** Chunks changed since the previous consume — the re-mesh work list. */
  consumeDirtyChunkKeys(): readonly ChunkKey[] {
    const keys = [...this.dirty];
    this.dirty.clear();
    return keys;
  }

  /** Snapshot every modified chunk as a persistable delta (research §7). */
  toChunkDeltas(): readonly ChunkDelta[] {
    const deltas: ChunkDelta[] = [];
    for (const [key, chunk] of this.chunks) {
      if (!chunk.edited) continue;
      deltas.push({ key, rev: chunk.rev, data: encodeVoxelChunk(chunk) });
    }
    return deltas;
  }

  /** Restore chunks from persisted deltas; every loaded chunk is marked dirty for meshing. */
  loadFromDeltas(deltas: readonly ChunkDelta[]): Result<void, VoxelLoadError> {
    for (const delta of deltas) {
      const coords = parseVoxelChunkKey(delta.key);
      if (coords === null) return err({ kind: "BadKey", key: delta.key });
      const decoded = decodeVoxelChunk(delta.data);
      if (!decoded.ok) return err({ kind: "Codec", key: delta.key, error: decoded.error });
      const [cx, cy, cz] = coords;
      this.chunks.set(delta.key, {
        cx,
        cy,
        cz,
        rev: delta.rev,
        revBumped: false,
        edited: true,
        sdf: decoded.value.sdf,
        material: decoded.value.material,
        editedMask: decoded.value.editedMask,
      });
      this.dirty.add(delta.key);
    }
    return ok(undefined);
  }

  // ---------------------------------------------------------------- internals

  private applyBrush(
    wx: number,
    wy: number,
    wz: number,
    radius: number,
    combine: (sampleM: number, brushM: number) => number,
    materialId: number,
  ): void {
    const minGrid = [wx - radius, wy - radius, wz - radius].map((m) =>
      Math.floor(worldToGrid(m)) - 1,
    );
    const maxGrid = [wx + radius, wy + radius, wz + radius].map((m) =>
      Math.ceil(worldToGrid(m)) + 1,
    );
    const [cxMin, cxMax] = chunkRangeOverlappingSamples(minGrid[0], maxGrid[0]);
    const [cyMin, cyMax] = chunkRangeOverlappingSamples(minGrid[1], maxGrid[1]);
    const [czMin, czMax] = chunkRangeOverlappingSamples(minGrid[2], maxGrid[2]);

    const touched: Chunk[] = [];
    for (let cz = czMin; cz <= czMax; cz++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const chunk = this.materialize(cx, cy, cz);
          touched.push(chunk);
          this.applyBrushToChunk(chunk, wx, wy, wz, radius, combine, materialId);
        }
      }
    }
    // Drop chunks the brush materialized but did not actually change.
    for (const chunk of touched) {
      const key = voxelChunkKey(chunk.cx, chunk.cy, chunk.cz);
      if (!chunk.edited) this.chunks.delete(key);
      else chunk.revBumped = false; // close the edit batch for the next rev bump
    }
  }

  private applyBrushToChunk(
    chunk: Chunk,
    wx: number,
    wy: number,
    wz: number,
    radius: number,
    combine: (sampleM: number, brushM: number) => number,
    materialId: number,
  ): void {
    const ox = chunkSampleOrigin(chunk.cx);
    const oy = chunkSampleOrigin(chunk.cy);
    const oz = chunkSampleOrigin(chunk.cz);
    for (let lz = 0; lz <= CHUNK_CELLS; lz++) {
      const pz = gridToWorld(oz + lz);
      for (let ly = 0; ly <= CHUNK_CELLS; ly++) {
        const py = gridToWorld(oy + ly);
        for (let lx = 0; lx <= CHUNK_CELLS; lx++) {
          const px = gridToWorld(ox + lx);
          const dist = Math.hypot(px - wx, py - wy, pz - wz);
          if (dist > radius) continue;
          // The floor is inviolable: no brush may open air at/below it.
          const opensAir = combine(-1, radius - dist) > -1;
          if (opensAir && py <= SUBTERRANEAN_FLOOR_Y_M) continue;
          const index = sampleIndexInChunk(lx, ly, lz);
          const current = dequantizeSdf(chunk.sdf[index]);
          const next = quantizeSdf(combine(current, radius - dist));
          if (next === chunk.sdf[index]) continue;
          chunk.sdf[index] = next;
          if (next < 0) chunk.material[index] = materialId;
          chunk.editedMask[index >> 3] |= 1 << (index & 7);
          chunk.edited = true;
          if (!chunk.revBumped) {
            chunk.rev += 1;
            chunk.revBumped = true;
          }
          this.dirty.add(voxelChunkKey(chunk.cx, chunk.cy, chunk.cz));
        }
      }
    }
  }

  private materialize(cx: number, cy: number, cz: number): Chunk {
    const key = voxelChunkKey(cx, cy, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const sdf = new Int8Array(CHUNK_SAMPLE_COUNT);
    const material = new Uint8Array(CHUNK_SAMPLE_COUNT);
    const ox = chunkSampleOrigin(cx);
    const oy = chunkSampleOrigin(cy);
    const oz = chunkSampleOrigin(cz);
    for (let lz = 0; lz <= CHUNK_CELLS; lz++) {
      for (let ly = 0; ly <= CHUNK_CELLS; ly++) {
        for (let lx = 0; lx <= CHUNK_CELLS; lx++) {
          const wx = gridToWorld(ox + lx);
          const wy = gridToWorld(oy + ly);
          const wz = gridToWorld(oz + lz);
          const index = sampleIndexInChunk(lx, ly, lz);
          const sdfM = this.baseline.sdfAt(wx, wy, wz);
          sdf[index] = quantizeSdf(sdfM);
          if (sdfM < 0) material[index] = this.materials.materialAt(wx, wy, wz);
        }
      }
    }
    const chunk: Chunk = {
      cx,
      cy,
      cz,
      rev: 0,
      revBumped: false,
      edited: false,
      sdf,
      material,
      editedMask: new Uint8Array(MASK_BYTES),
    };
    this.chunks.set(key, chunk);
    return chunk;
  }

  /**
   * The loaded chunk holding a lattice sample, or null. Boundary samples
   * (i % 16 === 0) may live in up to 8 chunks; edits keep them identical, so
   * any holder is authoritative.
   */
  private chunkHolding(ix: number, iy: number, iz: number): Chunk | null {
    const [cxMin, cxMax] = chunkRangeOverlappingSamples(ix, ix);
    const [cyMin, cyMax] = chunkRangeOverlappingSamples(iy, iy);
    const [czMin, czMax] = chunkRangeOverlappingSamples(iz, iz);
    for (let cz = czMin; cz <= czMax; cz++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const chunk = this.chunks.get(voxelChunkKey(cx, cy, cz));
          if (chunk) return chunk;
        }
      }
    }
    return null;
  }

  private localIndex(chunk: Chunk, ix: number, iy: number, iz: number): number {
    return sampleIndexInChunk(
      ix - chunkSampleOrigin(chunk.cx),
      iy - chunkSampleOrigin(chunk.cy),
      iz - chunkSampleOrigin(chunk.cz),
    );
  }
}
