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
