/**
 * M5.2 deterministic seeded spawning: same seed ⇒ identical spawns on every
 * peer with nothing to sync; density is ONE multiplier on the per-cell
 * budget; positions land inside their cell.
 */
import { describe, expect, it } from "vitest";
import {
  SPAWN_CELL_M,
  SPAWN_SPECIES,
  spawnsInCell,
  spawnsNear,
  worldToSpawnCell,
} from "./SpawnField";

describe("spawnsInCell determinism", () => {
  it("returns identical entities for the same (seed, epoch, cell, density)", () => {
    const a = spawnsInCell(42, 0, 3, -7, 1);
    const b = spawnsInCell(42, 0, 3, -7, 1);
    expect(a).toEqual(b);
  });

  it("differs across seeds and epochs", () => {
    const bySeed = [1, 2, 3, 4, 5].map((s) => spawnsInCell(s, 0, 0, 0, 1).length);
    const byEpoch = [0, 1, 2, 3, 4].map((e) => spawnsInCell(1, e, 0, 0, 1).length);
    expect(new Set(bySeed).size + new Set(byEpoch).size).toBeGreaterThan(2);
  });

  it("gives every entity a stable unique id and a species from the registry", () => {
    const all = spawnsNear(42, 0, 0, 0, 4, 1);
    const ids = new Set(all.map((s) => s.id));
    expect(ids.size).toBe(all.length);
    const speciesIds = new Set(SPAWN_SPECIES.map((sp) => sp.id));
    for (const s of all) expect(speciesIds.has(s.species)).toBe(true);
  });

  it("places each entity inside its own cell", () => {
    for (const s of spawnsInCell(42, 0, 3, -7, 1)) {
      expect(worldToSpawnCell(s.position[0])).toBe(3);
      expect(worldToSpawnCell(s.position[2])).toBe(-7);
    }
  });
});

describe("density multiplier", () => {
  function countOver(cells: number, density: number): number {
    let n = 0;
    for (let c = 0; c < cells; c++) n += spawnsInCell(42, 0, c, 0, density).length;
    return n;
  }

  it("zero density spawns nothing", () => {
    expect(countOver(50, 0)).toBe(0);
  });

  it("full density spawns strictly more than half density", () => {
    const half = countOver(200, 0.5);
    const full = countOver(200, 1);
    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(0);
  });
});

describe("node yields", () => {
  it("covers every node species in the registry", async () => {
    const { NODE_YIELD } = await import("./SpawnField");
    for (const sp of SPAWN_SPECIES.filter((s) => s.kind === "node")) {
      expect(NODE_YIELD[sp.id], `yield for ${sp.id}`).toBeDefined();
    }
  });
});

describe("cell math", () => {
  it("worldToSpawnCell floors by the cell edge", () => {
    expect(worldToSpawnCell(0)).toBe(0);
    expect(worldToSpawnCell(SPAWN_CELL_M - 0.001)).toBe(0);
    expect(worldToSpawnCell(SPAWN_CELL_M)).toBe(1);
    expect(worldToSpawnCell(-0.001)).toBe(-1);
  });
});

// E6.3: biome/time-of-day gate + E6.6 spawn-rate multipliers. All of these
// exercise the sixth (optional) `gate` param — an omitted gate must keep the
// exact pre-E6.3 output, asserted by every test above that never passes one.
describe("SpawnCellGate — biome affinity", () => {
  it("omitting the gate never filters a creature roll (back-compat default)", () => {
    const cells = 40;
    let withoutGate = 0;
    let withUndefinedBiome = 0;
    for (let c = 0; c < cells; c++) {
      withoutGate += spawnsInCell(42, 0, c, 0, 1).filter((s) => s.kind === "creature").length;
      withUndefinedBiome += spawnsInCell(42, 0, c, 0, 1, {}).filter(
        (s) => s.kind === "creature",
      ).length;
    }
    expect(withUndefinedBiome).toBe(withoutGate);
  });

  it("a lowland-only creature (deer) never rolls when the cell's biome is highland", () => {
    let deerHighland = 0;
    let deerLowland = 0;
    for (let c = 0; c < 200; c++) {
      deerHighland += spawnsInCell(42, 0, c, 0, 1, { biome: "highland" }).filter(
        (s) => s.species === "deer",
      ).length;
      deerLowland += spawnsInCell(42, 0, c, 0, 1, { biome: "lowland" }).filter(
        (s) => s.species === "deer",
      ).length;
    }
    expect(deerHighland).toBe(0);
    expect(deerLowland).toBeGreaterThan(0);
  });

  it("node-kind species are never biome-gated", () => {
    let nodesUngated = 0;
    let nodesGated = 0;
    for (let c = 0; c < 60; c++) {
      nodesUngated += spawnsInCell(42, 0, c, 0, 1).filter((s) => s.kind === "node").length;
      nodesGated += spawnsInCell(42, 0, c, 0, 1, { biome: "alpine" }).filter(
        (s) => s.kind === "node",
      ).length;
    }
    expect(nodesGated).toBe(nodesUngated);
  });
});

