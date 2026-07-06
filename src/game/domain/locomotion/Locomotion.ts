/**
 * Locomotion state machine (plan 6.2 [O]). Pure transition function over the
 * full state set; the [F] half maps states to AnimationMixer clips (one clip
 * set retargeted across skeletons via SkeletonUtils.retargetClip, research
 * §5). Guards: death is terminal; riding excludes ground-only states
 * (crouch/work/fight); movement interrupts work/fight.
 */

export const LOCOMOTION_STATES = [
  "idle",
  "run",
  "crouch",
  "strafe",
  "work",
  "fight",
  "die",
  "ride",
] as const;

export type LocomotionState = (typeof LOCOMOTION_STATES)[number];

export type LocomotionEvent =
  | { readonly kind: "move"; readonly gait: "run" | "crouch" | "strafe" }
  | { readonly kind: "stop" }
  | { readonly kind: "work" }
  | { readonly kind: "fight" }
  | { readonly kind: "done" }
  | { readonly kind: "mount" }
  | { readonly kind: "dismount" }
  | { readonly kind: "die" };

export function nextState(state: LocomotionState, event: LocomotionEvent): LocomotionState {
  if (state === "die") return "die";
  if (event.kind === "die") return "die";

  if (state === "ride") {
    // riding excludes ground actions; run/strafe gaits drive the MOUNT's
    // locomotion (the [F] adapter), not the rider's state
    return event.kind === "dismount" ? "idle" : "ride";
  }

  switch (event.kind) {
    case "move":
      return event.gait;
    case "stop":
      return "idle";
    case "work":
      return "work";
    case "fight":
      return "fight";
    case "done":
      return state === "work" || state === "fight" ? "idle" : state;
    case "mount":
      return "ride";
    case "dismount":
      return state;
  }
}
