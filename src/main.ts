/** LAAS entry point — boot sequence with fail-loud diagnostics. */

import { Vector3 } from 'three';
import { BootUI } from './core/BootUI';
import { browserGate, detectCapabilityTier } from './core/BrowserGate';
import {
  describeDiagnostics,
  failLoud,
  installGlobalErrorHooks,
  probeWebGPU,
} from './core/Diagnostics';
import { Engine } from './core/Engine';
import { FlyCamera } from './core/FlyCamera';
import { initHooks, type LaasHooks } from './core/Hooks';
import { createLocalizer } from './game/ui/i18n/strings';
import { injectStyles } from './game/ui/styles';
import { mountLoadingScreen } from './game/ui/components/LoadingScreen';
import type { Locale } from './game/domain/i18n/translate';
import { parseCamString, parseParams, type QualityPreset } from './core/Params';
import { WorldSeed } from './core/Seed';
import { resolveRenderPreset } from './game/domain/capability/RenderPreset';
import type { GraphicsPreset } from './game/domain/settings/Settings';
import { isErr, isOk } from './game/domain/Result';
import { defaultSettings } from './game/domain/settings/Settings';
import type { PlayerState } from './game/domain/world/WorldSaveData';
import type { WorldSaveStore } from './game/application/ports/WorldSaveStore';
import { WorldLifecycle } from './game/application/WorldLifecycle';
import { InventoryPersistence } from './game/application/InventoryPersistence';
import { Inventory } from './game/domain/inventory/Inventory';
import { ItemRegistry } from './game/domain/items/ItemRegistry';
import { STARTER_ITEMS } from './game/domain/items/starterItems';
import type { SerializedInventoryWire } from './game/domain/net/Protocol';
import {
  WorldClockPersistence,
  readWorldClockHour,
  WORLD_CLOCK_ENTITY_KEY,
} from './game/application/WorldClockPersistence';
import { WorldClockService } from './game/application/WorldClockService';
import {
  camPoseToPlayerState,
  isDefaultPlayerState,
  mountGameUi,
  playerStateToCamPose,
  shouldMountMenu,
} from './game/app/composeGameUi';
import { InMemoryWorldSaveStore } from './game/infrastructure/persistence/InMemoryWorldSaveStore';
import { WebAudioAdapter } from './game/infrastructure/audio/WebAudioAdapter';
import { attachHostNet, createJoinNet, type JoinNetHandle } from './net/NetSync';
import { HOST_PEER_ID } from './game/application/HostSession';
import { IndexedDbKeyValueStore } from './game/infrastructure/persistence/IndexedDbKeyValueStore';
import { LocalStorageSettingsStore } from './game/infrastructure/persistence/LocalStorageSettingsStore';
import { OpfsBlobStore } from './game/infrastructure/persistence/OpfsBlobStore';
import { PersistentWorldSaveStore } from './game/infrastructure/persistence/PersistentWorldSaveStore';
import { Hud } from './debug/HUD';
import { buildGalleryScene } from './debug/GalleryScene';
import { buildSanityScene } from './debug/SanityScene';
import { buildVoxelDevScene } from './debug/VoxelDevScene';
import { buildShadowTestScene } from './debug/ShadowTestScene';
import { buildTerrainScene } from './debug/TerrainScene';
import { buildScene, registerScene, type WorldContext } from './debug/Scenes';

/**
 * M1.6 boot preset when the URL carries no explicit `?preset=`: capability
 * tier (mobile-reduced → 'mobile') → persisted game settings → 'high'.
 * Storage failures fall through to the default — never break boot over it.
 */
async function bootFallbackPreset(): Promise<QualityPreset> {
  const { tier } = detectCapabilityTier();
  let persisted: GraphicsPreset | null = null;
  if (tier !== 'mobile-reduced') {
    try {
      const loaded = await new LocalStorageSettingsStore().load();
      if (!isErr(loaded)) persisted = loaded.value.graphicsPreset;
    } catch (e) {
       
      console.warn('[laas] settings unavailable, using default preset:', e);
    }
  }
  return resolveRenderPreset(tier, persisted);
}

/** Mirrors `bootFallbackPreset` for the domain `dayLengthSeconds` setting
 *  (Workstream E0.3) — only ever consulted on a menu launch (gameplay world);
 *  a tooling/dev scene boot never calls this. */
