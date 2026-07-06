/**
 * Binary codec for one voxel chunk's persisted payload — the opaque bytes
 * inside a ChunkDelta (research §7: only edits are persisted). The save layer
 * treats the blob as bytes; this file owns its layout.
 *
 * Layout v1: [version u8][3 reserved bytes][sdf i8 x N][material u8 x N]
 * [editedMask bitset ceil(N/8)] with N = CHUNK_SAMPLE_COUNT.
 */

import { err, ok, type Result } from "../Result";
import { CHUNK_SAMPLE_COUNT } from "./VoxelGrid";

export const VOXEL_BLOB_VERSION = 1;

const HEADER_BYTES = 4;
const MASK_BYTES = Math.ceil(CHUNK_SAMPLE_COUNT / 8);

export interface VoxelChunkPayload {
  readonly sdf: Int8Array;
  readonly material: Uint8Array;
  readonly editedMask: Uint8Array;
}

export type VoxelCodecError =
  | { readonly kind: "UnsupportedVersion"; readonly version: number }
  | { readonly kind: "BadLength"; readonly expected: number; readonly actual: number };

export function voxelBlobLength(): number {
  return HEADER_BYTES + CHUNK_SAMPLE_COUNT * 2 + MASK_BYTES;
}

export function encodeVoxelChunk(payload: VoxelChunkPayload): Uint8Array {
  const blob = new Uint8Array(voxelBlobLength());
  blob[0] = VOXEL_BLOB_VERSION;
  blob.set(new Uint8Array(payload.sdf.buffer, payload.sdf.byteOffset, CHUNK_SAMPLE_COUNT).slice(), HEADER_BYTES);
  blob.set(payload.material.slice(), HEADER_BYTES + CHUNK_SAMPLE_COUNT);
  blob.set(payload.editedMask.slice(), HEADER_BYTES + CHUNK_SAMPLE_COUNT * 2);
  return blob;
}

export function decodeVoxelChunk(
  blob: Uint8Array,
): Result<VoxelChunkPayload, VoxelCodecError> {
  if (blob.byteLength > 0 && blob[0] !== VOXEL_BLOB_VERSION) {
    return err({ kind: "UnsupportedVersion", version: blob[0] });
  }
  if (blob.byteLength !== voxelBlobLength()) {
    return err({ kind: "BadLength", expected: voxelBlobLength(), actual: blob.byteLength });
  }
  const sdf = new Int8Array(CHUNK_SAMPLE_COUNT);
  sdf.set(new Int8Array(blob.buffer, blob.byteOffset + HEADER_BYTES, CHUNK_SAMPLE_COUNT));
  return ok({
    sdf,
    material: blob.slice(
      HEADER_BYTES + CHUNK_SAMPLE_COUNT,
      HEADER_BYTES + CHUNK_SAMPLE_COUNT * 2,
    ),
    editedMask: blob.slice(HEADER_BYTES + CHUNK_SAMPLE_COUNT * 2),
  });
}
