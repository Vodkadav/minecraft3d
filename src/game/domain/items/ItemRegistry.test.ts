import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { ItemDefinition } from "./ItemDefinition";
import { ItemRegistry } from "./ItemRegistry";

function def(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "wood",
    displayName: "Wood",
    maxStackSize: 64,
    tags: ["natural", "flammable"],
    tier: 0,
    ...overrides,
  };
}

describe("ItemRegistry", () => {
  it("looks up a defined item by id", () => {
    const created = ItemRegistry.create([def()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const found = created.value.get("wood");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.displayName).toBe("Wood");
  });

  it("returns UnknownItem for an id that was never registered", () => {
    const created = ItemRegistry.create([def()]);
    if (!isOk(created)) throw new Error("setup");

    const found = created.value.get("obsidian");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) {
      expect(found.error.kind).toBe("UnknownItem");
      if (found.error.kind === "UnknownItem") expect(found.error.id).toBe("obsidian");
    }
  });

  it("rejects a table with a duplicate id", () => {
    const created = ItemRegistry.create([def(), def({ displayName: "Wood Copy" })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) {
      expect(created.error.kind).toBe("DuplicateItem");
      if (created.error.kind === "DuplicateItem") expect(created.error.id).toBe("wood");
    }
  });

  it("queries items by tag", () => {
    const created = ItemRegistry.create([
      def({ id: "wood", tags: ["natural"] }),
      def({ id: "stone", tags: ["natural"] }),
      def({ id: "plank", tags: ["crafted"] }),
    ]);
    if (!isOk(created)) throw new Error("setup");

    const natural = created.value.byTag("natural").map((d) => d.id);
    expect(natural.sort()).toEqual(["stone", "wood"]);
  });

  it("queries items by tier", () => {
    const created = ItemRegistry.create([
      def({ id: "wood", tier: 0 }),
      def({ id: "iron", tier: 2 }),
      def({ id: "stone", tier: 0 }),
    ]);
    if (!isOk(created)) throw new Error("setup");

    const tier0 = created.value.byTier(0).map((d) => d.id);
    expect(tier0.sort()).toEqual(["stone", "wood"]);
    expect(created.value.byTier(2).map((d) => d.id)).toEqual(["iron"]);
  });

  it("reports membership with has()", () => {
    const created = ItemRegistry.create([def()]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("wood")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
  });

  it("exposes all definitions", () => {
    const created = ItemRegistry.create([def({ id: "a" }), def({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.all().map((d) => d.id).sort()).toEqual(["a", "b"]);
  });
});
