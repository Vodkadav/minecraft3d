import { describe, expect, it } from "vitest";
import {
  CHUNK_CELLS,
  CHUNK_SAMPLES,
  chunkOfSample,
  chunkRangeOverlappingSamples,
  chunkSampleOrigin,
  dequantizeSdf,
  gridToWorld,
  parseVoxelChunkKey,
  quantizeSdf,
  SDF_CLAMP_M,
  voxelChunkKey,
  VOXEL_SIZE_M,
  worldToGrid,
} from "./VoxelGrid";

describe("voxelChunkKey", () => {
  it("encodes chunk coords in the save layer's 'x,y,z' scheme", () => {
    expect(voxelChunkKey(12, -3, 7)).toBe("12,-3,7");
  });

  it("round-trips through parseVoxelChunkKey", () => {
    expect(parseVoxelChunkKey(voxelChunkKey(-5, 0, 31))).toEqual([-5, 0, 31]);
  });

  it("rejects malformed keys", () => {
    expect(parseVoxelChunkKey("1,2")).toBeNull();
    expect(parseVoxelChunkKey("a,b,c")).toBeNull();
    expect(parseVoxelChunkKey("1,2,3,4")).toBeNull();
    expect(parseVoxelChunkKey("1.5,2,3")).toBeNull();
  });
});

describe("grid <-> world", () => {
  it("converts sample indices to meters and back", () => {
    expect(gridToWorld(4)).toBeCloseTo(4 * VOXEL_SIZE_M);
    expect(worldToGrid(gridToWorld(-9))).toBeCloseTo(-9);
  });
});

describe("chunk lattice", () => {
  it("maps a sample index to its owning chunk (floor division)", () => {
    expect(chunkOfSample(0)).toBe(0);
    expect(chunkOfSample(CHUNK_CELLS - 1)).toBe(0);
    expect(chunkOfSample(CHUNK_CELLS)).toBe(1);
    expect(chunkOfSample(-1)).toBe(-1);
    expect(chunkOfSample(-CHUNK_CELLS)).toBe(-1);
    expect(chunkOfSample(-CHUNK_CELLS - 1)).toBe(-2);
  });

  it("chunk sample origin is chunk * CHUNK_CELLS", () => {
    expect(chunkSampleOrigin(2)).toBe(2 * CHUNK_CELLS);
    expect(chunkSampleOrigin(-1)).toBe(-CHUNK_CELLS);
  });

  it("chunks store CHUNK_CELLS+1 samples per axis (shared faces)", () => {
    expect(CHUNK_SAMPLES).toBe(CHUNK_CELLS + 1);
  });

  it("finds every chunk whose inclusive sample range [16c, 16c+16] overlaps a span", () => {
    // A single boundary sample (i = 16) is held by both chunk 0 and chunk 1.
    expect(chunkRangeOverlappingSamples(CHUNK_CELLS, CHUNK_CELLS)).toEqual([0, 1]);
    // Interior sample belongs to exactly one chunk.
    expect(chunkRangeOverlappingSamples(3, 5)).toEqual([0, 0]);
    // Negative spans: -16 is itself a boundary sample shared by chunks -2 and -1.
    expect(chunkRangeOverlappingSamples(-CHUNK_CELLS, -1)).toEqual([-2, -1]);
    expect(chunkRangeOverlappingSamples(-CHUNK_CELLS + 1, -1)).toEqual([-1, -1]);
    expect(chunkRangeOverlappingSamples(-CHUNK_CELLS - 2, 1)).toEqual([-2, 0]);
  });
});

describe("sdf quantization", () => {
  it("is symmetric and clamps to +/- SDF_CLAMP_M", () => {
    expect(quantizeSdf(0)).toBe(0);
    expect(quantizeSdf(SDF_CLAMP_M)).toBe(127);
    expect(quantizeSdf(-SDF_CLAMP_M)).toBe(-127);
    expect(quantizeSdf(SDF_CLAMP_M * 10)).toBe(127);
    expect(quantizeSdf(-SDF_CLAMP_M * 10)).toBe(-127);
  });

  it("preserves sign for small magnitudes (solid stays solid)", () => {
    expect(quantizeSdf(-0.004)).toBeLessThan(0);
    expect(quantizeSdf(0.004)).toBeGreaterThan(0);
  });

  it("round-trips within one quantization step", () => {
    for (const d of [-1.7, -0.31, 0.02, 0.5, 1.99]) {
      expect(Math.abs(dequantizeSdf(quantizeSdf(d)) - d)).toBeLessThanOrEqual(
        SDF_CLAMP_M / 127,
      );
    }
  });
});
