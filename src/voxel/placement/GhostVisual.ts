/**
 * Pure visual mappings for the placement ghost + committed pieces (plan 8.5
 * [F]): validity → tint, footprint → BoxGeometry extents, occupied cells →
 * world-space AABB. Kept three-free so they unit-test in the node runner.
 */

import type {
  Cell,
  Footprint,
  GridSpec,
  PlacementValidity,
} from "../../game/domain/placement/Placement";
import type { Vec3 } from "../../game/domain/placement/vec";

export const GHOST_VALID_HEX = 0x2ecc71;
export const GHOST_BLOCKED_HEX = 0xe74c3c;

export function ghostColorHex(validity: PlacementValidity): number {
  return validity.kind === "Valid" ? GHOST_VALID_HEX : GHOST_BLOCKED_HEX;
}

/**
 * BoxGeometry extents for the UNrotated footprint (x=w, y=h, z=d) — the ghost
 * mesh applies PlacementState.orientation, which supplies the yaw.
 */
export function footprintBoxSize(
  fp: Footprint,
  cellSize: number,
): readonly [number, number, number] {
  return [fp.w * cellSize, fp.h * cellSize, fp.d * cellSize];
}

/**
 * World-space bounds of a committed piece's cells — the solid mesh is this
 * axis-aligned box (yaw is already baked into the cell set at 90° steps).
 */
export function cellsBox(
  cells: readonly Cell[],
  grid: GridSpec,
): { center: Vec3; size: Vec3 } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of cells) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
    maxZ = Math.max(maxZ, z + 1);
  }
  const cs = grid.cellSize;
  return {
    center: [
      grid.origin[0] + ((minX + maxX) / 2) * cs,
      grid.origin[1] + ((minY + maxY) / 2) * cs,
      grid.origin[2] + ((minZ + maxZ) / 2) * cs,
    ],
    size: [(maxX - minX) * cs, (maxY - minY) * cs, (maxZ - minZ) * cs],
  };
}
