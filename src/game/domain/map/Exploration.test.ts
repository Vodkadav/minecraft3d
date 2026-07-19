import { describe, expect, it } from "vitest";
import {
  cellKey,
  discoveredCellList,
  emptyExploration,
  isCellDiscovered,
  isDiscoveredAt,
  mergeExploration,
  revealAround,
  worldToCell,
} from "./Exploration";

describe("Exploration", () => {
  it("starts with nothing discovered", () => {
    const state = emptyExploration(10);
    expect(state.discovered.size).toBe(0);
    expect(isDiscoveredAt(state, 0, 0)).toBe(false);
  });

  it("maps world coordinates to cells by floor division", () => {
    expect(worldToCell(0, 0, 10)).toEqual([0, 0]);
    expect(worldToCell(9.9, -0.1, 10)).toEqual([0, -1]);
    expect(worldToCell(-10, 25, 10)).toEqual([-1, 2]);
  });

  it("reveals the player's cell and a radius around it", () => {
    const state = emptyExploration(10);
    const next = revealAround(state, 0, 0, 1);
    // 3x3 footprint around cell (0,0)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(isCellDiscovered(next, dx, dz)).toBe(true);
      }
    }
    expect(isCellDiscovered(next, 2, 0)).toBe(false);
  });

  it("returns the same instance when nothing new is revealed (idempotent)", () => {
    const state = revealAround(emptyExploration(10), 0, 0, 1);
    const again = revealAround(state, 0, 0, 1);
    expect(again).toBe(state);
  });

  it("reveal is additive across multiple calls at different positions", () => {
    let state = emptyExploration(10);
    state = revealAround(state, 0, 0, 0);
    state = revealAround(state, 100, 100, 0);
    expect(isCellDiscovered(state, 0, 0)).toBe(true);
    expect(isCellDiscovered(state, 10, 10)).toBe(true);
    expect(isCellDiscovered(state, 5, 5)).toBe(false);
  });

  it("merges two exploration states (union of discovered cells)", () => {
    const a = revealAround(emptyExploration(10), 0, 0, 0);
    const b = revealAround(emptyExploration(10), 100, 0, 0);
    const merged = mergeExploration(a, b);
    expect(isCellDiscovered(merged, 0, 0)).toBe(true);
    expect(isCellDiscovered(merged, 10, 0)).toBe(true);
  });

  it("merge with an empty addend returns the original reference", () => {
    const a = revealAround(emptyExploration(10), 0, 0, 0);
    const merged = mergeExploration(a, emptyExploration(10));
    expect(merged).toBe(a);
  });

  it("rejects merging states with mismatched cell sizes", () => {
    const a = emptyExploration(10);
    const b = emptyExploration(20);
    expect(() => mergeExploration(a, b)).toThrow();
  });

  it("cellKey round-trips through discoveredCellList", () => {
    let state = emptyExploration(10);
    state = revealAround(state, 0, 0, 0);
    state = revealAround(state, -30, 40, 0);
    const list = discoveredCellList(state);
    expect(list).toContainEqual([0, 0]);
    expect(list).toContainEqual([-3, 4]);
    expect(list.map(([cx, cz]) => cellKey(cx, cz)).sort()).toEqual(
      Array.from(state.discovered).sort(),
    );
  });
});
