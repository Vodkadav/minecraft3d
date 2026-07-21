/**
 * ?scene=terrain — terrain inspection scene (also currently ?scene=world).
 * Real CDLOD tiles + far shell + PBR terrain material, temporary sun/sky
 * lighting (replaced by the Phase-2 atmosphere stack).
 *
 * Views: ?view=hydro paints hydrology diagnostics on a preview grid.
 * ?alt=N puts the camera N meters above ground (ground-clamped spawn).
 */

import { Vector3 } from 'three';
import { BOOKMARKS, installBookmarks } from './Bookmarks';
import { Froxels } from '../gpu/passes/Froxels';
import { PARTICLE_COUNT, Particles } from '../gpu/passes/Particles';
import { ProbeGI } from '../gpu/passes/ProbeGI';
import { buildCanopyMap, runScatter } from '../gpu/passes/Scatter';
import { addScatterDebug } from './ScatterDebug';
import { Forests } from '../vegetation/Forests';
import { GroundRing } from '../vegetation/GroundRing';
import { buildVegLibrary } from '../vegetation/VegLibrary';
import { CausticsBake, setCausticContext } from '../render/Caustics';
import { setWindContext, windU } from '../render/Wind';
import { sunU, updateSunUniforms } from '../render/VegMaterials';
import { buildCanopyShell } from '../world/CanopyShell';
import { Heightfield } from '../world/Heightfield';
import { buildTerrainShadowProxy } from '../world/ShadowProxy';
import { TerrainTiles } from '../world/TerrainTiles';
import { WaterSurface } from '../world/WaterSurface';
import { PostStack } from '../render/PostStack';
import { setupSunShadows } from '../render/ShadowSetup';
import { Clouds } from '../sky/Clouds';
import { SunSky } from '../sky/SunSky';
import { DigMask } from '../voxel/DigMask';
import { DigTool, REACH_M as DIG_REACH_M } from '../voxel/DigTool';
import { VoxelTerrain } from '../voxel/VoxelTerrain';
import { attachPlacementTool, type PlacementToolHandle } from '../voxel/placement/PlacementTool';
import {
  attachPlaceableInteraction,
  type PlaceableInteractionHandle,
} from '../voxel/placement/PlaceableInteractionTool';
import { attachTreasureField } from '../voxel/treasure/TreasureField';
import { attachStructureField, type StructureField } from '../voxel/worldgen/StructureField';
import { WORLDGEN_VERSION } from '../game/domain/world/NewWorldSave';
import { attachSpawnField } from '../spawn/SpawnFieldView';
import { attachGroundItemField } from '../spawn/GroundItemField';
import { DEFAULT_BANK_OPTIONS, mountGameHud } from '../spawn/GameHud';
import { BankPersistence } from '../game/application/BankPersistence';
import { IndexedDbAccountStore } from '../game/infrastructure/persistence/IndexedDbAccountStore';
import type { Bank } from '../game/domain/storage/Bank';
import { mountNameplateView } from '../spawn/NameplateView';
import { stepCameraShake } from '../feel/CameraShake';
import { mountDamageNumbers } from '../feel/DamageNumbers';
import { mountDefeatEffects, type DefeatEffectsHandle } from '../feel/DefeatEffects';
import { FeelDirector } from '../feel/FeelDirector';
import { attachGamepadRumble } from '../feel/GamepadRumble';
import { mountImpactParticles } from '../feel/ImpactParticles';
import { mountScreenEffects } from '../feel/ScreenEffects';
import {
  PLAYER_MAX_HEALTH,
  damagePlayer,
  respawnPlayer,
  spawnPlayerVitals,
  tickVitals,
} from '../game/domain/combat/PlayerVitals';
import { isOk } from '../game/domain/Result';
import { ItemRegistry } from '../game/domain/items/ItemRegistry';
import { STARTER_ITEMS } from '../game/domain/items/starterItems';
import { resolveCrosshairState } from '../game/domain/ui/CrosshairState';
import { difficultyRules } from '../game/domain/settings/Difficulty';
import { setSpawnPoint, type SpawnPoint } from '../game/domain/survival/Respawn';
import {
  STAMINA_MAX,
  canAttack as canAttackSurvival,
  drainStaminaForAttack,
  spawnSurvival,
  starvationDamagePerTick,
  tickSurvival,
} from '../game/domain/survival/Survival';
import {
  type CharacterState,
  effectiveAttackPowerMultiplier,
  effectiveGatherPowerMultiplier,
  effectiveLootMultiplier,
  effectiveMaxEnergyMultiplier,
  effectiveMaxHealthMultiplier,
  newCharacter,
} from '../game/domain/character/Character';
import { CharacterPersistence } from '../game/application/CharacterPersistence';
import { emptyResearchState, type ResearchState } from '../game/domain/research/ResearchTree';
import { ResearchPersistence } from '../game/application/ResearchPersistence';
import { eat } from '../game/domain/survival/Eating';
import type { ProgressionEventId } from '../game/domain/progression/ProgressionEvents';
import { STARTER_RECIPES } from '../game/domain/crafting/starterRecipes';
import { isNight, MORNING_HOUR } from '../game/domain/time/DayNight';
import { Crosshair } from '../game/ui/components/Crosshair';
import { mountPerfHud } from '../game/ui/components/PerfHud';
import { mountCombatMeterPanel } from '../game/ui/components/CombatMeterPanel';
import { mountAttackMeter } from '../game/ui/components/AttackMeter';
import { mountHandViewmodel } from '../game/ui/components/HandViewmodel';
import { mountHandViewmodel3D } from '../game/ui/components/HandViewmodel3D';
import {
  LOCAL_PLAYER_SOURCE_ID,
  dpsFor,
  emptyCombatLog,
  foldCombatEvent,
  totalsFor,
  type CombatLogEventKind,
  type CombatLogState,
} from '../game/domain/combat/CombatLog';
import { HOST_PEER_ID, type PartyVitalsReport } from '../game/application/HostSession';
import type { PartyInventoryStateMsg, PartyInviteMsg, PartyMsg } from '../game/domain/net/Protocol';
import { mountPartyPanel } from '../game/ui/components/PartyPanel';
import { InventoryGrid } from '../game/ui/components/InventoryGrid';
import { Panel } from '../game/ui/components/Panel';
import { Button } from '../game/ui/components/Button';
import { createLocalizer } from '../game/ui/i18n/strings';
import { LocalStorageSettingsStore } from '../game/infrastructure/persistence/LocalStorageSettingsStore';
import { SettingsController } from '../game/application/SettingsController';
import { GameStatePersistence } from '../game/application/GameStatePersistence';
import { InventoryPersistence } from '../game/application/InventoryPersistence';
import { Inventory } from '../game/domain/inventory/Inventory';
import { ProgressionPersistence } from '../game/application/ProgressionPersistence';
import { ExplorationPersistence, loadExplorationOrEmpty } from '../game/application/ExplorationPersistence';
import type { WorldSaveStore } from '../game/application/ports/WorldSaveStore';
import { emptyExploration, revealAround } from '../game/domain/map/Exploration';
import { mergeMarkers, type MapMarker } from '../game/domain/map/MinimapModel';
import { mountMapScreen } from '../game/ui/MapScreen';
import { mountChatBox } from '../game/ui/ChatBox';
import { mountMinimapView } from '../spawn/MinimapView';
import { createPlayerSurvivalBar } from '../spawn/PlayerSurvivalBar';
import { IndexedDbKeyValueStore } from '../game/infrastructure/persistence/IndexedDbKeyValueStore';
import { OpfsBlobStore } from '../game/infrastructure/persistence/OpfsBlobStore';
import { PersistentWorldSaveStore } from '../game/infrastructure/persistence/PersistentWorldSaveStore';
import type { ChatUiHandle, WorldContext } from './Scenes';
import type { CamPose } from '../core/Hooks';

/** Health fraction at/below which the persistent low-health vignette shows (Workstream 2.5). */
const LOW_HEALTH_FRACTION = 0.25;

