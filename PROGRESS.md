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
- [ ] M0.5 Vitest for game-logic layers — deferred until first testable logic
- [ ] M1 Mobile PWA shell + capability gating (manifest, service worker, storage.persist, mobile preset)
- [ ] M2 World framing: save architecture, seed vault, adjustable boundary
- [ ] M3 Game-logic core: item registry, inventory, crafting, gathering (TDD)
- [ ] M4 Menu, settings, multiplayer lobby UI
- [ ] M5 Spawning: proximity-gated, tunable density (research-first)
- [ ] M6 Characters & creatures: animation, taming, riding
- [ ] M7 Multiplayer: player-hosted P2P (research-first)
- [ ] M8 Hybrid voxel terrain: mining, building, treasures (Fable-led)

## Notes

- Prime directive: never regress the finished desktop LAAS render — all new work is additive and
  flag/preset-gated.
- Open research questions (resolve before their milestone): iOS Safari WebGPU status; spawn-density
  systems; physics-building/crafting patterns; persistent-world P2P netcode. See the research doc.
