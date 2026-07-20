/**
 * Ground-drop loot entity + render adapter (E0.5) — mirrors SpawnFieldView's
 * host/joiner shape (ADR 0003) but for dropped stacks instead of creatures:
 * the host owns the authoritative set and streams it (`groundItems`, same
 * pattern as `creatures`); a joiner puppets the stream and never mutates it
 * locally. Manual pickup uses its own key (see PICKUP_KEY, distinct from
 * SpawnFieldView's F/G/T/E/R/B) and its own intent channel — the generic
 * `interact` wire message with action "pickup", resolved host-side via
 * HostSession's `onGroundItemPeek`/`onGroundItemRemove` hooks.
 *
 * Local (solo/host) pickup credits the caller's OWN inventory directly via
 * `tryLocalPickup` — the host trusts itself, the same precedent as
 * SpawnFieldView's local resolveAttack/resolveHarvest. A joiner's pickup (and
 * autoloot, E4.3) always goes out as an intent; only the host's resolved
 * stream ever removes an item from a joiner's view.
 *
 * Autoloot (E4.3): on the host/solo side, each tick evaluates the pure
 * `decideAutoloot` against the live inventory (so a partial-fit pickup tops
 * up and leaves a reduced-count remainder on the ground, never a silent
 * loss). A joiner has no local inventory authority, so it can only ASK — it
 * fires a plain proximity+filter pickup intent per candidate and lets the
 * host's fit check be the one that actually sticks (a joiner never gets
 * partial-stack autoloot credit; deferred, see slice report).
 */

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  type Object3D,
} from "three";
import { decideAutoloot, type AutolootSettings } from "../game/domain/loot/Autoloot";
import { groundItemId, isExpired, spawnGroundItem, type GroundItem } from "../game/domain/loot/GroundItem";
import type { Inventory, ItemStack } from "../game/domain/inventory/Inventory";
import type { MapMarker } from "../game/domain/map/MinimapModel";
import type { GroundItemEntity } from "../game/domain/net/Protocol";

/** Interaction reach (m) — matches SpawnFieldView's REACH_M. */
const REACH_M = 3.5;
/** Ground offset so a dropped stack floats slightly above the terrain. */
const ITEM_LIFT = 0.35;
/** Unpicked drops despawn after 3 minutes — bounds mesh count in a long
 *  solo/host session; a joiner never expires locally (host truth only). */
const DESPAWN_MS = 3 * 60 * 1000;
/** Autoloot re-evaluates a few times a second — plenty responsive for a
 *  walking player, far cheaper than a per-frame Inventory.add scan. */
const AUTOLOOT_INTERVAL_S = 0.25;
/** Host: stream the active ground-item set at a slower cadence than the 10 Hz
 *  creature stream — drops are static, so this is plenty responsive. */
const SNAPSHOT_INTERVAL_S = 0.5;
/** F/G/T/E/R/B are all taken by SpawnFieldView/PlacementTool — X is free. */
export const PICKUP_KEY = "KeyX";
/** Host cap on the active drop set, matching the wire validator's
 *  MAX_WIRE_GROUND_ITEMS (Protocol.ts) — past it a `groundItems` snapshot
 *  would be rejected wholesale by every joiner's parseMessage, silently
 *  freezing loot sync. Oldest drop is evicted first (same loss a despawn
 *  would cause, just earlier). */
const MAX_ACTIVE_ITEMS = 256;

export interface GroundItemGround {
  heightAt(x: number, z: number): number;
}

export interface GroundItemFieldDeps {
  readonly parent: Object3D;
  readonly ground: GroundItemGround;
  getPlayerXZ(): readonly [number, number];
  /** Pointer-lock target — pickup only fires while locked (matches SpawnFieldView). */
  readonly dom?: HTMLElement;
  /** Local (solo/host) pickup credit — returns true iff it fully applied
   *  (the caller already mutated its own inventory); false leaves the ground
   *  item untouched. */
  tryLocalPickup?(itemId: string, count: number): boolean;
  /** E4.3 — polled each autoloot tick (not cached), so a live settings
   *  change takes effect immediately. Omitted/disabled = autoloot off. */
  getAutolootSettings?(): AutolootSettings;
  /** The live player inventory autoloot decides fit against (read-only). */
  getInventory?(): Inventory;
  /** A "bag full" toast (E4.3) — fired on the not-full → full transition
   *  only, never every tick. Host/solo only (see module doc). */
  onBagFull?(): void;
  /** Test seam; defaults to a real clock. */
  now?(): number;
}