export async function buildTerrainScene(ctx: WorldContext): Promise<void> {
  const { engine, params, seed } = ctx;

  // Workstream 9.2: opt-in frame-time percentile overlay — mounted hidden on
  // every scene (dev/tooling included, same as the F3 debug HUD) so F4 works
  // everywhere; sampling `engine.stats.frameMs` every tick costs one array
  // write (FrameTimeBuffer.push is allocation-free) whether or not it's
  // visible, and the DOM never re-renders while hidden.
  const perfHud = mountPerfHud();
  engine.onUpdate(() => perfHud.sample(engine.stats.frameMs));

  // Workstream 1.4/1.6: apply persisted bus volumes as soon as there's an
  // audio port, and start the ambient wind bed + calm music loop for a real
  // game boot. The spawn block below reuses this same loaded controller.
  let settingsController: SettingsController | null = null;
  // Workstream 2: the juice layer only mounts on the same real-game-boot gate
  // as audio (never a tooling/dev URL scene) — mirrors `ctx.audio`'s own
  // gating in main.ts, so a no-flags desktop boot stays pixel-identical.
  let feel: FeelDirector | null = null;
  // Workstream 5.5: hoisted so the spawnsOn block below can trigger the
  // sleep-fade transition without re-mounting a second overlay.
  let screenEffectsRef: ReturnType<typeof mountScreenEffects> | null = null;
  // Workstream 9.4: hoisted so attachSpawnField's streaming pop-in fade below
  // can honor the settings-aware reducedMotion (not just the OS media query
  // its own default fallback uses) — same hoist reason as feel/screenEffects.
  let reducedMotionRef: (() => boolean) | null = null;
  if (ctx.audio) {
    settingsController = new SettingsController(new LocalStorageSettingsStore());
    await settingsController.load();
    const s = settingsController.settings;
    ctx.audio.setBusVolume('master', s.masterVolume);
    ctx.audio.setBusVolume('music', s.musicVolume);
    ctx.audio.setBusVolume('sfx', s.sfxVolume);
    ctx.audio.setBusVolume('ambient', s.ambientVolume);
    ctx.audio.startAmbient('ambientWind');
    ctx.audio.startMusicState('calm');

    const settingsRef = settingsController;
    const reducedMotion = (): boolean =>
      settingsRef.settings.reducedMotion ||
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    reducedMotionRef = reducedMotion;
    const damageNumbers = mountDamageNumbers(document, engine.camera, engine.renderer.domElement);
    const screenEffects = mountScreenEffects(document, reducedMotion);
    screenEffectsRef = screenEffects;
    // the largest new instance carpet is skipped outright on the mobile
    // preset, same policy as GroundRing/froxels above
    const particles = params.preset === 'mobile' ? undefined : mountImpactParticles(engine.scene);
    const rumble = attachGamepadRumble(reducedMotion);
    feel = new FeelDirector({
      damageNumbers,
      screenEffects,
      ...(particles ? { particles } : {}),
      rumble,
    });
    const feelRef = feel;
    engine.onUpdate((dt) => feelRef.tick(dt));
    // registered AFTER main.ts's `fly.update` onUpdate call (buildScene runs
    // strictly after that registration) — shakes the camera FlyCamera just
    // finished computing this frame, never accumulates (see CameraShake.ts).
    engine.onUpdate(() =>
      stepCameraShake({
        camera: engine.camera,
        getShakeMagnitude: () => feelRef.shakeMagnitude(),
        getHitStopActive: () => feelRef.hitStopActive(),
        reducedMotion,
      }),
    );
  }

  const hf = await Heightfield.generate(
    engine.renderer,
    params,
    seed,
    (p, m) => ctx.progress(p * 0.92, m),
  );
  (engine as unknown as { heightfield?: Heightfield }).heightfield = hf;

  if (hf.cpuHeights) {
    let maxH = -Infinity;
    for (let i = 0; i < hf.cpuHeights.length; i += 7) {
      const v = hf.cpuHeights[i] as number;
      if (v > maxH) maxH = v;
    }
    engine.stats.counters['terrain.maxH'] = Math.round(maxH);
  }

  // physical sky first: probe gathering needs the atmosphere LUTs.
  // ?shot=N boots straight into a composed bookmark — use ITS time of day
  const bootBm = params.shot !== null ? BOOKMARKS[params.shot - 1] : undefined;
  const bootTod = bootBm?.tod ?? params.timeOfDay;
  ctx.progress(0.93, 'sky: baking atmosphere LUTs');
  const sunSky = new SunSky(engine, bootTod);
  await sunSky.init(engine.renderer);
  (engine as unknown as { sunSky?: SunSky }).sunSky = sunSky;
  // tooling probe handle (tools/probe-state.ts) — light/scene state triage
  (window as unknown as { __laasDbg?: unknown }).__laasDbg = { engine, sunSky };

  // vegetation/rock placement (Phase 5): GPU clustered-Poisson scatter +
  // canopy coverage map — BEFORE the probe field (probes ray-march the bare
  // heightfield; the canopy map is their only knowledge of the forest) and
  // before tiles (under-crown ambient)
  ctx.progress(0.94, 'vegetation: scattering instances');
  const scatter = await runScatter(engine.renderer, hf, seed);
  const canopyTex = await buildCanopyMap(engine.renderer, scatter.trees);
  engine.stats.counters['veg.trees'] = scatter.trees.count;
  engine.stats.counters['veg.under'] = scatter.understory.count;
  engine.stats.counters['veg.extras'] = scatter.extras.count;
  engine.stats.counters['veg.stones'] = scatter.stones.count;

  const ablate = new Set(
    (new URLSearchParams(window.location.search).get('ablate') ?? '').split(','),
  );
  // M1.6 mobile-reduced fidelity cuts — every gate composes with ?ablate=
  // and leaves low/high/ultra byte-identical to before
  const mobile = params.preset === 'mobile';

  // M8 hybrid voxel terrain — flag-gated on URL boots (?voxel=1) so a no-flags
  // tooling boot never builds the mask and the terrain material graph is
  // unchanged; menu-launched worlds ALWAYS get the voxel subsystem (digging is
  // part of the game).
  const voxelOn =
    ctx.world !== undefined ||
    new URLSearchParams(window.location.search).get('voxel') === '1';
  const digMask = voxelOn ? new DigMask() : null;

  // irradiance probe field (Phase 3 GI; canopy-aware since Phase 5 —
  // ?ablate=canopygi rebuilds the bare-heightfield field for A/B)
  ctx.progress(0.95, 'gi: gathering irradiance probes');
  const gi = new ProbeGI(
    hf,
    sunSky.atmosphere,
    ablate.has('canopygi') ? null : canopyTex,
  );
  await gi.init(engine.renderer);
  sunSky.dimAmbientForGI();
  engine.onUpdate(() => gi.tick(engine.renderer));

  // Phase 6 caustics: per-frame analytic bake + module context — MUST be
  // set before any material factory runs (terrain tiles, rocks, debris all
  // self-apply at build time). ?ablate=caustics to A/B, ?caustk=N to tune.
  if (!ablate.has('caustics')) {
    const bake = new CausticsBake();
    const ck = Number(new URLSearchParams(window.location.search).get('caustk') ?? NaN);
    if (Number.isFinite(ck)) bake.focusK.value = ck;
    setCausticContext({ hf, bake, sunDir: sunU.dir });
    engine.onUpdate(() => bake.update(engine.renderer));
  }

  // Phase 6 wind: global gust field for all vegetation (?wind=N strength,
  // ?winddir=deg, ?ablate=wind to A/B) — context before veg materials build
  if (!ablate.has('wind') && hf.noiseA) {
    setWindContext({ noiseA: hf.noiseA, canopyTex });
    const q0 = new URLSearchParams(window.location.search);
    const ws = Number(q0.get('wind') ?? NaN);
    if (Number.isFinite(ws)) windU.strength.value = ws;
    const wdeg = Number(q0.get('winddir') ?? NaN);
    if (Number.isFinite(wdeg)) {
      windU.dir.value.set(Math.cos((wdeg * Math.PI) / 180), Math.sin((wdeg * Math.PI) / 180));
    }
  }

  ctx.progress(0.958, 'terrain: building tiles');
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'scatter') addScatterDebug(engine.scene, scatter);
  if (view === 'split' && hf.preErosion) {
    // erosion before/after: pre-erosion clay on the left, eroded on the right
    const pre = new TerrainTiles(hf, null, {
      heightBuf: hf.preErosion,
      neutral: true,
      screenHalf: 'left',
    });
    const post = new TerrainTiles(hf, null, { neutral: true, screenHalf: 'right' });
    engine.scene.add(pre.mesh, post.mesh);
    engine.onUpdate(() => {
      pre.update(engine.camera);
      post.update(engine.camera);
    });
  } else {
    const tiles = new TerrainTiles(hf, view, {
      gi,
      canopyTex,
      ...(digMask ? { digMask } : {}),
    });
    engine.scene.add(tiles.mesh);
    engine.scene.add(tiles.farShell);
    // ?ablate=proxy — drop the terrain shadow caster (shadow-debug bisect)
    if (!ablate.has('proxy')) engine.scene.add(buildTerrainShadowProxy(hf));
    engine.onUpdate(() => {
      tiles.update(engine.camera);
      engine.stats.counters['terrain.tiles'] = tiles.activeTiles;
    });
  }

  // Phase 6: stream/lake water clipmap (?ablate=water to A/B)
  if (view !== 'split' && !ablate.has('water')) {
    const water = new WaterSurface(
      hf,
      sunSky.atmosphere,
      canopyTex,
      ablate.has('gi') ? null : gi,
    );
    engine.scene.add(water.group);
    engine.onUpdate(() => water.update(engine.camera));
  }

  // Phase 5: variant pools + GPU cull → compacted indirect draws
  let forestsRef: Forests | null = null;
  if (view !== 'scatter' && !ablate.has('veg')) {
    const lib = await buildVegLibrary(engine.renderer, seed, (p, m) =>
      ctx.progress(0.963 + p * 0.006, m),
    );
    // mobile: halve per-class draw distances before Forests bakes them into
    // its cull buffers (trees stay ~infinite — impostors carry the far field)
    if (mobile) {
      for (let i = 0; i < lib.clsMaxDist.length; i++) {
        lib.clsMaxDist[i] = (lib.clsMaxDist[i] ?? 150) * 0.5;
      }
    }
    const forests = new Forests(
      hf,
      scatter,
      lib,
      ablate.has('gi') ? null : gi,
      canopyTex,
    );
    forests.init(engine.renderer);
    forestsRef = forests;
    engine.scene.add(forests.group);
    updateSunUniforms(sunSky.sun);
    engine.onUpdate(() => {
      forests.update(engine.renderer, engine.camera);
      Object.assign(engine.stats.counters, forests.counterSnapshot());
    });

    // near-field carpets: 800k-blade grass ring + 80k debris ring
    // (mobile: skipped outright — the largest instance carpet in the frame)
    if (!ablate.has('grass') && !mobile) {
      const ring = new GroundRing(hf, canopyTex, seed, ablate.has('gi') ? null : gi);
      ring.init(lib.atlases.get('beech') ?? null);
      engine.scene.add(ring.group);
      engine.onUpdate(() => {
        ring.update(engine.renderer, engine.camera);
        Object.assign(engine.stats.counters, ring.counterSnapshot());
      });
    }

    // far forests: aggregate canopy shell beyond the impostor mid-band
    if (!ablate.has('shell')) {
      engine.scene.add(buildCanopyShell(hf, canopyTex));
    }
  }

  // volumetric clouds (noise bake + sun-shadow map)
  ctx.progress(0.97, 'sky: baking cloud noise');
  const clouds = new Clouds(sunSky.atmosphere);
  await clouds.init(engine.renderer);
  // weather motion (Pillar F): drift on WORLD time so ?freeze=1 shots stay
  // deterministic; the drifted shadow map re-bakes itself every ~2.5 s
  let lastWt = 0;
  engine.onUpdate((_dt, wt) => {
    clouds.tick(engine.renderer, wt - lastWt);
    lastWt = wt;
  });

  // 4-cascade CSM + PCSS contact hardening; cloud shadows gate the sun term
  // (mobile: 2 cascades on a 1024² map over a shorter 1200 m range)
  const shadowRig = setupSunShadows(
    sunSky.sun,
    engine.camera,
    (wxz) => clouds.shadowAt(wxz),
    mobile ? { maxFar: 1200, cascades: 2, mapSize: 1024 } : undefined,
  );
  // cascade cameras drive the per-cascade caster cull in Forests
  forestsRef?.setCSM(shadowRig.csm ?? null);
  (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg = {
    engine,
    sunSky,
    shadowRig,
  };

  // GPU particles: snow/pollen/leaves riding the wind (?ablate=particles;
  // mobile keeps a token 4096-particle population)
  if (view !== 'split' && !ablate.has('particles')) {
    const partCount = mobile ? 4096 : PARTICLE_COUNT;
    const parts = new Particles(hf, canopyTex, ablate.has('gi') ? null : gi, partCount);
    engine.scene.add(parts.mesh);
    engine.onUpdate((dt) => parts.update(engine.renderer, engine.camera, dt));
    engine.stats.counters['particles'] = partCount;
  }

  // froxel volumetrics: canopy shafts + valley fog (?ablate=froxels, ?fog=N;
  // mobile: skipped — PostStack already handles the froxels-null path)
  let froxels: Froxels | null = null;
  if (!ablate.has('froxels') && !mobile) {
    froxels = new Froxels(hf, sunSky.atmosphere, canopyTex, clouds);
    const fq = Number(new URLSearchParams(window.location.search).get('fog') ?? NaN);
    if (Number.isFinite(fq)) froxels.fogK.value = fq;
    const fx = froxels;
    engine.onUpdate(() => fx.update(engine.renderer, engine.camera));
  }

  // HDR post stack: aerial perspective, clouds, GTAO, TRAA, bloom, exposure, grade
  ctx.progress(0.98, 'post: building pipeline');
  const post = new PostStack(engine, sunSky.atmosphere, bootTod, clouds, froxels);
  engine.post = post;

  ctx.hooks.setTimeOfDay = (t: number) => {
    void (async () => {
      await sunSky.setTimeOfDay(t);
      await clouds.refreshShadow(engine.renderer);
      gi.invalidate();
      post.setTimeOfDay(t);
    })();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      void clouds.refreshShadow(engine.renderer);
      post.setTimeOfDay(sunSky.timeOfDay);
    }
  });

  // terrain/water probe for the camera rig: walk-mode ground physics + the
  // fly-mode soft collision / underwater guard both live in FlyCamera now
  ctx.hooks.groundProbe = (x, z) => ({
    ground: hf.heightAtCpu(x, z),
    water: hf.waterYAtCpu(x, z),
  });

  // M5 proximity-gated spawns — same gate shape as the voxel subsystem (menu
  // launch always; URL boots opt in with ?spawns=1); computed early so the
  // dig-only crosshair fallback below knows whether the spawns block (which
  // drives the fuller crosshair state) will also run this scene.
  const spawnsOn =
    ctx.world !== undefined ||
    new URLSearchParams(window.location.search).get('spawns') === '1';

  // M8 voxel digging: chunk meshes + dig input + delta persistence. The
  // ground probe becomes cavern-aware so walk mode can descend into digs.
  let voxelsRef: VoxelTerrain | null = null;
  let placementRef: PlacementToolHandle | null = null;
  // S7b: same before/after-HUD indirection as progressHook below — the
  // functional-placeable interaction tool needs the live inventory/HUD,
  // which only exists once spawnsOn's block runs; PlacementTool's commit/
  // remove hooks are wired unconditionally here so no piece can ever be
  // placed before the indirection exists to catch it.
  let placeableInteractionRef: PlaceableInteractionHandle | null = null;
  let structureFieldRef: StructureField | null = null;
  let saveStoreForPersistence: WorldSaveStore | null = null;
  // Workstream 6: DigTool/PlacementTool are constructed before the HUD (whose
  // recordProgress is the real sink) — this indirection lets them fire
  // progress events the moment the HUD exists without reordering the whole
  // voxel/spawns boot sequence. Stays a no-op (spawns-off boots never mount
  // a HUD) if the spawns block below never runs.
  let progressHook: ((event: ProgressionEventId) => void) | undefined;
  // Mounted alongside DigTool regardless of whether spawns are also on (dev
  // URL boots can have ?voxel=1 without ?spawns=1) — matches the crosshair's
  // old unconditional-with-DigTool presence exactly.
  let crosshairRef: ReturnType<typeof Crosshair> | null = null;
  if (digMask && view !== 'split') {
    // menu launch: the SAME store instance the menu uses, keyed to the real
    // worldId; URL boots keep the per-seed demo id over a fresh OPFS store
    const store =
      ctx.world?.store ??
      ('storage' in navigator && 'getDirectory' in navigator.storage
        ? new PersistentWorldSaveStore(new OpfsBlobStore(), new IndexedDbKeyValueStore())
        : null);
    saveStoreForPersistence = store;
    const voxels = new VoxelTerrain(
      { heightAt: (x, z) => hf.heightAtCpu(x, z) },
      digMask,
      params.seed,
      store,
      'voxel-demo',
      ctx.world
        ? { worldId: ctx.world.worldId, poseProvider: ctx.world.poseProvider }
        : {},
    );
    ctx.progress(0.985, 'voxel: restoring digs');
    await voxels.init();
    voxelsRef = voxels;
    if (ctx.world) ctx.world.voxels = voxels; // M7 net glue reaches it here
    engine.scene.add(voxels.group);
    new DigTool(
      voxels,
      engine.camera,
      engine.renderer.domElement,
      ctx.audio,
      feel ?? undefined,
      (event) => progressHook?.(event),
    );
    crosshairRef = Crosshair();
    // First-person hand/tool viewmodel: swings on every dig (LMB) / place (RMB)
    // click so the player gets immediate confirmation the action fired. Self-
    // wires its own pointer-locked mousedown on the canvas.
    // ?hand3d=1 — real 3D arm/tool viewmodel (after-post overlay, see
    // HandViewmodel3D's header) instead of the default 2D SVG. Flag-gated so
    // the default boot is byte-identical to before this option existed; the
    // one-line swap to make 3D the default is deleting this `if`/`else` and
    // keeping only the `mountHandViewmodel3D(...)` branch.
    if (new URLSearchParams(window.location.search).get('hand3d') === '1') {
      mountHandViewmodel3D(engine, {
        dom: engine.renderer.domElement,
        reducedMotion: () => reducedMotionRef?.() ?? false,
      });
    } else {
      mountHandViewmodel({
        dom: engine.renderer.domElement,
        reducedMotion: () => reducedMotionRef?.() ?? false,
      });
    }
    window.addEventListener('pagehide', () => voxels.flushSave());
    // tooling probe handle (tools/voxel-shot.ts) — programmatic digs in CI-less runs
    (
      window as unknown as { __laasDbg?: Record<string, unknown> }
    ).__laasDbg = Object.assign(
      (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg ?? {},
      { voxels },
    );

    const surfaceProbe = ctx.hooks.groundProbe;
    ctx.hooks.groundProbe = (x, z) => {
      const base = surfaceProbe(x, z);
      return {
        ground: voxels.groundBelow(x, z, engine.camera.position.y, base.ground),
        water: base.water,
      };
    };

    // build mode (B) — capture-phase listener suppresses DigTool while active
    const placement = attachPlacementTool({
      terrain: voxels,
      camera: engine.camera,
      dom: engine.renderer.domElement,
      parent: engine.scene,
      ...(ctx.audio ? { audio: ctx.audio } : {}),
      ...(feel ? { feel } : {}),
      onProgress: (event) => progressHook?.(event),
      onPieceCommitted: (piece) => placeableInteractionRef?.ensurePlaceable(piece),
      onPieceRemoved: (piece) => placeableInteractionRef?.forgetPlaceable(piece),
      mobile: params.preset === 'mobile',
      save: {
        load: () => voxels.entity('placement.pieces'),
        persist: (data) => voxels.setEntity('placement.pieces', data),
      },
    });
    engine.onUpdate(() => placement.update());
    placementRef = placement;

    const claimed = voxels.entity('treasure.discovered');
    const treasures = attachTreasureField({
      seed: params.seed,
      surface: { heightAt: (x, z) => hf.heightAtCpu(x, z) },
      parent: engine.scene,
      getPlayerXZ: () => [engine.camera.position.x, engine.camera.position.z],
      ...(Array.isArray(claimed)
        ? { discovery: claimed.filter((id): id is string => typeof id === 'string') }
        : {}),
      onDiscovered: (_t, _reward, state) => voxels.setEntity('treasure.discovered', state),
    });
    engine.onUpdate((dt) => treasures.update(dt));
  }

  // Dig-only crosshair state (mine/place, no attack/interact — spawns won't
  // run this scene): the fuller updater inside the spawns block below takes
  // over instead when spawns ARE on, so this only wires when they aren't.
  if (crosshairRef && !spawnsOn) {
    const AIM_DIR = new Vector3();
    const crosshair = crosshairRef;
    engine.onUpdate(() => {
      const placing = placementRef?.isBuildMode() ?? false;
      let hasMineTarget = false;
      if (!placing && voxelsRef) {
        AIM_DIR.set(0, 0, -1).applyQuaternion(engine.camera.quaternion).normalize();
        const hit = voxelsRef.raycastSolid(
          [engine.camera.position.x, engine.camera.position.y, engine.camera.position.z],
          [AIM_DIR.x, AIM_DIR.y, AIM_DIR.z],
          DIG_REACH_M,
        );
        hasMineTarget = hit !== null;
      }
      crosshair.setState(
        resolveCrosshairState({
          placing,
          hasAttackTarget: false,
          hasInteractTarget: false,
          hasMineTarget,
        }),
      );
    });
  }

  if (spawnsOn && view !== 'split') {
    const settings = settingsController ?? new SettingsController(new LocalStorageSettingsStore());
    if (!settingsController) await settings.load();
    // M6 player health: only wild worlds (spawns on) can hurt you, so the
    // vitals + bar live here. Death respawns full at the start position — a
    // family game loses your spot, never your progress (Workstream 5.3:
    // the death-penalty rule below can now override "never your progress"
    // on harder difficulties, but stays keep-inventory by default).
    // E1.4b: the character's additive multipliers feed vitals/survival maxima
    // and the spawn-field power/loot call sites — loaded before vitals spawn
    // so a returning character starts at their real maxima. Persisted with
    // the rest of the game state on pagehide/hidden below.
    const worldIdForSave = ctx.world?.worldId ?? `voxel-demo-${params.seed}`;
    const characterPersistence = saveStoreForPersistence
      ? new CharacterPersistence(saveStoreForPersistence)
      : null;
    let character: CharacterState = newCharacter();
    if (characterPersistence) {
      const loadedCharacter = await characterPersistence.load(worldIdForSave, 'local');
      if (isOk(loadedCharacter)) character = loadedCharacter.value;
    }
    // E6.4: the research tree persists per-owner exactly like the character
    // does — single-player/host-local only for now (see GameHud.ts's doc
    // comment for the explicit joiner-sync deferral).
    const researchPersistence = saveStoreForPersistence
      ? new ResearchPersistence(saveStoreForPersistence)
      : null;
    let research: ResearchState = emptyResearchState();
    if (researchPersistence) {
      const loadedResearch = await researchPersistence.load(worldIdForSave, 'local');
      if (isOk(loadedResearch)) research = loadedResearch.value;
    }
    let maxHealthEff = PLAYER_MAX_HEALTH * effectiveMaxHealthMultiplier(character);
    let maxEnergyEff = STAMINA_MAX * effectiveMaxEnergyMultiplier(character);

    let vitals = spawnPlayerVitals(maxHealthEff);
    // Workstream 5.1: hunger + stamina, ticked alongside vitals below.
    let survival = spawnSurvival(maxEnergyEff);
    // reposition through the fly camera's own seam (setPose owns basePos too —
    // a raw camera.position.set is stomped by fly.update the same frame)
    let respawnPose: CamPose | null = null;
    // Workstream 5.3: the domain spawn-point value (position-only); mirrors
    // respawnPose whenever it's (re)captured — a placed bed (Workstream 7)
    // will call `setSpawnPoint` from the same seam instead of "on sleep".
    let spawnPoint: SpawnPoint | null = null;
    const survivalBar = createPlayerSurvivalBar(
      createLocalizer(settings.settings.locale),
      document,
      effectiveMaxHealthMultiplier(character),
      effectiveMaxEnergyMultiplier(character),
      settings.settings.hudStyle,
      character.level.level,
    );

    function captureSpawn(pose: CamPose): void {
      respawnPose = pose;
      spawnPoint = setSpawnPoint(spawnPoint, { x: pose.p[0], y: pose.p[1], z: pose.p[2] });
    }

    // themed HUD (Workstream 3+4): hotbar + toasts + crosshair + the
    // inventory/crafting overlay. Digit-key hotbar selection is off here —
    // keys 1-9 already jump to the camera bookmarks (Bookmarks.ts) in this
    // scene; wheel/click selection still works. Opening the overlay pauses
    // camera-look input through the same `flyCamEnabled` seam the flythrough
    // uses (main.ts) — it already releases pointer lock itself.
    const loc = createLocalizer(settings.settings.locale);
    // E7.7: defeat/player-down VFX — same real-game-boot gate `feel`/
    // `particles` use (ctx.audio present) AND the same mobile-preset skip as
    // `particles` above (heavy bursts + a canvas filter are exactly the
    // "skip on mobile" cost ImpactParticles already established).
    const defeatEffects: DefeatEffectsHandle | undefined =
      feel && params.preset !== 'mobile' && reducedMotionRef
        ? mountDefeatEffects(
            engine.scene,
            document,
            engine.camera,
            engine.renderer.domElement,
            loc,
            reducedMotionRef,
          )
        : undefined;
    if (defeatEffects) {
      const de = defeatEffects;
      // Registered here (strictly after main.ts's fly.update, same ordering
      // rule stepCameraShake documents) so the gentle player-down camera dip
      // composes as an additive offset FlyCamera implicitly clears next frame.
      engine.onUpdate((dt) => de.step(dt));
    }
    const itemsReg = ItemRegistry.create(STARTER_ITEMS);
    if (!isOk(itemsReg)) throw new Error(`bad starter item table: ${itemsReg.error.kind}`);
    if (ctx.world) ctx.world.registry = itemsReg.value; // E0.4: host net glue reaches it here

    // E2.5: the solo self damage meter — hidden by default, "L"-toggled
    // (CombatMeterPanel). `combatLog` folds the local player's own
    // hit/heal/kill stream (never routed through the intent path — purely
    // local presentation state, same posture as the perf HUD).
    const meterPanel = mountCombatMeterPanel(loc);
    // E7.1: the attack-strength cooldown meter — client-side presentation
    // only, hidden at full charge (AttackMeter.ts), driven from
    // spawns.attackChargeFraction() in the crosshair update loop below.
    const attackMeter = mountAttackMeter(loc);
    let combatLog: CombatLogState = emptyCombatLog();
    function recordCombatEvent(kind: CombatLogEventKind, amount: number): void {
      combatLog = foldCombatEvent(combatLog, {
        sourceId: LOCAL_PLAYER_SOURCE_ID,
        kind,
        amount,
        atMs: performance.now(),
      });
    }

    // E5.1/E5.2/E5.4/E5.6: party — mounted unconditionally (empty/"no party"
    // state) alongside the solo meter; the outgoing sends only do something
    // once main.ts's M7 net glue wires `ctx.world.sendPartyAction`/etc after
    // the host/join session exists (mirrors `applyInventoryState`'s E0.4
    // wave-3 wiring, just the other direction — see `Scenes.ts`). A solo
    // (no-net) boot renders "not in a party" and every send is a silent no-op.
    const selfPeerId = ctx.world?.selfPeerId ?? 'solo';
    let partyState: PartyMsg = { kind: 'party', partyId: null, leaderId: null, members: [] };
    let myShareEnabled = false;
    let inventoryLookupOverlay: { dispose(): void } | null = null;

    const partyPanel = mountPartyPanel(loc, {
      onInvite: (targetPeerId) => ctx.world?.sendPartyAction?.({ op: 'invite', targetPeerId }),
      onKick: (targetPeerId) => ctx.world?.sendPartyAction?.({ op: 'kick', targetPeerId }),
      onLeave: () => ctx.world?.sendPartyAction?.({ op: 'leave' }),
      onShareToggle: (shared) => {
        myShareEnabled = shared;
        ctx.world?.sendPartyAction?.({ op: 'setInventoryShare', shared });
      },
      onViewInventory: (targetPeerId) => ctx.world?.sendPartyInventoryLookup?.(targetPeerId),
    });

    function invitableList(): Array<{ peerId: string; playerName: string }> {
      const known = ctx.world?.partyPeerNames?.() ?? new Map<string, string>();
      const memberIds = new Set(partyState.members.map((m) => m.peerId));
      const list: Array<{ peerId: string; playerName: string }> = [];
      for (const [peerId, playerName] of known) {
        if (peerId !== selfPeerId && !memberIds.has(peerId)) list.push({ peerId, playerName });
      }
      // the host is always a valid invite target too, even though it's never
      // discovered by name via `partyPeerNames` (see NetSync.ts).
      if (selfPeerId !== HOST_PEER_ID && !memberIds.has(HOST_PEER_ID)) {
        list.push({ peerId: HOST_PEER_ID, playerName: loc.t('party.hostName') });
      }
      return list;
    }

    function renderPartyPanel(): void {
      partyPanel.render({
        selfPeerId,
        leaderId: partyState.leaderId,
        members: partyState.members,
        invitable: invitableList(),
        shareEnabled: myShareEnabled,
      });
    }
    renderPartyPanel();

    const registry = itemsReg.value;
    const showPartyInventoryOverlay = (msg: PartyInventoryStateMsg): void => {
      inventoryLookupOverlay?.dispose();
      const inv = Inventory.fromSlots(registry, msg.slots);
      if (!isOk(inv)) return;
      const targetName =
        partyState.members.find((m) => m.peerId === msg.targetPeerId)?.playerName ?? msg.targetPeerId;
      const title = loc.t('party.inventory.title', { name: targetName });
      const grid = InventoryGrid({ registry, loc, ariaLabel: title, readOnly: true });
      grid.render(inv.value);
      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      const closeBtn = Button({
        label: loc.t('party.inventory.close'),
        onClick: () => {
          inventoryLookupOverlay?.dispose();
          inventoryLookupOverlay = null;
        },
      });
      const overlayEl = Panel([titleEl, grid.el, closeBtn], { ariaLabel: title });
      overlayEl.style.position = 'fixed';
      overlayEl.style.top = '50%';
      overlayEl.style.left = '50%';
      overlayEl.style.transform = 'translate(-50%, -50%)';
      overlayEl.style.zIndex = '80';
      document.body.appendChild(overlayEl);
      inventoryLookupOverlay = {
        dispose(): void {
          grid.dispose();
          overlayEl.remove();
        },
      };
    };

    if (ctx.world) {
      ctx.world.applyParty = (msg: PartyMsg) => {
        partyState = msg;
        renderPartyPanel();
      };
      ctx.world.applyPartyInvite = (msg: PartyInviteMsg) => {
        partyPanel.showInvite(
          msg.fromPeerId,
          msg.fromPlayerName,
          () => ctx.world?.sendPartyAction?.({ op: 'acceptInvite' }),
          () => ctx.world?.sendPartyAction?.({ op: 'declineInvite' }),
        );
      };
      ctx.world.applyPartyInventoryState = showPartyInventoryOverlay;
    }

    // S7b: wire the tested-but-unwired InventoryPersistence/ProgressionPersistence
    // into the boot/save flow (closes the S4/S6 deferral). Only when there's a
    // real save store — dev/tooling boots with no OPFS support skip persistence
    // exactly like the voxel subsystem already does above.
    // E4.4: the account bank persists across worlds/characters via its own
    // account-scoped store (separate DB from the per-world save) — loaded
    // here so the HUD's bank overlay seeds from the real account, saved on
    // every bank change (rare, user-driven).
    const bankPersistence =
      typeof indexedDB !== 'undefined'
        ? new BankPersistence(new IndexedDbAccountStore(), itemsReg.value, DEFAULT_BANK_OPTIONS)
        : null;
    let initialBank: Bank | null = null;
    if (bankPersistence) {
      const loadedBank = await bankPersistence.load();
      if (isOk(loadedBank)) initialBank = loadedBank.value;
    }

    const gameStatePersistence = saveStoreForPersistence
      ? new GameStatePersistence({
          inventoryPersistence: new InventoryPersistence(saveStoreForPersistence, itemsReg.value),
          progressionPersistence: new ProgressionPersistence(saveStoreForPersistence),
        })
      : null;
    const loadedGameState = gameStatePersistence
      ? await gameStatePersistence.load(worldIdForSave, 'local')
      : null;

    // E3.1: discovered-map-cell persistence — same optional-record pattern
    // as inventory/progression/character above; a dedicated seam (not folded
    // into GameStatePersistence) mirrors how WorldClockPersistence stays
    // standalone, since it saves on the same pagehide/visibilitychange
    // triggers rather than GameStatePersistence's own save() call.
    const explorationPersistence = saveStoreForPersistence
      ? new ExplorationPersistence(saveStoreForPersistence)
      : null;
    let exploration = explorationPersistence
      ? await loadExplorationOrEmpty(explorationPersistence, worldIdForSave, 'local')
      : emptyExploration();

    const hud = mountGameHud({
      loc,
      registry: itemsReg.value,
      enableHotbarDigitKeys: false,
      recipes: STARTER_RECIPES,
      ...(crosshairRef ? { crosshair: crosshairRef } : {}),
      ...(ctx.audio ? { audio: ctx.audio } : {}),
      ...(feel ? { feel } : {}),
      ...(loadedGameState?.inventory ? { initialInventory: loadedGameState.inventory } : {}),
      ...(loadedGameState?.progression ? { initialProgression: loadedGameState.progression } : {}),
      ...(loadedGameState?.keyhints ? { initialKeyhints: loadedGameState.keyhints } : {}),
      ...(initialBank ? { initialBank } : {}),
      onBankChange: (next) => {
        void bankPersistence?.save(next);
      },
      initialCharacter: character,
      initialResearch: research,
      onResearchChange: (next) => {
        research = next;
      },
      onCharacterChange: (next) => {
        // E1.4b: multipliers apply live — a stat spend mid-session changes
        // maxima/power immediately; persistence rides the pagehide save below.
        character = next;
        maxHealthEff = PLAYER_MAX_HEALTH * effectiveMaxHealthMultiplier(next);
        maxEnergyEff = STAMINA_MAX * effectiveMaxEnergyMultiplier(next);
        survivalBar.setLevel(next.level.level);
      },
      setInputEnabled: (on) => ctx.hooks.flyCamEnabled?.(on),
      // E8.5: shift-click / "Link to chat" on an inventory slot links the item
      // into the chat composer. `chatBox` is created later in this same scope;
      // the closure only fires on a runtime click, long after it's assigned.
      onLinkItemToChat: (itemId) => chatBox.insertItemLink(itemId),
      onEat: (food) => {
        const healedBefore = vitals.health;
        const r = eat(vitals, survival, food);
        vitals = r.vitals;
        survival = r.survival;
        const healedAmount = vitals.health - healedBefore;
        const frac = vitals.health / maxHealthEff;
        survivalBar.setHealth(frac);
        survivalBar.setHunger(survival.hunger);
        feel?.setLowHealth(frac > 0 && frac <= LOW_HEALTH_FRACTION);
        if (healedAmount > 0) {
          // E2.4: a themed "+N" floating number above the player, offset in
          // front of the camera (worldPos AT the camera would project to
          // the screen center with an undefined/degenerate direction).
          const dir = new Vector3();
          engine.camera.getWorldDirection(dir);
          const p = engine.camera.position;
          const worldPos: [number, number, number] = [
            p.x + dir.x * 0.6,
            p.y + dir.y * 0.6 - 0.3,
            p.z + dir.z * 0.6,
          ];
          feel?.trigger('heal', { worldPos, numberValue: healedAmount });
          recordCombatEvent('heal', healedAmount);
        }
      },
    });
    // Workstream 6: DigTool/PlacementTool were built before this HUD existed
    // (see `progressHook` above) — wire the real sink now.
    progressHook = (event) => hud.recordProgress(event);

    // E0.4 wave-3: a joiner NEVER mutates its own inventory locally — this is
    // the one path the host's echoed `inventoryState` reaches the HUD (and,
    // if a chest is open, its player-side grid via `notifyInventoryChanged`).
    // `placeableInteractionRef` is assigned later in this function but
    // already live by the time any inventoryState actually arrives (async).
    if (ctx.world) {
      ctx.world.applyInventoryState = (wire) => {
        const inv = Inventory.fromSlots(itemsReg.value, wire.slots);
        if (isOk(inv)) hud.setInventory(inv.value);
        placeableInteractionRef?.notifyInventoryChanged();
      };
    }

    if (gameStatePersistence) {
      const saveGameState = (): void => {
        void gameStatePersistence.save(worldIdForSave, 'local', hud.inventory, hud.progression, hud.keyhints);
        void characterPersistence?.save(worldIdForSave, 'local', hud.character);
        void researchPersistence?.save(worldIdForSave, 'local', hud.research);
        if (explorationPersistence) {
          void explorationPersistence.save(worldIdForSave, 'local', exploration);
        }
      };
      window.addEventListener('pagehide', saveGameState);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveGameState();
      });
    }

    // S7b: functional placeables (chest/door/campfire/bed/farm plot) — the
    // domain resolver + UI wiring over the voxel/placement tool's committed
    // pieces. Needs the voxel subsystem AND the HUD it grants inventory
    // through, so it only mounts when both exist (matches DigTool/PlacementTool's
    // own `digMask` gate plus this block's `spawnsOn` gate).
    if (voxelsRef && placementRef) {
      const voxels = voxelsRef;
      const placeableInteraction = attachPlaceableInteraction({
        placement: placementRef,
        camera: engine.camera,
        dom: engine.renderer.domElement,
        parent: engine.scene,
        registry: itemsReg.value,
        recipes: STARTER_RECIPES,
        loc,
        ...(ctx.audio ? { audio: ctx.audio } : {}),
        ...(feel ? { feel } : {}),
        save: {
          load: () => voxels.entity('placeables.state'),
          persist: (data) => voxels.setEntity('placeables.state', data),
        },
        getInventory: () => hud.inventory,
        setInventory: (inv) => hud.setInventory(inv),
        addLoot: (stacks) => hud.addLoot(stacks),
        getHotbarSelectedItemId: () => hud.selectedHotbarItemId(),
        now: () => Date.now(),
        setInputEnabled: (on) => ctx.hooks.flyCamEnabled?.(on),
        setSpawnPoint: (x, y, z) => {
          const pose = ctx.hooks.getPose?.();
          captureSpawn({ p: [x, y, z], yaw: pose?.yaw ?? 0, pitch: pose?.pitch ?? 0 });
        },
        toast: (key, params2) => hud.toast(key, params2),
        showInteractKeyhint: () => hud.maybeShowInteractHint(),
      });
      engine.onUpdate(() => placeableInteraction.update());
      placeableInteractionRef = placeableInteraction;
      if (ctx.world) ctx.world.placeables = placeableInteraction; // M7 net glue reaches it here

      // E6.2: world-seeded structures/POIs — composition-gated behind the
      // `worldgen.version` entity stamp (NewWorldSave.ts) so every save
      // written before this slice landed has no such key and never streams
      // structures: the prime directive's "no effect on existing worlds"
      // satisfied by construction, not a runtime feature flag. Stamps
      // pieces through the SAME PlacedPieceRegistry/PlaceableStore the
      // player's own build tool uses (`placementRef.commitPieceAt`), so a
      // structure's chest is an ordinary placeable afterwards.
      if (voxels.entity('worldgen.version') === WORLDGEN_VERSION) {
        const structureStamped = voxels.entity('worldgen.structures.stamped');
        const structures = attachStructureField({
          seed: params.seed,
          surface: { heightAt: (x, z) => hf.heightAtCpu(x, z) },
          registry: itemsReg.value,
          placement: placementRef,
          placeableInteraction,
          getPlayerXZ: () => [engine.camera.position.x, engine.camera.position.z],
          ...(Array.isArray(structureStamped)
            ? { stamped: structureStamped.filter((id): id is string => typeof id === 'string') }
            : {}),
          onStamped: (ids) => voxels.setEntity('worldgen.structures.stamped', ids),
        });
        engine.onUpdate(() => structures.update());
        structureFieldRef = structures;
      }
    }

    const AIM_DIR = new Vector3();

    // Workstream 5.1: an F-attack costs stamina/hunger and is gated while
    // stamina is empty; applied here (not in the domain) since it needs the
    // live `survival` closure. Local player state only — never routed
    // through the intent path (see the SpawnFieldDeps doc comment).
    function applyPlayerDamage(amount: number): void {
      const r = damagePlayer(vitals, amount);
      vitals = r.state;
      const frac = vitals.health / maxHealthEff;
      survivalBar.setHealth(frac);
      survivalBar.flashDamage();
      feel?.setLowHealth(frac > 0 && frac <= LOW_HEALTH_FRACTION);
      if (r.died) {
        // E7.7: gentle, NO-ITEM-LOSS player-down polish — screen desaturate
        // + a brief camera dip start here; lifted by the respawn shimmer
        // below once the respawn pose has landed. Never a punishing death
        // screen (cozy charter) — the `playerDown` FeelEvent bundle stays a
        // hurt vignette + rumble only (no shake/number, see FeelEvents.test).
        feel?.trigger('playerDown');
        defeatEffects?.playerDown();
        vitals = respawnPlayer(vitals, maxHealthEff);
        survival = spawnSurvival(maxEnergyEff);
        if (respawnPose) ctx.hooks.setPose?.(respawnPose);
        survivalBar.setHealth(1);
        survivalBar.setStamina(survival.stamina);
        survivalBar.setHunger(survival.hunger);
        feel?.setLowHealth(false);
        feel?.trigger('respawnShimmer');
        defeatEffects?.respawnShimmer();
        hud.applyDeathPenalty(difficultyRules(settings.settings.difficulty).deathPenalty);
      }
    }

    const spawns = attachSpawnField({
      seed: params.seed,
      ground: {
        heightAt: (x, z) => hf.heightAtCpu(x, z),
        waterAt: (x, z) => hf.waterYAtCpu(x, z),
      },
      parent: engine.scene,
      getPlayerXZ: () => [engine.camera.position.x, engine.camera.position.z],
      density: settings.settings.animalDensity,
      dom: engine.renderer.domElement,
      ...(ctx.audio ? { audio: ctx.audio } : {}),
      ...(feel ? { feel } : {}),
      ...(defeatEffects ? { defeatEffects } : {}),
      onPlayerHit: (amount) => applyPlayerDamage(amount),
      setMoveSpeedScale: (s) => ctx.hooks.setMoveSpeedScale?.(s),
      onLoot: (stacks) => hud.addLoot(stacks),
      // E0.5: a creature kill's loot drops on the ground instead of an
      // instant grant — `groundItems` is declared just below, but this
      // closure only runs from a later frame update, well after that.
      onDropLoot: (stacks, position) => groundItems.spawnDrop(stacks, position),
      onProgress: (event) => hud.recordProgress(event),
      onCombatEvent: (kind, amount) => recordCombatEvent(kind, amount),
      canAttack: () => canAttackSurvival(survival),
      attackPowerMult: () => effectiveAttackPowerMultiplier(character),
      gatherPowerMult: () => effectiveGatherPowerMultiplier(character),
      lootMult: () => effectiveLootMultiplier(character),
      // E7.1: weapon-driven melee — the selected hotbar item is the "equip
      // slot" (no separate equip system exists yet), and the forward aim
      // direction (XZ plane) drives the cone soft-lock assist.
      equippedWeaponId: () => hud.selectedHotbarItemId(),
      getAimDir: () => {
        AIM_DIR.set(0, 0, -1).applyQuaternion(engine.camera.quaternion).normalize();
        return [AIM_DIR.x, AIM_DIR.z];
      },
      onAttack: () => {
        survival = drainStaminaForAttack(survival, maxEnergyEff);
        survivalBar.setStamina(survival.stamina);
        survivalBar.setHunger(survival.hunger);
      },
      isNight: () => isNight(sunSky.timeOfDay),
      creatureDamageMult: difficultyRules(settings.settings.difficulty).creatureDamage,
      creatureSpawnRate: settings.settings.creatureSpawnRate,
      resourceSpawnRate: settings.settings.resourceSpawnRate,
      ...(reducedMotionRef ? { reducedMotion: reducedMotionRef } : {}),
      ...(voxelsRef
        ? {
            save: {
              entity: (k: string) => voxelsRef.entity(k),
              setEntity: (k: string, v: unknown) => voxelsRef.setEntity(k, v),
            },
          }
        : {}),
    });
    if (ctx.world) ctx.world.spawns = spawns; // M7.x net glue streams creatures here

    // E2.2/E2.3: creature nameplates + overhead lifebars, gated purely by
    // this `spawnsOn` composition branch — a boot with spawns off never
    // mounts it. Mobile preset gets a much smaller billboard pool/culling
    // distance (same graphicsPreset seam RenderPreset.ts already reads),
    // since a wall of readable-at-a-distance nameplate DOM is a mobile
    // frame-budget risk the desktop/high path doesn't have.
    const NAMEPLATE_POOL_SIZE = settings.settings.graphicsPreset === 'mobile' ? 8 : 24;
    const NAMEPLATE_MAX_DISTANCE_M = settings.settings.graphicsPreset === 'mobile' ? 18 : 30;
    const nameplates = mountNameplateView({
      doc: document,
      camera: engine.camera,
      canvas: engine.renderer.domElement,
      poolSize: NAMEPLATE_POOL_SIZE,
      maxDistance: NAMEPLATE_MAX_DISTANCE_M,
      loc,
      getPolicy: () => ({
        mode: settings.settings.nameplateMode,
        friendly: settings.settings.nameplateFriendly,
        neutral: settings.settings.nameplateNeutral,
        hostile: settings.settings.nameplateHostile,
        tamed: settings.settings.nameplateTamed,
        player: settings.settings.nameplatePlayers,
      }),
      isHovered: (id) => spawns.hoveredCreatureId === id,
      isInCombat: () => spawns.inCombat,
    });
    // E0.5/E4.3: ground-drop loot field — host-owned (streamed like spawns),
    // manual pickup (X) + autoloot both credit the local HUD inventory
    // directly here (host/solo) or become intents for the net glue (joiner).
    const groundItems = attachGroundItemField({
      parent: engine.scene,
      ground: { heightAt: (x, z) => hf.heightAtCpu(x, z) },
      getPlayerXZ: () => [engine.camera.position.x, engine.camera.position.z],
      dom: engine.renderer.domElement,
      tryLocalPickup: (itemId, count) => hud.tryPickup(itemId, count),
      getAutolootSettings: () => ({
        enabled: settings.settings.autolootEnabled,
        radiusM: settings.settings.autolootRadiusM,
      }),
      getInventory: () => hud.inventory,
      onBagFull: () => hud.toast('hud.toast.bagFull'),
    });
    if (ctx.world) ctx.world.groundItems = groundItems; // M7.x net glue streams drops here
    // creature-sync probe seam (tools/net-probe.ts)
    (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg = Object.assign(
      (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg ?? {},
      { spawnField: spawns },
    );
    // Workstream 5.1: sprint is detected observationally from frame-to-frame
    // camera speed — FlyCamera owns the actual sprint key state and lives in
    // src/core (engine dir, off-limits), the same constraint that deferred
    // S1's footstep-velocity hook. WALK_SPEED*SPRINT_MULT ≈ 9.2 m/s there.
    const SPRINT_SPEED_THRESHOLD_MPS = 6;
    let lastPlayerX = engine.camera.position.x;
    let lastPlayerZ = engine.camera.position.z;
    engine.onUpdate(() => {
      nameplates.sync(spawns.nameplateTargets());
    });
    // E2.5: only redraw the meter while the player has it open, throttled
    // like the perf HUD — no per-frame DOM work when hidden (the default).
    const METER_RENDER_INTERVAL_S = 0.25;
    let meterRenderAcc = 0;
    // E5.1/E5.6: a low-cadence self-report (vitals + this-encounter combat
    // tally) — reused as BOTH the party-frame stream and the party meter's
    // tally carrier (plan constraint: no new high-rate traffic).
    const PARTY_VITALS_INTERVAL_S = 1;
    let partyVitalsAcc = 0;
    engine.onUpdate((dt) => {
      spawns.update(dt);
      groundItems.update(dt);
      const inParty = partyState.members.length > 0;
      if (meterPanel.visible) {
        meterRenderAcc += dt;
        if (meterRenderAcc >= METER_RENDER_INTERVAL_S) {
          meterRenderAcc = 0;
          meterPanel.render(combatLog, performance.now(), inParty ? partyState.members : undefined);
        }
      }
      if (inParty) {
        partyVitalsAcc += dt;
        if (partyVitalsAcc >= PARTY_VITALS_INTERVAL_S) {
          partyVitalsAcc = 0;
          const selfTotals = totalsFor(combatLog, LOCAL_PLAYER_SOURCE_ID);
          const report: PartyVitalsReport = {
            health: vitals.health,
            maxHealth: maxHealthEff,
            energy: survival.stamina,
            maxEnergy: maxEnergyEff,
            level: character.level.level,
            damageDealt: selfTotals.damageDealt,
            dps: dpsFor(combatLog, LOCAL_PLAYER_SOURCE_ID, performance.now()),
            healing: selfTotals.healing,
            kills: selfTotals.kills,
          };
          ctx.world?.sendPartyVitals?.(report);
        }
      }
      if (!respawnPose) {
        const p = ctx.hooks.getPose?.() ?? null;
        if (p) captureSpawn(p); // spawn = respawn
      }
      const before = vitals.health;
      vitals = tickVitals(vitals, dt, maxHealthEff);
      if (vitals.health !== before) {
        const frac = vitals.health / maxHealthEff;
        survivalBar.setHealth(frac);
        feel?.setLowHealth(frac > 0 && frac <= LOW_HEALTH_FRACTION);
      }

      const nx = engine.camera.position.x;
      const nz = engine.camera.position.z;
      const horizSpeed = dt > 0 ? Math.hypot(nx - lastPlayerX, nz - lastPlayerZ) / dt : 0;
      lastPlayerX = nx;
      lastPlayerZ = nz;
      const rules = difficultyRules(settings.settings.difficulty);
      survival = tickSurvival(survival, dt, {
        sprinting: horizSpeed > SPRINT_SPEED_THRESHOLD_MPS,
        hungerRateMult: rules.hungerRate,
        maxEnergy: maxEnergyEff,
      });
      survivalBar.setStamina(survival.stamina);
      survivalBar.setHunger(survival.hunger);
      const starveDmg = starvationDamagePerTick(survival, dt);
      if (starveDmg > 0) {
        applyPlayerDamage(starveDmg);
        feel?.trigger('starve');
      }
    });

    // Phase E3.1-E3.3: minimap + full map. Markers merge whatever live
    // sources exist today (creatures, resource nodes) via the pluggable
    // MarkerSource array — wiring a future source (e.g. E0.5 ground loot)
    // is one more entry here, no change to MinimapModel/MapScreen.
    function liveMarkers(): readonly MapMarker[] {
      return mergeMarkers([
        () => spawns.liveMarkers(),
        () => groundItems.liveMarkers(),
        // E6.2: structures stamped so far this world, as "poi" markers.
        () =>
          (structureFieldRef?.liveMarkers() ?? []).map((m) => ({
            id: m.id,
            kind: 'poi' as const,
            x: m.x,
            z: m.z,
          })),
      ]);
    }
    const minimap = mountMinimapView({
      heightAt: (x, z) => hf.heightAtCpu(x, z),
      mobile: settings.settings.graphicsPreset === 'mobile',
    });
    const mapScreen = mountMapScreen({
      loc,
      getSnapshot: () => ({
        player: {
          x: engine.camera.position.x,
          z: engine.camera.position.z,
          yawRadians: ctx.hooks.getPose?.()?.yaw ?? 0,
        },
        exploration,
        markers: liveMarkers(),
      }),
      setInputEnabled: (on) => ctx.hooks.flyCamEnabled?.(on),
    });
    const MINIMAP_UPDATE_INTERVAL_S = 0.2;
    let sinceMinimapUpdate = 0;
    engine.onUpdate((dt) => {
      const px = engine.camera.position.x;
      const pz = engine.camera.position.z;
      exploration = revealAround(exploration, px, pz);
      sinceMinimapUpdate += dt;
      if (sinceMinimapUpdate < MINIMAP_UPDATE_INTERVAL_S) return;
      sinceMinimapUpdate = 0;
      minimap.update(
        { x: px, z: pz, yawRadians: ctx.hooks.getPose?.()?.yaw ?? 0 },
        liveMarkers(),
      );
      mapScreen.refresh();
    });

    // E5.5 kid-safe chat: a docked, always-visible scrollback + an Enter-to-
    // open input. The UI never filters anything itself — it only displays
    // whatever the host already resolved. `chatHandle` is the indirection
    // the net glue (wired in main.ts, after this scene builds) reaches
    // through `ctx.world.chat`, same pattern as `ctx.world.spawns`/`placeables`.
    const chatHandle: ChatUiHandle = { receiveMessage: () => {}, onSubmit: null };
    const chatBox = mountChatBox({
      loc,
      setInputEnabled: (on) => ctx.hooks.flyCamEnabled?.(on),
      onSubmit: (text, channel) => chatHandle.onSubmit?.(text, channel),
    });
    chatHandle.receiveMessage = (msg) => chatBox.receiveMessage(msg);
    if (ctx.world) {
      ctx.world.chat = chatHandle; // M7 net glue reaches it here
      ctx.world.hostPlayerName = loc.t('chat.host.name');
    }

    // Workstream 5.3: Z sleeps through the night (a no-op by day — no bed
    // exists yet, Workstream 7); sets the spawn point at the player's
    // current position, same convention as sleeping in most survival games.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyZ' || !isNight(sunSky.timeOfDay)) return;
      void (async () => {
        await screenEffectsRef?.sleepFadeOut();
        const pose = ctx.hooks.getPose?.();
        if (pose) captureSpawn(pose);
        ctx.hooks.setTimeOfDay?.(MORNING_HOUR);
        ctx.audio?.play('sleep');
        hud.recordProgress('sleep');
        await screenEffectsRef?.sleepFadeIn();
      })();
    });
    engine.onUpdate(() => {
      const placing = placementRef?.isBuildMode() ?? false;
      let hasMineTarget = false;
      if (!placing && voxelsRef) {
        AIM_DIR.set(0, 0, -1).applyQuaternion(engine.camera.quaternion).normalize();
        const hit = voxelsRef.raycastSolid(
          [engine.camera.position.x, engine.camera.position.y, engine.camera.position.z],
          [AIM_DIR.x, AIM_DIR.y, AIM_DIR.z],
          DIG_REACH_M,
        );
        hasMineTarget = hit !== null;
      }
      const hasInteractTarget =
        spawns.hasInteractTarget() || (placeableInteractionRef?.hasInteractTarget() ?? false);
      hud.setCrosshairState(
        resolveCrosshairState({
          placing,
          hasAttackTarget: spawns.hasAttackTarget(),
          hasInteractTarget,
          hasMineTarget,
        }),
      );
      // Workstream 6.5: first time any tamable/feedable target is in reach,
      // surface the "[T] Feed" keyhint once (persists dismissed thereafter).
      if (hasInteractTarget) hud.maybeShowTameHint();
      attackMeter.render(spawns.attackChargeFraction());
    });
  }

  // camera spawn: ground-clamped (?alt/x/z → fly) or the DEFAULT WALK SPAWN
  // at the map center — first dry, reasonably flat spot on a spiral out
  // from (0,0), eye at head height, facing the NE massif
  const q = new URLSearchParams(window.location.search);
  const alt = Number(q.get('alt') ?? NaN);
  if (params.cam === null) {
    if (Number.isFinite(alt)) {
      const x = Number(q.get('x') ?? 600);
      const z = Number(q.get('z') ?? 900);
      const yaw = Number(q.get('yaw') ?? 2.4); // rad; 0 = looking −z (north)
      const pitch = Number(q.get('pitch') ?? -0.04); // rad; negative = down
      const y = hf.heightAtCpu(x, z) + alt;
      // the fly camera doesn't exist yet — main applies this after rigging
      ctx.hooks.initialPose = { p: [x, y, z], yaw, pitch };
      ctx.hooks.initialPoseMode = 'fly';
      engine.camera.position.set(x, y, z);
    } else {
      const spawn = findWalkSpawn(hf);
      ctx.hooks.initialPose = {
        p: [spawn.x, hf.heightAtCpu(spawn.x, spawn.z) + 1.7, spawn.z],
        yaw: -0.78, // face NE — the serrated massif anchors the first frame
        pitch: -0.02,
      };
      ctx.hooks.initialPoseMode = 'walk';
      engine.camera.position.set(spawn.x, ctx.hooks.initialPose.p[1], spawn.z);
    }
  }

  // composed bookmarks (keys 1-9, ?shot=N) + 92 s flythrough (?fly=1 / F)
  installBookmarks(engine, hf, ctx.hooks, params);

  ctx.progress(1, 'terrain ready');
}

/**
 * Default walk spawn: first dry, reasonably flat spot on a coarse spiral
 * out from the map center (dry = waterY sits below the bed there; flat =
 * central-difference slope under ~19°).
 */
function findWalkSpawn(hf: Heightfield): { x: number; z: number } {
  for (let r = 0; r <= 240; r += 12) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 18));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = hf.heightAtCpu(x, z);
      if (hf.waterYAtCpu(x, z) > h - 0.05) continue; // wet or waterline
      const sx = hf.heightAtCpu(x + 6, z) - hf.heightAtCpu(x - 6, z);
      const sz = hf.heightAtCpu(x, z + 6) - hf.heightAtCpu(x, z - 6);
      if (Math.hypot(sx, sz) / 12 > 0.35) continue; // too steep
      return { x, z };
    }
  }
  return { x: 0, z: 0 };
}
