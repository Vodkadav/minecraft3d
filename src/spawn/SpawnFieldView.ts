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
import { CreatureModelLibrary, type CreatureInstance } from "./CreatureModels";
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
import { feed, startTaming, TAMING_RULES, type TamingState } from "../game/domain/taming/Taming";
import { hashUnitFloat } from "../game/domain/rng/hash";
import type { ItemStack } from "../game/domain/inventory/Inventory";
import { nearestWithin, SPECIES_VISUAL, validGround, type SpawnGround } from "./SpawnPlacement";

/** Seconds between proximity re-steps when no cell is crossed. */
const STEP_INTERVAL_S = 1.0;
/** Interaction reach (m) for attack/harvest. */
const REACH_M = 3.5;
/** Player hit damage per attack press (tools/weapons arrive later). */
const ATTACK_DAMAGE = 10;
/** How close an aggressive creature must get to bite the player (m). */
const CONTACT_RANGE_M = 2.2;
/** Minimum gap between a creature's bites on the player (s). */
const BITE_COOLDOWN_S = 1.2;
/** Wander waypoints change every this many ms. */
const WANDER_EPOCH_MS = 8000;
/** Walk-speed multiplier while mounted — a mount outpaces jogging (M6.5). */
const RIDE_SPEED_MULT = 1.6;

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
  /** An aggressive creature bit the player (M6 player health). */
  onPlayerHit?(amount: number): void;
  /** Set the player's walk-speed multiplier (mount boost; 1 = on foot). */
  setMoveSpeedScale?(scale: number): void;
}

export interface SpawnFieldHandle {
  update(dt: number): void;
  dispose(): void;
  readonly activeCount: number;
}

interface CreatureEntry {
  readonly entity: SpawnEntity;
  readonly obj: Object3D;
  readonly anchor: readonly [number, number];
  /** Rigged instance (AnimationMixer); null = primitive fallback. */
  readonly instance: CreatureInstance | null;
  /** Ground offset for this visual. */
  readonly lift: number;
  combat: CombatState;
  taming: TamingState;
  /** Seconds left of the death clip; set when killed, removed at zero. */
  dying: number | null;
  /** clockMs of this creature's last bite on the player (bite cooldown). */
  lastBiteMs: number;
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

