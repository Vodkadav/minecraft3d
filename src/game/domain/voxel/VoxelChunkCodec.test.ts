import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES } from "./VoxelGrid";
import {
  decodeVoxelChunk,
  encodeVoxelChunk,
  VOXEL_BLOB_VERSION,
  voxelBlobLength,
} from "./VoxelChunkCodec";

const SAMPLE_COUNT = CHUNK_SAMPLES ** 3;
const MASK_BYTES = Math.ceil(SAMPLE_COUNT / 8);

function payload() {
  const sdf = new Int8Array(SAMPLE_COUNT);
  const material = new Uint8Array(SAMPLE_COUNT);
  const editedMask = new Uint8Array(MASK_BYTES);
  sdf[0] = -127;
  sdf[SAMPLE_COUNT - 1] = 42;
  material[7] = 3;
  editedMask[0] = 0b1010;
  return { sdf, material, editedMask };
}

describe("encodeVoxelChunk / decodeVoxelChunk", () => {
  it("round-trips sdf, material and edited mask", () => {
    const original = payload();

    const decoded = decodeVoxelChunk(encodeVoxelChunk(original));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect([...decoded.value.sdf]).toEqual([...original.sdf]);
    expect([...decoded.value.material]).toEqual([...original.material]);
    expect([...decoded.value.editedMask]).toEqual([...original.editedMask]);
  });

  it("emits the documented blob length", () => {
    expect(encodeVoxelChunk(payload()).byteLength).toBe(voxelBlobLength());
  });

  it("copies the arrays (mutating the source after encode leaves the blob intact)", () => {
    const source = payload();
    const blob = encodeVoxelChunk(source);
    source.sdf[0] = 99;

    const decoded = decodeVoxelChunk(blob);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.sdf[0]).toBe(-127);
  });

  it("rejects an unknown version as a value, not a throw", () => {
    const blob = encodeVoxelChunk(payload());
    blob[0] = VOXEL_BLOB_VERSION + 1;

    const decoded = decodeVoxelChunk(blob);

    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.kind).toBe("UnsupportedVersion");
  });

  it("rejects a truncated blob", () => {
    const blob = encodeVoxelChunk(payload()).slice(0, 100);

    const decoded = decodeVoxelChunk(blob);

    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.kind).toBe("BadLength");
  });
});
