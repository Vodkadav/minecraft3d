/**
 * The real WorldSaveStore, composed from two low-level storage ports: a
 * BlobStore (OPFS in the browser) for bulk chunk bytes, and a KeyValueStore
 * (IndexedDB) for the structured metadata index. All the layout + reconciliation
 * logic lives here and is unit-tested against the in-memory fakes; the OPFS /
 * IndexedDB classes are then thin, untested glue behind the same ports.
 *
 * Layout:
 *   metadata  →  KeyValueStore  under `world:{worldId}`  (JSON of WorldSaveMetadata)
 *   chunk     →  BlobStore      under `{worldId}/{chunkKey}`
 */

import { err, isErr, ok, type Result } from "../../domain/Result";
import type {
  WorldId,
  WorldSaveData,
  WorldSummary,
} from "../../domain/world/WorldSaveData";
import {
  decodeWorldSave,
  encodeWorldSave,
  type ChunkBlob,
  type WorldSaveMetadata,
} from "../../domain/world/WorldSaveSerialization";
import type { BlobStore } from "../../application/ports/BlobStore";
import type { KeyValueStore } from "../../application/ports/KeyValueStore";
import type { StorageError } from "../../application/ports/StorageError";
import type {
  SaveError,
  WorldSaveStore,
} from "../../application/ports/WorldSaveStore";

const META_PREFIX = "world:";

function metaKey(worldId: WorldId): string {
  return `${META_PREFIX}${worldId}`;
}

function blobPrefix(worldId: WorldId): string {
  return `${worldId}/`;
}

function blobKey(worldId: WorldId, chunkKey: string): string {
  return `${worldId}/${chunkKey}`;
}

function toSaveError(e: StorageError): SaveError {
  if (e.kind === "QuotaExceeded") return { kind: "QuotaExceeded" };
  if (e.kind === "NotFound") return { kind: "StorageUnavailable", detail: `missing ${e.key}` };
  return { kind: "StorageUnavailable", detail: e.detail };
}

export class PersistentWorldSaveStore implements WorldSaveStore {
  constructor(
    private readonly blobs: BlobStore,
    private readonly meta: KeyValueStore,
  ) {}

  async save(save: WorldSaveData): Promise<Result<void, SaveError>> {
    const encoded = encodeWorldSave(save);

    const pruned = await this.pruneStaleBlobs(save.worldId, encoded.blobs);
    if (isErr(pruned)) return pruned;

    for (const blob of encoded.blobs) {
      const put = await this.blobs.put(blobKey(save.worldId, blob.key), blob.bytes);
      if (isErr(put)) return err(toSaveError(put.error));
    }

    const putMeta = await this.meta.put(
      metaKey(save.worldId),
      JSON.stringify(encoded.metadata),
    );
    if (isErr(putMeta)) return err(toSaveError(putMeta.error));

    return ok(undefined);
  }

  async load(worldId: WorldId): Promise<Result<WorldSaveData, SaveError>> {
    const rawMeta = await this.meta.get(metaKey(worldId));
    if (isErr(rawMeta)) {
      if (rawMeta.error.kind === "NotFound") return err({ kind: "NotFound", worldId });
      return err(toSaveError(rawMeta.error));
    }

    const metadata = parseMetadata(rawMeta.value);
    if (isErr(metadata)) {
      return err({ kind: "Corrupt", worldId, detail: metadata.error });
    }

    const loadedBlobs: ChunkBlob[] = [];
    for (const entry of metadata.value.chunkIndex) {
      const got = await this.blobs.get(blobKey(worldId, entry.key));
      if (isErr(got)) {
        if (got.error.kind === "NotFound") {
          return err({ kind: "Corrupt", worldId, detail: `missing blob ${entry.key}` });
        }
        return err(toSaveError(got.error));
      }
      loadedBlobs.push({ key: entry.key, bytes: got.value });
    }

    const decoded = decodeWorldSave({ metadata: metadata.value, blobs: loadedBlobs });
    if (isErr(decoded)) {
      return err({ kind: "Corrupt", worldId, detail: decoded.error.kind });
    }
    return ok(decoded.value);
  }

  async list(): Promise<Result<readonly WorldSummary[], SaveError>> {
    const keys = await this.meta.keys(META_PREFIX);
    if (isErr(keys)) return err(toSaveError(keys.error));

    const summaries: WorldSummary[] = [];
    for (const key of keys.value) {
      const raw = await this.meta.get(key);
      if (isErr(raw)) return err(toSaveError(raw.error));
      const metadata = parseMetadata(raw.value);
      if (isErr(metadata)) continue; // degrade: skip a corrupt entry, don't fail the list
      summaries.push(toSummary(metadata.value));
    }

    summaries.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return ok(summaries);
  }

  async delete(worldId: WorldId): Promise<Result<void, SaveError>> {
    const del = await this.meta.delete(metaKey(worldId));
    if (isErr(del)) {
      if (del.error.kind === "NotFound") return err({ kind: "NotFound", worldId });
      return err(toSaveError(del.error));
    }

    const keys = await this.blobs.keys(blobPrefix(worldId));
    if (isErr(keys)) return err(toSaveError(keys.error));
    for (const key of keys.value) {
      const delBlob = await this.blobs.delete(key);
      if (isErr(delBlob) && delBlob.error.kind !== "NotFound") {
        return err(toSaveError(delBlob.error));
      }
    }
    return ok(undefined);
  }

  private async pruneStaleBlobs(
    worldId: WorldId,
    keeping: readonly ChunkBlob[],
  ): Promise<Result<void, SaveError>> {
    const existing = await this.blobs.keys(blobPrefix(worldId));
    if (isErr(existing)) return err(toSaveError(existing.error));

    const desired = new Set(keeping.map((b) => blobKey(worldId, b.key)));
    for (const key of existing.value) {
      if (desired.has(key)) continue;
      const del = await this.blobs.delete(key);
      if (isErr(del) && del.error.kind !== "NotFound") {
        return err(toSaveError(del.error));
      }
    }
    return ok(undefined);
  }
}

function parseMetadata(raw: string): Result<WorldSaveMetadata, string> {
  try {
    return ok(JSON.parse(raw) as WorldSaveMetadata);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid JSON");
  }
}

function toSummary(m: WorldSaveMetadata): WorldSummary {
  return {
    worldId: m.worldId,
    seed: m.seed,
    name: m.name,
    createdAt: m.createdAt,
    modifiedAt: m.modifiedAt,
  };
}
