/**
 * Workstream 8.1/8.3/8.4 scene wiring (S7b) — the `E`-interact engine glue
 * over the pure `resolvePlaceableInteract` resolver: opens the chest/campfire
 * UIs, toggles a door's mesh + plays its sound, sets the spawn point off a
 * bed, and drives farm-plot planting/harvesting from the hotbar. Solo play
 * (and the host, which IS this same tool acting on its own scene) resolves
 * interactions locally through the domain resolver; a joiner only ever SENDS
 * the intent (`onInteractIntent`) and waits for the host's broadcast
 * (`applyRemoteState`) — Invariant 6, joiners never mutate placeable state.
 *
 * Farm growth-stage visuals are simple procedural marker meshes (a small box
 * that grows/greens with `growthStage`) — no new assets, budget-capped by
 * only existing while a plot is planted.
 */

import type { Object3D, PerspectiveCamera } from 'three';
import { BoxGeometry, Color, Euler, Mesh, Quaternion } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { AudioPort } from '../../game/application/ports/AudioPort';
import type { FeelPort } from '../../game/application/ports/FeelPort';
import type { Localizer } from '../../game/application/i18n/Localizer';
import { isOk } from '../../game/domain/Result';
import type { Recipe } from '../../game/domain/crafting/Crafting';
import { growthStage, type PlotState } from '../../game/domain/farming/Farming';
import { Inventory, type ItemStack } from '../../game/domain/inventory/Inventory';
import { defaultFilterRules } from '../../game/domain/inventory/ItemFilter';
import type { ItemRegistry } from '../../game/domain/items/ItemRegistry';
import type { ItemFilterStore } from '../../game/application/ports/ItemFilterStore';
import { LocalStorageItemFilterStore } from '../../game/infrastructure/persistence/LocalStorageItemFilterStore';
import type { PlaceableAction } from '../../game/domain/net/Protocol';
import type { CampfireState } from '../../game/domain/placeables/Campfire';
import type { ChestState } from '../../game/domain/placeables/ChestTransfer';
import type { DoorState } from '../../game/domain/placeables/Door';
import {
  defaultStateFor,
  resolvePlaceableInteract,
  type InteractContext,
} from '../../game/domain/placeables/PlaceableInteraction';
import {
  deserializePlaceableStore,
  getPlaceable,
  serializePlaceableStore,
  upsertPlaceable,
  type PlaceableStore,
} from '../../game/domain/placeables/PlaceableStore';
import { mountCampfireScreen, type CampfireScreenHandle } from '../../game/ui/components/CampfireScreen';
import { mountChestScreen, type ChestScreenHandle } from '../../game/ui/components/ChestScreen';
import { PLACEABLE_PIECE_IDS } from './PlacementPieces';
import type { PlacedPiece } from './PlacedPieceRegistry';
import type { PlacementToolHandle } from './PlacementTool';

const DOOR_OPEN_YAW_RAD = Math.PI * 0.45;
const PLOT_MARKER_SIZE_M = 0.5;
const PLOT_MARKER_COLORS_HEX = [0x6b5836, 0x8fae4a, 0xa8c95a, 0xd8c23a]; // soil -> sprout -> growing -> ripe

export interface PlaceableSave {
  load(): unknown | undefined;
  persist(data: unknown): void;
}

export interface PlaceableInteractionDeps {
  placement: PlacementToolHandle;
  camera: PerspectiveCamera;
  dom: HTMLElement;
  parent: Object3D;
  registry: ItemRegistry;
  recipes: readonly Recipe[];
  loc: Localizer;
  audio?: AudioPort;
  feel?: FeelPort;
  save?: PlaceableSave;
  /** Item-filter rule persistence (Workstream E4.2) — the chest UI applies
   *  whatever the player last saved from `InventoryScreen`'s Filter tab
   *  read-only; defaults to the same localStorage-backed store. */
  filterStore?: ItemFilterStore;
  getInventory(): Inventory;
  setInventory(inv: Inventory): void;
  addLoot(stacks: readonly ItemStack[]): void;
  getHotbarSelectedItemId(): string | null;
  now(): number;
  roll?(): number;
  setInputEnabled?(enabled: boolean): void;
  setSpawnPoint(x: number, y: number, z: number): void;
  toast(key: string, params?: Record<string, string | number>): void;
  showInteractKeyhint(): void;
  doc?: Document;
}

const INTERACT_REACH_M = 5;

