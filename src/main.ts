/** LAAS entry point — boot sequence with fail-loud diagnostics. */

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
import { parseCamString, parseParams, type QualityPreset } from './core/Params';
import { WorldSeed } from './core/Seed';
import { resolveRenderPreset } from './game/domain/capability/RenderPreset';
import type { GraphicsPreset } from './game/domain/settings/Settings';
import { isErr } from './game/domain/Result';
import type { PlayerState } from './game/domain/world/WorldSaveData';
import type { WorldSaveStore } from './game/application/ports/WorldSaveStore';
import { WorldLifecycle } from './game/application/WorldLifecycle';
import {
  camPoseToPlayerState,
  isDefaultPlayerState,
  mountGameUi,
  playerStateToCamPose,
  shouldMountMenu,
} from './game/app/composeGameUi';
import { InMemoryWorldSaveStore } from './game/infrastructure/persistence/InMemoryWorldSaveStore';
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

/** Everything a menu launch overrides on the URL boot path (M8 lifecycle). */
interface MenuLaunch {
  seed: number;
  worldId: string;
  playerState: PlayerState;
  store: WorldSaveStore;
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

  mountGameUi(container, {
    worlds,
    onLaunch: (launch) => {
      container.remove();
      if (bootEl) bootEl.style.display = '';
      bootEngine(hooks, {
        seed: launch.seed,
        worldId: launch.worldId,
        playerState: launch.playerState,
        store: worlds,
      }).catch(reportBootFailure);
    },
  });
}

async function bootEngine(hooks: LaasHooks, launch: MenuLaunch | null): Promise<void> {
  const urlParams = parseParams(window.location.search, await bootFallbackPreset());
  // a menu launch is a world boot from the save's seed; everything else on
  // the params surface keeps its URL/default semantics
  const params = launch ? { ...urlParams, seed: launch.seed, scene: 'world' } : urlParams;
  const bootUI = new BootUI(hooks);

  bootUI.set(0.02, 'probing WebGPU');
  const diag = await probeWebGPU();
  hooks.diag = diag;
  if (!diag.ok) {
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
  hooks.settle = (frames?: number) => engine.settle(frames ?? 8);
  hooks.flyCamEnabled = (on) => {
    fly.enabled = on;
  };

  // menu-launched worlds persist the player's pose on exit so the next
  // launch restores where they left off (the live camera owns the pose)
  if (launch) {
    const lifecycle = new WorldLifecycle(launch.store);
    const savePose = (): void => {
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
  hooks.ready = true;
   
  console.log('[laas] ready');
}

function reportBootFailure(e: unknown): void {
  const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e);
  failLoud('Boot failed', [msg]);
}

boot().catch(reportBootFailure);
