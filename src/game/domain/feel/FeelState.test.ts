import { describe, expect, it } from "vitest";
import { resolveFeedback } from "./FeelEvents";
import {
  applyFeedback,
  emptyFeelState,
  HIT_STOP_CAP_MS,
  pulseIntensity,
  shakeMagnitude,
  tickFeel,
  VIGNETTE_PULSE_LIFE_S,
} from "./FeelState";

describe("FeelState decay/stacking", () => {
  it("starts at zero trauma/hit-stop/no pulses", () => {
    const s = emptyFeelState();
    expect(s.trauma).toBe(0);
    expect(s.hitStopMs).toBe(0);
    expect(s.vignettePulses).toHaveLength(0);
  });

  it("shake trauma sums across simultaneous hits but clamps at 1", () => {
    let s = emptyFeelState();
    s = applyFeedback(s, resolveFeedback("kill")); // 0.35
    s = applyFeedback(s, resolveFeedback("kill")); // 0.70
    s = applyFeedback(s, resolveFeedback("kill")); // would be 1.05
    expect(s.trauma).toBe(1);
  });

  it("hit-stop does not stack additively — it caps at the max of what's fired, bounded", () => {
    let s = emptyFeelState();
    s = applyFeedback(s, resolveFeedback("attackHit")); // 40ms
    s = applyFeedback(s, resolveFeedback("attackHit")); // still 40ms, not 80ms
    expect(s.hitStopMs).toBe(40);
    s = applyFeedback(s, resolveFeedback("kill", { crit: true })); // 90*1.6=144ms
    expect(s.hitStopMs).toBeCloseTo(144);
    expect(s.hitStopMs).toBeLessThanOrEqual(HIT_STOP_CAP_MS);
  });

  it("hit-stop is hard-capped even from a single huge bundle", () => {
    let s = emptyFeelState();
    // two crit kills back to back would exceed the cap without clamping
    s = applyFeedback(s, resolveFeedback("kill", { crit: true }));
    s = applyFeedback(s, resolveFeedback("kill", { crit: true }));
    expect(s.hitStopMs).toBeLessThanOrEqual(HIT_STOP_CAP_MS);
  });

  it("trauma decays linearly toward zero over time and never goes negative", () => {
    let s = applyFeedback(emptyFeelState(), resolveFeedback("kill"));
    s = tickFeel(s, 10); // way more than enough time to fully decay
    expect(s.trauma).toBe(0);
  });

  it("hit-stop decays in real ms and never goes negative", () => {
    let s = applyFeedback(emptyFeelState(), resolveFeedback("attackHit"));
    s = tickFeel(s, 1);
    expect(s.hitStopMs).toBe(0);
  });

  it("vignette pulses (hurt/heal) coexist and each age out independently", () => {
    let s = applyFeedback(emptyFeelState(), resolveFeedback("takeDamage")); // hurt
    s = applyFeedback(s, resolveFeedback("tame")); // heal
    expect(s.vignettePulses).toHaveLength(2);
    expect(s.vignettePulses.map((p) => p.kind).sort()).toEqual(["heal", "hurt"]);
    s = tickFeel(s, VIGNETTE_PULSE_LIFE_S + 0.01);
    expect(s.vignettePulses).toHaveLength(0);
  });

  it("tickFeel returns the SAME reference at idle — zero allocation on the steady-state per-frame path (Workstream 9.1)", () => {
    const idle = emptyFeelState();
    const next = tickFeel(idle, 1 / 60);
    expect(next).toBe(idle);
  });

  it("tickFeel still allocates fresh state once anything is actually decaying", () => {
    const active = applyFeedback(emptyFeelState(), resolveFeedback("kill"));
    const next = tickFeel(active, 1 / 60);
    expect(next).not.toBe(active);
  });

  it("shakeMagnitude is trauma^2 (punchier falloff than linear)", () => {
    expect(shakeMagnitude({ trauma: 0.5, hitStopMs: 0, vignettePulses: [] })).toBeCloseTo(0.25);
    expect(shakeMagnitude({ trauma: 1, hitStopMs: 0, vignettePulses: [] })).toBe(1);
  });

  it("pulseIntensity fades linearly to 0 and clamps at 0 past its lifetime", () => {
    const fresh = { kind: "hurt" as const, intensity: 0.6, ageS: 0 };
    expect(pulseIntensity(fresh)).toBeCloseTo(0.6);
    const half = { ...fresh, ageS: VIGNETTE_PULSE_LIFE_S / 2 };
    expect(pulseIntensity(half)).toBeCloseTo(0.3);
    const dead = { ...fresh, ageS: VIGNETTE_PULSE_LIFE_S + 1 };
    expect(pulseIntensity(dead)).toBe(0);
  });
});
