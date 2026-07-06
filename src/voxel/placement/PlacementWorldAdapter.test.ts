import { describe, expect, it } from "vitest";
import type { Cell, GridSpec } from "../../game/domain/placement/Placement";
import { PlacedPieceRegistry } from "./PlacedPieceRegistry";
import { makePlacementWorld, solidFromSdf } from "./PlacementWorldAdapter";
import type { SdfFn } from "./SdfNormal";

const GRID: GridSpec = { cellSize: 0.5, origin: [0, 0, 0] };
/** Solid below y=10 (sdf negative = solid, matching the voxel convention). */
const ground: SdfFn = (_x, y, _z) => y - 10;

describe("solidFromSdf", () => {
  it("samples the CELL CENTER: a cell whose center is under the surface is solid", () => {
    const isSolid = solidFromSdf(ground, GRID);
    // cell [0,19,0] center y = (19 + 0.5) * 0.5 = 9.75 < 10 → solid
    expect(isSolid([0, 19, 0])).toBe(true);
    // cell [0,20,0] center y = 10.25 → air
    expect(isSolid([0, 20, 0])).toBe(false);
  });

  it("honours the grid origin offset", () => {
    const shifted: GridSpec = { cellSize: 0.5, origin: [0, 1, 0] };
    const isSolid = solidFromSdf(ground, shifted);
    // center y = 1 + (17 + 0.5) * 0.5 = 9.75 → solid; one cell up = 10.25 → air
    expect(isSolid([0, 17, 0])).toBe(true);
    expect(isSolid([0, 18, 0])).toBe(false);
  });
});

describe("makePlacementWorld", () => {
  it("routes isSolid to the SDF and isOccupied to the registry", () => {
    const registry = new PlacedPieceRegistry();
    registry.add({
      pieceId: "block",
      center: [0.25, 10.25, 0.25],
      orientation: [0, 0, 0, 1],
      cells: [[0, 20, 0]],
    });
    const world = makePlacementWorld(ground, GRID, registry);
    const solidCell: Cell = [0, 19, 0];
    const placedCell: Cell = [0, 20, 0];
    const emptyCell: Cell = [0, 21, 0];
    expect(world.isSolid(solidCell)).toBe(true);
    expect(world.isOccupied(solidCell)).toBe(false);
    expect(world.isOccupied(placedCell)).toBe(true);
    expect(world.isSolid(placedCell)).toBe(false);
    expect(world.isSolid(emptyCell)).toBe(false);
    expect(world.isOccupied(emptyCell)).toBe(false);
  });
});
