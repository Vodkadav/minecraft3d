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
- [ ] M0.4 ESLint/Prettier (non-blocking → blocking) — deferred
- [x] M0.5 Vitest + dependency-cruiser (layer rules) wired into the CI gate — game-logic layers
- [~] M1 Mobile PWA shell — manifest, service worker (offline precache), capability-tier gate,
  storage.persist done ([O]); M1.6 mobile-reduced render preset done ([F], 2026-07-06: engine
  `?preset=mobile` + tier/settings fallback resolution, froxels off, 4k particles, 2×1024 cascades,
  grass ring off, veg draw distance ×0.5) — iOS Safari WebGPU check [R] remains
- [x] M2 World framing: save architecture (OPFS/IndexedDB ports + fakes), seed vault, adjustable boundary — TDD, renderer-free
- [x] M3 Game-logic core: item registry, inventory, crafting, gathering — TDD, renderer-free
- [x] M4 Menu, settings, multiplayer lobby UI — EN/ES/DA, a11y baseline, Host/Join loopback (netcode M7)
- [ ] M5 Spawning: proximity-gated, tunable density (research-first)
- [ ] M6 Characters & creatures: animation, taming, riding
- [ ] M7 Multiplayer: player-hosted P2P (research-first)
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
  (`application/WorldLifecycle` + composeGameUi). **Remaining — Fable [F]:** paint the ore/gem +
  treasure + placement-ghost render adapters; boot the chosen world from `WorldLaunch` in
  `src/main.ts` (mount UI, seed + FlyCamera pose restore, VoxelTerrain keyed to the real worldId,
  save-pose on exit); world-gen device-loss time-slice fix (see Notes); transition-cell LOD
  stitching, field-derived hole mask (>128 digs), rim material/vegetation polish.

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
- `?scene=voxeldev` is the lightweight voxel proving ground (analytic ground, full dig stack) —
  exists because the full world gen currently device-loses in Playwright Chromium on the dev box
  (AMD RDNA-3, Windows TDR — see `~/.claude/MACHINE.md`); `?voxel=1` on `?scene=world` therefore
  still needs a visual pass on a device that can run the full pipeline.
- **[F] World-gen device-loss fix (user-chosen approach, 2026-07-06):** the full world gen
  (erosion/scatter compute) trips the Windows TDR GPU watchdog on AMD RDNA-3 → device lost mid-boot
  (`mapAsync … external Instance reference no longer exists`). Even `?preset=low` fails (render
  presets cut raster cost, not the gen-time compute burst). **Chosen fix: time-slice the world-gen
  compute** so no single GPU submission exceeds the watchdog (yield across frames, as ProbeGI
  already does at 3072 samples/frame) — also helps low-end/mobile and extends the mobile-reduced
  path. Fable-led. Interim workarounds for testing on this box: raise Windows `TdrDelay`, update the
  AMD driver, or use `?scene=voxeldev`/`?scene=sanity`. See the handoff doc for detail.
- Menu/lobby ↔ engine world lifecycle glue: the [O] application seam is done —
  `application/WorldLifecycle` resolves a session's worldId into a `WorldLaunch` (seed + saved
  player pose + delta save) and saves pose back on exit; composeGameUi's `onLaunch` now emits it.
  The [F] engine half remains: `src/main.ts` must mount the game UI, boot from `WorldLaunch`
  (seed + FlyCamera pose restore), key VoxelTerrain to the real worldId (not `voxel-demo-${seed}`;
  and stop VoxelTerrain.saveNow clobbering `playerState` to origin), and call `savePlayerState` on
  exit. See `docs/HANDOFF-M8-OPUS.md`.
