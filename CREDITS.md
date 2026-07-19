# Credits & Third-Party Provenance

Every third-party asset or data table shipped in this repo is recorded here
with its source and license (rule: art-asset-sourcing / dep-hygiene).

| What | Where in repo | Source | License | Notes |
|---|---|---|---|---|
| Transvoxel Algorithm lookup tables (regular + transition cell triangulations) | `src/voxel/TransvoxelTables.ts` (generated) | Eric Lengyel, [github.com/EricLengyel/Transvoxel](https://github.com/EricLengyel/Transvoxel) / [transvoxel.org](https://transvoxel.org/) | MIT (Copyright © 2009 Eric Lengyel) | Converted from `Transvoxel.cpp` by `tools/gen-transvoxel-tables.ts`; the algorithm is documented as free of patent claims. |
| LAAS engine (`src/core`, `render`, `gpu`, `world`, `sky`, `vegetation`, `debug`) | engine directories | upstream `Braffolk/fable5-world-demo` (git remote `upstream`) | per upstream repo | Kept as provenance remote; this repo builds additively on it. |
| Deer + Wolf rigged/animated models | `public/assets/models/animals/*.gltf` | Quaternius, [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) (byte-mirror via github.com/benjaminpjones/catch-the-animal) | CC0 1.0 (verified on pack page) | Self-contained glTF (embedded buffers, vertex colors); clips: Idle/Walk/Gallop/Attack/Death/Eating. Committed as plain git, not LFS — 3 MB JSON-text files; LFS pointer/bandwidth risk on Pages/Actions outweighs benefit at this volume (revisit if assets grow). |
| Knight rigged/animated humanoid (remote player avatar) | `public/assets/models/characters/Knight.glb` | Kay Lousberg, [KayKit Adventurers Character Pack](https://kaylousberg.itch.io/kaykit-adventurers), mirrored at [github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 1.0 (LICENSE.txt in the source repo) | Self-contained glb (~3.5 MB), 75 baked clips; only Idle/Walking_A/Running_A/Death_A are used. Committed as plain git, not LFS — same rationale as the animal models. |