describe("SpawnCellGate — time-of-day activity window", () => {
  it("the nocturnal owl never rolls with isNight: false, and does roll with isNight: true", () => {
    let owlDay = 0;
    let owlNight = 0;
    for (let c = 0; c < 200; c++) {
      owlDay += spawnsInCell(42, 0, c, 0, 1, { isNight: false }).filter(
        (s) => s.species === "owl",
      ).length;
      owlNight += spawnsInCell(42, 0, c, 0, 1, { isNight: true }).filter(
        (s) => s.species === "owl",
      ).length;
    }
    expect(owlDay).toBe(0);
    expect(owlNight).toBeGreaterThan(0);
  });

  it("an always-active species (deer) rolls identically regardless of isNight", () => {
    let deerDay = 0;
    let deerNight = 0;
    for (let c = 0; c < 200; c++) {
      deerDay += spawnsInCell(42, 0, c, 0, 1, { isNight: false }).filter(
        (s) => s.species === "deer",
      ).length;
      deerNight += spawnsInCell(42, 0, c, 0, 1, { isNight: true }).filter(
        (s) => s.species === "deer",
      ).length;
    }
    expect(deerDay).toBe(deerNight);
  });
});

describe("SpawnCellGate — creature/resource rate multipliers", () => {
  it("creatureRate scales only creature-kind rolls, nodeRate only node-kind", () => {
    function countByKind(gate: Parameters<typeof spawnsInCell>[5]): {
      creature: number;
      node: number;
    } {
      let creature = 0;
      let node = 0;
      for (let c = 0; c < 150; c++) {
        for (const s of spawnsInCell(42, 0, c, 0, 0.4, gate)) {
          if (s.kind === "creature") creature++;
          else node++;
        }
      }
      return { creature, node };
    }
    const base = countByKind(undefined);
    const creatureBoost = countByKind({ creatureRate: 3 });
    const nodeBoost = countByKind({ nodeRate: 3 });
    expect(creatureBoost.creature).toBeGreaterThan(base.creature);
    expect(creatureBoost.node).toBe(base.node);
    expect(nodeBoost.node).toBeGreaterThan(base.node);
    expect(nodeBoost.creature).toBe(base.creature);
  });
});

describe("spawnsNear — SpawnNearGate", () => {
  it("resolves biome per-cell via biomeAt and filters accordingly", () => {
    const all = spawnsNear(42, 0, 0, 0, 4, 1, { biomeAt: () => "alpine" });
    // elk/wolf are the only alpine-affine creatures; no lowland-only species
    // (deer, fox, rabbit, sheep, owl, squirrel) should appear.
    const forbidden = new Set(["deer", "fox", "rabbit", "sheep", "owl", "squirrel"]);
    for (const s of all) expect(forbidden.has(s.species)).toBe(false);
  });

  it("propagates isNight and rate multipliers down to every cell", () => {
    const owls = spawnsNear(42, 0, 0, 0, 4, 1, { isNight: true }).filter(
      (s) => s.species === "owl",
    );
    const owlsDay = spawnsNear(42, 0, 0, 0, 4, 1, { isNight: false }).filter(
      (s) => s.species === "owl",
    );
    expect(owlsDay.length).toBe(0);
    expect(owls.length).toBeGreaterThan(0);
  });
});
