/**
 * Per-world store of placed *functional* placeables (Workstream 8.1 wiring,
 * S7b) — id -> {pieceId, state}. The id is the `PlacedPiece.id` from
 * `PlacedPieceRegistry` (stringified), so a functional placeable's domain
 * state travels alongside its geometry record without the two ever
 * disagreeing about identity. Pure Record over immutable updates, matching
 * every other domain/placeables module (Door/Chest/Campfire) — no classes,
 * no I/O. Persists as plain JSON (every state shape here already is one:
 * DoorState/CampfireState/PlotState/ChestState are POJOs) under the world
 * save's entities['placeables.state'], the same convention `PlacedPieceRegistry`
 * uses for entities['placement.pieces'].
 */

export interface PlaceableRecord {
  readonly pieceId: string;
  readonly state: unknown;
}

export type PlaceableStore = Readonly<Record<string, PlaceableRecord>>;

export function emptyPlaceableStore(): PlaceableStore {
  return {};
}

/** Adds a new placeable, or replaces one at the same id (a re-place). */
export function upsertPlaceable(
  store: PlaceableStore,
  id: string,
  pieceId: string,
  state: unknown,
): PlaceableStore {
  return { ...store, [id]: { pieceId, state } };
}

export function getPlaceable(store: PlaceableStore, id: string): PlaceableRecord | null {
  return store[id] ?? null;
}

/** Replaces just the state of an existing record; a no-op store (same
 *  reference) if the id doesn't exist — callers check via getPlaceable first
 *  when they need to distinguish "unknown id" from "no change". */
export function setPlaceableState(store: PlaceableStore, id: string, state: unknown): PlaceableStore {
  const existing = store[id];
  if (!existing) return store;
  return { ...store, [id]: { ...existing, state } };
}

export function removePlaceable(store: PlaceableStore, id: string): PlaceableStore {
  if (!(id in store)) return store;
  const next = { ...store };
  delete next[id];
  return next;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Untrusted save data in — a malformed store (or malformed entries) is
 *  dropped/skipped, never thrown on (matches PlacedPieceRegistry.deserialize). */
export function deserializePlaceableStore(data: unknown): PlaceableStore {
  if (!isRecord(data)) return {};
  const out: Record<string, PlaceableRecord> = {};
  for (const [id, entry] of Object.entries(data)) {
    if (!isRecord(entry) || typeof entry["pieceId"] !== "string" || !("state" in entry)) continue;
    out[id] = { pieceId: entry["pieceId"], state: entry["state"] };
  }
  return out;
}

export function serializePlaceableStore(store: PlaceableStore): unknown {
  return store;
}
