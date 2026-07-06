/**
 * Spawn-field engine adapter (plans 5.4 + 6.3/6.6 [F]) — the composition
 * entry the scenes wire in. Drives the pure proximity step (SpawnProximity)
 * around the player, materializes placeholder primitives per species
 * (SPECIES_VISUAL; real models are M6.1), and animates creatures with the
 * pure brain (CreatureBrain: roam/flee/aggro + deterministic wander).
 *
 * Interactions (while pointer-locked): F attacks the nearest creature in
 * reach (combat domain — health, single death event, deterministic loot),
 * E harvests the nearest node (NODE_YIELD). Removed ids and collected loot
 * persist through the `save` seam (the world save's entities bag):
 * entities['spawn.removed'] / entities['spawn.loot'].
 *
 * The proximity step scans a ~13-cell window of hashes — cheap, but not
 * per-frame: it runs on spawn-cell crossings and a coarse timer. Creature
 * steering IS per-frame (it's a handful of active creatures).
 */

import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from "three";
import {
  NODE_YIELD,
  worldToSpawnCell,
  type SpawnEntity,
} from "../game/domain/spawn/SpawnField";
import { stepSpawns } from "../game/domain/spawn/SpawnProximity";
import {
  decideBehavior,
  steer,
  wanderWaypoint,
} from "../game/domain/ai/CreatureBrain";
import {
  applyDamage,
  CREATURE_STATS,
  lootFor,
  spawnCombatState,
  type CombatState,
} from "../game/domain/combat/Combat";
import { hashUnitFloat } from "../game/domain/rng/hash";
import type { ItemStack } from "../game/domain/inventory/Inventory";
import { nearestWithin, SPECIES_VISUAL, validGround, type SpawnGround } from "./SpawnPlacement";

/** Seconds between proximity re-steps when no cell is crossed. */
const STEP_INTERVAL_S = 1.0;
/** Interaction reach (m) for attack/harvest. */
const REACH_M = 3.5;
/** Player hit damage per attack press (tools/weapons arrive later). */
const ATTACK_DAMAGE = 10;
/** Wander waypoints change every this many ms. */
const WANDER_EPOCH_MS = 8000;

export interface SpawnSave {
  entity(key: string): unknown;
  setEntity(key: string, value: unknown): void;
}

export interface SpawnFieldDeps {
  readonly seed: number;
  readonly ground: SpawnGround;
  readonly parent: Object3D;
  getPlayerXZ(): readonly [number, number];
  /** The M4 animal-density slider, 0..1. */
  readonly density: number;
  /** Pointer-lock target — interactions only fire while locked. */
  readonly dom?: HTMLElement;
  /** World-save entities seam (removed ids + loot persistence). */
  readonly save?: SpawnSave;
  /** Called with the stacks gained from a kill/harvest (HUD hook). */
  onLoot?(stacks: readonly ItemStack[]): void;
}

export interface SpawnFieldHandle {
  update(dt: number): void;
  dispose(): void;
  readonly activeCount: number;
}

interface CreatureEntry {
  readonly entity: SpawnEntity;
  readonly mesh: Mesh;
  readonly anchor: readonly [number, number];
  combat: CombatState;
}

