# ADR 0003 — Host-authoritative creature streaming (M7.x)

Date: 2026-07-07 · Status: accepted · Extends: ADR 0002 (multiplayer)

## Context

Co-op creatures diverge between clients. Spawns are deterministic
(`domain/spawn/SpawnField` hashes seed+cell → identical ids/positions/species on
every peer), but creature **movement** is player-relative:
`domain/ai/CreatureBrain` steers each creature toward the *local* player, so every
client's creatures chase their own player. Kills, harvests, and taming don't sync
either — everyone sees a different animal world.

ADR 0002 already makes the host authoritative for world edits and player poses
(§6). Creatures are the one live subsystem still simulated independently per
client.

## Decision

**The host is authoritative for every spawn-field entity (creatures AND nodes).
Joiners run no local spawn AI, proximity, or interaction resolution — they mirror
a host-streamed entity snapshot and forward interaction intents.**

1. **Host simulates, joiner puppets.** The host keeps `SpawnFieldView` as-is
   (proximity + `CreatureBrain` AI + F/E/T resolution). The joiner runs the same
   view in a **remote mode**: no proximity step, no creature AI, no local
   resolution — it renders exactly what the host streams and forwards intents.
2. **Snapshot streaming (~10 Hz, like poses).** New host→joiner message
   `{ kind: "creatures", entities: [{ id, species, kind, x, y, z, yaw, behavior?,
   health? }] }`. Proximity caps the active set to a handful, so the batch is
   small. The snapshot carries the full active set, so spawn (new id), move
   (transform), and despawn/kill (id absent) all fall out of one diff.
3. **Joiner reconciliation.** A pure `reconcileEntities(prevIds, snapshot)` →
   `{ add, update, remove }` (unit-tested, renderer-free); the remote-mode view
   applies it to materialize / move / remove.
4. **Joiner interactions → intents.** F/E/T on the joiner send the existing
   `interact` intent (`attack | harvest | feed`, `targetId`); the host resolves it
   against its own view (`applyInteract`, reusing the F/E/T resolution keyed by
   id). The result shows up in the next snapshot.

## Rejected alternatives

- **A parallel `RemoteCreatures` renderer.** Duplicates the
  materialization/model-load logic already in `SpawnFieldView`.
- **Deterministic joiner-side sim with only removal sync.** Half-correct:
  positions still diverge because AI is player-relative.

## Consequences

- Joiner creatures are as fresh as the 10 Hz stream — fine at family LAN/P2P
  latency. No creature interpolation yet; add smoothing if jitter shows in play.
- One more message kind. It rides the reliable channel today like poses;
  moving it to the unreliable channel (ADR 0002 §3) is a deferred optimization.
- The host does all creature CPU work — already true for its own sim.
- Taming is host-authoritative too: a `feed` intent resolves on the host and the
  tamed state arrives via the snapshot. Joiner-side mounting is deferred (the
  mount is host-controlled in remote mode).
- The snapshot sends the full active set every tick; deltas keyed off the stable
  deterministic id are a future optimization.

## Addendum (2026-07-19) — joiner-side mounting

Joiner-side mounting (deferred above) is now implemented, reusing the existing
intent path rather than adding new wire shapes:

- `InteractAction` gains `"mount"` / `"dismount"`, resolved by the host exactly
  like `attack`/`harvest`/`feed` — `HostSessionHooks.onInteract` now also
  passes the sender's `peerId` (mount/dismount are keyed by *rider*, not by
  target, so the host needs to know who's asking).
- `CreatureEntity` gains an optional `tamed` flag on the stream. The joiner
  tracks no taming progress of its own (it never sees feed cooldowns), so a
  joiner's G-mount gates on this streamed flag instead of a locally-fabricated
  one — the host remains the sole source of taming truth.
- **Ridden-creature transform authority** (the "host must not fight the rider"
  question): the host tracks `riddenBy: peerId | null` per creature, freezes
  its AI while ridden, and glues its transform to the SAME pose data the peer
  already streams ~10 Hz for its own avatar (`PeerPoseMsg` → `setPeerPose`) —
  no new wire traffic. This makes the mount's movement fall out of the
  existing snapshot for free, visible to the host and any other peer.
  Separately, the riding client (host or joiner) glues its OWN view locally
  every frame for zero-lag first-person feel, ignoring the network-smoothed
  stream target for that one id while it's riding — a straight network
  round-trip through the echoed pose would otherwise show up as visible lag
  on a mesh sitting right under the camera. This is a deliberate blend of the
  two options the follow-up considered (host-echo vs. client-only glue): the
  host-echo model gives other peers a moving mount almost for free, while the
  local override keeps the rider's own feel identical to the host's original
  M6.5 experience. Host-drop dismount needs no extra code: `flyCamEnabled`
  freezes input and the existing grace-window flow reloads the page,
  resetting `speedScale` along with everything else.
- A departing rider (`onPeerLeave`) releases whatever creature it was riding
  (`releaseRider`) so a dropped joiner never leaves a creature stuck frozen.
