import { describe, expect, it } from "vitest";
import { emptyCooldownState, pickPriority, resolvePlay } from "./AudioCooldown";

describe("resolvePlay", () => {
  it("allows the first play of an event", () => {
    const r = resolvePlay(emptyCooldownState(), "footstep", 1000);
    expect(r.allow).toBe(true);
    expect(r.state.lastPlayedMs.footstep).toBe(1000);
  });

  it("blocks a repeat within the event's cooldown window", () => {
    const first = resolvePlay(emptyCooldownState(), "footstep", 1000);
    const second = resolvePlay(first.state, "footstep", 1100); // cooldown 250ms
    expect(second.allow).toBe(false);
    expect(second.state).toBe(first.state); // unchanged on block
  });

  it("allows again once the cooldown has fully elapsed", () => {
    const first = resolvePlay(emptyCooldownState(), "footstep", 1000);
    const second = resolvePlay(first.state, "footstep", 1250);
    expect(second.allow).toBe(true);
  });

  it("events with 0 cooldown are never blocked", () => {
    const first = resolvePlay(emptyCooldownState(), "ambientWind", 1000);
    const second = resolvePlay(first.state, "ambientWind", 1000);
    expect(second.allow).toBe(true);
  });

  it("cooldowns are tracked independently per event id", () => {
    const first = resolvePlay(emptyCooldownState(), "footstep", 1000);
    const other = resolvePlay(first.state, "hit", 1000);
    expect(other.allow).toBe(true);
  });
});

describe("pickPriority", () => {
  it("returns null for an empty list", () => {
    expect(pickPriority([])).toBeNull();
  });

  it("returns the single event unchanged", () => {
    expect(pickPriority(["footstep"])).toBe("footstep");
  });

  it("picks the highest-priority event among several", () => {
    // hurt(6) > hit(5) > tame(4) > harvest/craft(3) > dig/place/uiClick(2) > footstep/uiHover(1)
    expect(pickPriority(["footstep", "hurt", "dig"])).toBe("hurt");
  });

  it("keeps the first event on a priority tie", () => {
    expect(pickPriority(["dig", "place"])).toBe("dig");
  });
});
