/**
 * M5.4 terrain placement validity: spawns land on walkable ground — above
 * water, not on a cliff face. Pure, so the rules are exact.
 */
import { describe, expect, it } from "vitest";
import { MAX_SLOPE, SPECIES_VISUAL, validGround } from "./SpawnPlacement";
import { SPAWN_SPECIES } from "../game/domain/spawn/SpawnField";

const FLAT = { heightAt: () => 10, waterAt: () => -1000 };

describe("validGround", () => {
  it("accepts flat dry ground", () => {
    expect(validGround(FLAT, 0, 0)).toBe(true);
  });

  it("rejects ground at or below the water surface", () => {
    const flooded = { heightAt: () => 10, waterAt: () => 10.5 };
    expect(validGround(flooded, 0, 0)).toBe(false);
  });

  it("accepts a scene without water", () => {
    expect(validGround({ heightAt: () => 10 }, 0, 0)).toBe(true);
  });

  it("rejects steep slopes and accepts gentle ones", () => {
    const steep = { heightAt: (x: number) => x * (MAX_SLOPE * 2) };
    const gentle = { heightAt: (x: number) => x * (MAX_SLOPE / 2) };
    expect(validGround(steep, 0, 0)).toBe(false);
    expect(validGround(gentle, 0, 0)).toBe(true);
  });
});

describe("nearestWithin", () => {
  it("picks the closest candidate inside the range", async () => {
    const { nearestWithin } = await import("./SpawnPlacement");
    const items = [
      { id: "a", x: 5, z: 0 },
      { id: "b", x: 2, z: 0 },
      { id: "c", x: 0, z: 9 },
    ];
    expect(nearestWithin(items, 0, 0, 6)?.id).toBe("b");
  });

  it("returns null when nothing is in range", async () => {
    const { nearestWithin } = await import("./SpawnPlacement");
    expect(nearestWithin([{ id: "a", x: 50, z: 0 }], 0, 0, 6)).toBeNull();
  });
});

describe("species visuals", () => {
  it("covers every registered species", () => {
    for (const sp of SPAWN_SPECIES) {
      expect(SPECIES_VISUAL[sp.id], `visual for ${sp.id}`).toBeDefined();
    }
  });
});
