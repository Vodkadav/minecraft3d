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
