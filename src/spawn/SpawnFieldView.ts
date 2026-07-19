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
import { lerpToward, smoothingFactor, stepYaw } from "../game/domain/spawn/CreatureSmoothing";
import {
  applyDamage,
  CREATURE_STATS,
  lootFor,
  spawnCombatState,
  type CombatState,
} from "../game/domain/combat/Combat";
import { feed, startTaming, TAMING_RULES, type TamingState } from "../game/domain/taming/Taming";
import { hashUnitFloat } from "../game/domain/rng/hash";
import { NIGHT_AGGRO_RANGE_MULT, NIGHT_DAMAGE_MULT } from "../game/domain/time/DayNight";
import type { ItemStack } from "../game/domain/inventory/Inventory";
import type { AudioPort } from "../game/application/ports/AudioPort";
import type { FeelPort } from "../game/application/ports/FeelPort";
import type { ProgressionEventId } from "../game/domain/progression/ProgressionEvents";
import { SPECIES_VISUAL, validGround, type SpawnGround } from "./SpawnPlacement";

/** Seconds between proximity re-steps when no cell is crossed. */
const STEP_INTERVAL_S = 1.0;
/** Interaction reach (m) for attack/harvest. */
const REACH_M = 3.5;
/** Player hit damage per attack press (tools/weapons arrive later). */
const ATTACK_DAMAGE = 10;
/** Deterministic crit chance on a player attack — feel-only (Workstream 2). */
const CRIT_CHANCE = 0.15;
/** How close an aggressive creature must get to bite the player (m). */
const CONTACT_RANGE_M = 2.2;
/** Minimum gap between a creature's bites on the player (s). */
const BITE_COOLDOWN_S = 1.2;
/** Wander waypoints change every this many ms. */
const WANDER_EPOCH_MS = 8000;
/** Walk-speed multiplier while mounted — a mount outpaces jogging (M6.5). */
const RIDE_SPEED_MULT = 1.6;
/** E2.2: how long after an attack-given/bite-received the nameplate policy's
 *  `inCombat` mode stays true (ms). */
const COMBAT_WINDOW_MS = 6000;
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
  /** Workstream 2: attack/kill/hurt/harvest/tame each also fan out here —
   *  shake, hit-stop, vignette, damage numbers, particles, rumble. */
  readonly feel?: FeelPort;
  /** Workstream 6: kill/tame/harvest each also fan out here — feeds
   *  objectives/achievements/the tier curve (same threading as audio/feel). */
  onProgress?(event: ProgressionEventId): void;
  /** E2.5: the local player's attack/hit/kill events also fan out here —
   *  feeds the solo self damage meter's `CombatLog` fold (same threading as
   *  audio/feel/progress; never routed through the intent path, this is
   *  local presentation state only). */
  onCombatEvent?(kind: "hitDealt" | "hitTaken" | "kill", amount: number): void;
  /** Called with the stacks gained from a kill/harvest (HUD hook). */
  onLoot?(stacks: readonly ItemStack[]): void;
  /** An aggressive creature bit the player (M6 player health). */
  onPlayerHit?(amount: number): void;
  /** Set the player's walk-speed multiplier (mount boost; 1 = on foot). */
  setMoveSpeedScale?(scale: number): void;
  /** Workstream 5.1: stamina gate — an F press is dropped when this returns
   *  false (no target is even picked, so it costs nothing on the joiner
   *  side either). Local player state only; never routed through the
   *  intent path (see IntentRules — attack resolution itself still is). */
  canAttack?(): boolean;
  /** Called once per accepted attack press, before resolution — the
   *  composition root drains stamina/hunger here. */
  onAttack?(): void;
  /** Workstream 5.4: true while it's night — widens aggro reaction range and
   *  scales up contact-bite damage. Omitted/false = always-day behaviour. */
  isNight?(): boolean;
  /** Workstream 5.6: difficulty multiplier on contact-bite damage (peaceful
   *  = 0 disables player-facing creature damage entirely). Defaults to 1. */
  creatureDamageMult?: number;
  /** E1.4b: character `effectiveAttackPowerMultiplier` — scales the
   *  player's own attack damage. A getter so a mid-session stat spend takes
   *  effect immediately. Defaults to 1 (today's flat ATTACK_DAMAGE). */
  attackPowerMult?(): number;
  /** E1.4b: character `effectiveGatherPowerMultiplier` — scales harvested
   *  node yield counts. Defaults to 1 (today's flat NODE_YIELD). */
  gatherPowerMult?(): number;
  /** E1.4b: character `effectiveLootMultiplier` — scales creature kill loot
   *  counts. Defaults to 1 (today's flat lootFor() amounts). */
  lootMult?(): number;
  /** Workstream 9.4 streaming pop-in smoothing: true suppresses the
   *  materialize scale-up (an instant pop instead) — defaults to the OS
   *  prefers-reduced-motion query when omitted. */
  reducedMotion?(): boolean;
}

