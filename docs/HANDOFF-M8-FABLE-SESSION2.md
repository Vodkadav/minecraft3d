# M8 Fable session-2 handoff (2026-07-06)

Pickup point after the first Fable [F] session (continuation of
[`HANDOFF-M8-OPUS.md`](./HANDOFF-M8-OPUS.md)). Everything below is committed on `main`;
gates green (typecheck, vitest 376/376, arch, build).

## Done this session

1. **World-gen time-slicing (the TDR fix, partial — see "open bug")** —
   `src/gpu/SliceMath.ts` (pure, tested) + `src/gpu/SlicedCompute.ts`
   (`slicedCompute(total, slice, name, body)` — uint-uniform base offset + tail guard, mirrors
   ProbeGI's per-frame budget; `gpuFence(renderer)` = `device.queue.onSubmittedWorkDone()`; NOTE
   `renderer.computeAsync` only encodes+submits, it does NOT wait). Applied to: HeightSynthesis
   (sliced, progress cb), Erosion (batch 8→2 at ≥2048² + fence/batch), FlowRivers (trace kernel
   sliced at 128k, fill batch 32→8 at ≥2048², fences everywhere), BiomeSnow (sliced), Scatter
   (all 4 passes + canopy splat/pack sliced at `SCATTER_SLICE` currently 64k, `[laas] scatter:`
   pass marks). **Result: gen that died at ~13% now runs synthesis→erosion→hydrology→biome→height
   readback in ~17 s on this box.**
2. **World-lifecycle engine half** (agent, merged): `src/main.ts` mounts the menu
   (`shouldMountMenu`: no `scene`/`seed`/`cam`/`shot` param and not `?menu=0`), `bootEngine(hooks,
   launch|null)` — null path is byte-identical legacy boot; menu launch boots seed/scene `world`,
   threads `ctx.world = {worldId, store, poseProvider}` (`src/debug/Scenes.ts`), restores saved
   pose via `hooks.initialPose`, saves pose on pagehide/visibilitychange via
   `WorldLifecycle.savePlayerState`. `composeGameUi` takes `worlds?: WorldSaveStore` (main passes
   one shared `PersistentWorldSaveStore`). `VoxelTerrain` 6th param `{worldId?, poseProvider?}`;
   `saveNow()` no longer clobbers name/pose/inventories/foreign entities (preserved from init,
   live pose preferred). +19 tests.
3. **Placement ghost adapter 8.5[F]** (agent, merged): `src/voxel/placement/*` — SdfNormal
   (gradient normal), PlacementWorldAdapter (SDF cell-center solid + registry occupancy),
   PlacedPieceRegistry (serialize ↔ `entities['placement.pieces']`), GhostVisual, PlacementPieces
   (block/platform/pillar), PlacementTool (attach entry). 20 tests. **Not yet wired into scenes.**
4. **Treasures adapter 8.7[F]** (agent, merged): `src/voxel/treasure/*` — TreasureStreaming (pure
   cell-crossing/set-diff/y/proximity/tier-color), TreasureField (attach entry; markers, spin/bob,
   claim → `onDiscovered(t, reward, state)`; persist state to `entities['treasure.discovered']`).
   26 tests. **Not yet wired into scenes.**
5. `tools/boot-probe.ts` — boots a scene and prints every progress transition until READY/FATAL
   (needs `npm run dev` on :5173). This is the TDR-fix verification loop.

## OPEN BUG — the remaining device-loss (exactly where the last session stopped)

`npx tsx tools/boot-probe.ts --scene world` still device-loses ("A valid external Instance
reference no longer exists" / "Instance dropped in popErrorScope") right after
`[laas] scatter: trees` prints. **It is NOT the trees kernel**: a bisect reduced it to
hash + `hf.sampleHeight` + atomic append at 64k threads/slice — still dies. Because
`computeAsync` doesn't wait and the death only *surfaces* at the first fence inside
`treeK.run`, the actual killer is in the unfenced window between the last proven-healthy point
(Heightfield's `getArrayBufferAsync` readbacks — those drain the queue and succeeded) and that
fence: i.e. **`SunSky.init` → Atmosphere LUT bakes (3 computeAsync in `src/sky/Atmosphere.ts`
~lines 203/265/331, small dispatches with big `Loop(STEPS)` bodies) and `skyCompute`**, or a
Dawn/AMD crash triggered there.

**Next step (was mid-edit):** in `TerrainScene.buildTerrainScene` add
`await gpuFence(engine.renderer)` + a `[laas]` mark immediately after `await sunSky.init(...)`
(~line 65). If the fence dies → bisect the three Atmosphere LUT kernels (fence between each,
then slice/shrink the guilty one). If the fence survives → the killer is in scatter's
*resource creation* (5 instancedArrays incl. 1.5M-vec4 stones + atomics) — test by allocating
without dispatching. Bisect scratch copy of the gutted-trees Scatter.ts is NOT needed —
current file is the full restored version.

Cleanup after the bug is fixed: consider raising `SCATTER_SLICE` (64k is conservative;
512k was fine for everything that actually ran), and decide whether the `[laas] scatter:` marks
stay (they're cheap and useful).

## Remaining [F] work after the fix (task list)

1. Wire adapters into scenes (VoxelDevScene first, then TerrainScene under `?voxel=1`/menu-launch):
   ```ts
   // placement (after `new DigTool(...)`) — capture-phase listener suppresses DigTool in build mode (B key)
   const placement = attachPlacementTool({ terrain: voxels, camera: engine.camera,
     dom: engine.renderer.domElement, parent: scene,
     /* save: entities['placement.pieces'] seam */ });
   engine.onUpdate(() => placement.update());
   // treasures
   const treasures = attachTreasureField({ seed: params.seed, surface, parent: scene,
     getPlayerXZ: () => [engine.camera.position.x, engine.camera.position.z],
     /* discovery: entities['treasure.discovered'] */
     onDiscovered: (_t, _r, state) => {/* persist state */} });
   engine.onUpdate((dt) => treasures.update(dt));
   ```
   TerrainScene surface = `{ heightAt: (x, z) => hf.heightAtCpu(x, z) }`. Persistence for both
   seams should go through the same save the voxel terrain uses (`ctx.world.store`).
2. Ore/gem visual verify: `npx tsx tools/voxel-shot.ts` (voxeldev; dig deep, ORE brassy / GEM cyan).
3. End-to-end menu → world boot verify (blocked on the open bug on this box).
4. Update `HANDOFF-M8-OPUS.md`/PROGRESS when items close; playtest gate after.

## Notes

- Dev server: leftover vite on :5173 from an old session was killed; start fresh (`npm run dev`,
  background) before probe/shoot runs. `.cache/webgpu-flags.json` holds the working Playwright recipe.
- vitest include now covers `src/gpu/**/*.test.ts` too (pure helpers only).
