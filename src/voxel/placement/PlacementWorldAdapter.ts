/**
 * The domain's PlacementWorld occupancy port over the live terrain (plan 8.5
 * [F]): isSolid samples the voxel SDF at the CELL CENTER (negative = solid,
 * the M8 convention), isOccupied delegates to the placed-piece registry.
 */

import type { Cell, GridSpec, PlacementWorld } from "../../game/domain/placement/Placement";
import type { PlacedPieceRegistry } from "./PlacedPieceRegistry";
import type { SdfFn } from "./SdfNormal";

export function solidFromSdf(sdf: SdfFn, grid: GridSpec): (cell: Cell) => boolean {
  return (cell) =>
    sdf(
      grid.origin[0] + (cell[0] + 0.5) * grid.cellSize,
      grid.origin[1] + (cell[1] + 0.5) * grid.cellSize,
      grid.origin[2] + (cell[2] + 0.5) * grid.cellSize,
    ) < 0;
}

export function makePlacementWorld(
  sdf: SdfFn,
  grid: GridSpec,
  registry: PlacedPieceRegistry,
): PlacementWorld {
  const isSolid = solidFromSdf(sdf, grid);
  return {
    isSolid,
    isOccupied: (cell) => registry.isOccupied(cell),
  };
}
