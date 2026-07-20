// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ITEM_BADGE_KINDS, createItemBadgeEl } from "./ItemBadges";

describe("createItemBadgeEl", () => {
  it("builds a labelled corner badge for each kind", () => {
    for (const kind of ITEM_BADGE_KINDS) {
      const el = createItemBadgeEl(document, kind, `${kind} label`);
      expect(el.className).toBe("lw-item-badge");
      expect(el.dataset.badge).toBe(kind);
      expect(el.getAttribute("role")).toBe("img");
      expect(el.getAttribute("aria-label")).toBe(`${kind} label`);
      expect(el.querySelector("svg")).not.toBeNull();
    }
  });

  it("gives each kind a distinct glyph (shape channel, not color-only)", () => {
    const glyphs = ITEM_BADGE_KINDS.map(
      (k) => createItemBadgeEl(document, k, k).querySelector("svg")!.innerHTML,
    );
    expect(new Set(glyphs).size).toBe(ITEM_BADGE_KINDS.length);
  });

  it("is a real information carrier, not aria-hidden", () => {
    const el = createItemBadgeEl(document, "equipped", "Equipped");
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });
});
