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

- **A creature:** one entry in `src/game/domain/creatures/starterCreatures.ts` (+ an optional
  model spec in `CreatureModels.ts`). Registry completeness invariants are tested — CI fails on a
  half-registered creature. Biome affinity slot arrives with E6.3.
- **An item/recipe:** extend `starterItems.ts` / the recipe tables; `RecipeGraph.test.ts`-style
  reachability tests must stay green (no orphan/unreachable content).
- *(E6.5 will expand this section with the full recipe as the asset library grows.)*

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
