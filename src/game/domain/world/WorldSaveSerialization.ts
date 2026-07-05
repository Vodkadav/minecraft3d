/**
 * Splits a `WorldSaveData` into the two shapes real browser storage wants:
 * JSON-safe structured metadata (IndexedDB) and opaque binary chunk blobs
 * (OPFS). Keeping this a pure domain transform means the encode/decode logic is
 * unit-tested in Node, and the browser adapters stay thin glue over it.
 *
 * Decode is the trust boundary: a metadata index entry with no matching blob,
 * or a blob with no index entry, is a corruption we surface as a Result — never
 * a thrown exception (err-explicit-result-handling).
 */

import { err, ok, type Result } from "../Result";
import type {
  ChunkKey,
  PlayerState,
  WorldId,
  WorldSaveData,
} from "./WorldSaveData";

/** A chunk's identity + revision, without its bytes. JSON-safe. */
export interface ChunkIndexEntry {
  readonly key: ChunkKey;
  readonly rev: number;
}

/** Everything about a save except the chunk bytes. Serializes cleanly to JSON. */
export interface WorldSaveMetadata {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly createdAt: number;
  readonly modifiedAt: number;
  readonly chunkIndex: readonly ChunkIndexEntry[];
  readonly entities: Readonly<Record<string, unknown>>;
  readonly inventories: Readonly<Record<string, unknown>>;
  readonly playerState: PlayerState;
}

/** One chunk's raw bytes, addressed by its key. */
export interface ChunkBlob {
  readonly key: ChunkKey;
  readonly bytes: Uint8Array;
}

/** The transferable form: structured metadata + a bag of binary blobs. */
export interface EncodedWorldSave {
  readonly metadata: WorldSaveMetadata;
  readonly blobs: readonly ChunkBlob[];
}

export type DecodeError =
  | { readonly kind: "MissingBlob"; readonly key: ChunkKey }
  | { readonly kind: "OrphanBlob"; readonly key: ChunkKey };

export function encodeWorldSave(save: WorldSaveData): EncodedWorldSave {
  return {
    metadata: {
      worldId: save.worldId,
      seed: save.seed,
      name: save.name,
      createdAt: save.createdAt,
      modifiedAt: save.modifiedAt,
      chunkIndex: save.modifiedChunks.map((c) => ({ key: c.key, rev: c.rev })),
      entities: save.entities,
      inventories: save.inventories,
      playerState: save.playerState,
    },
    blobs: save.modifiedChunks.map((c) => ({
      key: c.key,
      bytes: new Uint8Array(c.data),
    })),
  };
}

export function decodeWorldSave(
  encoded: EncodedWorldSave,
): Result<WorldSaveData, DecodeError> {
  const { metadata, blobs } = encoded;
  const blobByKey = new Map(blobs.map((b) => [b.key, b.bytes]));
  const indexed = new Set(metadata.chunkIndex.map((e) => e.key));

  for (const blob of blobs) {
    if (!indexed.has(blob.key)) {
      return err({ kind: "OrphanBlob", key: blob.key });
    }
  }

  const modifiedChunks = [];
  for (const entry of metadata.chunkIndex) {
    const bytes = blobByKey.get(entry.key);
    if (bytes === undefined) {
      return err({ kind: "MissingBlob", key: entry.key });
    }
    modifiedChunks.push({
      key: entry.key,
      rev: entry.rev,
      data: new Uint8Array(bytes),
    });
  }

  return ok({
    worldId: metadata.worldId,
    seed: metadata.seed,
    name: metadata.name,
    createdAt: metadata.createdAt,
    modifiedAt: metadata.modifiedAt,
    modifiedChunks,
    entities: metadata.entities,
    inventories: metadata.inventories,
    playerState: metadata.playerState,
  });
}
