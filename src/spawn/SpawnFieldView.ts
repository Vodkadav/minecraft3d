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
 *
 * Mounting (G, host and joiner — ADR 0003 addendum): the host resolves both
 * "who may ride" (tamed/dying/already-ridden checks) and "where the mount
 * sits" — a peer's ridden creature is glued to that peer's own streamed pose
 * instead of running AI, so the host never fights the rider over the
 * transform, and the mount's movement rides the existing ~10 Hz creature
 * snapshot for free (visible to any other peer). The riding client (host or
 * joiner) additionally glues its OWN view locally every frame — zero added
 * latency for the first-person mount feel — and ignores the network-smoothed
 * stream target for that one id while riding.
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
  type Behavior,
} from "../game/domain/ai/CreatureBrain";
import type { CreatureEntity, InteractAction } from "../game/domain/net/Protocol";
import { reconcileEntities } from "../game/domain/spawn/CreatureStream";
import { smoothingFactor, stepToward, stepYaw } from "../game/domain/spawn/CreatureSmoothing";
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
import type { AudioPort } from "../game/application/ports/AudioPort";
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
/** Host→joiner snapshot cadence (ADR 0003) — matches the pose loop's 10 Hz. */
const SNAPSHOT_INTERVAL_S = 0.1;

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
  /** Workstream 1.6: hit/harvest/tame play here; a bite on the player plays
   *  the 2D "hurt" sound (no position — it's about the player, not a place). */
  readonly audio?: AudioPort;
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
  /** Live creature ids (probe/tooling seam — tools/net-probe.ts). */
  readonly creatureIds: readonly string[];
  /** Ids currently playing their death clip, on either host or joiner
   *  (probe/tooling seam — tools/net-probe.ts asserts the joiner sees this
   *  before the id is actually removed, i.e. the death clip synced). */
  readonly dyingIds: readonly string[];
  /** Host: ids currently ridden by a peer (probe/tooling seam — asserts a
   *  joiner's mount intent round-trips through the host, ADR 0003 addendum). */
  readonly riddenIds: readonly string[];
  /** Joiner mode (ADR 0003): no local AI/proximity/resolution — puppet the
   *  host's stream. Set by the net glue before the first frame. */
  remote: boolean;
  /** Host: called ~10 Hz with the full active set for the net glue to stream. */
  onSnapshot: ((entities: readonly CreatureEntity[]) => void) | null;
  /** Joiner: an F/E/T press becomes an intent for the host to resolve. */
  onInteractIntent: ((action: InteractAction, targetId: string) => void) | null;
  /** Joiner: apply a host snapshot (add/move/remove via the pure reconciler). */
  applySnapshot(entities: readonly CreatureEntity[]): void;
  /** Host: resolve a joiner's interaction against this field, keyed by id.
   *  peerId is the sender — only mount/dismount use it (they're keyed by
   *  rider, not by target). */
  applyInteract(action: InteractAction, targetId: string, peerId?: string): void;
  /** Host: the latest XZ position streamed by a riding peer's own pose
   *  (ADR 0003 addendum) — used to glue a peer-ridden creature each tick. */
  setPeerPose(peerId: string, x: number, z: number): void;
  /** Host: a peer disconnected — drop whatever creature it was riding so a
   *  vanished joiner doesn't leave a creature stuck frozen forever. */
  releaseRider(peerId: string): void;
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
  /** Last streamed behavior (host emits it; joiner drives the clip from it). */
  behavior: Behavior;
  /** Seconds left of the death clip; set when killed, removed at zero.
   *  Joiner (remote mode) instead uses this as a "death clip triggered"
   *  sentinel — actual removal there is host-driven (ADR 0003 follow-up). */
  dying: number | null;
  /** clockMs of this creature's last bite on the player (bite cooldown). */
  lastBiteMs: number;
  /** Joiner (remote mode): latest host-streamed transform, closed toward
   *  per-frame by CreatureSmoothing rather than snapped on arrival. */
  remoteTarget: readonly [number, number, number, number] | null;
  /** Host: peerId of the joiner riding this creature, or null. Distinct from
   *  the host's own local `ridingId` — a peer mount is resolved via intents
   *  and glued to that peer's streamed pose (ADR 0003 addendum). */
  riddenBy: string | null;
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
      // start the current behavior's clip — a joiner (remote mode) never
      // re-applies an unchanged behavior, so the upgrade would stay unanimated
      instance.setBehavior(c.behavior);
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
  let snapAcc = 0;
  // ADR 0003 net seams — flipped/wired by the net glue after attach.
  let remote = false;
  let onSnapshot: ((entities: readonly CreatureEntity[]) => void) | null = null;
  let onInteractIntent: ((action: InteractAction, targetId: string) => void) | null = null;
  // Host: last XZ each riding peer streamed via its own pose (ADR 0003
  // addendum — a peer-ridden creature is glued to this instead of AI steering).
  const peerPositions = new Map<string, readonly [number, number]>();
  const lastPeerXZ = new Map<string, readonly [number, number]>();

  // mounting/dismounting also toggles the ride speed boost through the controller
  const setRiding = (id: string | null): void => {
    ridingId = id;
    deps.setMoveSpeedScale?.(id !== null ? RIDE_SPEED_MULT : 1);
  };

  /** Glue a mount's mesh under its rider's XZ each tick (host's own ride and a
   *  peer's streamed pose both resolve through this — ADR 0003 addendum). */
  function glueMount(
    c: CreatureEntry,
    rx: number,
    rz: number,
    lastRx: number | null,
    lastRz: number | null,
    dt: number,
  ): void {
    const speed = lastRx === null || lastRz === null || dt <= 0 ? 0 : Math.hypot(rx - lastRx, rz - lastRz) / dt;
    c.obj.position.set(rx, deps.ground.heightAt(rx, rz) + c.lift, rz);
    if (speed > 0.3 && lastRx !== null && lastRz !== null) {
      c.obj.rotation.y = Math.atan2(rx - lastRx, rz - lastRz);
    }
    c.behavior = speed > 4 ? "flee" : speed > 0.3 ? "follow" : "idle";
    c.instance?.setBehavior(c.behavior);
  }

  const locked = (): boolean =>
    deps.dom === undefined || document.pointerLockElement === deps.dom;

  // creature visual (rigged instance if its model has loaded, else primitive)
  function makeCreatureObj(species: string): {
    obj: Object3D;
    instance: CreatureInstance | null;
    lift: number;
  } {
    const instance = models.instantiate(species);
    const obj: Object3D =
      instance?.root ?? new Mesh(geometries.get(species), materials.get(species));
    if (obj instanceof Mesh) obj.castShadow = true;
    return { obj, instance, lift: instance ? instance.lift : SPECIES_VISUAL[species].lift };
  }

  function makeNodeMesh(s: SpawnEntity): Mesh {
    const mesh = new Mesh(geometries.get(s.species), materials.get(s.species));
    mesh.castShadow = true;
    mesh.name = s.id;
    return mesh;
  }

  function materialize(s: SpawnEntity): void {
    const [x, , z] = s.position;
    if (!validGround(deps.ground, x, z)) return;
    const v = SPECIES_VISUAL[s.species];
    if (!v) return;
    if (s.kind === "creature") {
      const { obj, instance, lift } = makeCreatureObj(s.species);
      obj.position.set(x, deps.ground.heightAt(x, z) + lift, z);
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
        behavior: "idle",
        dying: null,
        lastBiteMs: -Infinity,
        remoteTarget: null,
        riddenBy: null,
      });
      return;
    }
    const mesh = makeNodeMesh(s);
    mesh.position.set(x, deps.ground.heightAt(x, z) + v.lift, z);
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

  // Interaction resolution — reused by the local keydown (host/solo) AND by the
  // host's applyInteract when a joiner's intent arrives (ADR 0003).
  function resolveAttack(target: CreatureEntry): void {
    if (target.dying !== null) return;
    const r = applyDamage(target.combat, ATTACK_DAMAGE);
    target.combat = r.state;
    deps.audio?.play("hit", {
      position: [target.obj.position.x, target.obj.position.y, target.obj.position.z],
    });
    if (!r.died) return;
    const roll = hashUnitFloat(deps.seed, clockMs | 0, 0x6f00);
    grantLoot(lootFor(target.entity.species, roll));
    persistRemoved(target.entity.id);
    if (tamed.delete(target.entity.id)) deps.save?.setEntity("taming.tamed", [...tamed]);
    if (ridingId === target.entity.id) setRiding(null);
    if (target.riddenBy !== null) resolveDismountPeer(target.riddenBy);
    // rigged creatures fall over first; primitives vanish immediately
    const duration = target.instance?.playDeath() ?? 0;
    if (duration > 0) target.dying = duration;
    else remove(target.entity.id);
  }

  function resolveFeed(target: CreatureEntry): void {
    if (target.dying !== null || target.taming.phase === "tamed") return;
    const rules = TAMING_RULES[target.entity.species];
    if (!rules || !consumeFood(rules.foodItemId)) return;
    const r = feed(target.taming, rules.foodItemId, clockMs);
    target.taming = r.state;
    if (r.becameTamed) {
      tamed.add(target.entity.id);
      deps.save?.setEntity("taming.tamed", [...tamed]);
      deps.audio?.play("tame", {
        position: [target.obj.position.x, target.obj.position.y, target.obj.position.z],
      });
    }
  }

  function resolveHarvest(target: { entity: SpawnEntity; obj: Object3D }): void {
    grantLoot(NODE_YIELD[target.entity.species] ?? []);
    deps.audio?.play("harvest", {
      position: [target.obj.position.x, target.obj.position.y, target.obj.position.z],
    });
    remove(target.entity.id);
    persistRemoved(target.entity.id);
  }

  /** Host: a joiner's mount intent. Rejects a dying/untamed/already-ridden
   *  target — mirrors the local G-mount gate below. */
  function resolveMount(target: CreatureEntry, riderId: string): void {
    if (target.dying !== null) return;
    if (target.taming.phase !== "tamed") return;
    if (target.riddenBy !== null || ridingId === target.entity.id) return;
    target.riddenBy = riderId;
  }

  /** Host: a joiner's dismount intent, or its disconnect (releaseRider). */
  function resolveDismountPeer(riderId: string): void {
    for (const c of creatures.values()) {
      if (c.riddenBy === riderId) c.riddenBy = null;
    }
    peerPositions.delete(riderId);
    lastPeerXZ.delete(riderId);
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!locked()) return;
    // Joiner: an F/E/T/G press is an intent for the host to resolve — the
    // local ride glue below is optimistic (mirrors host feel) but the host's
    // resolution (tamed/dying/already-ridden) is the one that sticks (ADR
    // 0003 addendum).
    if (ev.code === "KeyF") {
      const target = pickTarget(creatures);
      if (!target || target.dying !== null) return;
      if (remote) onInteractIntent?.("attack", target.entity.id);
      else resolveAttack(target);
    } else if (ev.code === "KeyG") {
      // G = mount/dismount (R belongs to the placement tool's rotate)
      if (ridingId !== null) {
        const id = ridingId;
        setRiding(null);
        if (remote) onInteractIntent?.("dismount", id);
        return;
      }
      const target = pickTarget(creatures);
      if (!target || target.dying !== null || target.taming.phase !== "tamed") return;
      if (remote) {
        setRiding(target.entity.id); // optimistic local glue, zero-lag like the host
        onInteractIntent?.("mount", target.entity.id);
      } else if (target.riddenBy === null) {
        setRiding(target.entity.id);
      }
    } else if (ev.code === "KeyT") {
      const target = pickTarget(creatures);
      if (!target || target.dying !== null || target.taming.phase === "tamed") return;
      if (remote) onInteractIntent?.("feed", target.entity.id);
      else resolveFeed(target);
    } else if (ev.code === "KeyE") {
      const target = pickTarget(nodes);
      if (!target) return;
      if (remote) onInteractIntent?.("harvest", target.entity.id);
      else resolveHarvest(target);
    }
  };
  window.addEventListener("keydown", onKeyDown);

  function applyInteract(action: InteractAction, targetId: string, peerId = ""): void {
    if (action === "harvest") {
      const n = nodes.get(targetId);
      if (n) resolveHarvest(n);
      return;
    }
    if (action === "dismount") {
      resolveDismountPeer(peerId);
      return;
    }
    const c = creatures.get(targetId);
    if (!c) return;
    if (action === "attack") resolveAttack(c);
    else if (action === "feed") resolveFeed(c);
    else if (action === "mount") resolveMount(c, peerId);
  }

  function setPeerPose(peerId: string, x: number, z: number): void {
    peerPositions.set(peerId, [x, z]);
  }

  function releaseRider(peerId: string): void {
    resolveDismountPeer(peerId);
  }

  function stepCreatures(dt: number): void {
    const [px, pz] = deps.getPlayerXZ();
    const epoch = Math.floor(clockMs / WANDER_EPOCH_MS);
    for (const c of creatures.values()) {
      c.instance?.update(dt);
      if (c.dying !== null) {
        if (ridingId === c.entity.id) setRiding(null);
        if (c.riddenBy !== null) resolveDismountPeer(c.riddenBy);
        c.dying -= dt;
        if (c.dying <= 0) remove(c.entity.id);
        continue;
      }
      if (ridingId === c.entity.id) {
        glueMount(c, px, pz, lastPx, lastPz, dt);
        continue;
      }
      if (c.riddenBy !== null) {
        const pos = peerPositions.get(c.riddenBy);
        if (pos) {
          const [rx, rz] = pos;
          const last = lastPeerXZ.get(c.riddenBy) ?? null;
          glueMount(c, rx, rz, last?.[0] ?? null, last?.[1] ?? null, dt);
          lastPeerXZ.set(c.riddenBy, [rx, rz]);
        }
        continue; // frozen (no AI) until the peer's next pose lands
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
        deps.audio?.play("hurt");
      }
      const behavior = decideBehavior(
        c.entity.species,
        distToPlayer,
        healthFrac,
        c.taming.phase === "tamed",
      );
      const wp = wanderWaypoint(c.entity.id, c.anchor, epoch);
      const [vx, vz] = steer(behavior, [x, z], [px, pz], wp);
      c.behavior = vx === 0 && vz === 0 ? "idle" : behavior;
      c.instance?.setBehavior(c.behavior);
      if (vx === 0 && vz === 0) continue;
      const nx = x + vx * dt;
      const nz = z + vz * dt;
      if (!validGround(deps.ground, nx, nz)) continue; // cliff/water stops it
      c.obj.position.set(nx, deps.ground.heightAt(nx, nz) + c.lift, nz);
      c.obj.rotation.y = Math.atan2(vx, vz);
    }
  }

  // ---- host: build the streamed snapshot. A dying creature keeps streaming
  // (dying: true) through its death clip so joiners can play it too; it only
  // leaves the set once stepCreatures() actually removes it. ----
  function buildSnapshot(): CreatureEntity[] {
    const out: CreatureEntity[] = [];
    for (const c of creatures.values()) {
      const stats = CREATURE_STATS[c.entity.species];
      out.push({
        id: c.entity.id,
        species: c.entity.species,
        kind: "creature",
        x: c.obj.position.x,
        y: c.obj.position.y,
        z: c.obj.position.z,
        yaw: c.obj.rotation.y,
        behavior: c.behavior,
        ...(stats ? { health: c.combat.health } : {}),
        ...(c.dying !== null ? { dying: true } : {}),
        ...(c.taming.phase === "tamed" ? { tamed: true } : {}),
      });
    }
    for (const n of nodes.values()) {
      out.push({
        id: n.entity.id,
        species: n.entity.species,
        kind: "node",
        x: n.obj.position.x,
        y: n.obj.position.y,
        z: n.obj.position.z,
        yaw: 0,
      });
    }
    return out;
  }

  // ---- joiner: materialize/move from the host's stream (trusts wire coords).
  // Positions snap on arrival (spawn) but are smoothed toward on every
  // following update via `remoteTarget` (see the remote branch of update()). --
  function materializeRemote(e: CreatureEntity): void {
    if (!SPECIES_VISUAL[e.species]) return;
    if (e.kind === "creature") {
      const { obj, instance, lift } = makeCreatureObj(e.species);
      obj.position.set(e.x, e.y, e.z);
      obj.rotation.y = e.yaw;
      obj.name = e.id;
      group.add(obj);
      const behavior = (e.behavior as Behavior | undefined) ?? "idle";
      instance?.setBehavior(behavior);
      const taming = startTaming(e.species);
      creatures.set(e.id, {
        entity: { id: e.id, species: e.species, kind: "creature", position: [e.x, e.y, e.z] },
        obj,
        anchor: [e.x, e.z],
        instance,
        lift,
        combat: spawnCombatState(e.species),
        // the joiner tracks no taming progress of its own — the host's
        // `tamed` flag on the stream is the only source of truth (ADR 0003)
        taming: e.tamed ? { ...taming, phase: "tamed" } : taming,
        behavior,
        dying: null,
        lastBiteMs: -Infinity,
        remoteTarget: [e.x, e.y, e.z, e.yaw],
        riddenBy: null,
      });
      return;
    }
    const entity: SpawnEntity = {
      id: e.id,
      species: e.species,
      kind: "node",
      position: [e.x, e.y, e.z],
    };
    const mesh = makeNodeMesh(entity);
    mesh.position.set(e.x, e.y, e.z);
    group.add(mesh);
    nodes.set(e.id, { entity, obj: mesh });
  }

  function updateRemote(e: CreatureEntity): void {
    const c = creatures.get(e.id);
    if (c) {
      c.remoteTarget = [e.x, e.y, e.z, e.yaw];
      const behavior = (e.behavior as Behavior | undefined) ?? c.behavior;
      if (behavior !== c.behavior) {
        c.behavior = behavior;
        c.instance?.setBehavior(behavior);
      }
      if (e.tamed && c.taming.phase !== "tamed") c.taming = { ...c.taming, phase: "tamed" };
      return;
    }
    nodes.get(e.id)?.obj.position.set(e.x, e.y, e.z);
  }

  /** Joiner: the host just streamed this id as newly `dying` — play the
   *  one-shot death clip once; the entity keeps updating (frozen position)
   *  until the host's own removal drops it from the stream. */
  function playDeathRemote(e: CreatureEntity): void {
    const c = creatures.get(e.id);
    if (!c || c.dying !== null) return;
    c.dying = c.instance?.playDeath() ?? 0;
  }

  function applySnapshot(entities: readonly CreatureEntity[]): void {
    const prevDying = new Set(
      [...creatures.entries()].filter(([, c]) => c.dying !== null).map(([id]) => id),
    );
    const { add, update, remove: gone, died } = reconcileEntities(
      [...creatures.keys(), ...nodes.keys()],
      entities,
      prevDying,
    );
    for (const id of gone) remove(id);
    for (const e of add) materializeRemote(e);
    for (const e of update) updateRemote(e);
    for (const e of died) playDeathRemote(e);
    // Joiner: the creature it's riding died or dropped out of the stream —
    // unmount and reset the speed boost (host death/despawn edge, ADR 0003).
    if (ridingId !== null && (gone.includes(ridingId) || died.some((e) => e.id === ridingId))) {
      setRiding(null);
    }
  }

  return {
    applySnapshot,
    applyInteract,
    setPeerPose,
    releaseRider,
    // net seams delegate to the closure vars onKeyDown/update actually read
    get remote() {
      return remote;
    },
    set remote(v: boolean) {
      remote = v;
    },
    get onSnapshot() {
      return onSnapshot;
    },
    set onSnapshot(v: ((entities: readonly CreatureEntity[]) => void) | null) {
      onSnapshot = v;
    },
    get onInteractIntent() {
      return onInteractIntent;
    },
    set onInteractIntent(v: ((action: InteractAction, targetId: string) => void) | null) {
      onInteractIntent = v;
    },

    update(dt: number): void {
      clockMs += dt * 1000;
      // Joiner puppets the host's stream: no proximity, no AI. Advance the
      // animation mixers so the streamed poses stay animated, and smooth each
      // creature's rendered transform toward the latest snapshot (`remoteTarget`)
      // rather than snapping on arrival — the 10 Hz stream would otherwise
      // visibly step (ADR 0003 follow-up).
      if (remote) {
        const k = smoothingFactor(dt);
        const [px, pz] = deps.getPlayerXZ();
        for (const c of creatures.values()) {
          c.instance?.update(dt);
          // Own mount: glue zero-lag to the local player instead of the
          // network-smoothed stream target (ADR 0003 addendum) — the host
          // echoes this creature's transform back too, but it would only add
          // round-trip lag to what's already known locally.
          if (c.entity.id === ridingId) {
            glueMount(c, px, pz, lastPx, lastPz, dt);
            continue;
          }
          if (!c.remoteTarget) continue;
          const [tx, ty, tz, tyaw] = c.remoteTarget;
          const [nx, ny, nz] = stepToward(
            [c.obj.position.x, c.obj.position.y, c.obj.position.z],
            [tx, ty, tz],
            k,
          );
          c.obj.position.set(nx, ny, nz);
          c.obj.rotation.y = stepYaw(c.obj.rotation.y, tyaw, k);
        }
        lastPx = px;
        lastPz = pz;
        return;
      }
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
      // stream the active set to joiners at ~10 Hz (host only)
      if (onSnapshot) {
        snapAcc += dt;
        if (snapAcc >= SNAPSHOT_INTERVAL_S) {
          snapAcc = 0;
          onSnapshot(buildSnapshot());
        }
      }
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

    get creatureIds(): readonly string[] {
      return [...creatures.keys()];
    },

    get dyingIds(): readonly string[] {
      return [...creatures.entries()].filter(([, c]) => c.dying !== null).map(([id]) => id);
    },

    get riddenIds(): readonly string[] {
      return [...creatures.entries()].filter(([, c]) => c.riddenBy !== null).map(([id]) => id);
    },
  };
}
