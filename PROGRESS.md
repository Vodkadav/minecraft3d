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
  material painting behind the `MaterialSampler` port. ADR 0001. **Remaining — Opus [O]:** 8.4[O]
  deterministic depth-seeded ore/gem function (replace `depthBandSampler` placeholder, TDD), 8.5
  placement system (ghost/rotate/snap — after 8.6), 8.7 hidden treasures; **[R]:** 8.6 placement
  research pass; **[F later]:** transition-cell LOD stitching, field-derived hole mask (>128 digs),
  rim material/vegetation polish.

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
- Menu/lobby ↔ engine world lifecycle glue (choose/host a saved world from the M4 UI, restore
  player pose) is Opus [O] integration work — the voxel subsystem saves under a per-seed demo
  world id until then.
