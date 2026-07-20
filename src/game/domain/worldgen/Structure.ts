/**
 * Deterministic seeded structure/POI placement (plan E6.2). Mirrors
 * `HiddenTreasure`'s `hash(seed, cell, salt)` placement so every peer computes
 * the same structures from the world seed with nothing to sync — pure and
 * renderer-free. Unlike a treasure marker (a single point), a structure is a
 * small, data-defined set of `PlacementPieces` ids arranged around an anchor
 * plus an optional loot manifest; the [F] engine adapter (`StructureField`)
 * stamps the pieces into the SAME `PlacedPieceRegistry`/`PlaceableStore` the
 * player's own build tool uses, so a structure's chest is a completely normal
 * placeable afterwards (E-interact, ChestTransfer, host authority all work
 * unmodified).
 *
 * Placement sits on a coarse `STRUCTURE_CELL_M` grid, at most one candidate
 * per cell, anchored at the CELL CENTER (no in-cell jitter, unlike treasure) —
 * so `STRUCTURE_CELL_M` is also the guaranteed minimum spacing between any two
 * structures, not just a probabilistic one.
 *
 * Validity is biome + slope + water, all resolved through the pure
 * `StructureGround` port (heightAt/waterAt). This is a domain-local port
 * shape identical to `src/spawn/SpawnPlacement.ts`'s `SpawnGround`,
 * redeclared here since domain code may not import from an [F] engine-adjacent
 * module (arch-layered-ports) — the [F] `StructureField` adapter passes the
 * same heightfield it already threads through `TreasureField`.
 *
 * The `y` of a structure's anchor is left at 0 here, same convention as
 * `HiddenTreasure` — the [F] adapter resolves per-piece height against the
 * live surface when it stamps.
 */

import { hashUnitFloat } from "../rng/hash";
import { classifyBiome, type BiomeId } from "../world/BiomeResources";
import type { ItemStack } from "../inventory/Inventory";

export interface StructureGround {
  heightAt(x: number, z: number): number;
  /** Water surface y at (x,z); omit in worlds/tests without water. */
  waterAt?(x: number, z: number): number;
}

/** One build piece in a structure's layout. */
export interface StructurePieceSpec {
  /** A `PlacementPieces` id (walls, roofs, bench, lamp-post, bridge, chest, ...). */
  readonly pieceId: string;
  /** Offset from the structure anchor, in whole grid cells (the [F] adapter
   *  multiplies by its own voxel cell size — same convention the player's
   *  build-mode grid snapping uses). */
  readonly cellOffset: readonly [number, number, number];
  readonly quarterTurns: 0 | 1 | 2 | 3;
}

export interface LootRoll {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
}

export interface StructureLoot {
  /** Index into `pieces` of the chest that carries this loot. */
  readonly pieceIndex: number;
  readonly rolls: readonly LootRoll[];
}

export interface StructureType {
  readonly id: string;
  /** i18n key for the structure's display name (EN/ES/DA in `ui/i18n/strings.ts`). */
  readonly displayNameKey: string;
  readonly biomes: readonly BiomeId[];
  readonly pieces: readonly StructurePieceSpec[];
  readonly loot?: StructureLoot;
}

export interface PlacedStructure {
  readonly id: string;
  readonly typeId: string;
  /** World anchor; y is 0 until the [F] adapter resolves it against the surface. */
  readonly anchor: readonly [number, number, number];
  /** Rolled loot stacks, deterministic from the seed+cell; empty when the
   *  structure type has no loot manifest. */
  readonly reward: readonly ItemStack[];
}

/** Edge (meters) of a structure cell — at most one structure per cell, and
 *  since the anchor never jitters within the cell, also the exact minimum
 *  spacing between any two structures. */
export const STRUCTURE_CELL_M = 96;
/** Fraction of cells that hold a structure (sparser than treasure — a
 *  landmark, not a collectible). */
export const STRUCTURE_DENSITY = 0.1;

const EXISTS_SALT = 0xc501;
const TYPE_SALT = 0xc502;
const REWARD_SALT = 0xc503;

/** Gentler than SpawnPlacement's creature-spawn MAX_SLOPE (0.9) — a multi-
 *  piece footprint needs flatter ground than a single creature spawn point. */
const MAX_SLOPE = 0.6;
const DRY_MARGIN_M = 0.5;
const SLOPE_STEP_M = 3;

// ---------------------------------------------------------------- content

const CAMP_LOOT: StructureLoot = {
  pieceIndex: 1,
  rolls: [
    { itemId: "wood", min: 3, max: 8 },
    { itemId: "meat", min: 1, max: 3 },
    { itemId: "coin", min: 2, max: 6 },
  ],
};

const RUIN_LOOT: StructureLoot = {
  pieceIndex: 3,
  rolls: [
    { itemId: "stone-brick", min: 2, max: 5 },
    { itemId: "coin", min: 4, max: 10 },
    { itemId: "gem", min: 0, max: 1 },
  ],
};

