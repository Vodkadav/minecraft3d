import { describe, expect, it } from "vitest";
import {
  spawnDeployable,
  stepDeployable,
  type DeployableInstance,
  type NearbyEntity,
} from "./Deployable";
import type { DeployableSpec } from "./DeployableRegistry";

function spec(overrides: Partial<DeployableSpec> = {}): DeployableSpec {
  return {
    id: "test-mine",
    trigger: "proximity",
    armDelayMs: 500,
    triggerRadius: 1.5,
    telegraphVfx: "vfx.telegraph.test",
    aoe: "test-boom",
    ...overrides,
  };
}

function nearby(overrides: Partial<NearbyEntity> = {}): NearbyEntity {
  return { id: "e1", x: 0, y: 0, z: 0, ...overrides };
}

describe("spawnDeployable", () => {
  it("starts arming at the given position with zero elapsed time", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 1, y: 2, z: 3 });
    expect(d).toEqual({
      id: "d:1",
      deployableId: "test-mine",
      ownerId: "alice",
      x: 1,
      y: 2,
      z: 3,
      state: "arming",
      elapsedMs: 0,
    });
  });
});

describe("stepDeployable — arming", () => {
  it("stays arming (accumulating elapsed time) before armDelayMs elapses", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ armDelayMs: 500 }), 200, []);
    expect(next.state).toBe("arming");
    expect(next.elapsedMs).toBe(200);
  });

  it("becomes armed once armDelayMs elapses with nothing nearby (proximity/stepped)", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ armDelayMs: 500 }), 500, []);
    expect(next.state).toBe("armed");
  });

  it("never regresses elapsed on a negative/garbage dt", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ armDelayMs: 500 }), -50, []);
    expect(next.elapsedMs).toBe(0);
    expect(next.state).toBe("arming");
  });
});

describe("stepDeployable — timed trigger (grenade)", () => {
  it("triggers automatically the instant the fuse (armDelayMs) elapses — no nearby entity needed", () => {
    const d = spawnDeployable("d:1", "grenade", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ trigger: "timed", armDelayMs: 1500 }), 1500, []);
    expect(next.state).toBe("triggered");
  });

  it("stays arming before the fuse elapses even with an entity standing on it", () => {
    const d = spawnDeployable("d:1", "grenade", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ trigger: "timed", armDelayMs: 1500 }), 1000, [nearby()]);
    expect(next.state).toBe("arming");
  });
});

describe("stepDeployable — proximity/stepped trigger", () => {
  const armedSpec = spec({ trigger: "proximity", armDelayMs: 0, triggerRadius: 1.5 });

  it("stays armed (not triggered) once armed with nobody in range", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, armedSpec, 0, [nearby({ x: 10, y: 0, z: 0 })]);
    expect(next.state).toBe("armed");
  });

  it("triggers once an entity comes within triggerRadius while armed", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const armed = stepDeployable(d, armedSpec, 0, []);
    expect(armed.state).toBe("armed");
    const triggered = stepDeployable(armed, armedSpec, 16, [nearby({ x: 1, y: 0, z: 0 })]);
    expect(triggered.state).toBe("triggered");
  });

  it("ignores an entity outside triggerRadius", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const armed = stepDeployable(d, armedSpec, 0, []);
    const stillArmed = stepDeployable(armed, armedSpec, 16, [nearby({ x: 5, y: 0, z: 0 })]);
    expect(stillArmed.state).toBe("armed");
  });

  it("never triggers while still arming, even inside the trigger radius", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const next = stepDeployable(d, spec({ armDelayMs: 500, triggerRadius: 1.5 }), 100, [
      nearby({ x: 0.1, y: 0, z: 0 }),
    ]);
    expect(next.state).toBe("arming");
  });

  it("checks 3D straight-line distance, not a flat 2D one", () => {
    const d = spawnDeployable("d:1", "test-mine", "alice", { x: 0, y: 0, z: 0 });
    const armed = stepDeployable(d, armedSpec, 0, []);
    // dx=1, dy=1 -> distance ~1.41, inside a 1.5 radius
    const triggered = stepDeployable(armed, armedSpec, 16, [nearby({ x: 1, y: 1, z: 0 })]);
    expect(triggered.state).toBe("triggered");
  });
});

describe("stepDeployable — terminal state", () => {
  it("a triggered deployable stays triggered (idempotent, no re-arming)", () => {
    const d: DeployableInstance = {
      id: "d:1",
      deployableId: "test-mine",
      ownerId: "alice",
      x: 0,
      y: 0,
      z: 0,
      state: "triggered",
      elapsedMs: 900,
    };
    const next = stepDeployable(d, spec(), 1000, [nearby()]);
    expect(next).toEqual(d);
  });
});
