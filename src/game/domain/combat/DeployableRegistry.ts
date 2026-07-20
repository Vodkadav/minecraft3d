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
];

export const DEPLOYABLE_REGISTRY: DeployableRegistry = unwrap(
  DeployableRegistry.create(STARTER_DEPLOYABLES),
);

function unwrap(result: Result<DeployableRegistry, DeployableError>): DeployableRegistry {
  if (!result.ok) throw new Error(`bad starter deployable table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