export interface PlaceableInteractionHandle {
  update(): void;
  hasInteractTarget(): boolean;
  ensurePlaceable(piece: PlacedPiece): void;
  forgetPlaceable(piece: PlacedPiece): void;
  dispose(): void;
  // ---- multiplayer seams (mirrors SpawnFieldHandle's remote/onInteractIntent) ----
  remote: boolean;
  onInteractIntent:
    | ((action: PlaceableAction, placeableId: string, itemId?: string, count?: number) => void)
    | null;
  /** Host-side resolution — wired as `HostSessionHooks.onPlaceableInteract`.
   *  Never grants into the host's own inventory (2026-07-19 SR finding 1.2
   *  fix): the `grant`, if any, is returned so `HostSession` can credit the
   *  SENDING peer's authoritative copy instead. */
  resolveHostIntent(
    action: PlaceableAction,
    placeableId: string,
    peerId: string,
    itemId?: string,
    count?: number,
  ): { state: unknown; grant?: { itemId: string; count: number } } | undefined;
  /** Joiner-side reconciliation — wired as `JoinSessionHooks.onPlaceableState`. */
  applyRemoteState(placeableId: string, state: unknown): void;
}

export function attachPlaceableInteraction(deps: PlaceableInteractionDeps): PlaceableInteractionHandle {
  const { placement, dom, registry, recipes, loc } = deps;
  const doc = deps.doc ?? document;

  let store: PlaceableStore = deserializePlaceableStore(deps.save?.load());
  const persist = (): void => deps.save?.persist(serializePlaceableStore(store));

  // boot-sync: any already-committed placeable piece (from the geometry
  // registry, which persists independently under entities['placement.pieces'])
  // without a matching domain-state record gets one — covers a fresh world
  // (first ever commit, handled by ensurePlaceable below) and an older save
  // written before this store existed.
  for (const piece of placement.listPieces()) {
    if (PLACEABLE_PIECE_IDS.has(piece.pieceId) && !getPlaceable(store, String(piece.id))) {
      const def = defaultStateFor(piece.pieceId);
      if (def !== null) store = upsertPlaceable(store, String(piece.id), piece.pieceId, def);
    }
  }
  persist();

  const plotMarkers = new Map<string, Mesh>();
  const plotMaterial = new MeshStandardNodeMaterial();
  plotMaterial.roughness = 0.9;

  const syncPlotMarker = (id: string, piece: PlacedPiece, plot: PlotState): void => {
    let mesh = plotMarkers.get(id);
    if (!plot.cropId) {
      if (mesh) {
        deps.parent.remove(mesh);
        mesh.geometry.dispose();
        plotMarkers.delete(id);
      }
      return;
    }
    const stage = growthStage(plot, deps.now());
    const scale = 0.3 + 0.7 * (stage / Math.max(1, PLOT_MARKER_COLORS_HEX.length - 1));
    if (!mesh) {
      mesh = new Mesh(new BoxGeometry(PLOT_MARKER_SIZE_M, PLOT_MARKER_SIZE_M, PLOT_MARKER_SIZE_M), plotMaterial);
      mesh.position.set(piece.center[0], piece.center[1] + PLOT_MARKER_SIZE_M / 2, piece.center[2]);
      deps.parent.add(mesh);
      plotMarkers.set(id, mesh);
    }
    mesh.scale.setScalar(scale);
    const hex = PLOT_MARKER_COLORS_HEX[Math.min(stage, PLOT_MARKER_COLORS_HEX.length - 1)] as number;
    plotMaterial.color = new Color(hex);
  };

  const doorBaseQuat = new Map<number, Quaternion>();
  const applyDoorVisual = (piece: PlacedPiece, state: DoorState): void => {
    const mesh = placement.meshFor(piece.id);
    if (!mesh) return;
    let base = doorBaseQuat.get(piece.id);
    if (!base) {
      base = mesh.quaternion.clone();
      doorBaseQuat.set(piece.id, base);
    }
    const openRot = new Quaternion().setFromEuler(new Euler(0, state.open ? DOOR_OPEN_YAW_RAD : 0, 0));
    mesh.quaternion.copy(base).multiply(openRot);
  };

  let remote = false;
  let onInteractIntent:
    | ((action: PlaceableAction, placeableId: string, itemId?: string, count?: number) => void)
    | null = null;

  const roll = deps.roll ?? Math.random;

  /** Applies the store/visual side of an outcome — shared by local (solo)
   *  resolution and host-side remote resolution. Never grants an item to any
   *  inventory itself (2026-07-19 SR finding 1.2 fix): a REMOTE outcome's
   *  grant must reach the SENDING peer's authoritative inventory, which only
   *  `HostSession` holds — see `resolveHostIntent` below. */
  function applyOutcomeState(piece: PlacedPiece, outcome: { store: PlaceableStore }): void {
    store = outcome.store;
    persist();
    const record = getPlaceable(store, String(piece.id));
    if (record?.pieceId === 'door') applyDoorVisual(piece, record.state as DoorState);
    if (record?.pieceId === 'plot') syncPlotMarker(String(piece.id), piece, record.state as PlotState);
  }

  /** LOCAL (solo/host-local) resolution only — grants straight into the
   *  acting player's own inventory via `deps.addLoot`. */
  function applyOutcome(
    piece: PlacedPiece,
    outcome: { store: PlaceableStore; grant?: { itemId: string; count: number } },
  ): void {
    applyOutcomeState(piece, outcome);
    if (outcome.grant) deps.addLoot([outcome.grant]);
  }

  function ctxFor(itemId?: string, count?: number): InteractContext {
    return { now: deps.now(), actorId: 'local', registry, recipes, roll: roll(), itemId, count };
  }

  // ---- chest UI ----
  const filterStore = deps.filterStore ?? new LocalStorageItemFilterStore();
  const chestScreen: ChestScreenHandle = mountChestScreen({
    loc,
    registry,
    filterRules: defaultFilterRules(),
    ...(deps.setInputEnabled ? { setInputEnabled: deps.setInputEnabled } : {}),
    doc,
  });
  // Best-effort async load (mirrors GameHud's own item-filter load) — the
  // chest already renders with the domain defaults, so a slow/failed load
  // just means a brief moment before the player's saved rules apply.
  void filterStore.load().then((r) => {
    if (r.ok) chestScreen.setFilterRules(r.value);
  });
  let openChestPieceId: string | null = null;
  function openChest(piece: PlacedPiece, chest: ChestState): void {
    openChestPieceId = String(piece.id);
    const chestInv = Inventory.fromSlots(registry, chest.slots);
    if (!isOk(chestInv)) return;
    chestScreen.open(deps.getInventory(), chestInv.value, (player, chestNext) => {
      deps.setInventory(player);
      const id = openChestPieceId;
      if (!id) return;
      // Local-first, mirrors the DigTool "apply now, sync via intent"
      // pattern: the transfer always updates this player's own view (solo =
      // the whole truth; a joiner's own screen). A joiner's chest mirror is
      // NOT re-broadcast to the host — Workstream 8.1's protocol carries
      // itemId+count for exactly this, but ChestScreen's drag/drop UI moves
      // by SLOT, not itemId+count, so wiring a real depositChest/
      // withdrawChest intent needs that seam added first (deferred, see the
      // S7b report: multiplayer chest sharing is a documented gap).
      store = upsertPlaceable(store, id, 'chest', { capacity: chestNext.capacity, slots: chestNext.slots });
      persist();
    });
  }

  // ---- campfire UI ----
  const campfireScreen: CampfireScreenHandle = mountCampfireScreen({
    loc,
    registry,
    recipes,
    ...(deps.setInputEnabled ? { setInputEnabled: deps.setInputEnabled } : {}),
    onCook: (itemId) => interactWith(openCampfirePieceRef, 'startCook', itemId),
    onCollect: () => interactWith(openCampfirePieceRef, 'collectCook'),
    doc,
  });
  let openCampfirePieceRef: PlacedPiece | null = null;
  function openCampfire(piece: PlacedPiece, state: CampfireState): void {
    openCampfirePieceRef = piece;
    campfireScreen.open(deps.getInventory(), state, deps.now());
  }

  function refreshOpenCampfire(): void {
    if (!campfireScreen.isOpen || !openCampfirePieceRef) return;
    const record = getPlaceable(store, String(openCampfirePieceRef.id));
    if (record?.pieceId === 'campfire') {
      campfireScreen.render(deps.getInventory(), record.state as CampfireState, deps.now());
    }
  }

  function interactWith(piece: PlacedPiece | null, action: PlaceableAction, itemId?: string, count?: number): void {
    if (!piece) return;
    const id = String(piece.id);
    if (remote) {
      onInteractIntent?.(action, id, itemId, count);
      return;
    }
    const outcome = resolvePlaceableInteract(store, action, id, ctxFor(itemId, count));
    if (!outcome) return;
    applyOutcome(piece, outcome);
    refreshOpenCampfire();
  }

  // ---- E-interact ----
  const locked = (): boolean => document.pointerLockElement === dom;
  let lastAimed: PlacedPiece | null = null;

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code !== 'KeyE' || !locked() || placement.isBuildMode()) return;
    const piece = lastAimed;
    if (!piece) return;
    const id = String(piece.id);
    const record = getPlaceable(store, id);
    if (!record) return;

    switch (record.pieceId) {
      case 'door':
      case 'gate':
        interactWith(piece, 'toggleDoor');
        deps.audio?.play('place', { position: piece.center });
        return;
      case 'chest':
        openChest(piece, record.state as ChestState);
        return;
      case 'campfire':
        openCampfire(piece, record.state as CampfireState);
        return;
      case 'bed':
        deps.setSpawnPoint(piece.center[0], piece.center[1], piece.center[2]);
        deps.toast('hud.toast.spawnSet');
        return;
      case 'plot': {
        const plot = record.state as PlotState;
        if (!plot.cropId) {
          const seedId = deps.getHotbarSelectedItemId();
          if (seedId) interactWith(piece, 'plantCrop', seedId);
        } else {
          interactWith(piece, 'harvestCrop');
        }
        return;
      }
      default:
        return;
    }
  }
  window.addEventListener('keydown', onKeyDown);

  const update = (): void => {
    lastAimed = placement.raycastAimedPiece(INTERACT_REACH_M);
    const record = lastAimed ? getPlaceable(store, String(lastAimed.id)) : null;
    if (record) deps.showInteractKeyhint();
  };

  return {
    update,
    hasInteractTarget: () => {
      if (!lastAimed) return false;
      return getPlaceable(store, String(lastAimed.id)) !== null;
    },
    ensurePlaceable(piece: PlacedPiece): void {
      const def = defaultStateFor(piece.pieceId);
      if (def === null) return;
      store = upsertPlaceable(store, String(piece.id), piece.pieceId, def);
      persist();
    },
    forgetPlaceable(piece: PlacedPiece): void {
      const mesh = plotMarkers.get(String(piece.id));
      if (mesh) {
        deps.parent.remove(mesh);
        mesh.geometry.dispose();
        plotMarkers.delete(String(piece.id));
      }
      doorBaseQuat.delete(piece.id);
    },
    get remote() {
      return remote;
    },
    set remote(v: boolean) {
      remote = v;
    },
    get onInteractIntent() {
      return onInteractIntent;
    },
    set onInteractIntent(fn) {
      onInteractIntent = fn;
    },
    resolveHostIntent(action, placeableId, _peerId, itemId, count) {
      const piece = placement.listPieces().find((p) => String(p.id) === placeableId);
      if (!piece) return undefined;
      const outcome = resolvePlaceableInteract(store, action, placeableId, {
        now: deps.now(),
        actorId: _peerId,
        registry,
        recipes,
        roll: roll(),
        ...(itemId !== undefined ? { itemId } : {}),
        ...(count !== undefined ? { count } : {}),
      });
      if (!outcome) return undefined;
      // remote-resolved outcomes never auto-grant into THIS (the host's own)
      // inventory — HostSession credits the correct peer from `grant` below.
      applyOutcomeState(piece, outcome);
      refreshOpenCampfire();
      const record = getPlaceable(store, placeableId);
      return { state: record?.state, ...(outcome.grant ? { grant: outcome.grant } : {}) };
    },
    applyRemoteState(placeableId: string, state: unknown): void {
      const existing = getPlaceable(store, placeableId);
      if (!existing) return;
      store = upsertPlaceable(store, placeableId, existing.pieceId, state);
      persist();
      const piece = placement.listPieces().find((p) => String(p.id) === placeableId);
      if (!piece) return;
      if (existing.pieceId === 'door') applyDoorVisual(piece, state as DoorState);
      if (existing.pieceId === 'plot') syncPlotMarker(placeableId, piece, state as PlotState);
      if (existing.pieceId === 'chest' && openChestPieceId === placeableId) {
        // chest UI reconciles from the host's truth next time it's reopened;
        // mid-session live reconciliation is left as a documented deviation
        // (no per-peer inventory-grant protocol exists yet — see S7b report).
        void state;
      }
      refreshOpenCampfire();
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      chestScreen.dispose();
      campfireScreen.dispose();
      for (const mesh of plotMarkers.values()) {
        deps.parent.remove(mesh);
        mesh.geometry.dispose();
      }
      plotMaterial.dispose();
    },
  };
}
