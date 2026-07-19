import { describe, expect, it } from "vitest";
import type { Slot } from "../inventory/Inventory";
import { dropOnDeath, setSpawnPoint } from "./Respawn";

const FULL: readonly Slot[] = [
  { itemId: "wood", count: 5 },
  { itemId: "stone", count: 2 },
  null,
  { itemId: "pickaxe", count: 1 },
];

describe("setSpawnPoint", () => {
  it("returns the point given, regardless of the current value", () => {
    const p = { x: 1, y: 2, z: 3 };
    expect(setSpawnPoint(null, p)).toEqual(p);
    expect(setSpawnPoint(p, { x: 9, y: 9, z: 9 })).toEqual({ x: 9, y: 9, z: 9 });
  });
});

describe("dropOnDeath", () => {
  it("keep-inventory returns the same array reference untouched", () => {
    expect(dropOnDeath(FULL, 2, "keep-inventory")).toBe(FULL);
  });

  it("drop-hotbar clears only the first hotbarSize slots", () => {
    const r = dropOnDeath(FULL, 2, "drop-hotbar");
    expect(r).toEqual([null, null, null, { itemId: "pickaxe", count: 1 }]);
  });

  it("drop-all clears every slot", () => {
    const r = dropOnDeath(FULL, 2, "drop-all");
    expect(r).toEqual([null, null, null, null]);
  });

  it("drop-hotbar with a hotbarSize covering the whole inventory drops everything", () => {
    const r = dropOnDeath(FULL, FULL.length, "drop-hotbar");
    expect(r.every((s) => s === null)).toBe(true);
  });
});