export function attachSpawnField(deps: SpawnFieldDeps): SpawnFieldHandle {
  const group = new Group();
  deps.parent.add(group);

  const geometries = new Map<string, BufferGeometry>();
  const materials = new Map<string, MeshStandardMaterial>();
  for (const [species, v] of Object.entries(SPECIES_VISUAL)) {
    geometries.set(
      species,
      v.shape === "box"
        ? new BoxGeometry(v.size, v.size, v.size)
        : v.shape === "sphere"
          ? new SphereGeometry(v.size / 2, 12, 8)
          : new ConeGeometry(v.size / 2, v.size, 10),
    );
    materials.set(species, new MeshStandardMaterial({ color: v.color, roughness: 0.85 }));
  }

  const nodes = new Map<string, { entity: SpawnEntity; mesh: Mesh }>();
  const creatures = new Map<string, CreatureEntry>();
  const removed = new Set<string>(
    Array.isArray(deps.save?.entity("spawn.removed"))
      ? (deps.save.entity("spawn.removed") as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  );
  let lastCx: number | null = null;
  let lastCz: number | null = null;
  let sinceStep = Infinity; // first update always steps
  let clockMs = 0;

  const locked = (): boolean =>
    deps.dom === undefined || document.pointerLockElement === deps.dom;

  function materialize(s: SpawnEntity): void {
    const [x, , z] = s.position;
    if (!validGround(deps.ground, x, z)) return;
    const v = SPECIES_VISUAL[s.species];
    if (!v) return;
    const mesh = new Mesh(geometries.get(s.species), materials.get(s.species));
    mesh.position.set(x, deps.ground.heightAt(x, z) + v.lift, z);
    mesh.castShadow = true;
    mesh.name = s.id;
    group.add(mesh);
    if (s.kind === "creature") {
      creatures.set(s.id, { entity: s, mesh, anchor: [x, z], combat: spawnCombatState(s.species) });
    } else {
      nodes.set(s.id, { entity: s, mesh });
    }
  }

  function remove(id: string): void {
    const entry = creatures.get(id) ?? nodes.get(id);
    if (!entry) return;
    group.remove(entry.mesh);
    creatures.delete(id);
    nodes.delete(id);
  }

  function persistRemoved(id: string): void {
    removed.add(id);
    deps.save?.setEntity("spawn.removed", [...removed]);
  }

  function grantLoot(stacks: readonly ItemStack[]): void {
    if (deps.save) {
      const prior = deps.save.entity("spawn.loot");
      const merged = new Map<string, number>();
      if (Array.isArray(prior)) {
        for (const s of prior as ItemStack[]) {
          if (typeof s?.itemId === "string" && typeof s?.count === "number") {
            merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.count);
          }
        }
      }
      for (const s of stacks) merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.count);
      deps.save.setEntity(
        "spawn.loot",
        [...merged.entries()].map(([itemId, count]) => ({ itemId, count })),
      );
    }
    deps.onLoot?.(stacks);
  }

  function pickTarget<E extends { entity: SpawnEntity; mesh: Mesh }>(
    pool: ReadonlyMap<string, E>,
  ): E | null {
    const [px, pz] = deps.getPlayerXZ();
    const flat = [...pool.values()].map((e) => ({
      x: e.mesh.position.x,
      z: e.mesh.position.z,
      e,
    }));
    return nearestWithin(flat, px, pz, REACH_M)?.e ?? null;
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!locked()) return;
    if (ev.code === "KeyF") {
      const target = pickTarget(creatures);
      if (!target) return;
      const r = applyDamage(target.combat, ATTACK_DAMAGE);
      target.combat = r.state;
      if (r.died) {
        const roll = hashUnitFloat(deps.seed, clockMs | 0, 0x6f00);
        grantLoot(lootFor(target.entity.species, roll));
        remove(target.entity.id);
        persistRemoved(target.entity.id);
      }
    } else if (ev.code === "KeyE") {
      const target = pickTarget(nodes);
      if (!target) return;
      grantLoot(NODE_YIELD[target.entity.species] ?? []);
      remove(target.entity.id);
      persistRemoved(target.entity.id);
    }
  };
  window.addEventListener("keydown", onKeyDown);

  function stepCreatures(dt: number): void {
    const [px, pz] = deps.getPlayerXZ();
    const epoch = Math.floor(clockMs / WANDER_EPOCH_MS);
    for (const c of creatures.values()) {
      const x = c.mesh.position.x;
      const z = c.mesh.position.z;
      const stats = CREATURE_STATS[c.entity.species];
      const healthFrac = stats ? c.combat.health / stats.maxHealth : 1;
      const behavior = decideBehavior(c.entity.species, Math.hypot(x - px, z - pz), healthFrac);
      const wp = wanderWaypoint(c.entity.id, c.anchor, epoch);
      const [vx, vz] = steer(behavior, [x, z], [px, pz], wp);
      if (vx === 0 && vz === 0) continue;
      const nx = x + vx * dt;
      const nz = z + vz * dt;
      if (!validGround(deps.ground, nx, nz)) continue; // cliff/water stops it
      const v = SPECIES_VISUAL[c.entity.species];
      c.mesh.position.set(nx, deps.ground.heightAt(nx, nz) + (v?.lift ?? 0.5), nz);
      c.mesh.rotation.y = Math.atan2(vx, vz);
    }
  }

  return {
    update(dt: number): void {
      clockMs += dt * 1000;
      sinceStep += dt;
      const [px, pz] = deps.getPlayerXZ();
      const cx = worldToSpawnCell(px);
      const cz = worldToSpawnCell(pz);
      if (cx !== lastCx || cz !== lastCz || sinceStep >= STEP_INTERVAL_S) {
        lastCx = cx;
        lastCz = cz;
        sinceStep = 0;
        const active = new Set([...nodes.keys(), ...creatures.keys()]);
        const { enter, leave } = stepSpawns({
          seed: deps.seed,
          epoch: 0,
          density: deps.density,
          players: [[px, pz]],
          active,
          removed,
        });
        for (const id of leave) remove(id);
        for (const s of enter) materialize(s);
      }
      stepCreatures(dt);
    },

    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      for (const id of [...nodes.keys(), ...creatures.keys()]) remove(id);
      deps.parent.remove(group);
      for (const g of geometries.values()) g.dispose();
      for (const m of materials.values()) m.dispose();
    },

    get activeCount(): number {
      return nodes.size + creatures.size;
    },
  };
}