async function loadDayLengthSeconds(): Promise<number> {
  try {
    const loaded = await new LocalStorageSettingsStore().load();
    if (!isErr(loaded)) return loaded.value.dayLengthSeconds;
  } catch (e) {

    console.warn('[laas] settings unavailable, using default day length:', e);
  }
  return defaultSettings().dayLengthSeconds;
}

/** Everything a menu launch overrides on the URL boot path (M8 lifecycle). */
interface MenuLaunch {
  seed: number;
  worldId: string;
  playerState: PlayerState;
  store: WorldSaveStore;
  /** Persisted time-of-day hour (Workstream E0.3) — undefined on a brand-new
   *  world or a join (joiners never own the save); falls back to the URL/
   *  scene's default boot hour. */
  worldClockHour?: number;
  /** Present when this boot JOINS a remote world (M7): the live net session
   *  created before the boot; the store is in-memory (host owns the save). */
  join?: JoinNetHandle;
  /** JOIN-only (E0.4 wave-3): caches the host's echoed inventoryState locally
   *  under this room's stable code, so rejoining the SAME room from this
   *  device restores it as the next join claim (see `joinerInventoryStore`). */
  persistInventoryState?(wire: SerializedInventoryWire): void;
}

async function boot(): Promise<void> {
  const hooks = initHooks();
  installGlobalErrorHooks();
  // environment gate BEFORE any loading: unsupported mobile / non-Chromium /
  // missing WebGPU each get a clear notice instead of a broken boot; a
  // WebGPU-capable mobile proceeds on the reduced path (?nogate=1 skips)
  if (!browserGate()) return;
  // front-of-game menu on a bare URL; any engine param (?scene/seed/cam/shot,
  // or ?menu=0) boots directly so every tooling/dev URL behaves exactly as
  // before the menu existed
  if (shouldMountMenu(window.location.search)) {
    mountMenu(hooks);
    return;
  }
  await bootEngine(hooks, null);
}

/** E0.4 wave-3: a joiner's own gear, cached locally per joinable room so
 *  rejoining the SAME room on this device restores it as the join claim
 *  (`HostSession` re-seeds only ONCE per connection and fully revalidates
 *  against its live item registry — this cache can never let a peer conjure
 *  or dupe an item, only lose/skip the convenience if it's stale/absent). A
 *  SEPARATE IndexedDB database from the real per-world store (`laas-world-meta`)
 *  so a joined room's code never leaks into the menu's own "my worlds" list —
 *  the OPFS blob store IS shared, but every record here carries `modifiedChunks:
 *  []`, so it never writes a chunk blob a real world could collide with.
 *  In-memory (session-only) when OPFS is unavailable. */
function joinerInventoryStore(): WorldSaveStore {
  return 'storage' in navigator && 'getDirectory' in navigator.storage
    ? new PersistentWorldSaveStore(new OpfsBlobStore(), new IndexedDbKeyValueStore('laas-joiner-inventory'))
    : new InMemoryWorldSaveStore();
}

function serializeInventory(inv: Inventory): SerializedInventoryWire {
  return {
    capacity: inv.capacity,
    slots: inv.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
  };
}

/** Overwrites the whole cached record for `roomKey` — simpler and more
 *  robust than a read-modify-write (InventoryPersistence.saveInventory)
 *  since a brand-new room has no prior record to modify; nothing else in
 *  this record is ever read back except `inventories.local`. */
async function saveJoinerInventory(
  store: WorldSaveStore,
  roomKey: string,
  wire: SerializedInventoryWire,
): Promise<void> {
  await store.save({
    worldId: roomKey,
    seed: 0,
    name: '',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    modifiedChunks: [],
    entities: {},
    inventories: { local: wire },
    progression: {},
    playerState: { position: [0, 0, 0], yaw: 0, pitch: 0 },
  });
}

/**
 * Front-of-game composition root: ONE shared persistent world store (OPFS +
 * IndexedDB; in-memory fallback keeps the menu usable without OPFS) feeds the
 * menu/lobby, and a launch tears the menu down and boots the engine with the
 * chosen world's seed/id/pose over that same store.
 */
