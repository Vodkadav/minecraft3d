# Diggy World Combat Plan (E7)

The combat & encounters wave: weapon variety, ranged + ammo, whimsical spells, AoE "booms,"
deployable traps/mines/grenades, monster abilities, defeat VFX, and difficulty-scaled loot — every
system with high-quality procedural visual effects, kept cozy for the ~11-year-old audience. Live
status: the `## Combat (E7)` checklist in [`PROGRESS.md`](../PROGRESS.md). Architecture decision:
[ADR 0004](adr/0004-combat-and-aimed-intents.md).

## Locked design decisions

- **Hybrid targeting** — melee lands via a forward cone/soft-lock assist; ranged/thrown/spells use a
  real camera-ray crosshair, host-validated (ADR 0004).
- **Cozy-whimsical tone** — charter amended (owner, 2026-07-20): whimsical abilities allowed;
  additive-only power, no debuff builds, free of gore — creatures "poof," booms are celebratory
  confetti, traps are brightly telegraphed "bumble-traps." Damage types drive VFX/flavor, never a
  punishing rock-paper-scissors web (affinities default 1.0).
- **Host-authoritative, intent-only wire** — `equipItem`/`aimedAttack`/`castSpell`/`deployItem`
  carry what the player did, never damage numbers; host owns projectile/deployable simulation;
  joiners render cosmetic tracers and reconcile to `projectiles`/`deployables`/`effect` streams.
- **Block-safe booms by default** — terrain-affecting explosions live behind a setting (deferred
  unless playtest asks).
- **Prime directive unchanged** — no-flags desktop LAAS boot never regresses; `domain/**` stays
  Three.js-free; everything additive.
- **Mandatory security reviews** (`claude-infra:security`) for E7.0's protocol growth and every
  wire-touching stream (E7.2–E7.6) before merge.

## Phases

| Phase | Content | Status |
|---|---|---|
| E7.0 Contracts | WeaponMetadata/DamageType, weapon/projectile/ability/aoe/deployable registries, wire intents + host streams, FeelEvents combat ids | In progress |
| E7.1 Melee | Per-weapon stats, attack-strength cooldown meter, cone assist, heavy sweep | Pending |
| E7.2 Ranged | Draw-to-charge, host-simulated projectiles, ammo items, quiver HUD | Pending |
| E7.3 Spells | Sparkle Bolt / Frost Puff / Healing Bloom / Vine Snare, focus resource, cast bar | Pending |
| E7.4 AoE | Shared radius/falloff resolver, block-safe flag, boom VFX | Pending |
| E7.5 Deployables | Grenade / proximity mine / bumble-trap, host arm+trigger | Pending |
| E7.6 Monster abilities | Telegraphed windups, stand-and-cast / retreat-and-fire | Pending |
| E7.7 Defeat VFX | Poof + confetti + loot fountain, gentle player-down | Pending |
| E7.8 Loot pools | Weighted rarity tiers, difficulty multiplier, deterministic roll | Pending |

## Dependency order

```
E7.0 Contracts ─► all streams in parallel (disjoint file ownership)
  shared primitives consumed cross-stream: E7.4 Aoe ─► E7.2/E7.3/E7.5/E7.6
                                           E7.2 Projectile ─► E7.6
  (consumers build against the frozen E7.0 interfaces + fakes; suggested merge order E7.4, E7.2 first)
E7.1, E7.7, E7.8 fully independent.
```

## How to add content (filled in as streams land)

- **A weapon:** an item entry in `starterItems.ts` with a `combat` block + a `WeaponRegistry`
  entry; EN/ES/DA names in `strings.ts`. Guarding tests: registry completeness, `strings.test.ts`.
- **A spell:** an `AbilityRegistry` entry (+ projectile/aoe spec ids as needed) + FeelEvent binding.
- **A trap/mine/grenade:** a `DeployableRegistry` entry referencing an `AoeSpec`.
- **A monster ability:** an `abilities` entry on the creature in `starterCreatures.ts`.
- (Each stream's merge updates this section with the concrete, exercised recipe — same discipline
  as EXPANSION_PLAN's "How to add content".)

## Security follow-ups (recorded as reviews land)

- (populated per-review)

## Standing deferrals (recorded, not skipped)

- Damage-type affinity table: ship default-1.0 flavor only; gentle affinities later, charter-gated.
- Block-destroying explosions: behind a setting + voxel dig-mask budget; deferred unless playtest asks.
- Projectile lag compensation/rollback: not needed at cozy projectile speeds; revisit if fast
  projectiles arrive.
- Pathfinding/navmesh for kiting monsters: out of scope; direct-steering behaviors only.
- Combat achievements: blocked on the `ProgressionEventId` extension recorded in the E6.7 deferral.
