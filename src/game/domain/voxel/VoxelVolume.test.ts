import { describe, expect, it } from "vitest";
import { decodeVoxelChunk } from "./VoxelChunkCodec";
import {
  CHUNK_CELLS,
  CHUNK_SAMPLES,
  parseVoxelChunkKey,
  sampleIndexInChunk,
  SUBTERRANEAN_FLOOR_Y_M,
  VOXEL_SIZE_M,
} from "./VoxelGrid";
import { VoxelVolume } from "./VoxelVolume";

/** Flat ground at y=10 m: negative below (solid), positive above (air). */
function flatGround(): VoxelVolume {
  return new VoxelVolume({ sdfAt: (_x, y, _z) => y - 10 });
}

/** World y in meters -> vertical sample index. */
function gy(yMeters: number): number {
  return Math.round(yMeters / VOXEL_SIZE_M);
}

describe("VoxelVolume — baseline sampling", () => {
  it("samples the procedural baseline where nothing was edited", () => {
    const volume = flatGround();

    expect(volume.sdfAtGrid(0, gy(15), 0)).toBeGreaterThan(0); // air
    expect(volume.sdfAtGrid(0, gy(5), 0)).toBeLessThan(0); // solid
    expect(volume.modifiedChunkKeys()).toEqual([]);
  });
});

describe("VoxelVolume — carveSphere", () => {
  it("carves an air cavern below the surface", () => {
    const volume = flatGround();

    volume.carveSphere(0, 8, 0, 2);

    expect(volume.sdfAtGrid(0, gy(8), 0)).toBeGreaterThan(0); // cavern center is air
    expect(volume.sdfAtGrid(0, gy(4), 0)).toBeLessThan(0); // beyond radius: solid
    expect(volume.modifiedChunkKeys().length).toBeGreaterThan(0);
  });

  it("carving pure air changes nothing (no phantom modified chunks)", () => {
    const volume = flatGround();

    volume.carveSphere(0, 20, 0, 1.5);

    expect(volume.modifiedChunkKeys()).toEqual([]);
  });

  it("never carves below the subterranean floor", () => {
    const volume = flatGround();

    volume.carveSphere(0, SUBTERRANEAN_FLOOR_Y_M, 0, 2);

    expect(volume.sdfAtGrid(0, gy(SUBTERRANEAN_FLOOR_Y_M - 1), 0)).toBeLessThan(0);
    expect(volume.sdfAtGrid(0, gy(SUBTERRANEAN_FLOOR_Y_M), 0)).toBeLessThan(0);
    // above the floor the carve applies
    expect(volume.sdfAtGrid(0, gy(SUBTERRANEAN_FLOOR_Y_M + 1), 0)).toBeGreaterThan(0);
  });

  it("marks carved samples as edited, untouched samples as not", () => {
    const volume = flatGround();

    volume.carveSphere(0, 8, 0, 2);

    expect(volume.isSampleEdited(0, gy(8), 0)).toBe(true);
    expect(volume.isSampleEdited(40, gy(8), 40)).toBe(false);
  });
});

describe("VoxelVolume — fillSphere", () => {
  it("places solid matter with the given material above ground", () => {
    const volume = flatGround();

    volume.fillSphere(0, 14, 0, 1.5, 5);

    expect(volume.sdfAtGrid(0, gy(14), 0)).toBeLessThan(0); // now solid
    expect(volume.materialAtGrid(0, gy(14), 0)).toBe(5);
  });
});