export interface GroundItemFieldHandle {
  update(dt: number): void;
  dispose(): void;
  readonly activeCount: number;
  /** A ground item is within pickup reach (crosshair/keyhint seam). */
  hasPickupTarget(): boolean;
  /** E3 map source: every active drop as a `groundLoot` marker. */
  liveMarkers(): readonly MapMarker[];
  /** Host/solo: drop a set of stacks at a world position (creature death,
   *  E0.5). Zero/negative-count stacks are skipped. `sourceId` seeds
   *  deterministic ids (defaults to an internal counter). */
  spawnDrop(
    stacks: readonly ItemStack[],
    position: readonly [number, number, number],
    sourceId?: string,
  ): void;
  /** Joiner mode (ADR 0003): puppet the host's stream instead of local state. */
  remote: boolean;
  /** Host: called on a cadence with the full active set for the net glue to stream. */
  onSnapshot: ((entities: readonly GroundItemEntity[]) => void) | null;
  /** Joiner: a pickup press/autoloot candidate becomes an intent for the host. */
  onInteractIntent: ((targetId: string) => void) | null;
  /** Joiner: apply a host snapshot (add/remove/count-update). */
  applySnapshot(entities: readonly GroundItemEntity[]): void;
  /** Host: HostSession's two-phase pickup resolution — peek without
   *  mutating, remove only after the credit committed. */
  peek(targetId: string): { itemId: string; count: number } | undefined;
  remove(targetId: string): void;
}

