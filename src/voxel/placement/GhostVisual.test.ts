import { describe, expect, it } from "vitest";
import type { GridSpec } from "../../game/domain/placement/Placement";
import {
  cellsBox,
  footprintBoxSize,
  GHOST_BLOCKED_HEX,
  ghostColorHex,
  GHOST_VALID_HEX,
} from "./GhostVisual";

describe("ghostColorHex", () => {
  it("Valid → green, Blocked → red", () => {
    expect(ghostColorHex({ kind: "Valid" })).toBe(GHOST_VALID_HEX);
    expect(ghostColorHex({ kind: "Blocked", reasons: ["Overlap"] })).toBe(GHOST_BLOCKED_HEX);
  });
});

describe("footprintBoxSize", () => {
  it("maps footprint {w,h,d} to BoxGeometry (x=w, y=h, z=d) × cellSize", () => {
    expect(footprintBoxSize({ w: 1, d: 1, h: 1 }, 0.5)).toEqual([0.5, 0.5, 0.5]);
    expect(footprintBoxSize({ w: 2, d: 2, h: 1 }, 0.5)).toEqual([1, 0.5, 1]);
    expect(footprintBoxSize({ w: 1, d: 1, h: 2 }, 0.5)).toEqual([0.5, 1, 0.5]);
  });
});

describe("cellsBox", () => {
  const GRID: GridSpec = { cellSize: 0.5, origin: [0, 0, 0] };

  it("a single cell boxes to its center with cell-sized extents", () => {
    const { center, size } = cellsBox([[0, 20, 0]], GRID);
    expect(center).toEqual([0.25, 10.25, 0.25]);
    expect(size).toEqual([0.5, 0.5, 0.5]);
  });

  it("a multi-cell footprint boxes to the bounds of all cells", () => {
    const { center, size } = cellsBox(
      [
        [1, 20, 1],
        [2, 20, 1],
        [1, 20, 2],
        [2, 20, 2],
      ],
      GRID,
    );
    expect(size).toEqual([1, 0.5, 1]);
    expect(center).toEqual([1, 10.25, 1]);
  });

  it("honours the grid origin", () => {
    const shifted: GridSpec = { cellSize: 1, origin: [10, 0, 0] };
    const { center, size } = cellsBox([[0, 0, 0]], shifted);
    expect(center).toEqual([10.5, 0.5, 0.5]);
    expect(size).toEqual([1, 1, 1]);
  });
});
