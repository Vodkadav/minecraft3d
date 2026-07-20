// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { createItemIconEl, getItemIconMarkup, __clearItemIconCache } from "./ItemIconElement";

beforeEach(() => {
  __clearItemIconCache();
});

describe("getItemIconMarkup", () => {
  it("is deterministic per item id (cached)", () => {
    const a = getItemIconMarkup("wood", "Wood", ["natural"]);
    const b = getItemIconMarkup("wood", "Wood", ["natural"]);
    expect(a).toBe(b);
    expect(a).toContain("<svg");
  });

  it("produces distinct markup for items of different kind/color", () => {
    const wood = getItemIconMarkup("wood", "Wood", ["natural"]);
    const sword = getItemIconMarkup("iron-sword", "Iron Sword", ["tool", "weapon"]);
    expect(wood).not.toBe(sword);
  });

  it("renders every starter item without throwing and includes the glyph letter", () => {
    for (const item of STARTER_ITEMS) {
      const markup = getItemIconMarkup(item.id, item.displayName, item.tags);
      expect(markup).toContain(item.displayName.trim()[0]!.toUpperCase());
    }
  });
});

describe("createItemIconEl", () => {
  it("builds an aria-hidden span wrapping the icon svg", () => {
    const el = createItemIconEl(document, "wood", "Wood", ["natural"]);
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toBe("lw-item-icon");
    expect(el.querySelector("svg")).not.toBeNull();
  });
});

describe("rarity frame ring (E8.2)", () => {
  it("omits the ring by default (unchanged legacy call sites)", () => {
    const plain = getItemIconMarkup("wood", "Wood", ["natural"]);
    expect(plain).not.toContain("--lw-rarity-");
  });

  it("draws a frame ring in the tier's frame token when a rarity is given", () => {
    const legendary = getItemIconMarkup("relic", "Relic", ["treasure"], { rarityTier: "legendary" });
    expect(legendary).toContain("var(--lw-rarity-legendary-frame)");
    expect(legendary).toContain("<rect"); // the ring border
  });

  it("caches ringed and plain variants of the same id separately", () => {
    const plain = getItemIconMarkup("relic", "Relic", ["treasure"]);
    const ringed = getItemIconMarkup("relic", "Relic", ["treasure"], { rarityTier: "rare" });
    expect(plain).not.toBe(ringed);
    expect(getItemIconMarkup("relic", "Relic", ["treasure"], { rarityTier: "rare" })).toBe(ringed);
  });

  it("carries a distinct per-tier motif shape (colorblind-safe channel)", () => {
    // uncommon -> dot (circle), epic -> diamond, legendary -> starburst
    expect(getItemIconMarkup("x", "X", [], { rarityTier: "uncommon" })).toContain("<circle");
    const epic = getItemIconMarkup("y", "Y", [], { rarityTier: "epic" });
    const legendary = getItemIconMarkup("z", "Z", [], { rarityTier: "legendary" });
    expect(epic).not.toBe(legendary); // different motif geometry
  });
});
