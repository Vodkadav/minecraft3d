import { describe, expect, it } from "vitest";
import {
  PLAYER_MAX_HEALTH,
  REGEN_DELAY_S,
  REGEN_PER_S,
  damagePlayer,
  respawnPlayer,
  spawnPlayerVitals,
  tickVitals,
} from "./PlayerVitals";

describe("PlayerVitals", () => {
  it("spawns at full health", () => {
    const v = spawnPlayerVitals();
    expect(v.health).toBe(PLAYER_MAX_HEALTH);
    expect(v.dead).toBe(false);
  });

  it("subtracts damage and flags death exactly once at zero", () => {
    const v = spawnPlayerVitals();
    const hit = damagePlayer(v, 6);
    expect(hit.state.health).toBe(PLAYER_MAX_HEALTH - 6);
    expect(hit.died).toBe(false);

    const lethal = damagePlayer({ ...v, health: 5 }, 6);
    expect(lethal.state.health).toBe(0);
    expect(lethal.state.dead).toBe(true);
    expect(lethal.died).toBe(true);

    // already dead: no second death event
    const again = damagePlayer(lethal.state, 6);
    expect(again.died).toBe(false);
  });

  it("ignores non-positive damage", () => {
    const v = spawnPlayerVitals();
    expect(damagePlayer(v, 0).state).toBe(v);
    expect(damagePlayer(v, -4).state).toBe(v);
  });

  it("does not regen during the grace period after a hit", () => {
    const hurt = damagePlayer(spawnPlayerVitals(), 40).state;
    const after = tickVitals(hurt, REGEN_DELAY_S - 0.5);
    expect(after.health).toBe(hurt.health);
  });

  it("regens after the grace period, capped at max", () => {
    const hurt = damagePlayer(spawnPlayerVitals(), 40).state;
    const healed = tickVitals(hurt, REGEN_DELAY_S + 1);
    expect(healed.health).toBeCloseTo(hurt.health + REGEN_PER_S * 1, 5);

    const full = tickVitals({ ...hurt, health: PLAYER_MAX_HEALTH - 1, sinceHitS: 999 }, 999);
    expect(full.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("a fresh hit restarts the grace period", () => {
    let v = damagePlayer(spawnPlayerVitals(), 40).state;
    v = tickVitals(v, REGEN_DELAY_S + 5); // healing
    const healthBefore = v.health;
    v = damagePlayer(v, 5).state; // re-hit resets timer
    v = tickVitals(v, REGEN_DELAY_S - 0.5); // still in new grace window
    expect(v.health).toBe(healthBefore - 5);
  });

  it("does not regen the dead", () => {
    const dead = damagePlayer({ ...spawnPlayerVitals(), health: 3 }, 5).state;
    expect(tickVitals(dead, 999).health).toBe(0);
  });

  it("respawns to full and clears death", () => {
    const dead = damagePlayer({ ...spawnPlayerVitals(), health: 3 }, 5).state;
    const back = respawnPlayer(dead);
    expect(back.health).toBe(PLAYER_MAX_HEALTH);
    expect(back.dead).toBe(false);
  });

  // E1.4b: an explicit maxHealth (from a character's effectiveMaxHealthMultiplier)
  // scales spawn/regen-cap/respawn; omitting it is identical to today.
  describe("maxHealth multiplier plumbing", () => {
    it("spawns at the given maxHealth instead of the default", () => {
      const v = spawnPlayerVitals(150);
      expect(v.health).toBe(150);
    });

    it("regen caps at the given maxHealth, not the base constant", () => {
      const hurt = { health: 140, dead: false, sinceHitS: 999 };
      const healed = tickVitals(hurt, 999, 150);
      expect(healed.health).toBe(150);
    });

    it("respawns at the given maxHealth", () => {
      const dead = { health: 0, dead: true, sinceHitS: 0 };
      expect(respawnPlayer(dead, 150).health).toBe(150);
    });
  });
});
