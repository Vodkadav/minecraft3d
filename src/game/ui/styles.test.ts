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
