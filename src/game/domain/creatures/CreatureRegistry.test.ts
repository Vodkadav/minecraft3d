import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { CreatureDefinition } from "./CreatureDefinition";
import { CREATURE_REGISTRY, CreatureRegistry } from "./CreatureRegistry";
import { CREATURE_STATS } from "../combat/Combat";
import { TEMPERAMENT } from "../ai/CreatureBrain";
import { TAMING_RULES } from "../taming/Taming";
import { SPAWN_SPECIES } from "../spawn/SpawnField";

function def(overrides: Partial<CreatureDefinition> = {}): CreatureDefinition {
  return {
    id: "deer",
    kind: "creature",
    spawnWeight: 0.35,
    maxPerCell: 1,
    stats: { maxHealth: 20, damage: 0, loot: [{ itemId: "meat", min: 1, max: 2 }] },
    temperament: { reactRange: 18, aggressive: false, fleeBelowHealth: 1 },
    disposition: "friendly",
    visual: { shape: "cone", color: 0xb98a5a, size: 1.4, lift: 0.7 },
    ...overrides,
  };
}

describe("CreatureRegistry", () => {
  it("looks up a defined creature by id", () => {
    const created = CreatureRegistry.create([def()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const found = created.value.get("deer");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.stats.maxHealth).toBe(20);
  });

  it("returns UnknownCreature for an id that was never registered", () => {
    const created = CreatureRegistry.create([def()]);
    if (!isOk(created)) throw new Error("setup");

    const found = created.value.get("dragon");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) {
      expect(found.error.kind).toBe("UnknownCreature");
      if (found.error.kind === "UnknownCreature") expect(found.error.id).toBe("dragon");
    }
  });

  it("rejects a table with a duplicate id", () => {
    const created = CreatureRegistry.create([def(), def({ disposition: "hostile" })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) {
      expect(created.error.kind).toBe("DuplicateCreature");
      if (created.error.kind === "DuplicateCreature") expect(created.error.id).toBe("deer");
    }
  });

  it("reports membership with has()", () => {
    const created = CreatureRegistry.create([def()]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("deer")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
  });

  it("exposes all definitions", () => {
    const created = CreatureRegistry.create([def({ id: "a" }), def({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.all().map((d) => d.id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter creature completeness (the invariant that's missing today)", () => {
  it("every registered creature has combat stats, temperament, and a spawn-field entry", () => {
    for (const c of CREATURE_REGISTRY.all()) {
      expect(CREATURE_STATS[c.id], `CREATURE_STATS missing ${c.id}`).toBeDefined();
      expect(TEMPERAMENT[c.id], `TEMPERAMENT missing ${c.id}`).toBeDefined();
      const spawnEntry = SPAWN_SPECIES.find((s) => s.id === c.id);
      expect(spawnEntry, `SPAWN_SPECIES missing ${c.id}`).toBeDefined();
      expect(spawnEntry?.kind).toBe("creature");
    }
  });

  it("every SPAWN_SPECIES creature id is a registered creature", () => {
    for (const sp of SPAWN_SPECIES.filter((s) => s.kind === "creature")) {
      expect(CREATURE_REGISTRY.has(sp.id), `registry missing ${sp.id}`).toBe(true);
    }
  });

  it("a tameable creature's TAMING_RULES entry matches the registry's rule exactly", () => {
    for (const c of CREATURE_REGISTRY.all()) {
      if (!c.taming) continue;
      expect(TAMING_RULES[c.id]).toEqual(c.taming);
    }
  });

  it("an untameable creature has no TAMING_RULES entry", () => {
    for (const c of CREATURE_REGISTRY.all()) {
      if (c.taming) continue;
      expect(TAMING_RULES[c.id]).toBeUndefined();
    }
  });
});
