/**
 * Pure operations over the modified-chunk delta list (research §7: only edits
 * from procedural generation are persisted). These reconcile edits by `rev` so
 * the host can merge concurrent chunk writes when multiplayer lands (M7).
 *
 * All functions are non-mutating: they return a new list, leaving inputs intact.
 */

import type { ChunkDelta, ChunkKey } from "./WorldSaveData";

/**
 * Insert `delta`, or replace the existing delta with the same key. On a key
 * collision the higher `rev` wins; ties go to the incoming delta (the writer's
 * latest intent). New keys are appended, preserving existing order.
 */
export function upsertChunkDelta(
  deltas: readonly ChunkDelta[],
  delta: ChunkDelta,
): readonly ChunkDelta[] {
  const index = deltas.findIndex((d) => d.key === delta.key);
  if (index === -1) return [...deltas, delta];
  if (delta.rev < deltas[index].rev) return deltas.slice();
  const next = deltas.slice();
  next[index] = delta;
  return next;
}

/** Remove the delta for `key`; a no-op (fresh copy) if the key is absent. */
export function removeChunkDelta(
  deltas: readonly ChunkDelta[],
  key: ChunkKey,
): readonly ChunkDelta[] {
  return deltas.filter((d) => d.key !== key);
}

/** The distinct set of chunk keys carrying a persisted edit. */
export function modifiedChunkKeys(
  deltas: readonly ChunkDelta[],
): ReadonlySet<ChunkKey> {
  return new Set(deltas.map((d) => d.key));
}

/** Fold `incoming` into `base` via {@link upsertChunkDelta} (highest rev wins). */
export function mergeChunkDeltas(
  base: readonly ChunkDelta[],
  incoming: readonly ChunkDelta[],
): readonly ChunkDelta[] {
  return incoming.reduce<readonly ChunkDelta[]>(upsertChunkDelta, base);
}
