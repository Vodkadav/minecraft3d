# Progress — minecraft3d (survival sandbox on LAAS)

Building a free, desktop-first-with-mobile-PWA Minecraft-style survival game on the LAAS procedural
WebGPU engine. Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) ·
Research: [`docs/research/BUILD_ON_LAAS_RESEARCH.md`](docs/research/BUILD_ON_LAAS_RESEARCH.md).

Live: https://vodkadav.github.io/minecraft3d/ (desktop Chrome + WebGPU).

## Status

- [x] Deep-research pass (mobile PWA, free multiplayer, hybrid voxel terrain, spawning, creatures, persistence, CI/CD)
- [x] Implementation plan recorded in repo (milestones M0–M8, tagged Opus-now / Fable-complex / research-first)
- [x] Repo connected to Vodkadav/minecraft3d (origin); upstream kept for provenance
- [x] CI gate (typecheck + build) — green
- [x] Deploy to GitHub Pages (free) — live
- [x] M0.4 ESLint blocking in CI (2026-07-06: flat config, js+ts recommended, --max-warnings 0,
  in `ci` script + GH Actions; Prettier skipped deliberately — style churn on the engine tree,
  review enforces consistency). npm audit clean (esbuild advisory fixed).
- [x] M0.5 Vitest + dependency-cruiser (layer rules) wired into the CI gate — game-logic layers
- [~] M1 Mobile PWA shell — manifest, service worker (offline precache), capability-tier gate,
  storage.persist done ([O]); M1.6 mobile-reduced render preset done ([F], 2026-07-06: engine
  `?preset=mobile` + tier/settings fallback resolution, froxels off, 4k particles, 2×1024 cascades,
  grass ring off, veg draw distance ×0.5); iOS check [R] resolved 2026-07-06: Safari 26 /
  iOS 26 ships WebGPU enabled by default (Metal-backed) — older iOS falls to the existing
  capability-gate message. Remaining: a real iPhone/iPad smoke test when a device is available
- [x] M2 World framing: save architecture (OPFS/IndexedDB ports + fakes), seed vault, adjustable boundary — TDD, renderer-free
- [x] M3 Game-logic core: item registry, inventory, crafting, gathering — TDD, renderer-free
- [x] M4 Menu, settings, multiplayer lobby UI — EN/ES/DA, a11y baseline, Host/Join loopback (netcode M7)
- [~] M5 Spawning — done 2026-07-06 except interaction: 5.1 research verified (Minecraft model,
  see research doc §4); 5.2 deterministic seeded field (`domain/spawn/SpawnField`, TDD:
  hash(seed, epoch, cell, salt), per-cell budget × the M4 `animalDensity` slider); 5.3 proximity
  gate (`domain/spawn/SpawnProximity`, TDD: 24 m no-spawn ring, 128 m spawn range, 160 m despawn
  hysteresis, nearest-player multi-player rule, removed-ids seam); 5.4 terrain placement
  (`src/spawn/`: walkable-ground validity above-water + slope, placeholder primitives per
  species, wired into voxeldev + world under the menu-launch/?spawns=1 gate; verified aerial
  shot + world boot). Remaining: harvest/kill interaction (arrives with M6 combat / M3 gathering
  wiring); global spawn caps deferred to M7 multiplayer.
- [~] M6 Characters & creatures — core done 2026-07-06: 6.2 locomotion state machine
  (`domain/locomotion`, TDD: full idle/run/crouch/strafe/work/fight/die/ride set, death terminal,
  ride guards); 6.3 creature AI (`domain/ai/CreatureBrain`, TDD: temperament roam/flee/aggro,
  wounded-flee, deterministic wander waypoints; wired — creatures roam/flee/charge in both scenes,
  verified in-browser); 6.4 taming state machine (`domain/taming`, TDD: feed sequence, wrong-food/
  impatience resets, tamed ⇒ rideable); 6.6 combat/death (`domain/combat`, TDD: health,
  single-death-event, deterministic loot; wired — F attacks, E harvests nodes, loot + removed ids
  persist to the world save entities bag). This also closes M5's interaction gap.
  6.1/6.2 [F] done: CC0 Quaternius Deer+Wolf rigged glTF (CREDITS.md), CreatureModelLibrary
  (SkeletonUtils.clone per instance, height-normalized, behavior→clip AnimationMixer wiring,
  one-shot death), primitives upgrade in place when the async load lands. 6.4 wiring done:
  T feeds (consumes loot food), tamed ids persist, tamed creatures heel (follow behavior, TDD).
  6.5 done (MVP): G mounts a tamed creature — walk controller stays the mover, mount glued
  under the camera, speed-driven clips; no ride speed boost yet. Player health done
  (2026-07-06): `domain/combat/PlayerVitals` (TDD: damage, single death, grace-period
  full-heal regen, respawn), aggressive-creature contact damage in SpawnFieldView, a11y
  health-bar HUD, scene respawn via the fly-camera setPose seam; verified voxeldev boots
  with the bar mounted. Remaining: player humanoid model (KayKit — remote avatars are
  capsules today), ride speed boost.
