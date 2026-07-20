// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { injectStyles, UI_STYLES } from "./styles";

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
