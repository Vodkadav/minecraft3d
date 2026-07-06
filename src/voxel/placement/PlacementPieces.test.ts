import { describe, expect, it } from "vitest";
import { cyclePieceIndex, PLACEMENT_PIECES } from "./PlacementPieces";

describe("PLACEMENT_PIECES", () => {
  it("offers the three starter pieces with the planned footprints", () => {
    expect(PLACEMENT_PIECES.map((p) => p.id)).toEqual(["block", "platform", "pillar"]);
    expect(PLACEMENT_PIECES[0].footprint).toEqual({ w: 1, d: 1, h: 1 });
    expect(PLACEMENT_PIECES[1].footprint).toEqual({ w: 2, d: 2, h: 1 });
    expect(PLACEMENT_PIECES[2].footprint).toEqual({ w: 1, d: 1, h: 2 });
  });
});

describe("cyclePieceIndex", () => {
  it("wraps in both directions", () => {
    expect(cyclePieceIndex(0, 1, 3)).toBe(1);
    expect(cyclePieceIndex(2, 1, 3)).toBe(0);
    expect(cyclePieceIndex(0, -1, 3)).toBe(2);
  });
});
