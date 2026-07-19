// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("exposes the title as an accessible name and hides the decorative SVG", () => {
    const el = Wordmark("Diggy World");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe("Diggy World");
    expect(el.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the title as SVG text (procedural, no bundled font/image)", () => {
    const el = Wordmark("Diggy World");
    expect(el.querySelector("text")?.textContent).toBe("Diggy World");
    expect(el.querySelector("image")).toBeNull();
  });

  it("defaults to the hero size and switches on request", () => {
    expect(Wordmark("Diggy World").dataset.size).toBe("hero");
    expect(Wordmark("Diggy World", { size: "compact" }).dataset.size).toBe("compact");
  });
});
