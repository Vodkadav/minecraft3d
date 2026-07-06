# Credits & Third-Party Provenance

Every third-party asset or data table shipped in this repo is recorded here
with its source and license (rule: art-asset-sourcing / dep-hygiene).

| What | Where in repo | Source | License | Notes |
|---|---|---|---|---|
| Transvoxel Algorithm lookup tables (regular + transition cell triangulations) | `src/voxel/TransvoxelTables.ts` (generated) | Eric Lengyel, [github.com/EricLengyel/Transvoxel](https://github.com/EricLengyel/Transvoxel) / [transvoxel.org](https://transvoxel.org/) | MIT (Copyright © 2009 Eric Lengyel) | Converted from `Transvoxel.cpp` by `tools/gen-transvoxel-tables.ts`; the algorithm is documented as free of patent claims. |
| LAAS engine (`src/core`, `render`, `gpu`, `world`, `sky`, `vegetation`, `debug`) | engine directories | upstream `Braffolk/fable5-world-demo` (git remote `upstream`) | per upstream repo | Kept as provenance remote; this repo builds additively on it. |
