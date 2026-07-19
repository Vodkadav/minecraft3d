import { describe, expect, it } from "vitest";
import { cyclePieceIndex, PLACEABLE_PIECE_IDS, PLACEMENT_PIECES } from "./PlacementPieces";

describe("PLACEMENT_PIECES", () => {
  it("offers the three original starter pieces with their planned footprints", () => {
    const ids = PLACEMENT_PIECES.map((p) => p.id);
    expect(ids.slice(0, 3)).toEqual(["block", "platform", "pillar"]);
    expect(PLACEMENT_PIECES[0].footprint).toEqual({ w: 1, d: 1, h: 1 });
    expect(PLACEMENT_PIECES[1].footprint).toEqual({ w: 2, d: 2, h: 1 });
    expect(PLACEMENT_PIECES[2].footprint).toEqual({ w: 1, d: 1, h: 2 });
  });

  it("meets the >= 15 buildable-parts content gate (Workstream 8.5), all unique ids", () => {
    expect(PLACEMENT_PIECES.length).toBeGreaterThanOrEqual(15);
    const ids = PLACEMENT_PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every functional placeable (8.1) is present in the catalogue", () => {
    const ids = new Set(PLACEMENT_PIECES.map((p) => p.id));
    for (const id of PLACEABLE_PIECE_IDS) expect(ids.has(id)).toBe(true);
  });
});

describe("cyclePieceIndex", () => {
  it("wraps in both directions", () => {
    expect(cyclePieceIndex(0, 1, 3)).toBe(1);
    expect(cyclePieceIndex(2, 1, 3)).toBe(0);
    expect(cyclePieceIndex(0, -1, 3)).toBe(2);
  });
});
