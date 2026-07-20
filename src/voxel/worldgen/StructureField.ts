/**
 * World-seeded structure/POI engine adapter (plan E6.2, [F]) — the
 * composition entry the scene wires in, mirroring `TreasureField`'s
 * cell-crossing streaming shape. Unlike a treasure marker, a structure is
 * PERMANENT world content: stamping commits real `PlacedPiece`s into the
 * SAME `PlacedPieceRegistry`/`PlaceableStore` the player's own build tool
 * uses (`PlacementToolHandle.commitPieceAt`), so a structure's chest is an
 * ordinary placeable afterwards — E-interact, ChestTransfer, and host
 * authority all work completely unmodified (no bespoke structure-loot path).
 *
 * Idempotency: a `stamped` id set (persisted by the caller, same shape as
 * `TreasureDiscovery`'s claimed-id list) guards against re-stamping a
 * structure the player revisits in a later session — `commitPieceAt` is also
 * naturally idempotent per-piece (a second attempt at an already-occupied
 * cell is just Blocked/Overlap and skipped), but the id set avoids the
 * redundant resolve/commit walk on every return visit.
 *
 * Composition-gated: the scene only attaches this adapter for worlds stamped
 * `entities['worldgen.version'] >= 2` (see `NewWorldSave.ts` / the TerrainScene
 * wiring doc comment) — every save written before this slice landed has no
 * such entity key and stays byte-identical, no structures ever stream in.
 */

import {
  structureCellAnchor,
  structuresNear,
  structureTypeById,
  worldToStructureCell,
  type PlacedStructure,
  type StructureGround,
} from '../../game/domain/worldgen/Structure';
import { createChestInventory } from '../../game/domain/placeables/Chest';
import { isOk } from '../../game/domain/Result';
import type { ItemRegistry } from '../../game/domain/items/ItemRegistry';
import { VOXEL_SIZE_M } from '../../game/domain/voxel/VoxelGrid';
import type { PlaceableInteractionHandle } from '../placement/PlaceableInteractionTool';
import type { PlacementToolHandle } from '../placement/PlacementTool';

export const DEFAULT_STRUCTURE_RADIUS_CELLS = 2;

export interface StructureFieldDeps {
  readonly seed: number;
  readonly surface: StructureGround;
  readonly registry: ItemRegistry;
  readonly placement: PlacementToolHandle;
  readonly placeableInteraction: PlaceableInteractionHandle;
  getPlayerXZ(): readonly [number, number];
  /** Structure ids already stamped in a previous session — omitted = fresh world. */
  readonly stamped?: readonly string[];
  /** The scene persists the growing id set into the save (same pattern as
   *  TreasureField's `onDiscovered`). */
  onStamped(ids: readonly string[]): void;
  readonly radiusCells?: number;
}

export interface StructureField {
  update(): void;
  readonly stampedCount: number;
  /** POI markers for every structure stamped so far this world (E3 map seam) —
   *  a landmark stays on the map once found, not just while in streaming range. */
  liveMarkers(): readonly { readonly id: string; readonly x: number; readonly z: number }[];
}

const STRUCTURE_ID_RE = /^structure:-?\d+:(-?\d+):(-?\d+)$/;

function anchorFromId(id: string): readonly [number, number] | null {
  const m = STRUCTURE_ID_RE.exec(id);
  if (!m) return null;
  return structureCellAnchor(Number(m[1]), Number(m[2]));
}

export function attachStructureField(deps: StructureFieldDeps): StructureField {
  const radiusCells = deps.radiusCells ?? DEFAULT_STRUCTURE_RADIUS_CELLS;
  let stamped = new Set<string>(deps.stamped ?? []);
  let lastCx: number | null = null;
  let lastCz: number | null = null;

  function stampLoot(chestPieceId: number, structure: PlacedStructure): void {
    let inv = createChestInventory(deps.registry);
    for (const stack of structure.reward) {
      const added = inv.add(stack.itemId, stack.count);
      if (isOk(added)) inv = added.value;
    }
    deps.placeableInteraction.applyRemoteState(String(chestPieceId), {
      capacity: inv.capacity,
      slots: inv.slots,
    });
  }

  function stampStructure(structure: PlacedStructure): void {
    if (stamped.has(structure.id)) return;
    const type = structureTypeById(structure.typeId);
    if (!type) return;
    const baseY = deps.surface.heightAt(structure.anchor[0], structure.anchor[2]);

    type.pieces.forEach((pieceSpec, index) => {
      const worldPos: readonly [number, number, number] = [
        structure.anchor[0] + pieceSpec.cellOffset[0] * VOXEL_SIZE_M,
        baseY + pieceSpec.cellOffset[1] * VOXEL_SIZE_M,
        structure.anchor[2] + pieceSpec.cellOffset[2] * VOXEL_SIZE_M,
      ];
      const piece = deps.placement.commitPieceAt(pieceSpec.pieceId, worldPos, pieceSpec.quarterTurns);
      // Blocked (occupied/clipped) cell — skip just this piece, never the
      // whole structure (err-explicit-result-handling: one bad item doesn't
      // kill the batch).
      if (!piece) return;
      if (type.loot && type.loot.pieceIndex === index && pieceSpec.pieceId === 'chest') {
        stampLoot(piece.id, structure);
      }
    });

    stamped = new Set(stamped).add(structure.id);
    deps.onStamped([...stamped]);
  }

  return {
    update(): void {
      const [px, pz] = deps.getPlayerXZ();
      const cx = worldToStructureCell(px);
      const cz = worldToStructureCell(pz);
      if (cx === lastCx && cz === lastCz) return;
      lastCx = cx;
      lastCz = cz;
      for (const s of structuresNear(deps.seed, px, pz, deps.surface, radiusCells)) stampStructure(s);
    },
    get stampedCount(): number {
      return stamped.size;
    },
    liveMarkers(): readonly { readonly id: string; readonly x: number; readonly z: number }[] {
      const markers: { id: string; x: number; z: number }[] = [];
      for (const id of stamped) {
        const anchor = anchorFromId(id);
        if (anchor) markers.push({ id, x: anchor[0], z: anchor[1] });
      }
      return markers;
    },
  };
}
