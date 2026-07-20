import { describe, expect, it } from "vitest";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import {
  classifyItemIconKind,
  colorTokenForItem,
  hashItemId,
  ICON_COLOR_TOKENS,
  iconShapeForKind,
  itemIconSpec,
  type ItemIconKind,
} from "./ItemIconSpec";

const ALL_KINDS: readonly ItemIconKind[] = [
  "weapon",
  "tool",
  "gear",
  "treasure",
  "food",
  "seed",
  "light",
  "metal",
  "material",
  "misc",
];

describe("classifyItemIconKind", () => {
  it("is complete: every kind has a mapped shape", () => {
    for (const kind of ALL_KINDS) {
      expect(iconShapeForKind(kind)).toBeTruthy();
    }
  });

  it("prioritizes weapon over tool", () => {
    expect(classifyItemIconKind(["tool", "weapon"])).toBe("weapon");
  });

  it("prioritizes tool over material", () => {
    expect(classifyItemIconKind(["tool", "natural"])).toBe("tool");
  });

  it("classifies food/seed/light/metal correctly", () => {
    expect(classifyItemIconKind(["natural", "food"])).toBe("food");
    expect(classifyItemIconKind(["natural", "seed"])).toBe("seed");
    expect(classifyItemIconKind(["crafted", "placeable", "light"])).toBe("light");
    expect(classifyItemIconKind(["crafted", "metal"])).toBe("metal");
  });

  it("falls back to material for natural/crafted-only items", () => {
    expect(classifyItemIconKind(["natural"])).toBe("material");
    expect(classifyItemIconKind(["crafted"])).toBe("material");
  });

  it("falls back to misc for unknown/empty tag sets", () => {
    expect(classifyItemIconKind([])).toBe("misc");
    expect(classifyItemIconKind(["mystery-tag"])).toBe("misc");
  });
});

describe("hashItemId / colorTokenForItem", () => {
  it("is deterministic across repeated calls", () => {
    expect(hashItemId("iron-pickaxe")).toBe(hashItemId("iron-pickaxe"));
    expect(colorTokenForItem("iron-pickaxe")).toBe(colorTokenForItem("iron-pickaxe"));
  });

  it("always returns a token from the curated palette", () => {
    for (const item of STARTER_ITEMS) {
      expect(ICON_COLOR_TOKENS).toContain(colorTokenForItem(item.id));
    }
  });

  it("distributes starter items across more than one color bucket", () => {
    const buckets = new Set(STARTER_ITEMS.map((i) => colorTokenForItem(i.id)));
    expect(buckets.size).toBeGreaterThan(1);
  });
});

describe("itemIconSpec", () => {
  it("is fully deterministic per (id, name, tags)", () => {
    const a = itemIconSpec("wood", "Wood", ["natural", "flammable"]);
    const b = itemIconSpec("wood", "Wood", ["natural", "flammable"]);
    expect(a).toEqual(b);
  });

  it("derives the glyph letter from the display name, uppercased", () => {
    expect(itemIconSpec("wood", "Wood", []).glyphLetter).toBe("W");
    expect(itemIconSpec("ore", "iron ore", []).glyphLetter).toBe("I");
  });

  it("falls back to '?' for a blank display name", () => {
    expect(itemIconSpec("x", "   ", []).glyphLetter).toBe("?");
  });

  it("produces a valid, complete spec for every registered starter item", () => {
    for (const item of STARTER_ITEMS) {
      const spec = itemIconSpec(item.id, item.displayName, item.tags);
      expect(ALL_KINDS).toContain(spec.kind);
      expect(spec.shape).toBe(iconShapeForKind(spec.kind));
      expect(ICON_COLOR_TOKENS).toContain(spec.colorToken);
      expect(spec.glyphLetter).toHaveLength(1);
    }
  });
});
