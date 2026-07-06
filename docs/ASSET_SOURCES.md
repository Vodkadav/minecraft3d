# Asset Sources — approved catalogue

Every committed art/audio file must originate from a source listed here
(`rules/art-asset-sourcing.md`). CC0 preferred; CC-BY requires a `CREDITS.md`
row before commit. Researched + license-verified 2026-07-06 (M6.1).

## 3D characters & creatures (rigged + animated glTF)

| Source | Pack | Contents | License | URL |
|---|---|---|---|---|
| Quaternius | Ultimate Animated Animal Pack | 12 animals incl. **Deer**, Wolf, Fox, Horse — 12+ clips each (Idle/Walk/Run/Attack/Death…), glTF | CC0 (verified on pack page → creativecommons.org/publicdomain/zero/1.0) | quaternius.com/packs/ultimateanimatedanimals.html |
| Quaternius | Farm Animal Pack | 7 farm animals incl. Pig (boar stand-in) | CC0 (stated on quaternius.com) | quaternius.com/packs/farmanimal.html |
| KayKit (Kay Lousberg) | Character Pack: Adventurers | 4 rigged+animated low-poly humanoids + accessories, glTF | CC0 1.0 (verified on GitHub org + itch.io) | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| KayKit | Character Animations | 133 humanoid clips (idle/run/crouch/sneak/melee/ranged/die/emotes) on shared Rig_Medium/Rig_Large skeletons — retargeting across KayKit packs is first-class | CC0 (verified on kaylousberg.com) | kaylousberg.com/game-assets/character-animations |

**Known gap:** no CC0 rigged+animated *boar* exists in any reputable free
source (verified). Plan: Quaternius Pig retargeted onto the animal-pack
quadruped clip set (same vendor ⇒ compatible skeleton naming), reskinned
toward "boar", or a static CC0 boar rigged once in Blender against the
Quaternius quadruped skeleton.

## 2D / UI / SFX (from the global rule's defaults — use when needed)

| Source | Use | License |
|---|---|---|
| kenney.nl | UI, particles, prototype textures (NOTE: Kenney animals are 2D/static — not for M6 creatures) | CC0 |
| game-icons.net | UI iconography | CC-BY 3.0 — **attribution required** (CREDITS.md) |
| opengameart.org | supplemental; **verify license per entry** | mixed |
| Freesound (API) | SFX — only CC0/CC-BY tags | mixed |
| assetfactory MCP (local AI) | generated art/SFX — commercial-safe models only, provenance row in CREDITS.md | per model |

## Cohesion note

Primary 3D set = two vendor ecosystems only: Quaternius (animals) + KayKit
(humanoids). Both CC0, both native glTF, both designed for shared-skeleton
retargeting (`SkeletonUtils.retargetClip`).
