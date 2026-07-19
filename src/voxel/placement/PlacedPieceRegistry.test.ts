import { describe, expect, it } from "vitest";
import type { PlacePieceCommand } from "../../game/domain/placement/Placement";
import { PlacedPieceRegistry } from "./PlacedPieceRegistry";

const CMD: PlacePieceCommand = {
  pieceId: "block",
  center: [0.25, 10.25, 0.25],
  orientation: [0, 0, 0, 1],
  cells: [[0, 20, 0]],
};

const CMD2: PlacePieceCommand = {
  pieceId: "platform",
  center: [1, 10.25, 1],
  orientation: [0, 0, 0, 1],
  cells: [
    [1, 20, 1],
    [2, 20, 1],
    [1, 20, 2],
    [2, 20, 2],
  ],
};

describe("PlacedPieceRegistry", () => {
  it("add registers every footprint cell as occupied", () => {
    const reg = new PlacedPieceRegistry();
    expect(reg.isOccupied([0, 20, 0])).toBe(false);
    reg.add(CMD);
    reg.add(CMD2);
    expect(reg.isOccupied([0, 20, 0])).toBe(true);
    expect(reg.isOccupied([2, 20, 2])).toBe(true);
    expect(reg.isOccupied([3, 20, 3])).toBe(false);
  });

  it("add returns distinct ids and all() lists the pieces", () => {
    const reg = new PlacedPieceRegistry();
    const a = reg.add(CMD);
    const b = reg.add(CMD2);
    expect(a.id).not.toBe(b.id);
    expect(reg.all().map((p) => p.pieceId)).toEqual(["block", "platform"]);
  });

  it("get looks up a piece by id; unknown id is null", () => {
    const reg = new PlacedPieceRegistry();
    const placed = reg.add(CMD);
    expect(reg.get(placed.id)).toEqual(placed);
    expect(reg.get(999)).toBeNull();
  });

  it("remove frees the piece's cells and forgets it; unknown id is a no-op", () => {
    const reg = new PlacedPieceRegistry();
    const placed = reg.add(CMD2);
    expect(reg.remove(placed.id)).not.toBeNull();
    expect(reg.isOccupied([1, 20, 1])).toBe(false);
    expect(reg.all()).toEqual([]);
    expect(reg.remove(999)).toBeNull();
  });

  it("serialize → deserialize round-trips pieces and occupancy", () => {
    const reg = new PlacedPieceRegistry();
    reg.add(CMD);
    reg.add(CMD2);
    const json = JSON.parse(JSON.stringify(reg.serialize())) as unknown;
    const restored = PlacedPieceRegistry.deserialize(json);
    expect(restored.all().map((p) => p.pieceId)).toEqual(["block", "platform"]);
    expect(restored.isOccupied([0, 20, 0])).toBe(true);
    expect(restored.isOccupied([2, 20, 2])).toBe(true);
    expect(restored.isOccupied([5, 5, 5])).toBe(false);
  });

  it("deserialize degrades gracefully on untrusted data — skips malformed entries", () => {
    expect(PlacedPieceRegistry.deserialize(undefined).all()).toEqual([]);
    expect(PlacedPieceRegistry.deserialize("garbage").all()).toEqual([]);
    expect(PlacedPieceRegistry.deserialize({ nope: 1 }).all()).toEqual([]);
    const mixed = [
      { pieceId: "block", center: [0, 0, 0], orientation: [0, 0, 0, 1], cells: [[0, 0, 0]] },
      { pieceId: 42, center: [0, 0, 0], orientation: [0, 0, 0, 1], cells: [[0, 0, 0]] },
      { pieceId: "bad-center", center: [0, 0], orientation: [0, 0, 0, 1], cells: [[0, 0, 0]] },
      { pieceId: "bad-cells", center: [0, 0, 0], orientation: [0, 0, 0, 1], cells: [[0, "x", 0]] },
      null,
    ];
    const reg = PlacedPieceRegistry.deserialize(mixed);
    expect(reg.all().map((p) => p.pieceId)).toEqual(["block"]);
  });

  it("ids issued after deserialize never collide with restored pieces", () => {
    const reg = new PlacedPieceRegistry();
    reg.add(CMD);
    reg.add(CMD2);
    const restored = PlacedPieceRegistry.deserialize(reg.serialize());
    const ids = new Set(restored.all().map((p) => p.id));
    const fresh = restored.add({ ...CMD, cells: [[9, 9, 9]] });
    expect(ids.has(fresh.id)).toBe(false);
  });
});
