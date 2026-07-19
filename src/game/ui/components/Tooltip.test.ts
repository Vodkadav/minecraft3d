// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { attachTooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("links the anchor via aria-describedby and hides the popup initially", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const handle = attachTooltip(anchor, "Deals extra damage");
    const id = anchor.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    const tip = document.getElementById(id!);
    expect(tip?.getAttribute("role")).toBe("tooltip");
    expect(tip?.hidden).toBe(true);
    expect(tip?.textContent).toBe("Deals extra damage");
    handle.dispose();
  });

  it("shows on focus (keyboard-reachable) and hides on blur", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    attachTooltip(anchor, "hint");
    const id = anchor.getAttribute("aria-describedby")!;
    const tip = document.getElementById(id)!;

    anchor.dispatchEvent(new FocusEvent("focus"));
    expect(tip.hidden).toBe(false);

    anchor.dispatchEvent(new FocusEvent("blur"));
    expect(tip.hidden).toBe(true);
  });

  it("dispose removes the popup and the aria link", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const handle = attachTooltip(anchor, "hint");
    const id = anchor.getAttribute("aria-describedby")!;
    handle.dispose();
    expect(anchor.hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(id)).toBeNull();
  });
});
