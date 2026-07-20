/**
 * The deployable catalogue (E7.0 combat contracts) — mines/traps/grenades
 * (E7.5), each an arm/trigger state machine driven by one `DeployableSpec`.
 * `aoe` points at an `AoeRegistry` entry (the shared radius-damage resolver,
 * E7.4) so a trigger always resolves through the same falloff/block-safe
 * logic as every other AoE source.
 */

import { err, ok, type Result } from "../Result";

export type DeployableTrigger = "timed" | "proximity" | "stepped";

export interface DeployableSpec {
  readonly id: string;
  readonly trigger: DeployableTrigger;
  /** Ms before the deployable becomes live after placement (safety window
   *  for the thrower, and the telegraph read-time for everyone else). */
  readonly armDelayMs: number;
  /** Trigger radius, m ("proximity"/"stepped" only; ignored for "timed"). */
  readonly triggerRadius: number;
  readonly telegraphVfx: string;
  /** AoeRegistry id resolved on trigger. */
  readonly aoe: string;
}

export type DeployableError =
  | { readonly kind: "UnknownDeployable"; readonly id: string }
  | { readonly kind: "DuplicateDeployable"; readonly id: string };

export class DeployableRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, DeployableSpec>) {}

  static create(specs: readonly DeployableSpec[]): Result<DeployableRegistry, DeployableError> {
    const byId = new Map<string, DeployableSpec>();
    for (const s of specs) {
      if (byId.has(s.id)) return err({ kind: "DuplicateDeployable", id: s.id });
      byId.set(s.id, s);
    }
    return ok(new DeployableRegistry(byId));
  }

  get(id: string): Result<DeployableSpec, DeployableError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownDeployable", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly DeployableSpec[] {
    return [...this.byId.values()];
  }
}

/** Starter table — empty at E7.0; streams append in their own section
 *  (see `ProjectileRegistry.ts`'s doc comment for the append convention). */
export const STARTER_DEPLOYABLES: readonly DeployableSpec[] = [
  // ---- E7.5 Deployables (timed grenade, proximity mine, stepped bumble-trap) ----
  // Ids double as the corresponding STARTER_ITEMS id (the thing you throw/place
  // IS the thing debited from inventory — same "no separate ammo id" shape as
  // the E7.4 "bomb" thrown weapon). `HostSession.handleDeployItem` resolves
  // damage/damageType/feelEvent for the SAME id through `WEAPON_REGISTRY`
  // (each item's `combat.kind === "deployable"` block).
  //
  // A short fuse after the throw — armDelayMs IS the fuse: the instant it
  // elapses the grenade triggers on its own (Deployable.ts "timed" trigger),
  // no nearby entity required.
  {
    id: "grenade",
    trigger: "timed",
    armDelayMs: 1500,
    triggerRadius: 0,
    telegraphVfx: "vfx.telegraph.grenade",
    aoe: "grenade-boom",
  },
  // A safety arm window (so the placer can back away) then a proximity
  // trigger radius wide enough to catch anyone who wanders up to it.
  {
    id: "proximity-mine",
    trigger: "proximity",
    armDelayMs: 800,
    triggerRadius: 2,
    telegraphVfx: "vfx.telegraph.mine",
    aoe: "mine-boom",
  },
  // The cozy "bumble-trap": a quick arm, a tight step-on-it trigger radius,
  // and a gentle snare/knock-up blast (see its AoeRegistry entry) rather
  // than a damage spike — bright/telegraphed per the cozy charter, never a
  // gotcha (plan §2 decision 2 / ADR 0004 §4).
  {
    id: "bumble-trap",
    trigger: "stepped",
    armDelayMs: 400,
    triggerRadius: 1.2,
    telegraphVfx: "vfx.telegraph.bumbletrap",
    aoe: "bumble-trap-pop",
  },
];

export const DEPLOYABLE_REGISTRY: DeployableRegistry = unwrap(
  DeployableRegistry.create(STARTER_DEPLOYABLES),
);

function unwrap(result: Result<DeployableRegistry, DeployableError>): DeployableRegistry {
  if (!result.ok) throw new Error(`bad starter deployable table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
