// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../domain/settings/Settings";
import { applyAccessibility, injectStyles, UI_STYLES } from "./styles";

/**
 * Regression guard for the boot-time "stacked overlays over a black screen"
 * bug: `.lw-inv-overlay` sets `position:fixed; display:flex`, whose equal
 * specificity overrode the UA `[hidden]{display:none}` rule — so every
 * mounted-but-closed overlay (campfire, chest, bank, trade, character/research)
 * rendered at once, and Close buttons (which only toggle `hidden`) did nothing.
 * The fix is a global `[hidden]{display:none!important}` guard in UI_STYLES.
 */
describe("UI_STYLES [hidden] guard", () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it("makes the hidden attribute authoritative over the overlay display rule", () => {
    injectStyles(document);
    const overlay = document.createElement("div");
    overlay.className = "laas-ui lw-inv-overlay";
    overlay.hidden = true;
    document.body.appendChild(overlay);
    // happy-dom evaluates the injected cascade: a hidden overlay must collapse.
    expect(getComputedStyle(overlay).display).toBe("none");
    overlay.hidden = false;
    expect(getComputedStyle(overlay).display).toBe("flex");
  });

  it("ships the guard rule text (defence in depth if the cascade engine changes)", () => {
    expect(UI_STYLES).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });
});

/**
 * Regression guard for a dropped `}` on `.laas-room-code` (introduced when the
 * E2.5 combat-meter rule was inserted right after it): the unbalanced brace
 * made CSS nesting swallow the entire remainder of the sheet as descendants of
 * `.laas-room-code`, so global rules (button sizing, minimap/chat positioning,
 * reduced-motion) silently stopped applying whenever no room-code badge existed
 * (i.e. all of solo play). Braces must balance.
 */
describe("UI_STYLES structural integrity", () => {
  it("has balanced braces (no rule left unclosed)", () => {
    const open = (UI_STYLES.match(/\{/g) ?? []).length;
    const close = (UI_STYLES.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });
});

/**
 * Regression guard for the S9 dead-menu-button bug: `.laas-main-menu` is a
 * `position:relative; z-index:1` stacking context, so its `position:fixed`
 * `.lw-menu-backdrop` child — if given z-index >= 0 — paints OVER the in-flow
 * nav (positioned-child layer beats the in-flow layer) and swallows every
 * button's click. The backdrop is decorative: it must stay below content and
 * be click-through.
 */
describe("UI_STYLES menu backdrop never buries the menu buttons", () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it("paints the backdrop below content and lets clicks pass through", () => {
    injectStyles(document);
    const menu = document.createElement("section");
    menu.className = "laas-ui laas-main-menu";
    const backdrop = document.createElement("div");
    backdrop.className = "laas-ui lw-menu-backdrop";
    menu.appendChild(backdrop);
    document.body.appendChild(menu);
    const cs = getComputedStyle(backdrop);
    expect(Number(cs.zIndex)).toBeLessThan(0);
    expect(cs.pointerEvents).toBe("none");
  });
});

/** E8.8 colorblind rarity palette + E8.6 reduce-flair. */
describe("applyAccessibility (colorblind rarity / reduce flair)", () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.documentElement.removeAttribute("data-reduce-flair");
  });

  it("reflects colorblindRarity onto the root dataset", () => {
    const root = document.createElement("section");
    root.className = "laas-ui";
    document.body.appendChild(root);
    applyAccessibility(root, { ...defaultSettings(), colorblindRarity: true });
    expect(root.dataset.colorblindRarity).toBe("true");
  });

  it("reflects reduceFlair onto documentElement, mirroring reducedMotion", () => {
    const root = document.createElement("section");
    root.className = "laas-ui";
    document.body.appendChild(root);
    applyAccessibility(root, { ...defaultSettings(), reduceFlair: true });
    expect(document.documentElement.dataset.reduceFlair).toBe("true");
  });

  it("ships a colorblind-rarity rule remapping every rarity token to its cb pair", () => {
    for (const tier of ["common", "uncommon", "rare", "epic", "legendary"]) {
      const re = new RegExp(
        `--lw-rarity-${tier}-frame:\\s*var\\(--lw-rarity-cb-${tier}-frame\\)`,
      );
      expect(UI_STYLES).toMatch(re);
    }
  });

  it("ships a reduce-flair rule keyed off documentElement", () => {
    expect(UI_STYLES).toMatch(/:root\[data-reduce-flair="true"\]/);
  });
});

/**
 * E8.8 mobile/responsive block — appended at the end of UI_STYLES behind a
 * single `@media (max-width: 640px)` query so every desktop rule above it
 * stays untouched. Asserted by text match (matching this file's existing
 * convention) rather than a computed-style check, since happy-dom's rendering
 * engine has no real viewport to evaluate a media query against.
 */
describe("UI_STYLES mobile/responsive (E8.8)", () => {
  const mediaBlockMatch = UI_STYLES.match(/@media \(max-width: 640px\) \{([\s\S]*)\}\s*`?$/);
  const mediaBlock = mediaBlockMatch?.[1] ?? "";

  it("ships exactly one clearly-marked mobile media block at the end of the sheet", () => {
    expect(UI_STYLES).toContain("---- E8.8 mobile/responsive ----");
    expect(UI_STYLES.match(/@media \(max-width: 640px\)/g)).toHaveLength(1);
  });

  it("closes the .lw-inv-overlay-panel desktop min-width overflow (420px wider than a phone)", () => {
    expect(mediaBlock).toMatch(/\.lw-inv-overlay-panel\s*\{[^}]*min-width:\s*0/);
  });

  it("closes the same min-width-wider-than-viewport risk on the HUD side clusters", () => {
    expect(mediaBlock).toMatch(/\.lw-objective-tracker,\s*\.lw-party-panel,\s*\.lw-combat-meter\s*\{[^}]*min-width:\s*0/);
  });

  it("keeps generic buttons/inputs at the 44px touch-target floor", () => {
    expect(mediaBlock).toMatch(/\.lw-button,[\s\S]*?\{[^}]*min-height:\s*44px/);
  });

  it("keeps hotbar slots at >=44px while letting the row scroll instead of clipping", () => {
    expect(mediaBlock).toMatch(/\.lw-hotbar-slot\s*\{[^}]*width:\s*44px/);
    expect(mediaBlock).toMatch(/\.lw-hotbar\s*\{[^}]*overflow-x:\s*auto/);
  });
});
