/**
 * Nameplate theming + show/hide policy (E2.2) — pure domain, no DOM/three.js.
 * A subject (a streamed creature or a peer player) maps to a `NameplateFaction`
 * or a `CreatureDisposition` (E0.2's `CreatureRegistry.disposition`, plus the
 * live `tamed` flag on the creature's own entity — tamed always outranks wild
 * disposition, since a tamed wolf is no longer a threat). The billboard
 * adapter (src/spawn) turns `NameplateSpec.faction` into an actual `ui/theme`
 * color and mounts the label under the E0.1 billboard overlay; this module
 * only decides *what* to show and *whether* to show it.
 *
 * `shouldShowNameplate`/`shouldShowLifebar` are the testable extraction of
 * the show/hide policy: a global mode (always/on-hover/in-combat/off) gates
 * on top of five independent per-faction toggles — a faction toggled off
 * stays off in every mode, `off` mode hides everything regardless of toggles.
 */

import type { CreatureDisposition } from "../creatures/CreatureDefinition";

export type NameplateFaction = "friendly" | "neutral" | "hostile" | "tamed" | "player";

export const NAMEPLATE_MODES = ["always", "onHover", "inCombat", "off"] as const;
export type NameplateMode = (typeof NAMEPLATE_MODES)[number];

export interface NameplateSubject {
  readonly kind: "creature" | "player";
  /** Required when `kind === "creature"`; ignored for players. */
  readonly disposition?: CreatureDisposition;
  /** Creature only — a tamed creature always reads as the `tamed` faction. */
  readonly tamed?: boolean;
  readonly name: string;
}

export interface NameplateSpec {
  readonly faction: NameplateFaction;
  readonly text: string;
}

/** Per-faction show/hide toggles, independent of the global `mode`. */
export interface NameplateFactionToggles {
  readonly friendly: boolean;
  readonly neutral: boolean;
  readonly hostile: boolean;
  readonly tamed: boolean;
  readonly player: boolean;
}

export interface NameplatePolicy extends NameplateFactionToggles {
  readonly mode: NameplateMode;
}

export interface NameplateVisibilityContext {
  /** The player's crosshair/reach target is this subject. */
  readonly isHovered: boolean;
  /** The local player is currently in a combat encounter. */
  readonly inCombat: boolean;
}

/** Which faction a subject reads as — tamed overrides wild disposition. */
export function factionFor(subject: NameplateSubject): NameplateFaction {
  if (subject.kind === "player") return "player";
  if (subject.tamed) return "tamed";
  return subject.disposition ?? "neutral";
}

/** The themed label content for a subject — color resolution is adapter-owned. */
export function nameplateFor(subject: NameplateSubject): NameplateSpec {
  return { faction: factionFor(subject), text: subject.name };
}

function isFactionEnabled(toggles: NameplateFactionToggles, faction: NameplateFaction): boolean {
  switch (faction) {
    case "friendly":
      return toggles.friendly;
    case "neutral":
      return toggles.neutral;
    case "hostile":
      return toggles.hostile;
    case "tamed":
      return toggles.tamed;
    case "player":
      return toggles.player;
  }
}

/**
 * The show/hide predicate: `off` mode or a disabled faction always hides;
 * `always` shows every enabled faction; `onHover`/`inCombat` additionally
 * require the matching context flag.
 */
export function shouldShowNameplate(
  policy: NameplatePolicy,
  faction: NameplateFaction,
  context: NameplateVisibilityContext,
): boolean {
  if (policy.mode === "off") return false;
  if (!isFactionEnabled(policy, faction)) return false;
  if (policy.mode === "always") return true;
  if (policy.mode === "onHover") return context.isHovered;
  return context.inCombat; // mode === "inCombat"
}

/**
 * The overhead lifebar only appears alongside a visible nameplate, and only
 * while the subject is damaged — an undamaged creature's bar would just be a
 * redundant full-green rectangle under its name.
 */
export function shouldShowLifebar(nameplateVisible: boolean, healthFraction: number): boolean {
  return nameplateVisible && healthFraction < 1;
}
