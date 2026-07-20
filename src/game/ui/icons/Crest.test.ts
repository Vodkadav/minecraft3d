// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { CREST_CHARGES, createCrestEl, crestForSeed, crestMarkup } from "./Crest";

describe("crestForSeed", () => {
  it("is deterministic for a given seed", () => {
    expect(crestForSeed("party-42")).toEqual(crestForSeed("party-42"));
  });

  it("only ever picks a charge from the canonical list", () => {
    for (const seed of ["a", "b", "guild", "the-diggers", "42", ""]) {
      expect(CREST_CHARGES).toContain(crestForSeed(seed).charge);
    }
  });

  it("varies across seeds (field or charge differs)", () => {
    const seeds = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
    const crests = seeds.map((s) => JSON.stringify(crestForSeed(s)));
    expect(new Set(crests).size).toBeGreaterThan(1);
  });
});

describe("createCrestEl", () => {
  it("builds an aria-hidden crest span with a shield svg", () => {
    const el = createCrestEl(document, "party-1");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.dataset.seed).toBe("party-1");
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("references only theme tokens for the field color (never raw hex)", () => {
    expect(crestMarkup("guild")).toContain("var(--lw-");
    expect(crestMarkup("guild")).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
