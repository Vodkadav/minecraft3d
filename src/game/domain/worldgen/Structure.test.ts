import { describe, expect, it } from "vitest";
import {
  STARTER_ITEMS,
} from "../items/starterItems";
import { PLACEMENT_PIECES } from "../../../voxel/placement/PlacementPieces";
import {
  STRUCTURE_CELL_M,
  STRUCTURE_TYPES,
  structureCellAnchor,
  structureInCell,
  structuresNear,
  structureTypeById,
  worldToStructureCell,
  type StructureGround,
} from "./Structure";

const FLAT: StructureGround = { heightAt: () => 100 };
const flatWithWater = (waterY: number): StructureGround => ({
  heightAt: () => 100,
  waterAt: () => waterY,
});
const slopedAt = (steepness: number): StructureGround => ({
  heightAt: (x) => x * steepness,
});

describe("structureInCell", () => {
  it("is fully deterministic for a seed and cell", () => {
    const a = structureInCell(42, 3, 7, FLAT);
    const b = structureInCell(42, 3, 7, FLAT);
    expect(a).toEqual(b);
  });

  it("anchors exactly at the cell center (no jitter)", () => {
    for (let cx = 0; cx < 100; cx++) {
      const s = structureInCell(1, cx, 0, FLAT);
      if (!s) continue;
      const [ax] = structureCellAnchor(cx, 0);
      expect(s.anchor[0]).toBe(ax);
      expect(s.anchor[1]).toBe(0); // y is the [F] adapter's job
    }
  });

  it("guarantees STRUCTURE_CELL_M minimum spacing between any two placements", () => {
    const found: { x: number; z: number }[] = [];
    for (let cx = 0; cx < 40; cx++) {
      for (let cz = 0; cz < 40; cz++) {
        const s = structureInCell(5, cx, cz, FLAT);
        if (s) found.push({ x: s.anchor[0], z: s.anchor[2] });
      }
    }
    expect(found.length).toBeGreaterThan(0);
    for (let i = 0; i < found.length; i++) {
      for (let j = i + 1; j < found.length; j++) {
        const dist = Math.hypot(found[i]!.x - found[j]!.x, found[i]!.z - found[j]!.z);
        expect(dist).toBeGreaterThanOrEqual(STRUCTURE_CELL_M);
      }
    }
  });

  it("only ever uses a registered structure type id", () => {
    const ids = new Set(STRUCTURE_TYPES.map((t) => t.id));
    for (let cx = 0; cx < 300; cx++) {
      const s = structureInCell(7, cx, cx, FLAT);
      if (s) expect(ids.has(s.typeId)).toBe(true);
    }
  });

  it("populates a sane minority of cells (not zero, not everything)", () => {
    let present = 0;
    const total = 80 * 80;
    for (let cx = 0; cx < 80; cx++) {
      for (let cz = 0; cz < 80; cz++) if (structureInCell(42, cx, cz, FLAT)) present++;
    }
    const fraction = present / total;
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(0.15);
  });

  it("lays structures out differently for different seeds", () => {
    let differences = 0;
    for (let cx = 0; cx < 150; cx++) {
      const a = structureInCell(1, cx, 0, FLAT)?.id ?? null;
      const b = structureInCell(2, cx, 0, FLAT)?.id ?? null;
      if ((a === null) !== (b === null)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("rejects placement on ground too close to water", () => {
    for (let cx = 0; cx < 200; cx++) {
      expect(structureInCell(3, cx, 0, flatWithWater(100))).toBeNull();
    }
  });

  it("rejects placement on a steep slope", () => {
    for (let cx = 0; cx < 200; cx++) {
      expect(structureInCell(3, cx, 0, slopedAt(5))).toBeNull();
    }
  });

  it("places freely on flat, dry ground", () => {
    let present = 0;
    for (let cx = 0; cx < 200; cx++) {
      if (structureInCell(3, cx, 0, flatWithWater(-1000))) present++;
    }
    expect(present).toBeGreaterThan(0);
  });

  it("only offers a structure type whose biome list matches the sampled ground", () => {
    // height 100 -> "lowland" per BiomeResources' proxy classifier
    for (let cx = 0; cx < 300; cx++) {
      const s = structureInCell(11, cx, cx, FLAT);
      if (!s) continue;
      const type = structureTypeById(s.typeId);
      expect(type).not.toBeNull();
      expect(type!.biomes).toContain("lowland");
    }
    // height 1200 -> "alpine"; only stone-ruin lists alpine
    const alpine: StructureGround = { heightAt: () => 1200 };
    for (let cx = 0; cx < 300; cx++) {
      const s = structureInCell(11, cx, cx, alpine);
      if (s) expect(s.typeId).toBe("stone-ruin");
    }
  });
});

describe("structuresNear", () => {
  it("maps world coordinates to the containing cell", () => {
    expect(worldToStructureCell(0)).toBe(0);
    expect(worldToStructureCell(STRUCTURE_CELL_M - 1)).toBe(0);
    expect(worldToStructureCell(STRUCTURE_CELL_M)).toBe(1);
    expect(worldToStructureCell(-1)).toBe(-1);
  });

  it("returns structures within the cell window around a point", () => {
    const near = structuresNear(42, 500, 500, FLAT, 2);
    const ccx = worldToStructureCell(500);
    const ccz = worldToStructureCell(500);
    for (const s of near) {
      const scx = worldToStructureCell(s.anchor[0]);
      const scz = worldToStructureCell(s.anchor[2]);
      expect(Math.abs(scx - ccx)).toBeLessThanOrEqual(2);
      expect(Math.abs(scz - ccz)).toBeLessThanOrEqual(2);
    }
  });

  it("agrees with structureInCell for the center cell", () => {
    const cx = worldToStructureCell(800);
    const cz = worldToStructureCell(800);
    const center = structureInCell(42, cx, cz, FLAT);
    const near = structuresNear(42, 800, 800, FLAT, 0);
    expect(near).toEqual(center ? [center] : []);
  });
});

describe("STRUCTURE_TYPES content", () => {
  const starterIds = new Set(STARTER_ITEMS.map((i) => i.id));
  const pieceIds = new Set(PLACEMENT_PIECES.map((p) => p.id));

  it("ships at least 3 kid-friendly structure types", () => {
    expect(STRUCTURE_TYPES.length).toBeGreaterThanOrEqual(3);
  });

  it("every piece id is a real PlacementPieces entry", () => {
    for (const type of STRUCTURE_TYPES) {
      for (const piece of type.pieces) expect(pieceIds.has(piece.pieceId)).toBe(true);
    }
  });

  it("every loot manifest item id is a real registered item", () => {
    for (const type of STRUCTURE_TYPES) {
      if (!type.loot) continue;
      for (const roll of type.loot.rolls) expect(starterIds.has(roll.itemId)).toBe(true);
    }
  });

  it("every loot manifest's pieceIndex points at an actual chest piece", () => {
    for (const type of STRUCTURE_TYPES) {
      if (!type.loot) continue;
      expect(type.pieces[type.loot.pieceIndex]?.pieceId).toBe("chest");
    }
  });

  it("every loot roll has min <= max and min >= 0", () => {
    for (const type of STRUCTURE_TYPES) {
      if (!type.loot) continue;
      for (const roll of type.loot.rolls) {
        expect(roll.min).toBeGreaterThanOrEqual(0);
        expect(roll.max).toBeGreaterThanOrEqual(roll.min);
      }
    }
  });

  it("every structure has at least one eligible biome", () => {
    for (const type of STRUCTURE_TYPES) expect(type.biomes.length).toBeGreaterThan(0);
  });
});
