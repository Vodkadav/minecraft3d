# ADR 0004 — Combat wave: hybrid targeting, aimed intents, and the cozy-abilities charter amendment

Date: 2026-07-20 · Status: accepted · Extends: ADR 0002 (multiplayer), ADR 0003 (host-authoritative streaming)

## Context

Pre-E7 combat is a single melee verb: `F` soft-locks the nearest creature within 3.5 m and applies a
hardcoded 10 damage scaled only by `might`. The host recomputes a *constant*, so per-hit validation
was unnecessary. E7 adds weapon variety, ranged+ammo, spells, AoE, deployables, and monster
abilities — which means variable damage, projectiles in flight, and area effects that every peer
must agree on. Three architectural gaps: no weapon stats on `ItemDefinition`, no authoritative
record of what a peer has equipped, and direct-steering AI with no pathfinding.

## Decision

1. **Hybrid targeting.** Melee uses a forward cone/soft-lock assist (kid-friendly); ranged, thrown,
   and spells use a real camera-ray crosshair. Both are expressed as *aimed intents* over the wire.
2. **Intents carry actions, never damage.** New joiner intents — `equipItem`, `aimedAttack`,
   `castSpell`, `deployItem` — describe what the player did (origin, direction, slot/id). The host
   resolves damage from its *own* record of the sender's equipped item, raytraces/simulates the hit
   itself, and debits ammo/focus/stamina against its authoritative inventory/vitals. A client can
   never name a damage number.
3. **Host-owned projectile/deployable simulation.** The host simulates arcs, fuses, and trigger
   checks; joiners send launch intents, render cosmetic tracers, and reconcile to host
   `projectiles`/`deployables` streams plus one-shot `effect` messages (same reconciler pattern as
   ADR 0003 creature streaming). No client-authoritative hits, no rollback — our projectiles are
   slow, arcing, and low-rate.
4. **Charter amendment (deliberate, owner-approved 2026-07-20).** The implicit "no magic/ability
   system" stance is amended to: *cozy whimsical abilities allowed* — additive-only power, no
   debuff builds, celebratory VFX (poofs/confetti/sparkles), no gore, damage types drive flavor
   not a rock-paper-scissors web (affinities default 1.0). Recorded in
   `docs/EXPANSION_PLAN.md` locked decisions.
5. **Weapon data lives on items.** `ItemDefinition` gains an optional additive `combat?:
   WeaponMetadata` block plus pure-data registries (weapon/projectile/ability/aoe/deployable),
   completeness-tested like `CreatureRegistry`.

## Alternatives considered

- **Client-authoritative hits with server sanity checks** — rejected: trust-boundary discipline
  (every mutation a validated intent) is the established charter; child-audience P2P play makes
  anti-cheat-by-construction worth the latency cost at our rates.
- **Lag-compensated rollback netcode** — rejected as over-engineering for slow cozy projectiles;
  revisit only if fast hitscan-like weapons are ever added.
- **Full tab-target or full free-aim** — rejected for the hybrid: tab-only undercuts the "exciting"
  goal, pure aim excludes the younger audience.
- **Navmesh pathfinding for kiting monsters** — rejected; monster abilities stay within
  direct-steering (stand-and-cast, retreat-and-fire).

## Consequences

- Wire protocol grows by 4 intent shapes and 3 host streams — every one bounds-checked at
  `parseMessage`, validated in `IntentRules`, round-trip-tested in `WireCodec`, and security-reviewed
  before merge (E7.0, E7.2–E7.6).
- The host tracks per-peer equipped state — a new small piece of authoritative session state.
- Rate limits and per-peer active-projectile/deployable caps become mandatory (DoS surface); the
  chat/party rate-limit follow-up pattern applies here from day one.
- Existing items are untouched (`combat?` optional); no save-format migration.
