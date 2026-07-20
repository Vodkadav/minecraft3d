/**
 * Proximity-gated spawn streaming (plan 5.3 [O]). Pure step function the [F]
 * adapter drives: given the deterministic field (SpawnField), the players'
 * XZ positions, and the currently-active set, decide what enters and leaves.
 *
 * The verified pattern (research §4, Minecraft model): a no-spawn ring around
 * every player (MIN_SPAWN_DIST_M), spawning only inside ACTIVE_RANGE_M of the
 * NEAREST player, and instant despawn beyond DESPAWN_RANGE_M — deliberately
 * wider than the spawn range so an entity at the boundary doesn't flicker
 * (hysteresis). Distances are entity-to-player, not cell-to-player, so the
 * ring is exact at its edges.
 */

import {
  spawnsNear,
  worldToSpawnCell,
  SPAWN_CELL_M,
  type SpawnEntity,
  type SpawnNearGate,
} from "./SpawnField";

/** No-spawn radius around every player — nothing pops in in plain sight. */
export const MIN_SPAWN_DIST_M = 24;
/** Spawning happens only within this range of the nearest player. */
export const ACTIVE_RANGE_M = 128;
/** Active entities survive out to here before despawning (hysteresis). */
export const DESPAWN_RANGE_M = 160;

/**
 * E6.3: a global ceiling on the active set, per kind — the density/spawn-rate
 * settings (up to 3x, E6.6) can otherwise push the active count arbitrarily
 * high. Generous enough that default settings (density 0.5, rates 1) never
 * come close — this is a budget backstop, not a nerf.
 */
export interface SpawnCaps {
  readonly maxCreatures: number;
  readonly maxNodes: number;
}

export const DEFAULT_SPAWN_CAPS: SpawnCaps = { maxCreatures: 64, maxNodes: 96 };

export interface SpawnStepContext {
  readonly seed: number;
  readonly epoch: number;
  /** The M4 animal-density slider, 0..1 — one multiplier on the cell budget. */
  readonly density: number;
  /** XZ of every player (host + peers); the nearest one gates each entity. */
  readonly players: readonly (readonly [number, number])[];
  /** Ids currently materialized in the scene. */
  readonly active: ReadonlySet<string>;
  /** Harvested/killed ids for this epoch — never (re-)spawned. */
  readonly removed: ReadonlySet<string>;
  /** E6.3 biome/time-of-day/spawn-rate gate. Omit for pre-E6.3 behaviour. */
  readonly gate?: SpawnNearGate;
  /** E6.3 global per-kind cap. Omit for no cap (pre-E6.3 behaviour). */
  readonly caps?: SpawnCaps;
}

export interface SpawnStep {
  readonly enter: readonly SpawnEntity[];
  readonly leave: readonly string[];
}

function nearestDistSq(x: number, z: number, players: SpawnStepContext["players"]): number {
  let best = Infinity;
  for (const [px, pz] of players) {
    const dx = x - px;
    const dz = z - pz;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return best;
}

/** One streaming step: what to materialize (enter) and remove (leave). */
export function stepSpawns(ctx: SpawnStepContext): SpawnStep {
  const minSq = MIN_SPAWN_DIST_M * MIN_SPAWN_DIST_M;
  const activeSq = ACTIVE_RANGE_M * ACTIVE_RANGE_M;
  const despawnSq = DESPAWN_RANGE_M * DESPAWN_RANGE_M;
  const radiusCells = Math.ceil(DESPAWN_RANGE_M / SPAWN_CELL_M) + 1;

  // candidate field: the union of cell windows around every player. De-dupe
  // by id so overlapping windows don't double-enter an entity.
  const candidates = new Map<string, SpawnEntity>();
  for (const [px, pz] of ctx.players) {
    for (const s of spawnsNear(ctx.seed, ctx.epoch, px, pz, radiusCells, ctx.density, ctx.gate)) {
      candidates.set(s.id, s);
    }
  }

  const keep = new Set<string>();
  const enterCandidates: SpawnEntity[] = [];
  for (const s of candidates.values()) {
    if (ctx.removed.has(s.id)) continue;
    const d = nearestDistSq(s.position[0], s.position[2], ctx.players);
    if (ctx.active.has(s.id)) {
      if (d <= despawnSq) keep.add(s.id);
    } else if (d >= minSq && d <= activeSq) {
      enterCandidates.push(s);
    }
  }

  // E6.3 global cap: trim new entries once a kind's budget (already-kept +
  // newly-entering) is spent. Already-active entities are never evicted by
  // the cap — only new materialization is throttled — so a cap change (or a
  // density spike) can't yank creatures out from under the player.
  let enter: SpawnEntity[];
  if (ctx.caps) {
    let creatureCount = 0;
    let nodeCount = 0;
    for (const id of keep) {
      if (candidates.get(id)?.kind === "creature") creatureCount++;
      else nodeCount++;
    }
    enter = [];
    for (const s of enterCandidates) {
      if (s.kind === "creature") {
        if (creatureCount >= ctx.caps.maxCreatures) continue;
        creatureCount++;
      } else {
        if (nodeCount >= ctx.caps.maxNodes) continue;
        nodeCount++;
      }
      enter.push(s);
    }
  } else {
    enter = enterCandidates;
  }

  const leave: string[] = [];
  for (const id of ctx.active) if (!keep.has(id)) leave.push(id);
  return { enter, leave };
}

export { worldToSpawnCell };