function mountMenu(hooks: LaasHooks): void {
  // the engine boot overlay stays idle behind the menu — hide it until launch
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.style.display = 'none';

  const worlds: WorldSaveStore =
    'storage' in navigator && 'getDirectory' in navigator.storage
      ? new PersistentWorldSaveStore(new OpfsBlobStore(), new IndexedDbKeyValueStore())
      : new InMemoryWorldSaveStore();

  const container = document.createElement('div');
  container.id = 'menu';
  container.style.cssText =
    'position:fixed;inset:0;overflow:auto;display:flex;align-items:center;' +
    'justify-content:center;text-align:center;color:#c8d8d0;z-index:5;';
  document.body.appendChild(container);

  // menu-only click/hover sounds; construction alone never plays anything —
  // the AudioContext stays suspended until the first user gesture resumes it.
  const menuAudio = new WebAudioAdapter();

  mountGameUi(container, {
    audio: menuAudio,
    worlds,
    onLaunch: (launch) => {
      container.remove();
      if (bootEl) bootEl.style.display = '';
      bootEngine(hooks, {
        seed: launch.seed,
        worldId: launch.worldId,
        playerState: launch.playerState,
        store: worlds,
        worldClockHour: readWorldClockHour(launch.save.entities) ?? undefined,
      }).catch(reportBootFailure);
    },
    // M7 join-by-code: bring the net session up FIRST — the welcome snapshot
    // is what the engine boots from. The joiner's world lives in an in-memory
    // store (the host owns the durable save; a joiner never writes OPFS).
    onJoinByCode: async (code) => {
      // E0.4 wave-3: the join claim carries whatever THIS device cached for
      // THIS room code last time (see `joinerInventoryStore` above) — omitted
      // on a brand-new room, exactly like the host's own documented default
      // ("no claim ⇒ fresh empty inventory").
      const roomKey = code.toUpperCase();
      const itemsReg = ItemRegistry.create(STARTER_ITEMS);
      const invStore = joinerInventoryStore();
      const invPersistence = isOk(itemsReg) ? new InventoryPersistence(invStore, itemsReg.value) : null;
      let initialInventory: SerializedInventoryWire | undefined;
      if (invPersistence) {
        const loadedInv = await invPersistence.loadInventory(roomKey, 'local');
        if (isOk(loadedInv)) initialInventory = serializeInventory(loadedInv.value);
      }
      const join = createJoinNet(code, initialInventory ? { initialInventory } : {});
      const welcome = await join.waitForWelcome();
      if (!welcome) {
        join.dispose();
        return false;
      }
      const store = new InMemoryWorldSaveStore();
      const now = Date.now();
      const defaultPose: PlayerState = { position: [0, 0, 0], yaw: 0, pitch: 0 };
      await store.save({
        worldId: welcome.worldId,
        seed: welcome.seed,
        name: welcome.name,
        createdAt: now,
        modifiedAt: now,
        modifiedChunks: welcome.modifiedChunks,
        entities: welcome.entities,
        inventories: {},
        progression: {},
        playerState: defaultPose,
      });
      container.remove();
      if (bootEl) bootEl.style.display = '';
      bootEngine(hooks, {
        seed: welcome.seed,
        worldId: welcome.worldId,
        playerState: defaultPose,
        store,
        join,
        ...(invPersistence
          ? { persistInventoryState: (wire: SerializedInventoryWire) => void saveJoinerInventory(invStore, roomKey, wire) }
          : {}),
      }).catch(reportBootFailure);
      return true;
    },
  });
}

