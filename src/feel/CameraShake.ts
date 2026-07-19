/**
 * Camera shake + hit-stop FOV punch (Workstream 2.2/2.3) — an ADDITIVE offset
 * layered onto the camera AFTER FlyCamera's own onUpdate (registration order:
 * this must be wired after `engine.onUpdate((dt) => fly.update(dt))`, which
 * TerrainScene's own onUpdate calls always are since it runs after main.ts
 * registers fly). FlyCamera fully RECOMPUTES `camera.position`/`fov` from its
 * own logical state every frame (see FlyCamera.updateWalk/updateFly) rather
 * than accumulating onto the previous frame's value, so this offset never
 * compounds across frames and is implicitly "removed" the instant the next
 * frame's fly.update() runs — nothing here mutates FlyCamera's `basePos`, so
 * `getPose()` (which walk-mode reads from `basePos`, untouched by shake) can
 * never leak a shaken pose into a saved pose. Fly/tooling mode's `getPose()`
 * does read `camera.position` directly and could observe shake at that
 * instant — acceptable because shake only fires from real gameplay (combat/
 * dig/harvest), which always runs in walk mode (see TerrainScene).
 *
 * prefers-reduced-motion / the settings reducedMotion flag ⇒ magnitude 0.
 */

import type { PerspectiveCamera } from "three";

const MAX_SHAKE_OFFSET_M = 0.32;
const MAX_FOV_PUNCH_DEG = 4;

export interface CameraShakeDeps {
  readonly camera: PerspectiveCamera;
  /** 0..1 shake magnitude for this frame (FeelDirector.shakeMagnitude()). */
  getShakeMagnitude(): number;
  /** Whether a hit-stop window is currently active (drives the FOV punch). */
  getHitStopActive(): boolean;
  reducedMotion(): boolean;
}

/** Call once per frame (register AFTER fly.update in the update-fn order). */
export function stepCameraShake(deps: CameraShakeDeps): void {
  if (deps.reducedMotion()) return;
  const mag = deps.getShakeMagnitude();
  if (mag <= 0 && !deps.getHitStopActive()) return;
  const { camera } = deps;
  if (mag > 0) {
    const amp = MAX_SHAKE_OFFSET_M * mag;
    camera.position.x += (Math.random() * 2 - 1) * amp;
    camera.position.y += (Math.random() * 2 - 1) * amp * 0.6;
    camera.position.z += (Math.random() * 2 - 1) * amp * 0.3;
    camera.updateMatrixWorld();
  }
  if (deps.getHitStopActive()) {
    camera.fov += MAX_FOV_PUNCH_DEG;
    camera.updateProjectionMatrix();
  }
}
