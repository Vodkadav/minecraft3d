/**
 * Discovered-area model (E3.1) — pure domain, no I/O. The world is divided
 * into a coarse grid of square cells; a cell is "discovered" once the player
 * has been within `radiusCells` of it. Fog-of-war (E3.2/E3.3) is simply
 * "undiscovered" — the map/minimap render layer decides how to draw that,
 * this module only tracks which cells are known.
 *
 * A per-player `ExplorationState` rides `WorldSaveData.exploration` (new
 * optional record, same non-breaking-extension pattern `CharacterPersistence`
 * and `ProgressionPersistence` already use for `.character`/`.progression`).
 */

export const DEFAULT_EXPLORATION_CELL_METERS = 12;

export interface ExplorationState {
  readonly cellMeters: number;
  readonly discovered: ReadonlySet<string>;
}

export function emptyExploration(
  cellMeters: number = DEFAULT_EXPLORATION_CELL_METERS,
): ExplorationState {
  return { cellMeters, discovered: new Set() };
}

export function worldToCell(x: number, z: number, cellMeters: number): readonly [number, number] {
  return [Math.floor(x / cellMeters), Math.floor(z / cellMeters)];
}

export function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function isCellDiscovered(state: ExplorationState, cx: number, cz: number): boolean {
  return state.discovered.has(cellKey(cx, cz));
}

export function isDiscoveredAt(state: ExplorationState, x: number, z: number): boolean {
  const [cx, cz] = worldToCell(x, z, state.cellMeters);
  return isCellDiscovered(state, cx, cz);
}

/**
 * Reveals every cell within `radiusCells` (Chebyshev distance, a square
 * footprint — cheap and plenty for a coarse discovery grid) of the world
 * point. Returns the SAME state instance when nothing new was revealed, so
 * callers can cheaply skip a re-render/re-save on a reference-equality check.
 */
export function revealAround(
  state: ExplorationState,
  x: number,
  z: number,
  radiusCells = 2,
): ExplorationState {
  const [pcx, pcz] = worldToCell(x, z, state.cellMeters);
  let changed = false;
  const next = new Set(state.discovered);
  for (let dz = -radiusCells; dz <= radiusCells; dz++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      const key = cellKey(pcx + dx, pcz + dz);
      if (!next.has(key)) {
        next.add(key);
        changed = true;
      }
    }
  }
  return changed ? { cellMeters: state.cellMeters, discovered: next } : state;
}

/** Unions two discovered-cell sets (same cell size) — used to merge a loaded
 *  save with in-session reveals, or (later) multiple players' exploration. */
export function mergeExploration(a: ExplorationState, b: ExplorationState): ExplorationState {
  if (a.cellMeters !== b.cellMeters) {
    throw new Error(
      `cannot merge exploration states with different cell sizes: ${a.cellMeters} vs ${b.cellMeters}`,
    );
  }
  if (b.discovered.size === 0) return a;
  const next = new Set(a.discovered);
  for (const key of b.discovered) next.add(key);
  return { cellMeters: a.cellMeters, discovered: next };
}

export function discoveredCellList(
  state: ExplorationState,
): readonly (readonly [number, number])[] {
  return Array.from(state.discovered, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return [cx, cz] as const;
  });
}