export function attachGroundItemField(deps: GroundItemFieldDeps): GroundItemFieldHandle {
  const group = new Group();
  deps.parent.add(group);
  const geometry = new OctahedronGeometry(0.22, 0);
  const material = new MeshStandardMaterial({
    color: 0xf2c94c,
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0x3a2a00,
  });

  const items = new Map<string, { item: GroundItem; obj: Mesh }>();
  let dropCounter = 0;
  let remote = false;
  let onSnapshot: ((entities: readonly GroundItemEntity[]) => void) | null = null;
  let onInteractIntent: ((targetId: string) => void) | null = null;
  let clockMs = 0;
  let snapAcc = 0;
  let autolootAcc = 0;
  let wasBagFull = false;
  const now = deps.now ?? (() => clockMs);

  function makeObj(position: readonly [number, number, number]): Mesh {
    const mesh = new Mesh(geometry, material);
    const [x, , z] = position;
    mesh.position.set(x, deps.ground.heightAt(x, z) + ITEM_LIFT, z);
    return mesh;
  }

  function add(item: GroundItem): void {
    const obj = makeObj(item.position);
    obj.name = item.id;
    group.add(obj);
    items.set(item.id, { item, obj });
  }

  function removeLocal(id: string): void {
    const entry = items.get(id);
    if (!entry) return;
    group.remove(entry.obj);
    items.delete(id);
  }

  function locked(): boolean {
    return deps.dom === undefined || document.pointerLockElement === deps.dom;
  }

  function pickNearest(): { item: GroundItem; obj: Mesh } | null {
    const [px, pz] = deps.getPlayerXZ();
    let best: { item: GroundItem; obj: Mesh } | null = null;
    let bestSq = REACH_M * REACH_M;
    for (const entry of items.values()) {
      const dx = entry.obj.position.x - px;
      const dz = entry.obj.position.z - pz;
      const d = dx * dx + dz * dz;
      if (d <= bestSq) {
        best = entry;
        bestSq = d;
      }
    }
    return best;
  }

  function attemptLocalPickup(id: string): void {
    const entry = items.get(id);
    if (!entry) return;
    const applied = deps.tryLocalPickup?.(entry.item.itemId, entry.item.count) ?? false;
    if (applied) removeLocal(id);
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!locked()) return;
    if (ev.code !== PICKUP_KEY) return;
    const target = pickNearest();
    if (!target) return;
    if (remote) onInteractIntent?.(target.item.id);
    else attemptLocalPickup(target.item.id);
  };
  window.addEventListener("keydown", onKeyDown);

  function runAutolootLocal(): void {
    const settings = deps.getAutolootSettings?.();
    const inventory = deps.getInventory?.();
    if (!settings?.enabled || !inventory) return;
    const [px, pz] = deps.getPlayerXZ();
    const decision = decideAutoloot({
      items: [...items.values()].map((e) => e.item),
      playerPosition: [px, 0, pz],
      inventory,
      settings,
    });
    for (const p of decision.pickedUp) {
      const applied = deps.tryLocalPickup?.(p.item.itemId, p.count) ?? false;
      if (!applied) continue; // race: bag filled between decide and apply — leave it
      if (p.count >= p.item.count) {
        removeLocal(p.item.id);
        continue;
      }
      const entry = items.get(p.item.id);
      if (entry) {
        items.set(p.item.id, {
          item: { ...entry.item, count: entry.item.count - p.count },
          obj: entry.obj,
        });
      }
    }
    if (decision.bagFull !== wasBagFull) {
      if (decision.bagFull) deps.onBagFull?.();
      wasBagFull = decision.bagFull;
    }
  }

  function runAutolootRemote(): void {
    const settings = deps.getAutolootSettings?.();
    if (!settings?.enabled) return;
    const [px, pz] = deps.getPlayerXZ();
    const radiusSq = settings.radiusM * settings.radiusM;
    for (const entry of items.values()) {
      const dx = entry.obj.position.x - px;
      const dz = entry.obj.position.z - pz;
      if (dx * dx + dz * dz <= radiusSq) onInteractIntent?.(entry.item.id);
    }
  }

  function buildSnapshot(): GroundItemEntity[] {
    return [...items.values()].map(({ item }) => ({
      id: item.id,
      itemId: item.itemId,
      count: item.count,
      x: item.position[0],
      y: item.position[1],
      z: item.position[2],
    }));
  }

  function applySnapshot(entities: readonly GroundItemEntity[]): void {
    const live = new Set(entities.map((e) => e.id));
    for (const id of [...items.keys()]) if (!live.has(id)) removeLocal(id);
    for (const e of entities) {
      const existing = items.get(e.id);
      if (existing) {
        if (existing.item.count !== e.count) {
          items.set(e.id, { item: { ...existing.item, count: e.count }, obj: existing.obj });
        }
        continue;
      }
      add(
        spawnGroundItem({
          id: e.id,
          itemId: e.itemId,
          count: e.count,
          position: [e.x, e.y, e.z],
          spawnedAtMs: now(),
        }),
      );
    }
  }

  return {
    spawnDrop(stacks, position, sourceId): void {
      const source = sourceId ?? `drop:${dropCounter++}`;
      stacks.forEach((stack, i) => {
        if (stack.count <= 0) return;
        if (items.size >= MAX_ACTIVE_ITEMS) {
          // host-only path (a joiner never calls spawnDrop), so insertion
          // order == spawn order and the Map's first key is the oldest drop
          const oldest = items.keys().next().value;
          if (oldest !== undefined) removeLocal(oldest);
        }
        add(
          spawnGroundItem({
            id: groundItemId(source, stack.itemId, i),
            itemId: stack.itemId,
            count: stack.count,
            position,
            spawnedAtMs: now(),
            despawnAfterMs: DESPAWN_MS,
          }),
        );
      });
    },

    applySnapshot,

    peek(targetId: string): { itemId: string; count: number } | undefined {
      const entry = items.get(targetId);
      return entry ? { itemId: entry.item.itemId, count: entry.item.count } : undefined;
    },

    remove(targetId: string): void {
      removeLocal(targetId);
    },

    update(dt: number): void {
      clockMs += dt * 1000;
      if (!remote) {
        for (const [id, entry] of [...items]) {
          if (isExpired(entry.item, now())) removeLocal(id);
        }
      }
      autolootAcc += dt;
      if (autolootAcc >= AUTOLOOT_INTERVAL_S) {
        autolootAcc = 0;
        if (remote) runAutolootRemote();
        else runAutolootLocal();
      }
      if (!remote && onSnapshot) {
        snapAcc += dt;
        if (snapAcc >= SNAPSHOT_INTERVAL_S) {
          snapAcc = 0;
          onSnapshot(buildSnapshot());
        }
      }
    },

    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      for (const id of [...items.keys()]) removeLocal(id);
      deps.parent.remove(group);
      geometry.dispose();
      material.dispose();
    },

    get activeCount(): number {
      return items.size;
    },

    hasPickupTarget(): boolean {
      return pickNearest() !== null;
    },

    liveMarkers(): readonly MapMarker[] {
      return [...items.values()].map(({ item }) => ({
        id: item.id,
        kind: "groundLoot" as const,
        x: item.position[0],
        z: item.position[2],
      }));
    },

    get remote() {
      return remote;
    },
    set remote(v: boolean) {
      remote = v;
    },
    get onSnapshot() {
      return onSnapshot;
    },
    set onSnapshot(v: ((entities: readonly GroundItemEntity[]) => void) | null) {
      onSnapshot = v;
    },
    get onInteractIntent() {
      return onInteractIntent;
    },
    set onInteractIntent(v: ((targetId: string) => void) | null) {
      onInteractIntent = v;
    },
  };
}
