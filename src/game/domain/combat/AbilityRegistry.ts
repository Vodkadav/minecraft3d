/**
 * The spell catalogue (E7.0 combat contracts) — cozy-whimsical abilities
 * (Sparkle Bolt / Frost Puff / Healing Bloom / Vine Snare, E7.3), cast via
 * the `castSpell` intent and gated by the "focus" resource. `projectile`/
 * `aoe` point at `ProjectileRegistry`/`AoeRegistry` entries so a spell reuses
 * the same host-simulated shot/blast every other source does.
 */

import type { DamageType } from "../items/ItemDefinition";
import { err, ok, type Result } from "../Result";

/** How the spell is aimed: a fired shot, a short forward cone, a target
 *  ground point, or centered on the caster. */
export type AbilityTargeting = "projectile" | "cone" | "groundTarget" | "selfAoe";

export interface AbilitySpec {
  readonly id: string;
  readonly displayName: string;
  readonly targeting: AbilityTargeting;
  /** "focus" cost to cast. */
  readonly resourceCost: number;
  readonly cooldownMs: number;
  /** Present iff the spell deals damage. */
  readonly damage?: number;
  /** Present iff the spell heals (Healing Bloom). */
  readonly healing?: number;
  /** ProjectileRegistry id ("projectile" targeting only). */
  readonly projectile?: string;
  /** AoeRegistry id (cone/groundTarget/selfAoe spells). */
  readonly aoe?: string;
  readonly damageType: DamageType;
  /** FeelEventId to fire on cast/hit — kept a plain string, see
   *  `ItemDefinition.WeaponMetadata.feelEvent` for why. */
  readonly feelEvent: string;
}

export type AbilityError =
  | { readonly kind: "UnknownAbility"; readonly id: string }
  | { readonly kind: "DuplicateAbility"; readonly id: string };

export class AbilityRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, AbilitySpec>) {}

  static create(specs: readonly AbilitySpec[]): Result<AbilityRegistry, AbilityError> {
    const byId = new Map<string, AbilitySpec>();
    for (const s of specs) {
      if (byId.has(s.id)) return err({ kind: "DuplicateAbility", id: s.id });
      byId.set(s.id, s);
    }
    return ok(new AbilityRegistry(byId));
  }

  get(id: string): Result<AbilitySpec, AbilityError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownAbility", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly AbilitySpec[] {
    return [...this.byId.values()];
  }
}

/** Starter table — empty at E7.0; streams append in their own section
 *  (see `ProjectileRegistry.ts`'s doc comment for the append convention). */
export const STARTER_ABILITIES: readonly AbilitySpec[] = [
  // ---- E7.3 Spellcasting (Sparkle Bolt, Frost Puff, Healing Bloom, Vine Snare) ----
];

export const ABILITY_REGISTRY: AbilityRegistry = unwrap(AbilityRegistry.create(STARTER_ABILITIES));

function unwrap(result: Result<AbilityRegistry, AbilityError>): AbilityRegistry {
  if (!result.ok) throw new Error(`bad starter ability table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
