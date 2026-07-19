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
import { attachTreasureField } from '../voxel/treasure/TreasureField';
import { attachSpawnField } from '../spawn/SpawnFieldView';
import { mountGameHud } from '../spawn/GameHud';
import { stepCameraShake } from '../feel/CameraShake';
import { mountDamageNumbers } from '../feel/DamageNumbers';
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
  canAttack as canAttackSurvival,
  drainStaminaForAttack,
  spawnSurvival,
  starvationDamagePerTick,
  tickSurvival,
} from '../game/domain/survival/Survival';
import { eat } from '../game/domain/survival/Eating';
import { isNight, MORNING_HOUR } from '../game/domain/time/DayNight';
import { Crosshair } from '../game/ui/components/Crosshair';
import { createLocalizer } from '../game/ui/i18n/strings';
import { LocalStorageSettingsStore } from '../game/infrastructure/persistence/LocalStorageSettingsStore';
import { SettingsController } from '../game/application/SettingsController';
import { createPlayerSurvivalBar } from '../spawn/PlayerSurvivalBar';
import { IndexedDbKeyValueStore } from '../game/infrastructure/persistence/IndexedDbKeyValueStore';
import { OpfsBlobStore } from '../game/infrastructure/persistence/OpfsBlobStore';
import { PersistentWorldSaveStore } from '../game/infrastructure/persistence/PersistentWorldSaveStore';
import type { WorldContext } from './Scenes';
import type { CamPose } from '../core/Hooks';

/** Health fraction at/below which the persistent low-health vignette shows (Workstream 2.5). */
const LOW_HEALTH_FRACTION = 0.25;

export async function buildTerrainScene(ctx: WorldContext): Promise<void> {
  const { engine, params, seed } = ctx;

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
    new DigTool(voxels, engine.camera, engine.renderer.domElement, ctx.audio, feel ?? undefined);
    crosshairRef = Crosshair();
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
    let vitals = spawnPlayerVitals();
    // Workstream 5.1: hunger + stamina, ticked alongside vitals below.
    let survival = spawnSurvival();
    // reposition through the fly camera's own seam (setPose owns basePos too —
    // a raw camera.position.set is stomped by fly.update the same frame)
    let respawnPose: CamPose | null = null;
    // Workstream 5.3: the domain spawn-point value (position-only); mirrors
    // respawnPose whenever it's (re)captured — a placed bed (Workstream 7)
    // will call `setSpawnPoint` from the same seam instead of "on sleep".
    let spawnPoint: SpawnPoint | null = null;
    const survivalBar = createPlayerSurvivalBar(createLocalizer(settings.settings.locale));

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
    const itemsReg = ItemRegistry.create(STARTER_ITEMS);
    if (!isOk(itemsReg)) throw new Error(`bad starter item table: ${itemsReg.error.kind}`);
    const hud = mountGameHud({
      loc,
      registry: itemsReg.value,
      enableHotbarDigitKeys: false,
      ...(crosshairRef ? { crosshair: crosshairRef } : {}),
      ...(ctx.audio ? { audio: ctx.audio } : {}),
      ...(feel ? { feel } : {}),
      setInputEnabled: (on) => ctx.hooks.flyCamEnabled?.(on),
      onEat: (food) => {
        const r = eat(vitals, survival, food);
        vitals = r.vitals;
        survival = r.survival;
        const frac = vitals.health / PLAYER_MAX_HEALTH;
        survivalBar.setHealth(frac);
        survivalBar.setHunger(survival.hunger);
        feel?.setLowHealth(frac > 0 && frac <= LOW_HEALTH_FRACTION);
      },
    });
    const AIM_DIR = new Vector3();

    // Workstream 5.1: an F-attack costs stamina/hunger and is gated while
    // stamina is empty; applied here (not in the domain) since it needs the
    // live `survival` closure. Local player state only — never routed
    // through the intent path (see the SpawnFieldDeps doc comment).
    function applyPlayerDamage(amount: number): void {
      const r = damagePlayer(vitals, amount);
      vitals = r.state;
      const frac = vitals.health / PLAYER_MAX_HEALTH;
      survivalBar.setHealth(frac);
      survivalBar.flashDamage();
      feel?.setLowHealth(frac > 0 && frac <= LOW_HEALTH_FRACTION);
      if (r.died) {
        vitals = respawnPlayer(vitals);
        survival = spawnSurvival();
        if (respawnPose) ctx.hooks.setPose?.(respawnPose);
        survivalBar.setHealth(1);
        survivalBar.setStamina(survival.stamina);
        survivalBar.setHunger(survival.hunger);
        feel?.setLowHealth(false);
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
      onPlayerHit: (amount) => applyPlayerDamage(amount),
      setMoveSpeedScale: (s) => ctx.hooks.setMoveSpeedScale?.(s),
      onLoot: (stacks) => hud.addLoot(stacks),
      canAttack: () => canAttackSurvival(survival),
      onAttack: () => {
        survival = drainStaminaForAttack(survival);
        survivalBar.setStamina(survival.stamina);
        survivalBar.setHunger(survival.hunger);
      },
      isNight: () => isNight(sunSky.timeOfDay),
      creatureDamageMult: difficultyRules(settings.settings.difficulty).creatureDamage,
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
    engine.onUpdate((dt) => {
      spawns.update(dt);
      if (!respawnPose) {
        const p = ctx.hooks.getPose?.() ?? null;
        if (p) captureSpawn(p); // spawn = respawn
      }
      const before = vitals.health;
      vitals = tickVitals(vitals, dt);
      if (vitals.health !== before) {
        const frac = vitals.health / PLAYER_MAX_HEALTH;
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
      });
      survivalBar.setStamina(survival.stamina);
      survivalBar.setHunger(survival.hunger);
      const starveDmg = starvationDamagePerTick(survival, dt);
      if (starveDmg > 0) {
        applyPlayerDamage(starveDmg);
        feel?.trigger('starve');
      }
    });

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
      hud.setCrosshairState(
        resolveCrosshairState({
          placing,
          hasAttackTarget: spawns.hasAttackTarget(),
          hasInteractTarget: spawns.hasInteractTarget(),
          hasMineTarget,
        }),
      );
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
