/**
 * Cosmetic projectile tracer + object pool (E7.2 ranged + ammo, ADR 0004
 * §3). The HOST owns the whole simulation (`HostSession.tick`, pure domain
 * math in `domain/combat/Projectile.ts`) — this module never computes a
 * position, a hit, or a damage number. It only mirrors whatever the host
 * streams (`ProjectileEntity[]`, the same `projectiles` message both a host's
 * own client and every joiner consume — see `HostSessionHooks.onProjectilesSnapshot`
 * / `JoinSessionHooks.onProjectiles`), same reconcile-a-pool shape as
 * `GroundItemField.ts`/`SpawnFieldView.ts`'s streamed sets.
 *
 * Kept intentionally simple/cozy: a small tinted cone per active shot,
 * oriented along its streamed flight direction, snapped to the streamed
 * position each snapshot (arrows/pebbles/darts are fast enough at cozy
 * ranges that a raw per-tick snap reads fine — no interpolation needed).
 */

import {
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from "three";
import type { ProjectileEntity } from "../game/domain/net/Protocol";

/** Cozy dart/arrow-ish tracer shape — a short tapered cone, not a realistic
 *  fletched arrow model (no assets, matches the rest of the placeholder
 *  primitive art direction). */
const TRACER_RADIUS = 0.07;
const TRACER_LENGTH = 0.45;

export interface ProjectileFieldDeps {
  readonly parent: Object3D;
}

export interface ProjectileFieldHandle {
  /** Reconcile the pool against the host's full active set (add/move/remove
   *  — same full-set-stream contract as `SpawnFieldView.applySnapshot`). */
  applySnapshot(entities: readonly ProjectileEntity[]): void;
  dispose(): void;
  readonly activeCount: number;
}

export function attachProjectileField(deps: ProjectileFieldDeps): ProjectileFieldHandle {
  const group = new Group();
  deps.parent.add(group);
  const geometry = new ConeGeometry(TRACER_RADIUS, TRACER_LENGTH, 6);
  const material = new MeshStandardMaterial({
    color: 0xf2c94c,
    roughness: 0.45,
    metalness: 0.1,
    emissive: 0x3a2a00,
  });

  const pool = new Map<string, Mesh>();
  // Reused scratch vectors — avoids an allocation per tracer per snapshot.
  const dirVec = new Vector3();
  const upVec = new Vector3(0, 1, 0);

  function makeObj(id: string): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = id;
    group.add(mesh);
    return mesh;
  }

  function orient(mesh: Mesh, e: ProjectileEntity): void {
    dirVec.set(e.dirX, e.dirY, e.dirZ);
    if (dirVec.lengthSq() < 1e-6) return; // degenerate/zero dir — keep last orientation
    dirVec.normalize();
    mesh.quaternion.setFromUnitVectors(upVec, dirVec);
  }

  return {
    applySnapshot(entities: readonly ProjectileEntity[]): void {
      const live = new Set(entities.map((e) => e.id));
      for (const id of [...pool.keys()]) {
        if (live.has(id)) continue;
        const mesh = pool.get(id);
        if (mesh) group.remove(mesh);
        pool.delete(id);
      }
      for (const e of entities) {
        let mesh = pool.get(e.id);
        if (!mesh) {
          mesh = makeObj(e.id);
          pool.set(e.id, mesh);
        }
        mesh.position.set(e.x, e.y, e.z);
        orient(mesh, e);
      }
    },

    dispose(): void {
      for (const mesh of pool.values()) group.remove(mesh);
      pool.clear();
      deps.parent.remove(group);
      geometry.dispose();
      material.dispose();
    },

    get activeCount(): number {
      return pool.size;
    },
  };
}
