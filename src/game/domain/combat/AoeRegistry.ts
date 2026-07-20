/**
 * The area-of-effect catalogue (E7.0 combat contracts) — one `AoeSpec` per
 * shared radius-damage resolver (E7.4), reused by thrown bombs (E7.2), spell
 * AoEs (E7.3), deployables (E7.5) and monster stomps (E7.6). Cozy stance:
 * `blockSafe` defaults every entry to leaving terrain untouched (plan §9).
 */

import { err, ok, type Result } from "../Result";

export interface AoeSpec {
  readonly id: string;
  /** Blast radius, m. */
  readonly radius: number;
  /** Damage scaling from center to edge — "none" = full damage everywhere
   *  inside the radius, "linear" = scales down to 0 at the edge. */
  readonly falloff: "none" | "linear";
  /** True = never digs/destroys terrain (the cozy default, plan §9). */
  readonly blockSafe: boolean;
  readonly vfx: string;
}

export type AoeError =
  | { readonly kind: "UnknownAoe"; readonly id: string }
  | { readonly kind: "DuplicateAoe"; readonly id: string };

export class AoeRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, AoeSpec>) {}

  static create(specs: readonly AoeSpec[]): Result<AoeRegistry, AoeError> {
    const byId = new Map<string, AoeSpec>();
    for (const s of specs) {
      if (byId.has(s.id)) return err({ kind: "DuplicateAoe", id: s.id });
      byId.set(s.id, s);
    }
    return ok(new AoeRegistry(byId));
  }

  get(id: string): Result<AoeSpec, AoeError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownAoe", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly AoeSpec[] {
    return [...this.byId.values()];
  }
}

/** Starter table — empty at E7.0; streams append in their own section
 *  (see `ProjectileRegistry.ts`'s doc comment for the append convention). */
export const STARTER_AOES: readonly AoeSpec[] = [
  // ---- E7.4 AoE / explosives (bombs, celebratory booms) ----
  // The one starter blast — a thrown bomb's boom (see starterItems.ts's
  // "bomb" item). blockSafe stays true (cozy default, plan §9); flipping it
  // is the deferred block-destroying-explosions follow-up, not this slice.
  { id: "bomb-boom", radius: 4, falloff: "linear", blockSafe: true, vfx: "vfx.boom.bomb" },
  // ---- E7.3 Spellcasting (Healing Bloom) ----
  // ---- E7.5 Deployables (traps/mines/grenades) ----
  { id: "grenade-boom", radius: 3.5, falloff: "linear", blockSafe: true, vfx: "vfx.boom.grenade" },
  { id: "mine-boom", radius: 3, falloff: "linear", blockSafe: true, vfx: "vfx.boom.mine" },
  // Cozy stance (plan §2 decision 2): the bumble-trap's "blast" is a gentle
  // snare/knock-up, not a damage spike — same shared falloff resolver, just
  // a smaller radius/low base damage on the item itself (starterItems.ts).
  { id: "bumble-trap-pop", radius: 2, falloff: "none", blockSafe: true, vfx: "vfx.boom.bumbletrap" },
  // ---- E7.6 Monster abilities (AoE stomp) ----
  // A bear's ground pound — a gentle-radius shockwave, block-safe like every
  // AoE default (cozy stance, plan §9), falls off so only a close player
  // takes the full hit.
  { id: "bear-stomp", radius: 3.5, falloff: "linear", blockSafe: true, vfx: "vfx.stomp.bear" },
];

export const AOE_REGISTRY: AoeRegistry = unwrap(AoeRegistry.create(STARTER_AOES));

function unwrap(result: Result<AoeRegistry, AoeError>): AoeRegistry {
  if (!result.ok) throw new Error(`bad starter aoe table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
