import { describe, expect, it } from "vitest";
import {
  findHit,
  spawnProjectile,
  stepProjectile,
  velocityDirection,
  type ProjectileState,
} from "./Projectile";

describe("spawnProjectile", () => {
  it("bakes origin + dir*speed into the initial state", () => {
    const s = spawnProjectile([1, 2, 3], [0, 0, 1], 40);
    expect(s).toEqual({ x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 40, ageMs: 0 });
  });
});

describe("stepProjectile", () => {
  it("integrates straight-line flight with zero gravity", () => {
    const s = spawnProjectile([0, 0, 0], [1, 0, 0], 10);
    const out = stepProjectile(s, { gravity: 0, lifetimeMs: 5000 }, 1000);
    expect(out.state.x).toBeCloseTo(10);
    expect(out.state.y).toBeCloseTo(0);
    expect(out.expired).toBe(false);
  });

  it("gravity curves the arc downward over time", () => {
    const s = spawnProjectile([0, 0, 0], [1, 0, 0], 10);
    const out = stepProjectile(s, { gravity: 10, lifetimeMs: 5000 }, 1000);
    expect(out.state.vy).toBeCloseTo(-10);
    expect(out.state.y).toBeLessThan(0);
  });

  it("accumulates ageMs and expires at the spec's lifetime", () => {
    const s = spawnProjectile([0, 0, 0], [0, 0, 1], 1);
    const out = stepProjectile(s, { gravity: 0, lifetimeMs: 1000 }, 1000);
    expect(out.state.ageMs).toBe(1000);
    expect(out.expired).toBe(true);
  });

  it("never regresses age on a negative/garbage dt", () => {
    const s = spawnProjectile([0, 0, 0], [0, 0, 1], 1);
    const out = stepProjectile(s, { gravity: 0, lifetimeMs: 1000 }, -50);
    expect(out.state.ageMs).toBe(0);
    expect(out.state.x).toBe(0);
  });
});

describe("findHit", () => {
  const state: ProjectileState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 1, ageMs: 0 };

  it("returns the overlapping target", () => {
    const hit = findHit(state, 0.2, [{ id: "c1", x: 0.3, y: 0, z: 0, radius: 0.5 }]);
    expect(hit?.id).toBe("c1");
  });

  it("returns null when nothing is in range", () => {
    const hit = findHit(state, 0.2, [{ id: "c1", x: 100, y: 0, z: 0, radius: 0.5 }]);
    expect(hit).toBeNull();
  });

  it("returns null against an empty target list", () => {
    expect(findHit(state, 0.2, [])).toBeNull();
  });
});

describe("velocityDirection", () => {
  it("normalizes a non-zero velocity", () => {
    const [x, y, z] = velocityDirection({ x: 0, y: 0, z: 0, vx: 3, vy: 4, vz: 0, ageMs: 0 });
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    expect(x).toBeCloseTo(0.6);
    expect(y).toBeCloseTo(0.8);
  });

  it("falls back to straight-down for a zero velocity (never NaN)", () => {
    const dir = velocityDirection({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ageMs: 0 });
    expect(dir).toEqual([0, -1, 0]);
  });
});
