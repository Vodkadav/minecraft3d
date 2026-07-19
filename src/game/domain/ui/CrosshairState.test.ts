import { describe, expect, it } from "vitest";
import { resolveCrosshairState, type CrosshairInput } from "./CrosshairState";

const base: CrosshairInput = {
  placing: false,
  hasAttackTarget: false,
  hasInteractTarget: false,
  hasMineTarget: false,
};

describe("resolveCrosshairState", () => {
  it("defaults when nothing is targeted", () => {
    expect(resolveCrosshairState(base)).toBe("default");
  });

  it("mine when a diggable surface is aimed at", () => {
    expect(resolveCrosshairState({ ...base, hasMineTarget: true })).toBe("mine");
  });

  it("interact when a harvest/feed/mount target is in reach", () => {
    expect(resolveCrosshairState({ ...base, hasInteractTarget: true })).toBe("interact");
  });

  it("attack when a hostile/attackable creature is in reach", () => {
    expect(resolveCrosshairState({ ...base, hasAttackTarget: true })).toBe("attack");
  });

  it("place always wins while build mode is active, regardless of other targets", () => {
    expect(
      resolveCrosshairState({
        placing: true,
        hasAttackTarget: true,
        hasInteractTarget: true,
        hasMineTarget: true,
      }),
    ).toBe("place");
  });

  it("attack outranks interact when both are true", () => {
    expect(
      resolveCrosshairState({ ...base, hasAttackTarget: true, hasInteractTarget: true }),
    ).toBe("attack");
  });

  it("interact outranks mine when both are true", () => {
    expect(
      resolveCrosshairState({ ...base, hasInteractTarget: true, hasMineTarget: true }),
    ).toBe("interact");
  });
});