describe("VoxelVolume — chunk-boundary consistency", () => {
  it("stores identical values for the shared face of neighboring chunks", () => {
    const volume = flatGround();
    const chunkMeters = CHUNK_CELLS * VOXEL_SIZE_M;
    // Sphere centered on a chunk corner so the edit spans multiple chunks.
    volume.carveSphere(chunkMeters, 8, chunkMeters, 2.5);

    const decoded = new Map<string, Int8Array>();
    for (const delta of volume.toChunkDeltas()) {
      const result = decodeVoxelChunk(delta.data);
      expect(result.ok).toBe(true);
      if (result.ok) decoded.set(delta.key, result.value.sdf);
    }

    let comparedFaces = 0;
    for (const [key, sdf] of decoded) {
      const coords = parseVoxelChunkKey(key);
      expect(coords).not.toBeNull();
      if (!coords) continue;
      const [cx, cy, cz] = coords;
      const neighbor = decoded.get(`${cx + 1},${cy},${cz}`);
      if (!neighbor) continue;
      comparedFaces++;
      for (let ly = 0; ly < CHUNK_SAMPLES; ly++) {
        for (let lz = 0; lz < CHUNK_SAMPLES; lz++) {
          expect(sdf[sampleIndexInChunk(CHUNK_CELLS, ly, lz)]).toBe(
            neighbor[sampleIndexInChunk(0, ly, lz)],
          );
        }
      }
    }
    expect(comparedFaces).toBeGreaterThan(0);
  });
});

describe("VoxelVolume — dirty tracking", () => {
  it("reports each dirty chunk once per consume", () => {
    const volume = flatGround();
    volume.carveSphere(0, 8, 0, 2);

    const first = volume.consumeDirtyChunkKeys();
    const second = volume.consumeDirtyChunkKeys();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it("re-marks a chunk dirty on a later edit", () => {
    const volume = flatGround();
    volume.carveSphere(0, 8, 0, 2);
    volume.consumeDirtyChunkKeys();

    volume.carveSphere(0.5, 8, 0, 2);

    expect(volume.consumeDirtyChunkKeys().length).toBeGreaterThan(0);
  });
});

describe("VoxelVolume — persistence deltas", () => {
  it("emits one delta per modified chunk at rev 1", () => {
    const volume = flatGround();
    volume.carveSphere(0, 8, 0, 2);

    const deltas = volume.toChunkDeltas();

    expect(deltas.length).toBe(volume.modifiedChunkKeys().length);
    for (const delta of deltas) expect(delta.rev).toBe(1);
  });

  it("bumps rev on chunks touched by a second edit batch", () => {
    const volume = flatGround();
    volume.carveSphere(0, 8, 0, 2);
    volume.carveSphere(0, 8.5, 0, 2);

    const revs = volume.toChunkDeltas().map((d) => d.rev);

    expect(revs).toContain(2);
  });

  it("snapshots the blob (later edits do not rewrite an emitted delta)", () => {
    const volume = flatGround();
    volume.carveSphere(0, 8, 0, 2);
    const emitted = volume.toChunkDeltas();
    const copies = emitted.map((d) => new Uint8Array(d.data));

    volume.carveSphere(0.25, 8.25, 0, 2);

    expect(emitted.every((d, i) => bytesEqual(d.data, copies[i]))).toBe(true);
  });

  it("round-trips through loadFromDeltas", () => {
    const original = flatGround();
    original.carveSphere(0, 8, 0, 2);

    const restored = flatGround();
    const loaded = restored.loadFromDeltas(original.toChunkDeltas());

    expect(loaded.ok).toBe(true);
    expect([...restored.modifiedChunkKeys()].sort()).toEqual(
      [...original.modifiedChunkKeys()].sort(),
    );
    for (const iy of [gy(6), gy(8), gy(10)]) {
      expect(restored.sdfAtGrid(0, iy, 0)).toBe(original.sdfAtGrid(0, iy, 0));
    }
    expect(restored.consumeDirtyChunkKeys().length).toBeGreaterThan(0);
  });

  it("rejects a malformed chunk key as a value", () => {
    const volume = flatGround();

    const loaded = volume.loadFromDeltas([
      { key: "not-a-key", rev: 1, data: new Uint8Array(4) },
    ]);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.kind).toBe("BadKey");
  });

  it("rejects a corrupt blob as a value", () => {
    const volume = flatGround();

    const loaded = volume.loadFromDeltas([
      { key: "0,0,0", rev: 1, data: new Uint8Array(4) },
    ]);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.kind).toBe("Codec");
  });
});

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
