// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { WindowFrame } from "./WindowFrame";

function baseOpts() {
  return {
    doc: document,
    title: "Storage",
    close: { label: "Close", ariaLabel: "Close storage", onClose: vi.fn() },
    body: [Object.assign(document.createElement("div"), { textContent: "grid" })],
  };
}

describe("WindowFrame", () => {
  it("builds a themed panel with header title + close button over the body", () => {
    const { panel, closeButton, titleEl } = WindowFrame(baseOpts());
    expect(panel.tagName).toBe("SECTION");
    expect(panel.classList.contains("lw-panel")).toBe(true);
    expect(titleEl.tagName).toBe("H2");
    expect(titleEl.textContent).toBe("Storage");
    expect(titleEl.classList.contains("lw-sr-only")).toBe(false);
    expect(closeButton.getAttribute("aria-label")).toBe("Close storage");
    expect(panel.querySelector(".lw-window-header")?.contains(closeButton)).toBe(true);
    expect(panel.textContent).toContain("grid");
  });

  it("fires onClose when the close button is clicked", () => {
    const opts = baseOpts();
    const { closeButton } = WindowFrame(opts);
    closeButton.click();
    expect(opts.close.onClose).toHaveBeenCalledOnce();
  });

  it("keeps a visually-hidden title in the a11y tree for tab-dominant windows", () => {
    const tabs = document.createElement("div");
    tabs.className = "lw-inv-tabs";
    const { panel, titleEl } = WindowFrame({
      ...baseOpts(),
      titleVisuallyHidden: true,
      emblem: "character",
      headerExtra: tabs,
    });
    expect(titleEl.classList.contains("lw-sr-only")).toBe(true);
    expect(titleEl.textContent).toBe("Storage"); // still present for screen readers
    expect(panel.querySelector(".lw-panel-emblem")).not.toBeNull();
    expect(panel.querySelector(".lw-window-header-lead")?.contains(tabs)).toBe(true);
  });

  it("renders a footer only when keyhints are supplied", () => {
    const withHints = WindowFrame({
      ...baseOpts(),
      keyhints: [Object.assign(document.createElement("span"), { textContent: "[Esc] Close" })],
    });
    expect(withHints.panel.querySelector(".lw-window-footer")).not.toBeNull();
    expect(WindowFrame(baseOpts()).panel.querySelector(".lw-window-footer")).toBeNull();
  });

  it("passes panelClassName through to the panel section", () => {
    const { panel } = WindowFrame({ ...baseOpts(), panelClassName: "lw-inv-overlay-panel" });
    expect(panel.classList.contains("lw-inv-overlay-panel")).toBe(true);
  });

  it("updates the title live via setTitle", () => {
    const h = WindowFrame(baseOpts());
    h.setTitle("Bank");
    expect(h.titleEl.textContent).toBe("Bank");
  });
});
