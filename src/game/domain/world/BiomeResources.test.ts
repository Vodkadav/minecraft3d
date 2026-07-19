import { describe, expect, it } from "vitest";
import { BIOME_RESOURCES, classifyBiome, resourcesAtHeight, resourcesFor } from "./BiomeResources";

describe("classifyBiome", () => {
  it("classifies low elevation as lowland", () => {
    expect(classifyBiome(0)).toBe("lowland");
    expect(classifyBiome(249)).toBe("lowland");
  });

  it("classifies mid elevation as highland", () => {
    expect(classifyBiome(250)).toBe("highland");
    expect(classifyBiome(899)).toBe("highland");
  });

  it("classifies high elevation as alpine", () => {
    expect(classifyBiome(900)).toBe("alpine");
    expect(classifyBiome(5000)).toBe("alpine");
  });
});

describe("resourcesFor / resourcesAtHeight", () => {
  it("has exactly 3 biomes, each with distinct resources", () => {
    const ids = Object.keys(BIOME_RESOURCES);
    expect(ids.sort()).toEqual(["alpine", "highland", "lowland"]);
    const [a, b, c] = ids.map((id) => resourcesFor(id as "alpine" | "highland" | "lowland"));
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it("resourcesAtHeight composes classifyBiome + resourcesFor", () => {
    expect(resourcesAtHeight(10)).toEqual(resourcesFor("lowland"));
    expect(resourcesAtHeight(500)).toEqual(resourcesFor("highland"));
    expect(resourcesAtHeight(2000)).toEqual(resourcesFor("alpine"));
  });

  it("every biome table is non-empty across all three categories", () => {
    for (const table of Object.values(BIOME_RESOURCES)) {
      expect(table.gatherables.length).toBeGreaterThan(0);
      expect(table.nodes.length).toBeGreaterThan(0);
      expect(table.creatures.length).toBeGreaterThan(0);
    }
  });
});
