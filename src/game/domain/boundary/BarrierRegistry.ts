/**
 * The barrier model registry: a lookup of barrier *definitions* keyed by id.
 * Domain is renderer-free, so a definition carries only ids + metadata (an
 * `assetKey` the render layer resolves to an actual mesh) — never a three.js
 * object. The visible barrier is swapped by changing a single registry entry's
 * `assetKey`; nothing in the boundary math changes.
 */

import { err, ok, type Result } from "../Result";

export interface BarrierModelDef {
  readonly id: string;
  readonly displayName: string;
  /** Opaque key the render layer maps to a concrete mesh/material. */
  readonly assetKey: string;
}

export type BarrierRegistry = Map<string, BarrierModelDef>;

export type BarrierError = {
  readonly kind: "UnknownBarrierModel";
  readonly id: string;
};

export function createBarrierRegistry(
  defs: readonly BarrierModelDef[],
): BarrierRegistry {
  return new Map(defs.map((d) => [d.id, d]));
}

export function resolveBarrierModel(
  registry: BarrierRegistry,
  id: string,
): Result<BarrierModelDef, BarrierError> {
  const found = registry.get(id);
  if (!found) return err({ kind: "UnknownBarrierModel", id });
  return ok(found);
}