export const STRUCTURE_TYPES: readonly StructureType[] = [
  {
    id: "abandoned-camp",
    displayNameKey: "worldgen.structure.abandonedCamp",
    biomes: ["lowland"],
    pieces: [
      { pieceId: "campfire", cellOffset: [0, 0, 0], quarterTurns: 0 },
      { pieceId: "chest", cellOffset: [2, 0, 0], quarterTurns: 0 },
      { pieceId: "fence", cellOffset: [0, 0, 2], quarterTurns: 0 },
      { pieceId: "fence", cellOffset: [1, 0, 2], quarterTurns: 0 },
    ],
    loot: CAMP_LOOT,
  },
  {
    id: "stone-ruin",
    displayNameKey: "worldgen.structure.stoneRuin",
    biomes: ["highland", "alpine"],
    pieces: [
      { pieceId: "wall", cellOffset: [0, 0, 0], quarterTurns: 0 },
      { pieceId: "wall", cellOffset: [2, 0, 0], quarterTurns: 0 },
      { pieceId: "wall", cellOffset: [0, 0, 2], quarterTurns: 1 },
      { pieceId: "chest", cellOffset: [1, 0, 1], quarterTurns: 0 },
    ],
    loot: RUIN_LOOT,
  },
  {
    id: "wayshelter",
    displayNameKey: "worldgen.structure.wayshelter",
    biomes: ["lowland", "highland"],
    pieces: [
      { pieceId: "bench", cellOffset: [0, 0, 0], quarterTurns: 0 },
      { pieceId: "lamp-post", cellOffset: [0, 0, 1], quarterTurns: 0 },
      { pieceId: "roof", cellOffset: [0, 2, 0], quarterTurns: 0 },
    ],
    // A rest-stop landmark, not a loot cache — no chest.
  },
  {
    id: "bridge-crossing",
    displayNameKey: "worldgen.structure.bridgeCrossing",
    biomes: ["lowland"],
    pieces: [
      { pieceId: "bridge", cellOffset: [0, 0, 0], quarterTurns: 0 },
      { pieceId: "lamp-post", cellOffset: [-1, 0, 0], quarterTurns: 0 },
      { pieceId: "lamp-post", cellOffset: [1, 0, 0], quarterTurns: 0 },
    ],
  },
];

function rollCount(rule: LootRoll, roll: number): number {
  const span = rule.max - rule.min + 1;
  return rule.min + Math.min(span - 1, Math.floor(roll * span));
}

function rewardFor(type: StructureType, seed: number, cx: number, cz: number): ItemStack[] {
  if (!type.loot) return [];
  const stacks: ItemStack[] = [];
  type.loot.rolls.forEach((rule, i) => {
    const count = rollCount(rule, hashUnitFloat(seed, cx, cz, REWARD_SALT + i));
    if (count > 0) stacks.push({ itemId: rule.itemId, count });
  });
  return stacks;
}

/** Slope + dry-ground check at a single point — same shape as
 *  `SpawnPlacement.validGround`, kept independent per the port note above. */
function validGround(ground: StructureGround, x: number, z: number): boolean {
  const h = ground.heightAt(x, z);
  const water = ground.waterAt?.(x, z) ?? -Infinity;
  if (h <= water + DRY_MARGIN_M) return false;
  const sx =
    (ground.heightAt(x + SLOPE_STEP_M, z) - ground.heightAt(x - SLOPE_STEP_M, z)) / (2 * SLOPE_STEP_M);
  const sz =
    (ground.heightAt(x, z + SLOPE_STEP_M) - ground.heightAt(x, z - SLOPE_STEP_M)) / (2 * SLOPE_STEP_M);
  return Math.hypot(sx, sz) <= MAX_SLOPE;
}

export function worldToStructureCell(coord: number): number {
  return Math.floor(coord / STRUCTURE_CELL_M);
}

/** The world anchor (x, z) of a structure cell — exact, no jitter. */
export function structureCellAnchor(cx: number, cz: number): readonly [number, number] {
  return [(cx + 0.5) * STRUCTURE_CELL_M, (cz + 0.5) * STRUCTURE_CELL_M];
}

/**
 * The structure in cell (cx, cz), or null when the cell holds none — either
 * the density roll missed, or no `StructureType` is eligible for the biome
 * sampled at the cell's ground, or the ground fails the slope/water check.
 */
export function structureInCell(
  seed: number,
  cx: number,
  cz: number,
  ground: StructureGround,
): PlacedStructure | null {
  if (hashUnitFloat(seed, cx, cz, EXISTS_SALT) >= STRUCTURE_DENSITY) return null;
  const [x, z] = structureCellAnchor(cx, cz);
  if (!validGround(ground, x, z)) return null;

  const biome: BiomeId = classifyBiome(ground.heightAt(x, z));
  const eligible = STRUCTURE_TYPES.filter((t) => t.biomes.includes(biome));
  if (eligible.length === 0) return null;

  const idx = Math.min(
    eligible.length - 1,
    Math.floor(hashUnitFloat(seed, cx, cz, TYPE_SALT) * eligible.length),
  );
  const type = eligible[idx] as StructureType;
  return {
    id: `structure:${seed}:${cx}:${cz}`,
    typeId: type.id,
    anchor: [x, 0, z],
    reward: rewardFor(type, seed, cx, cz),
  };
}

/** Every structure within `radiusCells` cells of world position (x, z). */
export function structuresNear(
  seed: number,
  x: number,
  z: number,
  ground: StructureGround,
  radiusCells = 3,
): PlacedStructure[] {
  const ccx = worldToStructureCell(x);
  const ccz = worldToStructureCell(z);
  const found: PlacedStructure[] = [];
  for (let dz = -radiusCells; dz <= radiusCells; dz++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      const s = structureInCell(seed, ccx + dx, ccz + dz, ground);
      if (s) found.push(s);
    }
  }
  return found;
}

/** Looks up a `StructureType` by id — the [F] adapter's stamping lookup. */
export function structureTypeById(typeId: string): StructureType | null {
  return STRUCTURE_TYPES.find((t) => t.id === typeId) ?? null;
}
