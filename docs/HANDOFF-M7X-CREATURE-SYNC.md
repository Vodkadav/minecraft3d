# M7.x handoff — host-authoritative creature streaming (design + plan)

Status: **designed, not started.** Next session: write ADR 0003 from the design
below, then implement in the tested slices listed. Working tree is clean at
commit `50b5bb7`.

## Why this exists (the problem)

Co-op creatures currently diverge between clients. Spawns are deterministic
(`domain/spawn/SpawnField` hashes seed+cell → same ids/positions/species on
every client), BUT creature **movement** is player-relative:
`domain/ai/CreatureBrain` `decideBehavior`/`steer` react to the *local* player,
so each client's creatures chase their own player. Kills/harvests also don't
sync. Result: everyone sees a different animal world.

A minimal "interact → entityRemoved" sync would keep removals consistent while
creatures still teleport relative to each other — half-correct. The real fix is
host-authoritative simulation streamed to joiners, like player poses already are.

## Design (draft ADR 0003)

**Decision: the host is authoritative for every spawn-field entity (creatures
AND nodes); joiners mirror a host-streamed entity snapshot and send interaction
intents. Joiners run no local spawn AI, proximity, or interaction resolution.**

1. **Host simulates, joiner puppets.** Host keeps `SpawnFieldView` as-is
   (proximity + `CreatureBrain` AI + interaction resolution). Joiner runs
   `SpawnFieldView` in a new **remote mode**: no `stepSpawns`, no `stepCreatures`
   AI, no local F/E/T resolution — it renders exactly what the host streams and
   forwards intents.
2. **Snapshot streaming (~10 Hz, like poses).** New host→joiner message
   `{ kind: "creatures", entities: [{ id, species, kind, x, y, z, yaw,
   behavior, health? }] }`. Proximity caps the active set to a handful, so the
   batch is small; goes on the unreliable channel (stale < dropped), matching
   ADR 0002 §3. Snapshot carries the full active set → spawn (new id), move
   (transform), and despawn/kill (id absent) all fall out of one diff. `health`
   drives the joiner's creature HP bar if/when added.
3. **Joiner reconciliation.** A pure `reconcileEntities(prevIds, snapshot)` →
   `{ add, update, remove }` (unit-testable, renderer-free); the remote-mode
   `SpawnFieldView` applies it to materialize/move/remove.
4. **Joiner interactions → intents.** F/E/T already have `InteractMsg`
   (`attack | harvest | feed`, `targetId`) in `domain/net/Protocol` — the host
   currently drops it (`HostSession.handle` default case). Route it to a new
   `onInteract(action, targetId)` hook; the host applies it to its
   `SpawnFieldView` (`applyInteract(action, targetId)` — reuse the existing
   F/E/T resolution keyed by id). The result shows up in the next snapshot.

**Rejected:** a parallel `RemoteCreatures` renderer (duplicates
materialization/model-load logic already in `SpawnFieldView`); deterministic
joiner-side sim with only removal sync (positions still diverge).

**Consequences:** joiner creatures are as fresh as the 10 Hz stream (fine at
family LAN/P2P latency); one more message kind on the unreliable channel; the
host does all creature CPU work (already true for its own sim). Taming becomes
host-authoritative too (feed intent → host resolves → tamed state streams).

## The seam problem (how host/joiner reach the spawn field)

`SpawnFieldView` is created in the SCENE (`debug/TerrainScene.ts`), but the net
session is created in `main.ts` (`attachHostNet` / `createJoinNet`). They meet
the same way voxels do today: expose the handle on `ctx.world`.

- Mirror the `ctx.world.voxels` seam: add `ctx.world.spawns` (see
  `debug/Scenes.ts` `WorldLaunchBinding`, and `TerrainScene` sets
  `ctx.world.voxels = voxels` at ~line 330 — do the same for spawns).
- `SpawnFieldView` exposes mutable net hooks like `VoxelTerrain.onLocalEdit`:
  - host: `onSnapshot: ((entities) => void) | null` — `NetSync` sets it to
    broadcast `{ kind: "creatures", ... }` each tick.
  - host: `applyInteract(action, targetId)` — called by `HostSession.onInteract`.
  - joiner: `remote` flag + `applySnapshot(entities)` and `onInteractIntent`
    (send instead of resolve).

## Implementation slices (each ends green + committed)

1. **ADR 0003** (`docs/adr/0003-*.md`) from the design above.
2. **Protocol** (TDD in `domain/net/Protocol.test.ts`): add the `creatures`
   snapshot message + validator; `entityRemoved` already exists. Extend
   `HostMessage`.
3. **Pure reconciler** (TDD, renderer-free): `reconcileEntities(prev, snap)`.
4. **HostSession** (TDD in `application/HostSession.test.ts`): route `interact`
   → `hooks.onInteract?.(action, targetId)` (currently the `default` no-op at
   `HostSession.ts` ~line 105).
5. **SpawnFieldView**: `remote` mode (skip AI/proximity/resolution), `onSnapshot`
   emit (host), `applySnapshot`/reconciler apply (joiner), `applyInteract`,
   `onInteractIntent`. Refactor the F/E/T keydown resolution into
   `resolveAttack(entry)`/`resolveHarvest(entry)`/`resolveFeed(entry)` reused by
   both keydown and `applyInteract`.
6. **Seam + wiring**: `ctx.world.spawns` (Scenes.ts type + TerrainScene set);
   `NetSync` host wires `onSnapshot`→broadcast and `HostSession.onInteract`→
   `applyInteract`; joiner sets `remote`, wires `applySnapshot` on `creatures`
   msg and `onInteractIntent`→`session.sendInteract`. Add `sendInteract` to
   `JoinSession` (Protocol `InteractMsg` already there).
7. **Verify**: unit tests (2–4); extend `tools/net-probe.ts` — B joins, host
   kills a creature, assert it disappears on B and B's attack intent kills one
   on the host. Boot smoke for no-regression. NOTE the net probe is ~10 min and
   shares the GPU — don't edit served `src/` files while it runs (vite HMR
   reloads the page and corrupts the run; learned the hard way this session).

## Gotchas carried over

- Deterministic spawn ids are the joiner's anchor — the snapshot's `id` must be
  the SAME id the host's `SpawnField` produced, so a future optimization could
  send only deltas. MVP sends the full active set.
- `feed`/taming: host-authoritative; the joiner's T sends `interact feed` and
  the tamed state arrives via the snapshot (add `tamed`/`phase` to the entity
  shape when wiring taming, or keep taming host-local for the first slice and
  note it deferred).
- Don't forget the joiner must NOT run `stepSpawns` (proximity) — otherwise it
  materializes its own divergent set on top of the streamed one.
