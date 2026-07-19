import { describe, expect, it } from "vitest";
import {
  cancelPick,
  initialGridState,
  moveCursor,
  select,
  splitCount,
} from "./InventoryGridState";

describe("InventoryGridState", () => {
  describe("moveCursor", () => {
    it("moves right/left/down/up within a grid", () => {
      const s0 = initialGridState(0);
      const right = moveCursor(s0, 1, 0, 27, 9);
      expect(right.cursor).toBe(1);
      const down = moveCursor(right, 0, 1, 27, 9);
      expect(down.cursor).toBe(10);
      const left = moveCursor(down, -1, 0, 27, 9);
      expect(left.cursor).toBe(9);
      const up = moveCursor(left, 0, -1, 27, 9);
      expect(up.cursor).toBe(0);
    });

    it("clamps at the grid edges instead of wrapping", () => {
      const s0 = initialGridState(0);
      expect(moveCursor(s0, -1, 0, 27, 9).cursor).toBe(0);
      expect(moveCursor(s0, 0, -1, 27, 9).cursor).toBe(0);
      const last = initialGridState(26);
      expect(moveCursor(last, 1, 0, 27, 9).cursor).toBe(26);
      expect(moveCursor(last, 0, 1, 27, 9).cursor).toBe(26);
    });

    it("refuses to land past capacity on a ragged last row", () => {
      // capacity 22, cols 9: row 0 = 0..8, row 1 = 9..17, row 2 = 18..21 (ragged).
      // From row 1 col 5 (index 14), moving down would target row 2 col 5 = 23,
      // which is past capacity — the cursor must stay put, not overshoot.
      const s = initialGridState(14);
      const down = moveCursor(s, 0, 1, 22, 9);
      expect(down.cursor).toBe(14);
    });
  });

  describe("select", () => {
    it("first select picks up the slot", () => {
      const s0 = initialGridState(0);
      const r = select(s0, 3);
      expect(r.kind).toBe("picked");
      expect(r.state.picked).toBe(3);
      expect(r.state.cursor).toBe(3);
    });

    it("selecting the same slot again cancels", () => {
      const picked = select(initialGridState(0), 3).state;
      const r = select(picked, 3);
      expect(r.kind).toBe("cancelled");
      expect(r.state.picked).toBeNull();
    });

    it("selecting a different slot resolves as a move and clears picked", () => {
      const picked = select(initialGridState(0), 3).state;
      const r = select(picked, 7);
      expect(r.kind).toBe("moved");
      if (r.kind !== "moved") return;
      expect(r.from).toBe(3);
      expect(r.to).toBe(7);
      expect(r.state.picked).toBeNull();
      expect(r.state.cursor).toBe(7);
    });
  });

  describe("cancelPick", () => {
    it("clears a pending pick without resolving a move", () => {
      const picked = select(initialGridState(0), 3).state;
      const cancelled = cancelPick(picked);
      expect(cancelled.picked).toBeNull();
    });
  });

  describe("splitCount", () => {
    it("halves rounding down", () => {
      expect(splitCount(10)).toBe(5);
      expect(splitCount(7)).toBe(3);
    });
    it("never goes below 1 even for a stack of 2", () => {
      expect(splitCount(2)).toBe(1);
    });
    it("floors a stack of 1 to 1 (caller must reject splitting a 1-stack)", () => {
      expect(splitCount(1)).toBe(1);
    });
  });
});
