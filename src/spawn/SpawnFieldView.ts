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
  SPAWN_CELL_M,
  worldToSpawnCell,
  type SpawnEntity,
} from "../game/domain/spawn/SpawnField";
import { DEFAULT_SPAWN_CAPS, stepSpawns } from "../game/domain/spawn/SpawnProximity";
import { classifyBiome } from "../game/domain/world/BiomeResources";
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
import type { FeelEventId } from "../game/domain/feel/FeelEvents";
import type { ProgressionEventId } from "../game/domain/progression/ProgressionEvents";
import type { MapMarker } from "../game/domain/map/MinimapModel";
import { SPECIES_VISUAL, validGround, type SpawnGround } from "./SpawnPlacement";
import { isOk } from "../game/domain/Result";
import type { WeaponMetadata } from "../game/domain/items/ItemDefinition";
import { WEAPON_REGISTRY } from "../game/domain/combat/WeaponRegistry";
import {
  chargeFraction as meleeChargeFraction,
  resolveMelee,
  type MeleeTarget,
} from "../game/domain/combat/MeleeResolve";

/** Seconds between proximity re-steps when no cell is crossed. */
const STEP_INTERVAL_S = 1.0;
/** Interaction reach (m) for harvest/feed/mount (E/T/G) — melee attack (F)
 *  reads its reach from the weapon instead, see BARE_HANDS_WEAPON/WEAPON_REGISTRY. */
const REACH_M = 3.5;
/** E7.2: a live creature's collision sphere radius for the host's projectile
 *  hit test — generous over any species' actual visual footprint (cozy, not
 *  pixel-precise hitboxes). */
const HITTABLE_RADIUS_M = 0.7;
/** Deterministic crit chance on a player attack — feel-only (Workstream 2). */
const CRIT_CHANCE = 0.15;
/** E7.1: unarmed attack-speed (hits/s ceiling) — bare hands didn't have a
 *  cooldown meter before E7.1, so this is a new, reasonable default rather
 *  than a preserved constant. */
const BARE_HANDS_ATTACK_SPEED = 1.5;
/** E7.1: the "nothing equipped" fallback WeaponMetadata — replaces the old
 *  flat `ATTACK_DAMAGE = 10` constant this module used to hardcode. Reach/
 *  cone are omitted so MeleeResolve's own defaults apply (DEFAULT_REACH_M
 *  matches the pre-E7.1 REACH_M exactly). */
