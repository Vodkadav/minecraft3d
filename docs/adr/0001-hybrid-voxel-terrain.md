# ADR 0001 — Hybrid voxel terrain data model (M8)

Date: 2026-07-06 · Status: accepted

## Context

The game keeps the finished LAAS heightfield surface (non-editable, CDLOD-
rendered) and adds diggable underground + player structures (research §3,
plan M8). The subsystem must never regress the desktop render (prime
directive), persist only player edits (research §7), and stay crack-free while
digging in real time.

## Decision

1. **SDF voxels, smooth isosurface.** Signed distance per lattice sample,
   negative = solid, positive = air (Godot Voxel Tools convention, research §3
   ✅). Smooth Transvoxel meshing — not blocky cubes — to preserve LAAS's
   realistic look; ore/gem reading comes from material-painted layers.
2. **Global sample lattice, overlapping chunk faces.** 0.5 m voxels; 16³-cell
   chunks storing 17³ corner samples. Neighboring chunks duplicate their shared
   face samples; every edit writes all overlapping chunks on the quantized
   lattice, so shared faces stay bit-identical — the crack-free precondition
   that needs no cross-chunk stitching at equal LOD.
3. **Delta-only persistence through the M2 save.** A chunk materializes only
   when an edit changes it; unmodified space regenerates from the baseline
   (heightfield surface adapter). Chunks serialize as `ChunkDelta{key, rev,
   data}` blobs (version-tagged codec: i8 quantized SDF ±2 m, u8 material, edit
   bitmask) through the existing `WorldSaveStore` (OPFS + IndexedDB). `rev` is
   ready for the M7 host-authoritative merge.
4. **Break-ground seam = shader hole punch + edited-cell meshing.** The
   heightfield keeps rendering everywhere except inside recorded dig spheres
   (uniform vec4 array → alpha-test discard in the tile material, flag-gated by
   `?voxel=1`). The voxel mesher emits geometry only for cells with edited
   samples, so pristine surface is never double-rendered.
5. **Layering.** Pure store/codec/lattice math live in `src/game/domain/voxel`
   (dependency-cruiser-enforced, TDD'd); the mesher is pure TS in `src/voxel`
   (unit-tested); only the three.js/TSL adapters (`VoxelTerrain`, `DigMask`,
   `DigTool`) touch the renderer. Engine↔domain seams are ports:
   `VoxelBaseline`, `MaterialSampler`, `VoxelSurface`, `WorldSaveStore`.

## Consequences

- Same-LOD digging is crack-free by construction; **transition cells** (LOD
  stitching for distant voxel chunks) are deferred [F] — Lengyel's transition
  tables are already generated in `TransvoxelTables.ts` for that step.
- The dig-sphere hole mask caps at 128 spheres per world; beyond that the mask
  must become field-derived on GPU (logged, deferred [F]).
- Known rim limitations (deferred polish [F]): voxel rim material ≈ but ≠ the
  splatted terrain look; grass blades/vegetation still scatter over hole
  footprints; digging under water is not reconciled with the water surface.
- The deterministic ore/gem seeding function, ghost-preview placement system
  (8.5, after research 8.6) and hidden treasures (8.7) are Opus-owned [O]
  behind the `MaterialSampler` port and the domain voxel store.