async function bootEngine(hooks: LaasHooks, launch: MenuLaunch | null): Promise<void> {
  const urlParams = parseParams(window.location.search, await bootFallbackPreset());
  // a menu launch is a world boot from the save's seed; everything else on
  // the params surface keeps its URL/default semantics
  const params = launch ? { ...urlParams, seed: launch.seed, scene: 'world' } : urlParams;
  const bootUI = new BootUI(hooks);
  // Workstream 9.3: rotating localized tips under the real progress bar for
  // the ~45-50s full-world boot — additive to BootUI (engine-owned), never
  // touches it. Disposed once the world is actually ready, below.
  const loadingScreen = mountLoadingScreen(createLocalizer(browserLocale()));

  bootUI.set(0.02, 'probing WebGPU');
  const diag = await probeWebGPU();
  hooks.diag = diag;
  if (!diag.ok) {
    loadingScreen.dispose();
    failLoud('WebGPU unavailable — LAAS has no fallback by design', [
      diag.reason ?? 'unknown reason',
      '',
      'Chrome exposes WebGPU here, but no usable GPU adapter came up. Check:',
      '  • chrome://gpu — WebGPU should read “Hardware accelerated”',
      '  • Settings → System → hardware acceleration ON, then relaunch',
      '  • update Chrome and the GPU driver',
    ]);
    return;
  }
   
  console.log('[laas] webgpu ok\n' + describeDiagnostics(diag).join('\n'));

  bootUI.set(0.08, 'creating renderer');
  const engine = await Engine.create(params, hooks);

  // FlyCamera's update MUST register before any scene system: updateFns run
  // in registration order, and subsystems copy camera state in their own
  // updates — the mover has to run first or every copy is one frame stale
  // during interactive motion (clouds/aerial visibly lagged the camera).
  const fly = new FlyCamera(engine.camera, engine.renderer.domElement);
  engine.onUpdate((dt) => fly.update(dt));

  // Workstream 1 audio: only a real menu-launched game boot gets a bus graph
  // (never a tooling/dev URL scene) — the AudioContext stays suspended until
  // the browser's first user gesture, so nothing plays before interaction.
  const audioAdapter = launch ? new WebAudioAdapter() : null;
  if (audioAdapter) {
    const fwd = new Vector3();
    const up = new Vector3();
    engine.onUpdate(() => {
      engine.camera.getWorldDirection(fwd);
      up.set(0, 1, 0).applyQuaternion(engine.camera.quaternion);
      audioAdapter.updateListener({
        position: [engine.camera.position.x, engine.camera.position.y, engine.camera.position.z],
        forward: [fwd.x, fwd.y, fwd.z],
        up: [up.x, up.y, up.z],
      });
    });
  }

  const seed = new WorldSeed(params.seed);
  registerScene('sanity', buildSanityScene);
  registerScene('terrain', buildTerrainScene);
  registerScene('gallery', buildGalleryScene);
  registerScene('shadowtest', buildShadowTestScene);
  // M8 voxel proving ground — full dig stack over an analytic surface
  registerScene('voxeldev', buildVoxelDevScene);
  // 'world' becomes the streamed open world once terrain tiles land.
  registerScene('world', buildTerrainScene);

  const ctx: WorldContext = {
    engine,
    params,
    seed,
    hooks,
    progress: (p, msg) => bootUI.set(0.1 + p * 0.85, msg),
    ...(audioAdapter ? { audio: audioAdapter } : {}),
    ...(launch
      ? {
          world: {
            worldId: launch.worldId,
            store: launch.store,
            poseProvider: () => camPoseToPlayerState(fly.getPose()),
          },
        }
      : {}),
  };
  await buildScene(params.scene, ctx);

  // a menu launch with a SAVED pose restores it over the scene's default
  // spawn (initialPose is the existing seam main applies below); a fresh
  // world's all-zero pose keeps the scene's spawn. initialPoseMode stays as
  // the scene chose it ('walk' for the world spawn).
  if (launch && !isDefaultPlayerState(launch.playerState)) {
    hooks.initialPose = playerStateToCamPose(launch.playerState);
  }

  // terrain probe first — walk mode + fly soft-collision depend on it
  if (hooks.groundProbe) fly.groundProbe = hooks.groundProbe;
  if (params.cam !== null) {
    const pose = parseCamString(params.cam);
    if (pose) fly.setPose(pose); // explicit pose ⇒ fly semantics
  } else if (hooks.initialPose) {
    fly.setPose(hooks.initialPose);
    // grounded RPG exploration is the interactive default (V toggles fly);
    // ?walk=0 keeps tooling/legacy behavior
    const q = new URLSearchParams(window.location.search);
    if (hooks.initialPoseMode === 'walk' && q.get('walk') !== '0') {
      fly.setMode('walk');
    }
  }

  new Hud(engine, params);

  hooks.setPose = (p) => fly.setPose(p);
  hooks.getPose = () => fly.getPose();
  hooks.setMoveSpeedScale = (s) => {
    fly.speedScale = s;
  };
  hooks.settle = (frames?: number) => engine.settle(frames ?? 8);
  hooks.flyCamEnabled = (on) => {
    fly.enabled = on;
  };
  // net-probe seam: which world seed actually booted (menu boots carry no URL seed)
  (window as unknown as { __laasSeed?: number }).__laasSeed = params.seed;

  // Workstream E0.3: a live domain day/night clock, wired ONLY for a menu
  // launch (gameplay world) — tooling/dev scene boots (`launch === null`)
  // never construct this, so their static boot-time sky stays byte-identical.
  // Feeds the engine's existing `hooks.setTimeOfDay` write seam every frame
  // (same seam TerrainScene's own `[`/`]` stepping and bookmarks already use).
  let worldClock: WorldClockService | null = null;
  if (launch) {
    const dayLengthSeconds = await loadDayLengthSeconds();
    worldClock = new WorldClockService(
      dayLengthSeconds,
      launch.worldClockHour ?? params.timeOfDay,
      { setTimeOfDay: (hour) => hooks.setTimeOfDay?.(hour) },
    );
    const clock = worldClock;
    engine.onUpdate((dt) => clock.tick(dt));
  }

  // M7 multiplayer glue: every menu-launched world is joinable (host), and a
  // join boot binds its pre-created session to the now-live scene (joiner)
  if (launch?.join) {
    // ADR 0002 §5: when the host drops, freeze the joiner and wait a grace
    // window for a transient reconnect; if it doesn't return, go to the menu.
    const hostWatch = installHostOfflineWatch(hooks);
    // E5.1/E5.2/E5.4: the scene builds BEFORE this session exists, so it
    // can only render party UI (see `Scenes.ts`'s `applyParty`/etc — set by
    // TerrainScene above) — wire the OUTGOING sends here, now that the real
    // `JoinNetHandle` exists.
    if (ctx.world) {
      ctx.world.selfPeerId = launch.join.selfId();
      ctx.world.sendPartyAction = (action) => launch.join?.sendPartyAction(action);
      ctx.world.sendPartyVitals = (report) => launch.join?.sendPartyVitals(report);
      ctx.world.sendPartyInventoryLookup = (targetPeerId) =>
        launch.join?.sendPartyInventoryLookup(targetPeerId);
      ctx.world.partyPeerNames = () => launch.join?.peerNames() ?? new Map();
    }
    const world = launch.join.attachWorld({
      voxels: ctx.world?.voxels ?? null,
      spawns: ctx.world?.spawns ?? null,
      groundItems: ctx.world?.groundItems ?? null,
      placeables: ctx.world?.placeables ?? null,
      parent: engine.scene,
      getPose: () => camPoseToPlayerState(fly.getPose()),
      onHostGone: hostWatch.onGone,
      onHostReturned: hostWatch.onReturned,
      // E0.4 wave-3: the host's authoritative echo is the ONLY path this
      // joiner's inventory UI updates from — never a local mutation.
      onInventoryState: (wire) => {
        ctx.world?.applyInventoryState?.(wire);
        launch.persistInventoryState?.(wire);
      },
      onParty: (msg) => ctx.world?.applyParty?.(msg),
      onPartyInvite: (msg) => ctx.world?.applyPartyInvite?.(msg),
      onPartyInventoryState: (msg) => ctx.world?.applyPartyInventoryState?.(msg),
    });
    engine.onUpdate((dt) => world.update(dt));
  } else if (launch) {
    const net = await attachHostNet({
      worldId: launch.worldId,
      seed: launch.seed,
      store: launch.store,
      getPose: () => camPoseToPlayerState(fly.getPose()),
      voxels: ctx.world?.voxels ?? null,
      spawns: ctx.world?.spawns ?? null,
      groundItems: ctx.world?.groundItems ?? null,
      placeables: ctx.world?.placeables ?? null,
      ...(ctx.world?.registry ? { registry: ctx.world.registry } : {}),
      parent: engine.scene,
      onParty: (msg) => ctx.world?.applyParty?.(msg),
      onPartyInvite: (msg) => ctx.world?.applyPartyInvite?.(msg),
      onPartyInventoryState: (msg) => ctx.world?.applyPartyInventoryState?.(msg),
    });
    engine.onUpdate((dt) => net.update(dt));
    console.log(`[laas] room code: ${net.code}`);
    showRoomCodeBadge(net.code);
    // E5.1/E5.6: the host plays as `HostSession.HOST_PEER_ID` — see
    // `Scenes.ts`'s `sendPartyAction`/etc, set here now that `net` exists.
    if (ctx.world) {
      ctx.world.selfPeerId = HOST_PEER_ID;
      ctx.world.sendPartyAction = (action) => net.applyPartyAction(action);
      ctx.world.sendPartyVitals = (report) =>
        net.reportVitals(createLocalizer(browserLocale()).t('party.hostName'), report);
      ctx.world.sendPartyInventoryLookup = (targetPeerId) => net.requestPartyInventoryLookup(targetPeerId);
      ctx.world.partyPeerNames = () => net.peerNames();
    }
  }

  // menu-launched worlds persist the player's pose on exit so the next
  // launch restores where they left off (the live camera owns the pose);
  // a JOINER saves nothing — the host owns the world save
  if (launch && !launch.join) {
    const lifecycle = new WorldLifecycle(launch.store);
    // Workstream E0.3: persist the live clock hour alongside pose so a
    // reload resumes the same time of day — a JOINER never owns the save.
    const clockPersistence = worldClock ? new WorldClockPersistence(launch.store) : null;
    const savePose = (): void => {
      // when the voxel subsystem owns the save, flush IT (one write of live
      // chunks + live pose) — the load-modify-write below would race a
      // debounced voxel save and clobber freshly-written chunk deltas.
      // The clock hour rides the SAME sibling-subsystem entities seam
      // `setEntity` already offers (mirrors 'voxel.digSpheres') so it's
      // captured in that one write instead of racing a second store.save.
      const voxels = ctx.world?.voxels;
      if (voxels) {
        if (worldClock) voxels.setEntity(WORLD_CLOCK_ENTITY_KEY, { hour: worldClock.hour });
        void voxels.flushSave();
        return;
      }
      if (clockPersistence && worldClock) {
        void clockPersistence.save(launch.worldId, { hour: worldClock.hour });
      }
      void lifecycle.savePlayerState(launch.worldId, camPoseToPlayerState(fly.getPose()));
    };
    window.addEventListener('pagehide', savePose);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') savePose();
    });
  }

  engine.start();
  await engine.settle(6);
  bootUI.hide();
  loadingScreen.dispose();
  hooks.ready = true;
   
  console.log('[laas] ready');
}

