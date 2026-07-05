/**
 * OPFS-backed BlobStore — the real bulk-chunk store in the browser. Thin glue
 * over the tested core: every byte of save/load logic lives in
 * PersistentWorldSaveStore + WorldSaveSerialization; this only translates the
 * BlobStore port onto the Origin Private File System, so it carries no logic
 * that warrants a unit test (OPFS is browser-only, absent from the Node/Vitest
 * env — TDD carve-out for trivial I/O glue).
 *
 * Keys may contain `/` (the WorldSaveStore namespaces `{worldId}/{chunkKey}`),
 * which OPFS would read as directory nesting, so each key is percent-encoded
 * into a single flat filename.
 */

import { err, ok, type Result } from "../../domain/Result";
import type { BlobStore } from "../../application/ports/BlobStore";
import type { StorageError } from "../../application/ports/StorageError";

function encodeName(key: string): string {
  return encodeURIComponent(key);
}

function decodeName(name: string): string {
  return decodeURIComponent(name);
}

function mapError(e: unknown): StorageError {
  if (e instanceof DOMException) {
    if (e.name === "QuotaExceededError") return { kind: "QuotaExceeded" };
    return { kind: "Unavailable", detail: e.name };
  }
  return { kind: "Unavailable", detail: String(e) };
}

export class OpfsBlobStore implements BlobStore {
  private root(): Promise<FileSystemDirectoryHandle> {
    return navigator.storage.getDirectory();
  }

  async put(key: string, bytes: Uint8Array): Promise<Result<void, StorageError>> {
    try {
      const dir = await this.root();
      const handle = await dir.getFileHandle(encodeName(key), { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes as unknown as FileSystemWriteChunkType);
      await writable.close();
      return ok(undefined);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async get(key: string): Promise<Result<Uint8Array, StorageError>> {
    try {
      const dir = await this.root();
      const handle = await dir.getFileHandle(encodeName(key));
      const file = await handle.getFile();
      return ok(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        return err({ kind: "NotFound", key });
      }
      return err(mapError(e));
    }
  }

  async delete(key: string): Promise<Result<void, StorageError>> {
    try {
      const dir = await this.root();
      await dir.removeEntry(encodeName(key));
      return ok(undefined);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        return err({ kind: "NotFound", key });
      }
      return err(mapError(e));
    }
  }

  async keys(prefix: string): Promise<Result<readonly string[], StorageError>> {
    try {
      const dir = await this.root();
      const found: string[] = [];
      const entries = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
      for await (const [name] of entries) {
        const key = decodeName(name);
        if (key.startsWith(prefix)) found.push(key);
      }
      return ok(found);
    } catch (e) {
      return err(mapError(e));
    }
  }
}