const BARE_HANDS_WEAPON: WeaponMetadata = {
  kind: "melee",
  damage: 10,
  attackSpeed: BARE_HANDS_ATTACK_SPEED,
  damageType: "physical",
  feelEvent: "meleeSwing",
};
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
  /** Called with the stacks gained from a harvest (HUD hook — instant grant,
   *  unchanged). A creature kill's loot goes through `onDropLoot` instead
   *  (E0.5: ground drops, not an instant grant — see its doc comment). */
  onLoot?(stacks: readonly ItemStack[]): void;
  /** E0.5: a creature death's loot roll, to be dropped on the ground at the
   *  kill position rather than granted directly — fixes a pre-E0.5 gap where
   *  the HOST resolving a JOINER's kill (via `applyInteract`) credited the
   *  HOST's own `onLoot`, not the joiner's. A ground drop is actor-agnostic:
   *  whoever interacts with it picks it up, host-authoritatively. */
  onDropLoot?(stacks: readonly ItemStack[], position: readonly [number, number, number]): void;
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
   *  scales up contact-bite damage. Omitted/false = always-day behaviour. Also
   *  feeds E6.3's nocturnal/diurnal creature-activity gate on spawn rolls. */
  isNight?(): boolean;
  /** E6.6: creature spawn-rate multiplier (Settings.creatureSpawnRate),
   *  stacked onto `density` for creature-kind species only. Defaults to 1. */
  creatureSpawnRate?: number;
  /** E6.6: resource spawn-rate multiplier (Settings.resourceSpawnRate),
   *  stacked onto `density` for node-kind species only. Defaults to 1. */
  resourceSpawnRate?: number;
  /** Workstream 5.6: difficulty multiplier on contact-bite damage (peaceful
   *  = 0 disables player-facing creature damage entirely). Defaults to 1. */
  creatureDamageMult?: number;
  /** E1.4b: character `effectiveAttackPowerMultiplier` — scales the
   *  player's own attack damage. A getter so a mid-session stat spend takes
   *  effect immediately. Defaults to 1 (today's flat BARE_HANDS_WEAPON.damage). */
  attackPowerMult?(): number;
  /** E7.1: the item id currently equipped in the weapon slot (e.g. the
   *  selected hotbar item), or null/omitted for bare hands — looked up in
   *  `WEAPON_REGISTRY` for the LOCAL player's own melee swings only. Omitted
   *  entirely = always bare hands (matches the pre-E7.1 boot exactly). */
  equippedWeaponId?(): string | null;
  /** E7.1: the player's forward aim direction on the XZ ground plane
   *  (need not be normalized) — drives the melee forward-cone soft-lock
   *  assist. Omitted = no facing requirement (falls back to the pre-E7.1
   *  reach-only targeting). */
  getAimDir?(): readonly [number, number];
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
  /** Minimap/map marker source (E3.2) — a small additive read-only seam:
   *  the current creatures' and resource nodes' live positions, in the
   *  pluggable `MapMarker` shape `MinimapModel` consumes. Pull-based (no
   *  new per-frame cost of its own — the caller decides how often to ask). */
  liveMarkers(): readonly MapMarker[];
  /** E7.1: 0..1 attack-strength charge for the currently equipped weapon (or
   *  bare hands) — 1 = fully recharged/full damage, drops to 0 right after a
   *  swing and ramps back up over the weapon's `1/attackSpeed` seconds.
   *  Client-side presentation only (feeds the cooldown-meter HUD); the host
   *  still independently re-derives the real charge when it resolves a hit. */
  attackChargeFraction(): number;
  /** E7.2: every live (non-dying) creature's collision sphere, read fresh
   *  each tick by the host's projectile simulation (`HostSession.tick` via
   *  the `findHittableEntities` hook) — host/solo mode only, a joiner has no
   *  authoritative positions to offer. */
  hittableEntities(): readonly { id: string; x: number; y: number; z: number; radius: number }[];
  /** E7.2: apply a HOST-RESOLVED projectile hit (damage already computed by
   *  `HostSession` from its own weapon/charge record) against the target
   *  creature, if it still exists. Returns false if there was nothing to
   *  hit (already dead/removed) — never throws. */
  applyProjectileHit(targetId: string, damage: number, feelEventId?: FeelEventId): boolean;
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
  // E7.1: last time the LOCAL player threw a melee swing — feeds the
  // attack-strength cooldown meter (attackChargeFraction). Starts at
  // -Infinity so a fresh session begins fully charged, like Minecraft 1.9.
  let lastAttackClockMs = -Infinity;
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

  /** E7.1: the LOCAL player's currently equipped weapon, looked up from this
   *  host's own WEAPON_REGISTRY (never trusts a wire value — melee stays off
   *  the trust boundary entirely, see the deps doc comment). Falls back to
   *  BARE_HANDS_WEAPON for an empty slot or a non-weapon item. */
  function currentWeapon(): WeaponMetadata {
    const id = deps.equippedWeaponId?.() ?? null;
    if (id !== null) {
      const found = WEAPON_REGISTRY.get(id);
      if (isOk(found)) return found.value;
    }
    return BARE_HANDS_WEAPON;
  }

  /** Live (non-dying) creatures as MeleeResolve candidates, in the pure
   *  module's 2D ground-plane shape. */
  function liveCreatureTargets(): readonly MeleeTarget[] {
    const out: MeleeTarget[] = [];
    for (const c of creatures.values()) {
      if (c.dying !== null) continue;
      out.push({ id: c.entity.id, position: [c.obj.position.x, c.obj.position.z] });
    }
    return out;
  }

  // Interaction resolution — reused by the local keydown (host/solo) AND by
  // the host's applyInteract when a joiner's intent arrives (ADR 0003). Each
  // returns whether its "counts as progress" outcome happened (a kill, a
  // tame) so the *local-only* call sites below can fire `onProgress` —
  // progression is local-player state (Workstream 6): the host resolving a
  // joiner's remote intent here must never advance the host's own tracker.

  /** Applies one resolved hit to `target`: health, audio/feel, loot + death
   *  animation on a kill. Weapon-driven damage from `resolveMelee` for the
   *  local player's melee, the flat bare-hands hit below for a joiner's
   *  intent, or a HOST-computed projectile hit (E7.2, via `applyProjectileHit`)
   *  — every kind shares the same kill/loot/removal/mount-release path.
   *  `weapon.feelEvent` drives the themed flourish (a projectile passes a
   *  synthesized weapon carrying its own feel event). `saltIndex` keeps a
   *  sweep's several simultaneous crit rolls independent of each other
   *  (index 0 reproduces the pre-E7.1 single-hit roll exactly). Returns true
   *  iff this hit killed the target. */
  function applyMeleeHit(
    target: CreatureEntry,
    damage: number,
    weapon: WeaponMetadata,
    saltIndex = 0,
  ): boolean {
    if (target.dying !== null) return false;
    lastCombatMs = clockMs;
    const r = applyDamage(target.combat, damage);
    target.combat = r.state;
    const pos: [number, number, number] = [
      target.obj.position.x,
      target.obj.position.y,
      target.obj.position.z,
    ];
    deps.audio?.play("hit", { position: pos });
    // deterministic crit roll (same shape as the loot roll below) — a
    // presentation flourish only, never affects the damage actually dealt
    const crit = hashUnitFloat(deps.seed, clockMs | 0, 0x6f10 + saltIndex) < CRIT_CHANCE;
    deps.feel?.trigger("attackHit", { worldPos: pos, numberValue: damage, crit });
    // E7.1: the weapon's own themed swing flourish (meleeSwing for every
    // physical melee weapon today), alongside the generic damage-number hit.
    deps.feel?.trigger(weapon.feelEvent as FeelEventId, { worldPos: pos, crit });
    if (!r.died) return false;
    deps.feel?.trigger("kill", { worldPos: pos, numberValue: damage, crit });
    const roll = hashUnitFloat(deps.seed, clockMs | 0, 0x6f00 + saltIndex);
    const drop = scaleStacks(lootFor(target.entity.species, roll), deps.lootMult?.() ?? 1);
    if (drop.length > 0) deps.onDropLoot?.(drop, pos);
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

  /** Joiner-intent path (`applyInteract`, called by the net glue). The host
   *  has no synced record of a JOINER's equipped weapon yet — E7.0's
   *  `equipItem` intent exists but is deliberately left unwired (activating
   *  it here would touch the net glue / trust boundary, which this additive
   *  slice stays off, see COMBAT_PLAN.md's melee entry). A joiner's F-press
   *  always resolves at the bare-hands rate, full charge, for now — same
   *  numeric outcome as before E7.1. The LOCAL player's own attacks (below,
   *  in the keydown handler) get the real weapon+cooldown+cone treatment;
   *  closing this gap for joiners too is natural E7.2 (equip-state sync)
   *  follow-up work. */
  function resolveAttack(target: CreatureEntry): boolean {
    const damage = BARE_HANDS_WEAPON.damage * (deps.attackPowerMult?.() ?? 1);
    return applyMeleeHit(target, damage, BARE_HANDS_WEAPON);
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
      // E7.1: the forward-cone soft-lock assist replaces the old flat
      // nearest-in-reach pickTarget() for attacks specifically — E/T/G keep
      // the omnidirectional pick unchanged. A weapon with a wide-enough cone
      // (heavy sweep) resolves to several simultaneous hits.
      const weapon = currentWeapon();
      const [px, pz] = deps.getPlayerXZ();
      const resolved = resolveMelee({
        weapon,
        charge: meleeChargeFraction((clockMs - lastAttackClockMs) / 1000, weapon.attackSpeed),
        origin: [px, pz],
        dir: deps.getAimDir?.() ?? [0, 0],
        targets: liveCreatureTargets(),
      });
      if (!isOk(resolved)) return;
      deps.onAttack?.();
      lastAttackClockMs = clockMs;
      if (remote) {
        // Joiner: the cone-assist above only picks WHICH target(s) to swing
        // at (client-side presentation) — the legacy single-target `attack`
        // intent only ever names one, so a sweep's extra targets are a
        // joiner-side visual-only preview until E7.2's equip-state sync
        // closes this gap (see resolveAttack()'s doc comment).
        onInteractIntent?.("attack", resolved.value[0]!.targetId);
      } else {
        const mult = deps.attackPowerMult?.() ?? 1;
        for (let i = 0; i < resolved.value.length; i++) {
          const hit = resolved.value[i]!;
          const target = creatures.get(hit.targetId);
          if (!target) continue;
          const died = applyMeleeHit(target, hit.damage * mult, weapon, i);
          deps.onCombatEvent?.("hitDealt", hit.damage * mult);
          if (died) {
            deps.onCombatEvent?.("kill", hit.damage * mult);
            deps.onProgress?.("kill");
          }
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
        // E6.3: biome resolved per-cell from the same ground height seam
        // materialize()/validGround() already use (the domain has no
        // surface — see BiomeResources.ts's module doc). E6.6: rate
        // multipliers stack onto the existing density; caps are a fixed
        // safety budget, not user-configurable.
        const { enter, leave } = stepSpawns({
          seed: deps.seed,
          epoch: 0,
          density: deps.density,
          players: [[px, pz]],
          active,
          removed,
          gate: {
            biomeAt: (cx, cz) =>
              classifyBiome(
                deps.ground.heightAt((cx + 0.5) * SPAWN_CELL_M, (cz + 0.5) * SPAWN_CELL_M),
              ),
            isNight: deps.isNight?.(),
            creatureRate: deps.creatureSpawnRate ?? 1,
            nodeRate: deps.resourceSpawnRate ?? 1,
          },
          caps: DEFAULT_SPAWN_CAPS,
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

    /** A live creature is within the current weapon's F-attack reach+cone
     *  (crosshair state seam) — mirrors exactly what a KeyF press right now
     *  would resolve, including the E7.1 forward-cone soft-lock assist. */
    hasAttackTarget(): boolean {
      const [px, pz] = deps.getPlayerXZ();
      const resolved = resolveMelee({
        weapon: currentWeapon(),
        charge: 1, // target presence only — charge doesn't affect who's hittable
        origin: [px, pz],
        dir: deps.getAimDir?.() ?? [0, 0],
        targets: liveCreatureTargets(),
      });
      return isOk(resolved);
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

    liveMarkers(): readonly MapMarker[] {
      const out: MapMarker[] = [];
      for (const c of creatures.values()) {
        if (c.dying !== null) continue;
        out.push({ id: c.entity.id, kind: "creature", x: c.obj.position.x, z: c.obj.position.z });
      }
      for (const n of nodes.values()) {
        out.push({ id: n.entity.id, kind: "resourceNode", x: n.obj.position.x, z: n.obj.position.z });
      }
      return out;
    },

    attackChargeFraction(): number {
      const weapon = currentWeapon();
      return meleeChargeFraction((clockMs - lastAttackClockMs) / 1000, weapon.attackSpeed);
    },

    hittableEntities(): readonly { id: string; x: number; y: number; z: number; radius: number }[] {
      const out: { id: string; x: number; y: number; z: number; radius: number }[] = [];
      for (const c of creatures.values()) {
        if (c.dying !== null) continue;
        out.push({
          id: c.entity.id,
          x: c.obj.position.x,
          y: c.obj.position.y,
          z: c.obj.position.z,
          radius: HITTABLE_RADIUS_M,
        });
      }
      return out;
    },

    applyProjectileHit(targetId: string, damage: number, feelEventId: FeelEventId = "arrowHit"): boolean {
      const c = creatures.get(targetId);
      if (!c) return false;
      // Reuse the shared resolved-hit path (E7.1's applyMeleeHit): the host
      // already computed `damage`; a synthesized weapon carries the projectile's
      // own feel event so the flourish reads as an arrow/pebble impact, not a
      // melee swing. Only `weapon.feelEvent` is consulted for a non-lethal hit.
      return applyMeleeHit(c, damage, { ...BARE_HANDS_WEAPON, feelEvent: feelEventId });
    },
  };
}
