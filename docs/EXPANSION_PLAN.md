# Diggy World Expansion Plan (E0–E6)

The post-AAA expansion wave: ARPG-style progression and HUD, maps, inventory depth, multiplayer
social systems, and world content — kept cozy and kid-friendly (~11-year-old audience). Live
status: the `## Expansion` checklist in [`PROGRESS.md`](../PROGRESS.md).

## Locked design decisions

- **Cozy/kid-friendly throughout** — additive-only power (no debuff builds), free respec, gentle
  death, no scam/pressure mechanics, celebratory (never shaming) meters, kid-safe chat.
- **Host-authoritative multiplayer** — every mutation flows client→host as a validated intent
  (`Protocol.ts` → `IntentRules` → `HostSession`); the host's records are truth; state replies go
  owner-only (`send`, never `broadcast`); all wire validators hard-bounded. E0.4 (inventory
  authority) landed before any social/economy feature.
- **Prime directive** — never regress the no-flags desktop boot; all new behavior is additive and
  flag/preset/composition-gated.
- **Orbs are a reskin** of the existing vitals (hudStyle setting), not a parallel HUD.
- **Mandatory security reviews** (`claude-infra:security`) for inventory authority, trade, chat,
  and every other slice touching networking.

## Phases

| Phase | Content | Status |
|---|---|---|
| E0 Foundations | Billboard text util; `CreatureRegistry` (one entry = a new creature); `WorldClock` day/night; host-authoritative per-peer inventories; ground-drop loot + authoritative pickup | Done |
| E1 Stats/talents | Level/XP, talent points, additive `effective*Multiplier` API, free respec, per-owner persistence | Done |
| E2 ARPG HUD | Bars/orbs vitals, creature nameplates + lifebars, floating combat text, combat log + solo meter | Done |
| E3 Maps | Exploration fog-of-war, minimap, full-screen map (M), pluggable marker sources | Done |
| E4 Inventory depth | Autosort, item filters, autoloot, account bank (K) | Done (multiplayer bank deferred) |
| E5 Social | Party + frames, invite/kick, trade escrow, party inventory lookup, kid-safe chat, party meter | In flight |
| E6 World content | Caves, seeded structures/POIs, biome/time-gated spawning, research tree, asset library growth, settings, iconography | In flight |

## Dependency order

```
E0.1 Billboard ─┐
E0.2 Registry ──┤
E0.3 Clock ─────┼─► E1 Stats/Talents ─► E2 ARPG HUD ─► E3 Maps ─┐
E0.4 InvAuth ───┤                                                ├─► E6 World/Research/Polish
E0.5 GroundLoot ┘                       E4 Inv/Storage ─► E5 Social ┘
```

## How to add content

The E6.5 asset-library expansion (5 creatures, 17 items incl. the coin/gem/relic fix, 9 recipes,
5 build parts) exercised every seam below; this is the concrete recipe, not aspirational.

- **A creature:** one entry appended (not inserted — SpawnField's per-species hash salt is the
  array index, so inserting mid-array would silently reshuffle existing spawns) to
  `src/game/domain/creatures/starterCreatures.ts`. That's it for `CREATURE_STATS`
  (`domain/combat/Combat.ts`), `TEMPERAMENT` (`domain/ai/CreatureBrain.ts`), `TAMING_RULES`
  (`domain/taming/Taming.ts`) and `SPAWN_SPECIES`/`SPECIES_VISUAL` — all five are thin
  `CREATURE_REGISTRY`-derived projections (E0.2). A species with no rigged model just uses its
  `visual` primitive (`CreatureModelLibrary.has()` gates automatically) — only add a
  `src/spawn/CreatureModels.ts` `MODEL_SPECS` entry if reusing an *already-bundled* CC0 rig as a
  scale variant (do not add new downloaded assets). Add the species to any biome(s) it should favor
  in `domain/world/BiomeResources.ts` `creatures` list (additive; conservative — don't touch
  existing entries). Add `creature.<id>.name` to EN/ES/DA in `ui/i18n/strings.ts`.
  Guarding tests: `CreatureRegistry.test.ts` (completeness across all five derived tables),
  `strings.test.ts` (locale parity).
- **An item:** one entry in `domain/items/starterItems.ts`. It must be *reachable*: either tag it
  `"natural"` (a found/gathered root — treasure rewards like `coin`/`gem`/`relic` and creature
  drops like `bear-claw` use this even though nothing "grows" them, matching the existing
  `sand`/`clay`/`flint` convention) or make it a recipe output whose ingredients are themselves
  reachable. If it's meant to be gathered in the world, wire a `SpawnField.ts` node
  (`LATE_NODE_SPECIES` + `NODE_YIELD`) and a `src/spawn/SpawnPlacement.ts` `NODE_VISUAL` entry, one
  node per new gatherable (existing convention). Add `item.<id>.name` to EN/ES/DA in
  `ui/i18n/strings.ts`. Guarding tests: `RecipeGraph.test.ts` (reachability walk + no-orphan-unlock
  + the `>= 40 items` gate), `strings.test.ts`.
- **A recipe:** one entry in `domain/crafting/starterRecipes.ts`; every ingredient must already be
  reachable (a natural root or another recipe's output) or `RecipeGraph.test.ts` fails the chain.
  Guarding test: `RecipeGraph.test.ts` (`>= 25 recipes` gate + graph checks above).
- **A build part:** one entry in `src/voxel/placement/PlacementPieces.ts` `PLACEMENT_PIECES`
  (footprint + `requiresSupport`); only add it to `PLACEABLE_PIECE_IDS` if it carries domain state
  (like `chest`/`door`/`campfire`) rather than being pure structural geometry. Add
  `placeable.<id>.name` to EN/ES/DA in `ui/i18n/strings.ts` for consistency with the other
  structural pieces (not read by any UI yet — reserved for a future piece picker). Guarding test:
  `PlacementPieces.test.ts` (`>= 15 pieces` gate, unique ids, functional-set presence).

## Standing deferrals (recorded, not skipped)

- Multiplayer/persistent bank path — blocked on revisiting join-claim seed trust (security caveat:
  a client-seeded inventory must never reach persistent account storage).
- Joiner intra-grid inventory moves are local-only cosmetic (host echo overwrites); gate behind the
  existing `inventoryOp: "move"` intent when convenient.
- Node harvest resolved host-side still credits the host (pre-existing bug class fixed for kills by
  ground drops in E0.5) — fix by routing harvest loot through ground drops too.
- Joiner autoloot: all-or-nothing fit, intent re-fire without dedup; partial-fit + suppression later.
- Joiner cache prune path shares the OPFS root with world saves — move to a dedicated KV write.
- Waypoint persistence; full-map extreme-zoom mobile budget test; XP floating number (fires once XP
  events emit it); nameplate-policy filtering of map icons; peer/party map markers (E5).
