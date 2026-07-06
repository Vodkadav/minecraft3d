# M8 Opus→Fable Handoff (2026-07-06)

Opus completed the milestone-8 **[O]** pure-logic slices (all TDD, renderer-free, layered-arch
clean, `dependency-cruiser` green). Everything below is committed on `main`. This doc is the pickup
point for Fable's **[F]** engine work in a fresh session.

Plan: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) · Placement research:
[`research/PLACEMENT_SNAPPING_RESEARCH.md`](./research/PLACEMENT_SNAPPING_RESEARCH.md).

## What Opus built (done)

| Slice | Files | Tests | Notes |
|---|---|---|---|
| **8.6[R]** placement research | `docs/research/PLACEMENT_SNAPPING_RESEARCH.md` | — | Fills open question #3. Recommends **kinematic snap-and-stay**, not physics. |
| **8.4[O]** ore/gem seeding | `src/game/domain/voxel/OreGemSeeding.ts`, `VoxelMaterial.ts`, `src/game/domain/rng/hash.ts` | 20 | Depth bands + hash-seeded ore veins + rarer/deeper gems, deterministic by seed. Wired into `VoxelTerrain` (`oreGemMaterialSampler(seed, surface)`); `depthBandSampler` placeholder retired. |
| **8.5[O]** placement domain | `src/game/domain/placement/{Placement,vec}.ts` | 32 | Grid snap (even/odd parity), surface-normal align (quaternion), socket matching (polarity + anti-parallel + nearest), validity predicates (overlap/terrain-clip/support/boundary/floor). `resolvePlacement → transform + validity`; `commit → PlacePieceCommand`. |
| **8.7[O]** hidden treasures | `src/game/domain/treasure/{HiddenTreasure,TreasureDiscovery}.ts` | 16 | Seeded placement over a 32 m cell grid (position/tier/reward all hashed); claim-once discovery returning the reward as a Result. |
| **world-lifecycle seam** | `src/game/application/WorldLifecycle.ts`, `app/composeGameUi.ts` | 5 | `launch(worldId) → WorldLaunch{seed, playerState, save}`; `savePlayerState(worldId, pose)`. `onLaunch` now emits `WorldLaunch`. |

Shared primitive added: `src/game/domain/rng/hash.ts` (`hash32`/`hashUnitFloat`, MurmurHash3-style) —
the domain-layer `hash(seed, cell, …)` the plan calls for. Reused by ore/gem **and** treasures; also
the natural home for the later M5.2 seeded spawns. (The engine's `pcg2d`/`cyrb53` live in `src/gpu`/
`src/core`, which the domain may not import — hence a domain copy.)

## Fable [F] pickup — what turns each [O] slice into a visible/functional feature

1. **Ore/gem render** — the ids now come from `oreGemMaterialSampler`; `VOXEL_MATERIAL_RGB`
   (`src/voxel/VoxelMaterials.ts`) gives ORE a brassy and GEM a cyan albedo. Verify the paint in
   `?scene=voxeldev` / `tools/voxel-shot.ts` (both run fine on this box). Optional polish: emissive
   glint / metallic on ore & gem vertices; tune band depths/densities (constants at the top of
   `OreGemSeeding.ts`).
2. **Placement ghost [F]** — build the render adapter the domain was designed against: a translucent
   `Mesh` tinted green/red from `PlacementResult.validity`, a `THREE.Raycaster` producing
   `{point, normal}` (+ nearby `WorldSocket`s) fed to `resolvePlacement`, and mesh instantiation on
   `commit`. The domain never touches a mesh — see the research doc's "domain/render split". Surface
   mode hands back `orientation` (a quaternion) already; wire the occupancy port to the M8.1 chunk
   store (`isOccupied`/`isSolid`).
3. **Hidden treasures [F]** — `treasuresNear(seed, x, z)` as chunks stream; resolve each treasure's
   `position.y` against the heightfield (domain leaves it 0), spawn a discoverable marker/mesh, and
   wire proximity/interaction to `discover(state, treasure)`. Persist `DiscoveryState` in the M2 save
   (`entities`).
4. **World-lifecycle engine half [F]** — the biggest wiring task. `src/main.ts` currently boots the
   engine directly and never mounts the game UI. Make it:
   - mount `mountGameUi(container, { onLaunch })` (front-of-game) and, on `onLaunch(launch)`, boot the
     world from `launch.seed` instead of `?seed=`;
   - restore `launch.playerState` onto the `FlyCamera` (position/yaw/pitch) after the rig exists
     (`hooks.initialPose` is the existing seam);
   - construct `VoxelTerrain` keyed to `launch.worldId` (constructor takes seed + a `worldIdPrefix`;
     give it the real worldId so digs persist per-world, not under `voxel-demo-${seed}`);
   - **fix `VoxelTerrain.saveNow()`** — it currently writes `playerState: [0,0,0]`, which would
     clobber the saved pose. It should preserve the existing `playerState` (or the lifecycle should
     own the pose write and VoxelTerrain only the chunk deltas — pick one owner).
   - call `WorldLifecycle.savePlayerState(worldId, pose)` on page-hide/exit.
   This half needs a device that can boot the full world to verify (see below), so it was left to Fable.

## World-gen device-loss — the user-chosen fix (option 3)

On the current dev box (**AMD RDNA-3, Windows 11**) the full world gen device-loses mid-boot
(`mapAsync … A valid external Instance reference no longer exists`) — the heavy erosion/scatter
compute exceeds the **Windows TDR** GPU-watchdog (~2 s). Even `?preset=low` fails (render presets cut
raster, not the gen-time compute burst). `?scene=voxeldev` / `?scene=sanity` run fine at 100+ fps.
See `~/.claude/MACHINE.md`.

**User decision (2026-07-06): fix it properly by time-slicing the world-gen compute** so no single GPU
submission exceeds the watchdog — yield across frames the way `ProbeGI` already does (3072
samples/frame). This is **Fable-led [F]**, and it also lifts low-end/mobile devices (the same
direction the mobile-reduced path is heading). Candidate targets: the erosion iteration loop
(640 it @2048²) and the clustered-Poisson scatter pass — chunk them into per-frame budgets behind a
progress tick, so boot stays responsive and never trips TDR. Interim workarounds for testing here:
raise Windows `TdrDelay`, update the AMD driver, or use the light scenes.

## Note: the 8.5 delegation collision (why placement uses `vec.ts`, not `geom.ts`)

8.7 was delegated to a background fork while Opus built 8.5 inline. The fork (inheriting full context)
built the **placement** module instead of treasures — two parallel implementations briefly existed.
Reconciled by keeping the fork's version (more complete: real quaternions, `PlacePieceCommand`,
`TerrainClip` reason, research-exact `BlockReason` naming) and discarding Opus's yaw-only variant;
8.7 was then built inline. No residue remains, but it's why placement's math lives in a local
`vec.ts`. Lesson for future delegation: a fork inheriting context can latch onto the wrong salient
task — give background agents a non-overlapping file scope or don't fork work adjacent to what you're
actively editing.
