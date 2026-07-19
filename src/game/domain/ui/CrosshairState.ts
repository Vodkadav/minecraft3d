/**
 * Pure crosshair reticle-state mapping (Workstream 3, task 3.7). The DOM
 * component only renders whatever state this function returns — no
 * targeting logic lives in the UI layer.
 *
 * Priority (highest first): explicit place-mode always wins (it has its own
 * ghost preview), then attack (combat is the most time-critical read), then
 * a generic interact target (harvest/feed/mount), then mine (a diggable
 * surface in reach), else the default reticle.
 */

export type CrosshairState = "default" | "interact" | "attack" | "mine" | "place";

export interface CrosshairInput {
  /** True while build/placement mode is active. */
  readonly placing: boolean;
  /** A live, attackable creature is within reach. */
  readonly hasAttackTarget: boolean;
  /** A harvestable node / tameable / mountable target is within reach. */
  readonly hasInteractTarget: boolean;
  /** A solid, diggable voxel surface is under the aim ray. */
  readonly hasMineTarget: boolean;
}

export function resolveCrosshairState(input: CrosshairInput): CrosshairState {
  if (input.placing) return "place";
  if (input.hasAttackTarget) return "attack";
  if (input.hasInteractTarget) return "interact";
  if (input.hasMineTarget) return "mine";
  return "default";
}
