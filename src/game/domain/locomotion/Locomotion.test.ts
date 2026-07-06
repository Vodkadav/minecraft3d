/**
 * M6.2 locomotion state machine: the full state set with guarded
 * transitions — death is terminal, riding excludes ground states, work/fight
 * are interruptible. The AnimationMixer wiring is thin [F] glue; the state
 * logic is exact here.
 */
import { describe, expect, it } from "vitest";
import { LOCOMOTION_STATES, nextState, type LocomotionState } from "./Locomotion";

describe("state set", () => {
  it("contains the plan's full locomotion set", () => {
    for (const s of ["idle", "run", "crouch", "strafe", "work", "fight", "die", "ride"]) {
      expect(LOCOMOTION_STATES).toContain(s as LocomotionState);
    }
  });
});

describe("ground movement", () => {
  it("moves between idle/run/crouch/strafe freely", () => {
    expect(nextState("idle", { kind: "move", gait: "run" })).toBe("run");
    expect(nextState("run", { kind: "move", gait: "strafe" })).toBe("strafe");
    expect(nextState("strafe", { kind: "move", gait: "crouch" })).toBe("crouch");
    expect(nextState("crouch", { kind: "stop" })).toBe("idle");
  });
});

describe("actions", () => {
  it("starts work/fight from any ground state and returns to idle when done", () => {
    expect(nextState("run", { kind: "work" })).toBe("work");
    expect(nextState("work", { kind: "done" })).toBe("idle");
    expect(nextState("idle", { kind: "fight" })).toBe("fight");
    expect(nextState("fight", { kind: "done" })).toBe("idle");
  });

  it("movement interrupts work and fight", () => {
    expect(nextState("work", { kind: "move", gait: "run" })).toBe("run");
    expect(nextState("fight", { kind: "move", gait: "run" })).toBe("run");
  });
});

describe("riding", () => {
  it("mounts from ground states and dismounts to idle", () => {
    expect(nextState("idle", { kind: "mount" })).toBe("ride");
    expect(nextState("ride", { kind: "dismount" })).toBe("idle");
  });

  it("cannot work, fight, or crouch while riding", () => {
    expect(nextState("ride", { kind: "work" })).toBe("ride");
    expect(nextState("ride", { kind: "fight" })).toBe("ride");
    expect(nextState("ride", { kind: "move", gait: "crouch" })).toBe("ride");
  });
});

describe("death", () => {
  it("is reachable from every state and terminal", () => {
    for (const s of LOCOMOTION_STATES) {
      if (s === "die") continue;
      expect(nextState(s, { kind: "die" })).toBe("die");
    }
    expect(nextState("die", { kind: "move", gait: "run" })).toBe("die");
    expect(nextState("die", { kind: "mount" })).toBe("die");
    expect(nextState("die", { kind: "done" })).toBe("die");
  });
});
