// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("wraps children in a themed, labelled section", () => {
    const child = document.createElement("p");
    child.textContent = "hi";
    const el = Panel([child], { ariaLabel: "Test panel" });
    expect(el.tagName).toBe("SECTION");
    expect(el.classList.contains("lw-panel")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Test panel");
    expect(el.contains(child)).toBe(true);
  });
});
