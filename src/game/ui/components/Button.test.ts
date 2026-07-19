// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a real, labelled button", () => {
    const btn = Button({ label: "Craft" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button");
    expect(btn.textContent).toBe("Craft");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    const btn = Button({ label: "Go", onClick });
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is keyboard-operable (native button semantics)", () => {
    const onClick = vi.fn();
    const btn = Button({ label: "Go", onClick });
    document.body.appendChild(btn);
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it("applies the quiet variant as a data attribute", () => {
    const btn = Button({ label: "Cancel", variant: "quiet" });
    expect(btn.dataset.variant).toBe("quiet");
  });

  it("supports a distinct aria-label from the visible text", () => {
    const btn = Button({ label: "X", ariaLabel: "Close dialog" });
    expect(btn.getAttribute("aria-label")).toBe("Close dialog");
  });
});
