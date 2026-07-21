// @vitest-environment happy-dom
import { PerspectiveCamera } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { FlyCamera, THIRD_PERSON_BACK_M, THIRD_PERSON_UP_M, type GroundProbe } from "./FlyCamera";

// exposes the private fields the vertical/grounded resolution actually
// mutates — walk-mode collision is what this file verifies, not the public
// pose API alone
type Internals = { basePos: { x: number; y: number; z: number }; grounded: boolean; vel: { x: number; z: number } };
function internals(fly: FlyCamera): Internals {
  return fly as unknown as Internals;
}

function makeFly(probe: GroundProbe): FlyCamera {
  const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
  const dom = document.createElement("canvas");
  const fly = new FlyCamera(camera, dom);
  fly.groundProbe = probe;
  fly.setMode("walk"); // needs groundProbe installed first (see FlyCamera.setMode)
  return fly;
}

/** hold KeyW (yaw=0 → FORWARD = -z) for `frames` updates of `dt` each. */
function walkForward(fly: FlyCamera, dt: number, frames: number): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  for (let i = 0; i < frames; i++) fly.update(dt);
}

describe("FlyCamera walk-mode ground collision", () => {
  // Engine.ts caps dt at 0.1s (10fps floor) — this is the "low framerate,
  // big per-frame step" case the slope-flicker bug report describes.
  const BIG_DT = 0.1;

  beforeEach(() => {
    // fresh key state between tests — FlyCamera reads a shared `keydown`
    // listener on window and never sees a matching keyup in these tests
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
  });

  it("stays grounded with a monotonically-rising eye Y walking up a constant slope at a big dt", () => {
    // gentle uphill grade (rise 0.5 per m forward) — well clear of
    // MAX_STEP_UP so this case is purely about vertical ground-stick, not
    // the horizontal wall block
    const probe: GroundProbe = (_x, z) => ({ ground: -0.5 * z, water: -1000 });
    const fly = makeFly(probe);
    const eyeHeight = fly.getPose().p[1]; // ground(0,0)=0 → this is EYE_HEIGHT

    let prevY = fly.getPose().p[1];
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    for (let i = 0; i < 40; i++) {
      fly.update(BIG_DT);
      const pose = fly.getPose();
      const expectedFloor = probe(pose.p[0], pose.p[2]).ground + eyeHeight;
      expect(internals(fly).grounded).toBe(true);
      expect(pose.p[1]).toBeCloseTo(expectedFloor, 5); // snapped exactly onto the slope
      expect(pose.p[1]).toBeGreaterThanOrEqual(prevY - 1e-6); // monotonic non-decreasing
      prevY = pose.p[1];
    }
  });

  it("stays grounded with a monotonically-falling eye Y walking down a steep slope whose per-frame drop exceeds the OLD 0.55m stick range", () => {
    // steep downhill grade (0.9 drop per m forward): at BIG_DT the per-frame
    // drop (~0.3-0.4m at steady walk speed) would have popped the eye
    // micro-airborne under the old 0.55m STEP_DOWN once dt/step grew — this
    // proves the widened stick range keeps it glued to the slope instead
    const probe: GroundProbe = (_x, z) => ({ ground: 0.9 * z, water: -1000 });
    const fly = makeFly(probe);
    const eyeHeight = fly.getPose().p[1];

    let prevY = fly.getPose().p[1];
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    for (let i = 0; i < 40; i++) {
      fly.update(BIG_DT);
      const pose = fly.getPose();
      const expectedFloor = probe(pose.p[0], pose.p[2]).ground + eyeHeight;
      expect(internals(fly).grounded).toBe(true);
      expect(pose.p[1]).toBeCloseTo(expectedFloor, 5);
      expect(pose.p[1]).toBeLessThanOrEqual(prevY + 1e-6); // monotonic non-increasing
      prevY = pose.p[1];
    }
  });

  it("blocks horizontal advance into a step taller than MAX_STEP_UP", () => {
    // flat ground for z > -3, then a 1.0m rise (> the 0.6m MAX_STEP_UP) —
    // a wall/cliff, not a climbable step
    const probe: GroundProbe = (_x, z) => ({ ground: z <= -3 ? 1.0 : 0, water: -1000 });
    const fly = makeFly(probe);

    walkForward(fly, BIG_DT, 60); // far more travel than the 3m to the wall, if unblocked

    expect(internals(fly).basePos.z).toBeGreaterThan(-3); // never crossed the wall
    expect(internals(fly).vel.z).toBeCloseTo(0, 5); // horizontal velocity canceled at the wall
  });

  it("does not block horizontal advance into a step shorter than MAX_STEP_UP", () => {
    // same wall position, but only a 0.3m rise (< 0.6m) — a climbable step
    const probe: GroundProbe = (_x, z) => ({ ground: z <= -3 ? 0.3 : 0, water: -1000 });
    const fly = makeFly(probe);

    walkForward(fly, BIG_DT, 60);

    expect(internals(fly).basePos.z).toBeLessThan(-3); // walked past/up the step
  });
});

describe("FlyCamera third-person offset (?camera=ots MVP)", () => {
  const FLAT: GroundProbe = () => ({ ground: 0, water: -1000 });

  it("thirdPerson=false (default) keeps the camera at the logical eye — unchanged from before this existed", () => {
    const fly = makeFly(FLAT);
    fly.update(0.016);
    const pose = fly.getPose();
    expect(fly.camera.position.x).toBeCloseTo(pose.p[0], 5);
    expect(fly.camera.position.y).toBeCloseTo(pose.p[1], 5);
    expect(fly.camera.position.z).toBeCloseTo(pose.p[2], 5);
  });

  it("thirdPerson=true offsets the camera back + up from the logical eye at yaw=0", () => {
    const fly = makeFly(FLAT);
    fly.thirdPerson = true;
    fly.update(0.016);
    const pose = fly.getPose(); // logical pose — strips the offset (unaffected by thirdPerson)
    // yaw=0 ⇒ facing -Z, so "back" is +Z
    expect(fly.camera.position.x).toBeCloseTo(pose.p[0], 5);
    expect(fly.camera.position.z).toBeCloseTo(pose.p[2] + THIRD_PERSON_BACK_M, 5);
    expect(fly.camera.position.y).toBeCloseTo(pose.p[1] + THIRD_PERSON_UP_M, 5);
  });

  it("thirdPerson=true offsets along the current facing direction at a non-zero yaw", () => {
    const fly = makeFly(FLAT);
    fly.yaw = Math.PI / 2; // facing -X
    fly.thirdPerson = true;
    fly.update(0.016);
    const pose = fly.getPose();
    expect(fly.camera.position.x).toBeCloseTo(pose.p[0] + THIRD_PERSON_BACK_M, 4);
    expect(fly.camera.position.z).toBeCloseTo(pose.p[2], 4);
    expect(fly.camera.position.y).toBeCloseTo(pose.p[1] + THIRD_PERSON_UP_M, 5);
  });

  it("fly mode never applies the offset even when thirdPerson is true", () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    const dom = document.createElement("canvas");
    const fly = new FlyCamera(camera, dom); // stays in default 'fly' mode
    fly.thirdPerson = true;
    fly.update(0.016);
    expect(fly.camera.position.y).toBeCloseTo(0, 5); // no walk-mode ground clamp pushed it up either
  });
});
