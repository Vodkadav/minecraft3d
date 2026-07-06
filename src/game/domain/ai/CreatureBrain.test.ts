/**
 * M6.3 creature AI decision core: temperament-driven behavior from player
 * distance and health, deterministic wander waypoints, and steering that
 * points the right way. The engine adapter only integrates velocities.
 */
import { describe, expect, it } from "vitest";
import {
  decideBehavior,
  steer,
  TEMPERAMENT,
  wanderWaypoint,
} from "./CreatureBrain";

describe("temperament registry", () => {
  it("covers every creature species in the spawn registry", async () => {
    const { SPAWN_SPECIES } = await import("../spawn/SpawnField");
    for (const sp of SPAWN_SPECIES.filter((s) => s.kind === "creature")) {
      expect(TEMPERAMENT[sp.id], `temperament for ${sp.id}`).toBeDefined();
    }
  });
});

describe("decideBehavior", () => {
  it("timid deer flees a close player and roams otherwise", () => {
    expect(decideBehavior("deer", 5, 1)).toBe("flee");
    expect(decideBehavior("deer", 100, 1)).toBe("roam");
  });

  it("aggressive wolf charges a close player, roams beyond aggro range", () => {
    expect(decideBehavior("wolf", 5, 1)).toBe("aggro");
    expect(decideBehavior("wolf", 100, 1)).toBe("roam");
  });

  it("a wounded aggressive creature flees instead of charging", () => {
    expect(decideBehavior("wolf", 5, 0.2)).toBe("flee");
  });

  it("unknown species just roams", () => {
    expect(decideBehavior("slime", 5, 1)).toBe("roam");
  });
});

describe("steer", () => {
  it("flee points away from the player", () => {
    const v = steer("flee", [0, 0], [10, 0], [0, 0]);
    expect(v[0]).toBeLessThan(0);
  });

  it("aggro points toward the player", () => {
    const v = steer("aggro", [0, 0], [10, 0], [0, 0]);
    expect(v[0]).toBeGreaterThan(0);
  });

  it("roam points toward the wander waypoint", () => {
    const v = steer("roam", [0, 0], [500, 500], [0, 10]);
    expect(v[1]).toBeGreaterThan(0);
    expect(Math.abs(v[0])).toBeLessThan(0.001);
  });

  it("idle is stationary; arrival at the waypoint is stationary", () => {
    expect(steer("idle", [0, 0], [10, 0], [5, 5])).toEqual([0, 0]);
    expect(steer("roam", [5, 5], [100, 0], [5, 5])).toEqual([0, 0]);
  });

  it("flee is faster than roam", () => {
    const flee = steer("flee", [0, 0], [10, 0], [0, 0]);
    const roam = steer("roam", [0, 0], [100, 100], [10, 0]);
    expect(Math.hypot(...flee)).toBeGreaterThan(Math.hypot(...roam));
  });
});

describe("tamed follow", () => {
  it("tamed creatures follow: toward the player, stopping close", () => {
    expect(decideBehavior("deer", 50, 1, true)).toBe("follow");
    expect(decideBehavior("wolf", 5, 1, true)).toBe("follow"); // never aggro once tamed
    const v = steer("follow", [0, 0], [20, 0], [0, 0]);
    expect(v[0]).toBeGreaterThan(0);
    expect(steer("follow", [18, 0], [20, 0], [0, 0])).toEqual([0, 0]); // heel distance
  });
});

describe("wanderWaypoint", () => {
  it("is deterministic per (id, anchor, epoch)", () => {
    expect(wanderWaypoint("spawn:1:0:0:0:0", [50, 50], 3)).toEqual(
      wanderWaypoint("spawn:1:0:0:0:0", [50, 50], 3),
    );
  });

  it("changes across epochs and stays near the anchor", () => {
    const a = wanderWaypoint("spawn:1:0:0:0:0", [50, 50], 1);
    const b = wanderWaypoint("spawn:1:0:0:0:0", [50, 50], 2);
    expect(a).not.toEqual(b);
    for (const w of [a, b]) {
      expect(Math.hypot(w[0] - 50, w[1] - 50)).toBeLessThanOrEqual(20);
    }
  });
});
