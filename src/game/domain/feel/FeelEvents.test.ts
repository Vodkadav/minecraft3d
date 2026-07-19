import { describe, expect, it } from "vitest";
import { CRIT_MULTIPLIER, FEEL_EVENT_IDS, FEEL_EVENTS, resolveFeedback } from "./FeelEvents";

describe("FeelEvents registry", () => {
  it("every declared event has non-negative shake/hit-stop and a valid vignette kind", () => {
    for (const id of FEEL_EVENT_IDS) {
      const def = FEEL_EVENTS[id];
      expect(def.shakeTrauma).toBeGreaterThanOrEqual(0);
      expect(def.shakeTrauma).toBeLessThanOrEqual(1);
      expect(def.hitStopMs).toBeGreaterThanOrEqual(0);
      if (def.vignette) expect(["hurt", "heal"]).toContain(def.vignette.kind);
      if (def.rumble) {
        expect(def.rumble.intensity).toBeGreaterThan(0);
        expect(def.rumble.intensity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("the pillar-2 gate sites (attack, kill, harvest, dig, place, tame, hurt) are all declared", () => {
    const required = ["attackHit", "kill", "takeDamage", "harvest", "dig", "place", "tame"];
    for (const id of required) expect(FEEL_EVENT_IDS).toContain(id);
  });

  it("resolveFeedback without crit returns the base bundle unchanged", () => {
    expect(resolveFeedback("attackHit")).toEqual(FEEL_EVENTS.attackHit);
  });

  it("resolveFeedback with crit scales shake/hit-stop/rumble by CRIT_MULTIPLIER, clamped", () => {
    const base = FEEL_EVENTS.attackHit;
    const crit = resolveFeedback("attackHit", { crit: true });
    expect(crit.shakeTrauma).toBeCloseTo(Math.min(1, base.shakeTrauma * CRIT_MULTIPLIER));
    expect(crit.hitStopMs).toBeCloseTo(base.hitStopMs * CRIT_MULTIPLIER);
    expect(crit.rumble?.intensity).toBeCloseTo(Math.min(1, (base.rumble?.intensity ?? 0) * CRIT_MULTIPLIER));
  });

  it("crit never pushes shake trauma or rumble intensity above 1", () => {
    // kill already has high shake (0.35) — multiplied it would exceed 1 without the clamp
    const crit = resolveFeedback("kill", { crit: true });
    expect(crit.shakeTrauma).toBeLessThanOrEqual(1);
    expect(crit.rumble?.intensity).toBeLessThanOrEqual(1);
  });

  it("an event with no vignette/rumble stays null under crit", () => {
    const crit = resolveFeedback("harvest", { crit: true });
    expect(crit.vignette).toBeNull();
    expect(crit.rumble).not.toBeNull(); // harvest does declare a small rumble
    const dig = resolveFeedback("dig", { crit: true });
    expect(dig.vignette).toBeNull();
  });
});