/**
 * E2.2/E2.3: one live (non-dying) creature's nameplate-relevant state, read
 * fresh each frame by `src/spawn/NameplateView.ts` — species doubles as the
 * `CreatureRegistry`/i18n key (see `starterCreatures.ts`). `health`/`maxHealth`
 * are null for a species with no combat stats (none exist today, but a future
 * unkillable creature shouldn't need a fake health value).
 */
export interface NameplateTargetEntity {
  readonly id: string;
  readonly species: string;
  readonly worldPos: readonly [number, number, number];
  readonly health: number | null;
  readonly maxHealth: number | null;
  readonly tamed: boolean;
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
  /** A live creature is within F-attack reach (crosshair state seam, HUD). */
  hasAttackTarget(): boolean;
  /** A harvestable node or a tamed/feedable-or-mountable creature is in
   *  reach (crosshair state seam, HUD). */
  hasInteractTarget(): boolean;
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
  /** E2.2/E2.3: every live (non-dying) creature's nameplate-relevant state,
   *  read fresh each frame by the billboard nameplate adapter. Works in both
   *  host and joiner (remote) mode — the `creatures` map is populated either
   *  way (locally simulated or streamed). */
  nameplateTargets(): readonly NameplateTargetEntity[];
  /** The creature currently at F-attack/interact reach, or null — feeds the
   *  nameplate policy's `onHover` mode (crosshair state seam). */
  readonly hoveredCreatureId: string | null;
  /** True for a short window after the player last attacked or was bitten —
   *  feeds the nameplate policy's `inCombat` mode. */
  readonly inCombat: boolean;
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

  // Workstream 9.4 streaming pop-in smoothing: a newly-materialized creature
  // or node scales up from ~0 to full size over GROW_DURATION_S instead of
  // popping in instantly at the spawn-cell-crossing boundary. Cheap (a Map
  // that's normally empty — nothing streams in most frames — iterated once
  // per update tick) and additive: the underlying spawn/streaming logic is
  // unchanged, this only touches the visual's Object3D.scale. The actual
  // vegetation/terrain-tile pop-in the AAA plan also flags lives entirely in
  // off-limits engine dirs (src/world/TerrainTiles.ts, src/vegetation) — see
  // the slice report for that deferral.
  const GROW_DURATION_S = 0.35;
  const growing = new Map<Object3D, number>(); // obj -> elapsed seconds
  const reducedMotion =
    deps.reducedMotion ??
    ((): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  function beginGrow(obj: Object3D): void {
    if (reducedMotion()) return;
    obj.scale.setScalar(0.05);
    growing.set(obj, 0);
  }
  function stepGrowth(dt: number): void {
    if (growing.size === 0) return;
    for (const [obj, elapsed] of growing) {
      const t = elapsed + dt;
      if (t >= GROW_DURATION_S) {
        obj.scale.setScalar(1);
        growing.delete(obj);
        continue;
      }
      // ease-out cubic — a snappy grow, not a linear pop
      const p = t / GROW_DURATION_S;
      obj.scale.setScalar(0.05 + 0.95 * (1 - Math.pow(1 - p, 3)));
      growing.set(obj, t);
    }
  }

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
  // E2.2: last time the player attacked or was bitten — feeds inCombat.
  let lastCombatMs = -Infinity;
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
      beginGrow(obj);
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
    beginGrow(mesh);
    nodes.set(s.id, { entity: s, obj: mesh });
  }

  function remove(id: string): void {
    const creature = creatures.get(id);
    if (creature) {
      growing.delete(creature.obj);
      group.remove(creature.obj);
      creatures.delete(id);
      return;
    }
    const node = nodes.get(id);
    if (!node) return;
    growing.delete(node.obj);
    group.remove(node.obj);
    nodes.delete(id);
  }

  function persistRemoved(id: string): void {
    removed.add(id);
    deps.save?.setEntity("spawn.removed", [...removed]);
  }