- [x] M7 Multiplayer — 7.1 research resolved + ADR 0002 (trystero/Nostr signaling, Metered TURN,
  room-code lobby, pause-on-host-offline, host validates intents); 7.2/7.5 [O] done TDD
  (`domain/net`: RoomCode/Protocol/IntentRules; `application`: NetTransport port, HostSession
  welcome-snapshot + validate→apply→broadcast, JoinSession, honest in-memory network — 72 tests);
  7.3 [F] done: TrysteroTransport adapter, live-verified P2P message exchange between two
  browsers over public Nostr rails. 7.4 [F] done (2026-07-06): host room-code badge, join-by-code
  boot from the welcome snapshot, 10 Hz pose + echo-guarded world-edit sync loop (`src/net/`),
  smoothed remote-player avatars, WireCodec for trystero's JSON transport. Root-caused + fixed a
  live 2-peer join deadlock (single dropped join packet → no welcome; now re-announced on a timer).
  Verified end-to-end over public Nostr rails (`tools/net-probe.ts`): B joins by code, boots with
  A's seed, mutual avatars. Follow-ups: KayKit humanoid avatars, interact-intent sync, freeze-and-
  wait host-offline UX (ADR 0002 §5, warns today).
- [~] M8 Hybrid voxel terrain (Fable-led) — Fable [F] core done (2026-07-06): 8.1 SDF chunk store
  (TDD, delta persistence via M2 save), 8.2 Transvoxel regular-cell mesher (TDD; MIT Lengyel tables,
  see CREDITS.md), 8.3 break-ground seam (`?voxel=1`: dig-mask hole punch, dig/fill tool, walkable
  caverns, OPFS round-trip verified in `?scene=voxeldev` + `tools/voxel-shot.ts`), 8.4[F] vertex
  material painting behind the `MaterialSampler` port. ADR 0001. **Opus [O] done (2026-07-06,
  TDD, renderer-free — see `docs/HANDOFF-M8-OPUS.md`):** 8.6[R] placement research pass; 8.4[O]
  deterministic depth-seeded ore/gem function (`domain/voxel/OreGemSeeding` + `domain/rng/hash`,
  wired into VoxelTerrain, placeholder retired); 8.5[O] kinematic placement domain
  (`domain/placement`: grid/surface/socket snap + validity); 8.7[O] hidden treasures
  (`domain/treasure`: seeded placement + discovery); world-lifecycle app seam
  (`application/WorldLifecycle` + composeGameUi). **Fable [F] session 2+3 done (2026-07-06):**
  world-gen device-loss FIXED (two causes: GPU time-slicing `src/gpu/SlicedCompute.ts` for the
  TDR mega-dispatches, AND the atmosphere multi-scatter bake's 64×-unrolled shader killing Dawn —
  now a runtime loop; `?scene=world` boots READY ~48 s on the dev box, verified
  `tools/boot-probe.ts`); menu↔engine lifecycle wired in `src/main.ts` (menu mounts on plain URL,
  Solo launch boots the world, pose save/restore, shared save store); placement ghost
  (`src/voxel/placement`, B build mode) + hidden treasures (`src/voxel/treasure`, streamed tier
  markers) built TDD and wired into voxeldev + world scenes, persisting through
  `VoxelTerrain.entity()/setEntity()`; ore brassy verified visually (deep-pit shot), gem seeding
  unit-tested; end-to-end menu → Solo → full-world boot verified in Playwright.
  Dig-mask economy fixed (2026-07-06): only carves that intersect the surface sheet record a mask
  sphere, so deep tunnel carves no longer consume the 128 slots (~10× effective capacity for
  mining). **Deferred (recorded, not skipped):** field-derived hole mask — trigger: >128 SURFACE
  digs in real play; transvoxel transition-cell stitching — trigger: voxel chunks gaining LOD
  levels (today all edited chunks render LOD0, no cracks possible); rim material/veg-over-hole
  culling — cosmetic, trigger: playtest feedback (touches 15 veg node materials, prime-directive
  risk). **Remaining:** playtest gate.

## Notes

- Prime directive: never regress the finished desktop LAAS render — all new work is additive and
  flag/preset-gated.
- Open research questions (resolve before their milestone): iOS Safari WebGPU status; spawn-density
  systems; physics-building/crafting patterns; persistent-world P2P netcode. See the research doc.
- Game logic lives under `src/game/{domain,application,infrastructure,ui}` (layered, dependency-cruiser
  enforced) — additive, renderer-free, and separate from the untouched LAAS engine (`src/core`, `render`,
  `gpu`, `world`, `sky`, `vegetation`, `debug`). This is the Opus-owned block; Fable's [F] engine work
  (voxel terrain, mobile fidelity, netcode transport) plugs into these ports. Fable's M8 subsystem:
  pure voxel domain in `src/game/domain/voxel`, mesher + three.js adapters in `src/voxel` (vitest
  covers both).
- `?scene=voxeldev` is the lightweight voxel proving ground (analytic ground, full dig stack).
  The full-world device loss is FIXED (2026-07-06, see M8 status) — `?scene=world` runs in
  Playwright Chromium on the dev box again.
- **[F] World-gen device-loss fix — DONE (2026-07-06):** two independent causes, both fixed.
  (1) Gen-time mega-dispatches tripped the Windows TDR watchdog on AMD RDNA-3 → time-sliced via
  `src/gpu/SlicedCompute.ts` (uint-uniform base offset + tail guard + `gpuFence` between
  submissions; applied to synthesis, erosion, hydrology, biome, scatter). (2) The atmosphere
  multiple-scattering bake unrolled 64 sphere directions × an 18-step march at COMPILE time —
  a shader big enough to kill Dawn outright ("valid external Instance reference no longer
  exists"); the directions are now computed in-shader from a runtime loop. Also helps
  low-end/mobile.
- Menu/lobby ↔ engine world lifecycle glue — DONE both halves (2026-07-06): `src/main.ts` mounts
  the menu on a plain URL (`shouldMountMenu`), boots from `WorldLaunch` (seed + pose restore),
  keys VoxelTerrain to the real worldId, saves pose on pagehide/visibilitychange; verified
  end-to-end (menu → Solo → full-world READY) in Playwright.