  const nodes = new Map<string, { entity: SpawnEntity; obj: Mesh }>();
  const creatures = new Map<string, CreatureEntry>();
  const models = new CreatureModelLibrary();
  // spawns can materialize before the async model load lands — upgrade the
  // primitive stand-ins in place when their species' model arrives
  models.load((species) => {
    for (const [id, c] of [...creatures]) {
      if (c.entity.species !== species || c.instance || c.dying !== null) continue;
      const instance = models.instantiate(species);
      if (!instance) continue;
      const { x, z } = { x: c.obj.position.x, z: c.obj.position.z };
      group.remove(c.obj);
      instance.root.position.set(x, deps.ground.heightAt(x, z) + instance.lift, z);
      instance.root.rotation.y = c.obj.rotation.y;
      instance.root.name = id;
      group.add(instance.root);
      creatures.set(id, { ...c, obj: instance.root, instance, lift: instance.lift });
    }
  });
  const removed = new Set<string>(
    Array.isArray(deps.save?.entity("spawn.removed"))
      ? (deps.save.entity("spawn.removed") as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  );
  const tamed = new Set<string>(
    Array.isArray(deps.save?.entity("taming.tamed"))
      ? (deps.save.entity("taming.tamed") as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  );
  let lastCx: number | null = null;
  let lastCz: number | null = null;
  let sinceStep = Infinity; // first update always steps
  let clockMs = 0;
  // M6.5 ride: the walk controller stays the mover; the mount is glued under
  // the camera and animated by player speed. ponytail: no controller surgery,
  // no speed boost yet - add when riding should outrun running.
  let ridingId: string | null = null;
  let lastPx: number | null = null;
  let lastPz: number | null = null;

  // mounting/dismounting also toggles the ride speed boost through the controller
  const setRiding = (id: string | null): void => {
    ridingId = id;
    deps.setMoveSpeedScale?.(id !== null ? RIDE_SPEED_MULT : 1);
  };

  const locked = (): boolean =>
    deps.dom === undefined || document.pointerLockElement === deps.dom;

  function materialize(s: SpawnEntity): void {
    const [x, , z] = s.position;
    if (!validGround(deps.ground, x, z)) return;
    const v = SPECIES_VISUAL[s.species];
    if (!v) return;
    if (s.kind === "creature") {
      const instance = models.instantiate(s.species);
      const obj: Object3D =
        instance?.root ?? new Mesh(geometries.get(s.species), materials.get(s.species));
      const lift = instance ? instance.lift : v.lift;
      obj.position.set(x, deps.ground.heightAt(x, z) + lift, z);
      if (obj instanceof Mesh) obj.castShadow = true;
      obj.name = s.id;
      group.add(obj);
      const taming = startTaming(s.species);
      creatures.set(s.id, {
        entity: s,
        obj,
        anchor: [x, z],
        instance,
        lift,
        combat: spawnCombatState(s.species),
        taming: tamed.has(s.id) ? { ...taming, phase: "tamed" } : taming,
        dying: null,
        lastBiteMs: -Infinity,
      });
      return;
    }
    const mesh = new Mesh(geometries.get(s.species), materials.get(s.species));
    mesh.position.set(x, deps.ground.heightAt(x, z) + v.lift, z);
    mesh.castShadow = true;
    mesh.name = s.id;
    group.add(mesh);
    nodes.set(s.id, { entity: s, obj: mesh });
  }

  function remove(id: string): void {
    const creature = creatures.get(id);
    if (creature) {
      group.remove(creature.obj);
      creatures.delete(id);
      return;
    }
    const node = nodes.get(id);
    if (!node) return;
    group.remove(node.obj);
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

  function consumeFood(itemId: string): boolean {
    const prior = deps.save?.entity("spawn.loot");
    if (!Array.isArray(prior)) return false;
    const stacks = (prior as ItemStack[]).filter(
      (st) => typeof st?.itemId === "string" && typeof st?.count === "number",
    );
    const hit = stacks.find((st) => st.itemId === itemId && st.count > 0);
    if (!hit) return false;
    deps.save?.setEntity(
      "spawn.loot",
      stacks
        .map((st) => (st === hit ? { ...st, count: st.count - 1 } : st))
        .filter((st) => st.count > 0),
    );
    return true;
  }

  function pickTarget<E extends { entity: SpawnEntity; obj: Object3D }>(
    pool: ReadonlyMap<string, E>,
  ): E | null {
    const [px, pz] = deps.getPlayerXZ();
    const flat = [...pool.values()].map((e) => ({
      x: e.obj.position.x,
      z: e.obj.position.z,
      e,
    }));
    return nearestWithin(flat, px, pz, REACH_M)?.e ?? null;
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!locked()) return;
    if (ev.code === "KeyF") {
      const target = pickTarget(creatures);
      if (!target || target.dying !== null) return;
      const r = applyDamage(target.combat, ATTACK_DAMAGE);
      target.combat = r.state;
      if (r.died) {
        const roll = hashUnitFloat(deps.seed, clockMs | 0, 0x6f00);
        grantLoot(lootFor(target.entity.species, roll));
        persistRemoved(target.entity.id);
        if (tamed.delete(target.entity.id)) deps.save?.setEntity("taming.tamed", [...tamed]);
        // rigged creatures fall over first; primitives vanish immediately
        const duration = target.instance?.playDeath() ?? 0;
        if (duration > 0) target.dying = duration;
        else remove(target.entity.id);
      }
    } else if (ev.code === "KeyG") {
      // G = mount/dismount (R belongs to the placement tool's rotate)
      if (ridingId !== null) {
        setRiding(null);
        return;
      }
      const target = pickTarget(creatures);
      if (target && target.dying === null && target.taming.phase === "tamed") {
        setRiding(target.entity.id);
      }
    } else if (ev.code === "KeyT") {
      const target = pickTarget(creatures);
      if (!target || target.dying !== null || target.taming.phase === "tamed") return;
      const rules = TAMING_RULES[target.entity.species];
      if (!rules || !consumeFood(rules.foodItemId)) return;
      const r = feed(target.taming, rules.foodItemId, clockMs);
      target.taming = r.state;
      if (r.becameTamed) {
        tamed.add(target.entity.id);
        deps.save?.setEntity("taming.tamed", [...tamed]);
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
      c.instance?.update(dt);
      if (c.dying !== null) {
        if (ridingId === c.entity.id) setRiding(null);
        c.dying -= dt;
        if (c.dying <= 0) remove(c.entity.id);
        continue;
      }
      if (ridingId === c.entity.id) {
        const speed =
          lastPx === null || lastPz === null || dt <= 0
            ? 0
            : Math.hypot(px - lastPx, pz - lastPz) / dt;
        c.obj.position.set(px, deps.ground.heightAt(px, pz) + c.lift, pz);
        if (speed > 0.3 && lastPx !== null && lastPz !== null) {
          c.obj.rotation.y = Math.atan2(px - lastPx, pz - lastPz);
        }
        c.instance?.setBehavior(speed > 4 ? "flee" : speed > 0.3 ? "follow" : "idle");
        continue;
      }
      const x = c.obj.position.x;
      const z = c.obj.position.z;
      const stats = CREATURE_STATS[c.entity.species];
      const healthFrac = stats ? c.combat.health / stats.maxHealth : 1;
      const distToPlayer = Math.hypot(x - px, z - pz);
      // an aggressive wild creature that reaches the player bites, on cooldown
      if (
        stats &&
        stats.damage > 0 &&
        c.taming.phase !== "tamed" &&
        distToPlayer <= CONTACT_RANGE_M &&
        clockMs - c.lastBiteMs >= BITE_COOLDOWN_S * 1000
      ) {
        c.lastBiteMs = clockMs;
        deps.onPlayerHit?.(stats.damage);
      }
      const behavior = decideBehavior(
        c.entity.species,
        distToPlayer,
        healthFrac,
        c.taming.phase === "tamed",
      );
      const wp = wanderWaypoint(c.entity.id, c.anchor, epoch);
      const [vx, vz] = steer(behavior, [x, z], [px, pz], wp);
      c.instance?.setBehavior(vx === 0 && vz === 0 ? "idle" : behavior);
      if (vx === 0 && vz === 0) continue;
      const nx = x + vx * dt;
      const nz = z + vz * dt;
      if (!validGround(deps.ground, nx, nz)) continue; // cliff/water stops it
      c.obj.position.set(nx, deps.ground.heightAt(nx, nz) + c.lift, nz);
      c.obj.rotation.y = Math.atan2(vx, vz);
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
        for (const id of leave) if (!tamed.has(id)) remove(id);
        for (const s of enter) materialize(s);
      }
      stepCreatures(dt);
      lastPx = px;
      lastPz = pz;
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
