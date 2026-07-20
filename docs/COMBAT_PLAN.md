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
| E7.0 Contracts | WeaponMetadata/DamageType, weapon/projectile/ability/aoe/deployable registries, wire intents + host streams, FeelEvents combat ids | Done |
| E7.1 Melee | Per-weapon stats, attack-strength cooldown meter, cone assist, heavy sweep | Done |
| E7.2 Ranged | Draw-to-charge, host-simulated projectiles, ammo items, quiver HUD | Done |
| E7.3 Spells | Sparkle Bolt / Frost Puff / Healing Bloom / Vine Snare, focus resource, cast bar | Done |
| E7.4 AoE | Shared radius/falloff resolver, block-safe flag, boom VFX | Done |
| E7.5 Deployables | Grenade / proximity mine / bumble-trap, host arm+trigger | Done |
| E7.6 Monster abilities | Telegraphed windups, stand-and-cast / retreat-and-fire | Done |
| E7.7 Defeat VFX | Poof + confetti + loot fountain, gentle player-down | Done |
| E7.8 Loot pools | Weighted rarity tiers, difficulty multiplier, deterministic roll | Done |

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
- **An AoE blast** (E7.4): an `AoeSpec` entry in `AoeRegistry.ts` (radius/falloff/blockSafe/vfx),
  referenced by id from a weapon's `combat.aoe`, an ability's `aoe`, or a deployable's `aoe`. The
  host resolves who's hit via `resolveAoe(spec, center, targets)` (domain/combat/Aoe.ts, pure —
  never called by a joiner) and emits the existing `effect` wire message; the presentation side
  plays it via `attachAoeField(...).spawnBoom(spec, worldPos)` (spawn/AoeField.ts). Block-destroying
  booms stay off by default (`AoeFieldDeps.blockDestructionEnabled`) per the standing deferral below.
- (Each stream's merge updates this section with the concrete, exercised recipe — same discipline
  as EXPANSION_PLAN's "How to add content".)

## Security follow-ups (recorded as reviews land)

- **E7.0 protocol growth** (reviewed): host-stream validator hardening applied (bounded ids +
  finite coords); intent parse bounds confirmed at the trust boundary.
- **E7.4 AoE** (APPROVED): no wire surface — `effect` cue carries an id only; `resolveAoe` pure &
  host-only. Nit folded in: rejects non-finite (Infinity) radius.
- **E7.2 Ranged** (APPROVED): host-authoritative intent-only wire holds (client sends
  origin/dir/slot/chargeMs only; host computes damage from its own `WEAPON_REGISTRY`, debits own
  ammo, resolves own hits). All 6 E7.0-sec guards verified. Two deferrals to track, NOT skipped:
  - **Equip-possession not verified.** `handleEquipItem` accepts any id `WEAPON_REGISTRY` knows
    without checking the peer actually holds that item — low impact today (tier-0 weapons, PvE-only
    targets, no PvP), but becomes **must-fix** the moment weapon tiers gate progression or any
    PvP/player-damage target is introduced (ADR 0004 §2 records ownership validation as later work).
  - **Projectile broadcast cadence** (perf, not security): `broadcastProjectiles` fires every host
    tick while any projectile is live; bounded by the 12/peer cap. Throttle to the 10 Hz creature
    cadence later.
- **E7.5 Deployables** (APPROVED): faithful mirror of the E7.2 pattern — all 7 guards verified
  (validate → rate-limit → registry → per-peer cap → host-authoritative inventory debit → spawn;
  trigger resolves `resolveAoe` over the host's own entity set only). Deploy debits the real item, so
  possession is verified by construction here (stronger than E7.2's equip gap). Block-safe by default.
  Nits (track, not blocking): no max-lifetime on proximity/stepped deployables (a griefer can park
  their cap-of-6 mines indefinitely) + same broadcast-cadence throttle as projectiles.
- **E7.6 Monster abilities** (APPROVED): no new wire surface — new `cast`/`kite` behaviors ride the
  existing `CreatureEntity.behavior` string field; abilities are host-driven AI, damage host-computed,
  `resolveAoe`/`Projectile` run over the host's own single-player set only. Fair telegraphs, cozy
  palette, `starterCreatures` order preserved. Nits (track, not blocking): ability damage bypasses the
  night/difficulty multipliers the melee bite uses; monster abilities (like the bite) only hit the
  host's local player, never joiners (gameplay gap, not a vuln).
- **E7.3 Spellcasting** (APPROVED): host-authoritative castSpell — all 6 guards verified (null-pose
  gate, rate-limit, registry drop-on-unknown, host-authoritative focus debit, host-computed
  effects, authoritative target sets). Healing Bloom cannot heal enemies / target-spoof / over-heal.
  **Finding A applied at merge:** `validateCastSpell` now range-bounds a `groundTarget` spell's
  client-chosen `groundPoint` to ≤24 m of the caster (was finite-only) — closes the "center a blast
  anywhere on the map" hole before any *damaging* groundTarget spell lands (today's Vine Snare is
  damage-free). Deferred (for the future applier stream): Healing Bloom must clamp to `maxHealth`
  (finding B); focus is debited before a targeting early-return can no-op (finding C, self-harm nit).

## Integration follow-up (cross-stream, recorded not skipped)

- **Combat presentation fields not yet wired into `main.ts`/`NetSync.ts`.** `ProjectileField`
  (E7.2), `AoeField` (E7.4), and `DeployableField` (E7.5) each ship + test their pooled reconciler,
  but none is instantiated in the live composition root yet (grep: `attachProjectileField`/
  `attachAoeField` called nowhere outside their own modules/tests). The host simulation and wire are
  fully live; only the cosmetic client-side fields await one integration slice that threads
  `onProjectiles`/`onDeployables`/`onEffect`/`findHittableEntities` into `main.ts` for E7.2+E7.4+E7.5
  together. Pure integration/no new domain — no security surface (host sim runs regardless). Schedule
  after Wave B lands.

## Standing deferrals (recorded, not skipped)

- Damage-type affinity table: ship default-1.0 flavor only; gentle affinities later, charter-gated.
- Block-destroying explosions: behind a setting + voxel dig-mask budget; deferred unless playtest asks.
- Projectile lag compensation/rollback: not needed at cozy projectile speeds; revisit if fast
  projectiles arrive.
- Pathfinding/navmesh for kiting monsters: out of scope; direct-steering behaviors only.
- Combat achievements: blocked on the `ProgressionEventId` extension recorded in the E6.7 deferral.
