import { describe, expect, it } from "vitest";
import {
  HOTBAR_SIZE,
  initialHotbar,
  scrollHotbar,
  selectHotbarByDigit,
  selectHotbarSlot,
} from "./HotbarSelection";

describe("HotbarSelection", () => {
  it("starts on slot 0", () => {
    expect(initialHotbar().selected).toBe(0);
  });

  it("selectHotbarSlot picks a valid index", () => {
    expect(selectHotbarSlot(initialHotbar(), 4).selected).toBe(4);
  });

  it("selectHotbarSlot ignores an out-of-range index", () => {
    const s = initialHotbar();
    expect(selectHotbarSlot(s, HOTBAR_SIZE)).toBe(s);
    expect(selectHotbarSlot(s, -1)).toBe(s);
  });

  it("digit 1-9 maps to slot 0-8", () => {
    expect(selectHotbarByDigit(initialHotbar(), 1).selected).toBe(0);
    expect(selectHotbarByDigit(initialHotbar(), 9).selected).toBe(8);
    expect(selectHotbarByDigit(initialHotbar(), 5).selected).toBe(4);
  });

  it("digit 0 or >9 is ignored", () => {
    const s = initialHotbar();
    expect(selectHotbarByDigit(s, 0)).toBe(s);
    expect(selectHotbarByDigit(s, 10)).toBe(s);
  });

  it("wheel scroll forward steps to the next slot", () => {
    const s = selectHotbarSlot(initialHotbar(), 2);
    expect(scrollHotbar(s, 1).selected).toBe(3);
  });

  it("wheel scroll backward steps to the previous slot", () => {
    const s = selectHotbarSlot(initialHotbar(), 2);
    expect(scrollHotbar(s, -1).selected).toBe(1);
  });

  it("wheel scroll wraps forward past the last slot", () => {
    const s = selectHotbarSlot(initialHotbar(), HOTBAR_SIZE - 1);
    expect(scrollHotbar(s, 1).selected).toBe(0);
  });

  it("wheel scroll wraps backward past the first slot", () => {
    const s = initialHotbar();
    expect(scrollHotbar(s, -1).selected).toBe(HOTBAR_SIZE - 1);
  });

  it("zero delta is a no-op", () => {
    const s = selectHotbarSlot(initialHotbar(), 3);
    expect(scrollHotbar(s, 0)).toBe(s);
  });
});
