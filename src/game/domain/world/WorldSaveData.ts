/**
 * The authoritative shape of a persisted world. Only *deltas* from procedural
 * generation are stored — unmodified chunks regenerate from `seed` on demand
 * (research §7). The save carries the modified-chunk blobs plus all structured
 * game state (entities, inventories, player).
 *
 * This is pure domain data: no I/O, no engine, no three.js. Persistence is a
 * port (application/ports/WorldSaveStore) implemented by infrastructure adapters.
 */

export type WorldId = string;

/** A chunk coordinate key, e.g. "12,-3,7" — engine owns the coordinate scheme. */
export type ChunkKey = string;

/**
 * A modified-chunk delta. `data` is the opaque serialized voxel/SDF edit blob
 * the engine (M8) produces; the save layer treats it as bytes. `rev` lets the
 * host reconcile concurrent edits when multiplayer lands (M7).
 */
export interface ChunkDelta {
  readonly key: ChunkKey;
  readonly rev: number;
  readonly data: Uint8Array;
}

/** Minimal player state the save must round-trip. Extended by later milestones. */
export interface PlayerState {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * Full persisted world. `entities` and `inventories` are kept as open records
 * keyed by id so M3 (inventory/items) and M6 (creatures) can populate them
 * without a breaking change to this shape.
 */
export interface WorldSaveData {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly createdAt: number;
  readonly modifiedAt: number;
  readonly modifiedChunks: readonly ChunkDelta[];
  readonly entities: Readonly<Record<string, unknown>>;
  readonly inventories: Readonly<Record<string, unknown>>;
  /** Per-owner progression blobs (Workstream 6) — same open-record shape as
   *  `inventories`, serialized by `ProgressionPersistence`. */
  readonly progression: Readonly<Record<string, unknown>>;
  readonly playerState: PlayerState;
  /** Per-owner character (stats/level/talents) blobs (Phase E1) — optional so
   *  every save literal written before this field existed (main.ts, older
   *  tests, `createNewWorldSave`) keeps compiling and loading unchanged;
   *  `CharacterPersistence` treats an absent record as "no character yet". */
  readonly character?: Readonly<Record<string, unknown>>;
  /** Per-owner discovered-map-cell blobs (Phase E3.1) — same optional
   *  open-record shape as `.character`, so every save literal written before
   *  this field existed keeps compiling and loading unchanged;
   *  `ExplorationPersistence` treats an absent record as "nothing explored
   *  yet" rather than corrupt data. */
  readonly exploration?: Readonly<Record<string, unknown>>;
  /** Worldgen feature-version stamp (Phase E6.1) — optional, absent on every
   *  save written before caves existed. `VoxelTerrain` only unions cave
   *  carving into a world's baseline SDF when this is present and at least
   *  `CAVES_WORLDGEN_VERSION`, so a pre-existing world's undug terrain keeps
   *  regenerating byte-identical to before; only worlds stamped at (or after)
   *  creation opt in. See `domain/voxel/CaveSeeding.ts`. */
  readonly worldgenVersion?: number;
}

/** Lightweight index entry for the world-list / lobby, without the chunk blobs. */
export interface WorldSummary {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly createdAt: number;
  readonly modifiedAt: number;
}

export function summarize(save: WorldSaveData): WorldSummary {
  return {
    worldId: save.worldId,
    seed: save.seed,
    name: save.name,
    createdAt: save.createdAt,
    modifiedAt: save.modifiedAt,
  };
}