  /** E1.4b: scale a granted stack's count by a character multiplier (loot,
   *  gather power) — a no-op at the default mult of 1. Never rounds a
   *  positive count down to 0 (cozy: a multiplier only ever adds). */
  function scaleStacks(stacks: readonly ItemStack[], mult: number): readonly ItemStack[] {
    if (mult === 1) return stacks;
    return stacks.map((s) => ({ ...s, count: Math.max(1, Math.round(s.count * mult)) }));
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

  // Workstream 9.1 GC-hitch audit: this used to build a flat array of {x,z,e}
  // objects via spread+map every call — called 3x/frame from the crosshair
  // state update in TerrainScene (attack + interact targets), i.e. tens of
  // thousands of small object/array allocations per minute of normal play.
  // A direct nearest-scan over the pool's own values allocates nothing.
  function pickTarget<E extends { entity: SpawnEntity; obj: Object3D }>(
    pool: ReadonlyMap<string, E>,
  ): E | null {
    const [px, pz] = deps.getPlayerXZ();
    let best: E | null = null;
    let bestSq = REACH_M * REACH_M;
    for (const e of pool.values()) {
      const dx = e.obj.position.x - px;
      const dz = e.obj.position.z - pz;
      const d = dx * dx + dz * dz;
      if (d <= bestSq) {
        best = e;
        bestSq = d;
      }
    }
    return best;
  }

  // Interaction resolution — reused by the local keydown (host/solo) AND by the
  // host's applyInteract when a joiner's intent arrives (ADR 0003). Each
  // returns whether its "counts as progress" outcome happened (a kill, a
  // tame) so the *local-only* call sites below can fire `onProgress` —
  // progression is local-player state (Workstream 6): the host resolving a
  // joiner's remote intent here must never advance the host's own tracker.
  function resolveAttack(target: CreatureEntry): boolean {
    if (target.dying !== null) return false;
    lastCombatMs = clockMs;
    const attackDamage = ATTACK_DAMAGE * (deps.attackPowerMult?.() ?? 1);
    const r = applyDamage(target.combat, attackDamage);
    target.combat = r.state;
    const pos: [number, number, number] = [
      target.obj.position.x,
      target.obj.position.y,
      target.obj.position.z,
    ];
    deps.audio?.play("hit", { position: pos });
    // deterministic crit roll (same shape as the loot roll below) — a
    // presentation flourish only, never affects the damage actually dealt
    const crit = hashUnitFloat(deps.seed, clockMs | 0, 0x6f10) < CRIT_CHANCE;
    deps.feel?.trigger("attackHit", { worldPos: pos, numberValue: attackDamage, crit });
    if (!r.died) return false;
    deps.feel?.trigger("kill", { worldPos: pos, numberValue: attackDamage, crit });
    const roll = hashUnitFloat(deps.seed, clockMs | 0, 0x6f00);
    grantLoot(scaleStacks(lootFor(target.entity.species, roll), deps.lootMult?.() ?? 1));
    persistRemoved(target.entity.id);
    if (tamed.delete(target.entity.id)) deps.save?.setEntity("taming.tamed", [...tamed]);
    if (ridingId === target.entity.id) setRiding(null);
    if (target.riddenBy !== null) resolveDismountPeer(target.riddenBy);
    // rigged creatures fall over first; primitives vanish immediately
    const duration = target.instance?.playDeath() ?? 0;
    if (duration > 0) target.dying = duration;
    else remove(target.entity.id);
    return true;
  }

  function resolveFeed(target: CreatureEntry): boolean {
    if (target.dying !== null || target.taming.phase === "tamed") return false;
    const rules = TAMING_RULES[target.entity.species];
    if (!rules || !consumeFood(rules.foodItemId)) return false;
    const r = feed(target.taming, rules.foodItemId, clockMs);
    target.taming = r.state;
    if (r.becameTamed) {
      tamed.add(target.entity.id);
      deps.save?.setEntity("taming.tamed", [...tamed]);
      const pos: [number, number, number] = [
        target.obj.position.x,
        target.obj.position.y,
        target.obj.position.z,
      ];
      deps.audio?.play("tame", { position: pos });
      deps.feel?.trigger("tame", { worldPos: pos });
    }
    return r.becameTamed;
  }

  function resolveHarvest(target: { entity: SpawnEntity; obj: Object3D }): void {
    grantLoot(scaleStacks(NODE_YIELD[target.entity.species] ?? [], deps.gatherPowerMult?.() ?? 1));
    const pos: [number, number, number] = [
      target.obj.position.x,
      target.obj.position.y,
      target.obj.position.z,
    ];
    deps.audio?.play("harvest", { position: pos });
    deps.feel?.trigger("harvest", { worldPos: pos });
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
      if (deps.canAttack && !deps.canAttack()) return; // stamina-gated (Workstream 5.1)
      const target = pickTarget(creatures);
      if (!target || target.dying !== null) return;
      deps.onAttack?.();
      if (remote) {
        onInteractIntent?.("attack", target.entity.id);
      } else {
        const died = resolveAttack(target);
        deps.onCombatEvent?.("hitDealt", ATTACK_DAMAGE);
        if (died) {
          deps.onCombatEvent?.("kill", ATTACK_DAMAGE);
          deps.onProgress?.("kill");
        }
      }
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
      else if (resolveFeed(target)) deps.onProgress?.("tame");
    } else if (ev.code === "KeyE") {
      const target = pickTarget(nodes);
      if (!target) return;
      if (remote) onInteractIntent?.("harvest", target.entity.id);
      else {
        resolveHarvest(target);
        deps.onProgress?.("harvest");
      }
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
    // Workstream 2.3 hit-stop: PRESENTATION-only dt dip on the animation
    // mixer step. Every other use of `dt` in this function (steering,
    // positions, wander epoch, clockMs, the net snapshot cadence) keeps the
    // real dt — simulation/netcode must never see the scaled value.
    const animDt = deps.feel?.presentationDt ? deps.feel.presentationDt(dt) : dt;
    for (const c of creatures.values()) {
      c.instance?.update(animDt);
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
      const night = deps.isNight?.() ?? false;
      // an aggressive wild creature that reaches the player bites, on cooldown
      if (
        stats &&
        stats.damage > 0 &&
        c.taming.phase !== "tamed" &&
        distToPlayer <= CONTACT_RANGE_M &&
        clockMs - c.lastBiteMs >= BITE_COOLDOWN_S * 1000
      ) {
        c.lastBiteMs = clockMs;
        lastCombatMs = clockMs;
        const damage =
          stats.damage * (night ? NIGHT_DAMAGE_MULT : 1) * (deps.creatureDamageMult ?? 1);
        if (damage > 0) {
          deps.onPlayerHit?.(damage);
          deps.audio?.play("hurt");
          deps.feel?.trigger("takeDamage", { numberValue: damage });
          deps.onCombatEvent?.("hitTaken", damage);
        }
      }
      const behavior = decideBehavior(
        c.entity.species,
        distToPlayer,
        healthFrac,
        c.taming.phase === "tamed",
        night ? NIGHT_AGGRO_RANGE_MULT : 1,
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
      beginGrow(obj);
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
    beginGrow(mesh);
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
      stepGrowth(dt);
      // Joiner puppets the host's stream: no proximity, no AI. Advance the
      // animation mixers so the streamed poses stay animated, and smooth each
      // creature's rendered transform toward the latest snapshot (`remoteTarget`)
      // rather than snapping on arrival — the 10 Hz stream would otherwise
      // visibly step (ADR 0003 follow-up).
      if (remote) {
        const k = smoothingFactor(dt);
        const [px, pz] = deps.getPlayerXZ();
        // presentation-only (see stepCreatures) — network smoothing below
        // keeps the real dt untouched
        const animDt = deps.feel?.presentationDt ? deps.feel.presentationDt(dt) : dt;
        for (const c of creatures.values()) {
          c.instance?.update(animDt);
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
          // Workstream 9.1 GC-hitch audit: was `stepToward([...], [...], k)`,
          // allocating two input tuples + one output tuple per creature every
          // frame on every joiner — scalar lerpToward writes straight into
          // the existing Vector3, zero allocation.
          c.obj.position.set(
            lerpToward(c.obj.position.x, tx, k),
            lerpToward(c.obj.position.y, ty, k),
            lerpToward(c.obj.position.z, tz, k),
          );
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

    /** A live creature is within F-attack reach (crosshair state seam). */
    hasAttackTarget(): boolean {
      const target = pickTarget(creatures);
      return target !== null && target.dying === null;
    },

    /** A harvestable node OR a feedable/mountable creature is in reach
     *  (crosshair state seam — deliberately coarse: it doesn't distinguish
     *  which of E/T/G would fire, only that *something* other than attack is
     *  available). */
    hasInteractTarget(): boolean {
      const node = pickTarget(nodes);
      if (node) return true;
      const creature = pickTarget(creatures);
      return creature !== null && creature.dying === null && creature.taming.phase === "tamed";
    },

    nameplateTargets(): readonly NameplateTargetEntity[] {
      const out: NameplateTargetEntity[] = [];
      for (const c of creatures.values()) {
        if (c.dying !== null) continue;
        const stats = CREATURE_STATS[c.entity.species];
        out.push({
          id: c.entity.id,
          species: c.entity.species,
          worldPos: [c.obj.position.x, c.obj.position.y, c.obj.position.z],
          health: stats ? c.combat.health : null,
          maxHealth: stats ? stats.maxHealth : null,
          tamed: c.taming.phase === "tamed",
        });
      }
      return out;
    },

    get hoveredCreatureId(): string | null {
      const t = pickTarget(creatures);
      return t && t.dying === null ? t.entity.id : null;
    },

    get inCombat(): boolean {
      return clockMs - lastCombatMs < COMBAT_WINDOW_MS;
    },
  };
}