function browserLocale(): Locale {
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return l === 'es' ? 'es' : l === 'da' ? 'da' : 'en';
}

/**
 * ADR 0002 §5 host-offline UX: when the host drops, freeze the joiner and show
 * a grace-window countdown; a transient reconnect cancels it, otherwise reload
 * to the menu (a joiner's URL is the plain menu — reload boots straight to it).
 */
function installHostOfflineWatch(hooks: LaasHooks): { onGone: () => void; onReturned: () => void } {
  injectStyles(document);
  const loc = createLocalizer(browserLocale());
  const GRACE_S = 30;
  let overlay: HTMLDivElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const clear = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    overlay?.remove();
    overlay = null;
  };

  return {
    onGone(): void {
      if (overlay) return; // already counting down
      hooks.flyCamEnabled?.(false); // freeze input while we wait
      let remaining = GRACE_S;
      overlay = document.createElement('div');
      overlay.id = 'laas-host-offline';
      overlay.className = 'laas-ui laas-host-offline';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-live', 'assertive');
      const render = (): void => {
        if (overlay) {
          overlay.textContent = `${loc.t('net.hostLeft')}\n${loc.t('net.returningIn', { n: remaining })}`;
        }
      };
      render();
      document.body.appendChild(overlay);
      timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clear();
          window.location.reload();
          return;
        }
        render();
      }, 1000);
    },
    onReturned(): void {
      clear();
      hooks.flyCamEnabled?.(true);
    },
  };
}

/** Playtesters read the invite code off this badge (also on the console). */
function showRoomCodeBadge(code: string): void {
  injectStyles(document);
  const badge = document.createElement('div');
  badge.id = 'laas-room-code';
  badge.className = 'laas-ui laas-room-code';
  badge.textContent = code;
  document.body.appendChild(badge);
}

function reportBootFailure(e: unknown): void {
  const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e);
  failLoud('Boot failed', [msg]);
}

boot().catch(reportBootFailure);
