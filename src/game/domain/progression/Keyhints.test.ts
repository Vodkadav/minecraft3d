import { describe, expect, it } from "vitest";
import { emptyKeyhintState, markKeyhintShown, shouldShowKeyhint } from "./Keyhints";

describe("Keyhints", () => {
  it("shows an unshown hint", () => {
    const state = emptyKeyhintState();
    expect(shouldShowKeyhint(state, "eat")).toBe(true);
  });

  it("never shows again once marked shown", () => {
    let state = emptyKeyhintState();
    state = markKeyhintShown(state, "eat");
    expect(shouldShowKeyhint(state, "eat")).toBe(false);
  });

  it("marking one hint shown does not affect another", () => {
    const state = markKeyhintShown(emptyKeyhintState(), "eat");
    expect(shouldShowKeyhint(state, "tame")).toBe(true);
  });

  it("marking an already-shown hint is a no-op (stable reference-ish, no duplicate entries)", () => {
    let state = emptyKeyhintState();
    state = markKeyhintShown(state, "eat");
    state = markKeyhintShown(state, "eat");
    expect(state.shown).toEqual(["eat"]);
  });
});
