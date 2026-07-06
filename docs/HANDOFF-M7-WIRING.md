# M7 wiring handoff — what's done, what remains (2026-07-06)

All M7 layers below the UI/engine glue are DONE, tested, and merged:

- `domain/net/` RoomCode + Protocol (`parseMessage` → Result) + IntentRules (pose/dig caps) — 54 tests
- `application/` NetTransport port, HostSession (welcome snapshot, validate→apply→broadcast,
  peer lifecycle, injected clock), JoinSession, `testing/InMemoryTransportPair` honest fake — 18 tests
- `infrastructure/net/TrysteroTransport.ts` — trystero 0.25 (`joinRoom` → `makeAction("msg")`,
  property-style callbacks), Metered TURN in rtcConfig. **Live-verified**: two Playwright browser
  contexts exchanged messages over public Nostr rails (scratch `net-smoke.ts`, this session).

## Remaining: the glue (one focused session)

1. **Host path** (`composeGameUi` + `main.ts`): when a world launches, also
   `makeRoomCode(worldId, nonce)` → `makeTrysteroTransport(code)` → `new HostSession(transport,
   snapshotProvider, hooks)`. snapshotProvider reads the live save (`WorldSaveStore.load`);
   `hooks.onWorldEdit` applies dig/fill to the live `VoxelTerrain` (`ctx.world` seam carries the
   handle — add it). Show the room code in the UI (aria-live status line exists in composeGameUi).
2. **Join path**: menu "Online" → code input (LobbyView; add i18n strings EN/ES/DA) →
   `JoinSession` over the transport → `onWelcome(snapshot)` → write snapshot into an
   `InMemoryWorldSaveStore` under its worldId → boot engine with that store via the existing
   `WorldLaunch` path (menu-launch glue already boots from a store; joiners just use a remote-
   sourced one). Joiner saves NOTHING to OPFS (host owns the save).
3. **In-world sync loop** (new `src/net/NetSync.ts` engine adapter, mirrors SpawnFieldView shape):
   - every ~100 ms: `sendPose(camPoseToPlayerState(pose))`; on `peerPose` → move that peer's
     avatar (primitive capsule; KayKit humanoid model later — ASSET_SOURCES.md has the pack).
   - joiner DigTool: carve locally (optimistic — SDF carve is idempotent) AND `sendDig`; host
     `worldEdit` broadcasts re-apply everywhere (originator included — idempotent, safe).
   - `hostClosing`/host `peerLeft`: joiner freezes + "waiting for host" (~60 s) → menu (ADR §5).
4. **E2E verify**: extend scratch net-smoke into `tools/net-probe.ts` — browser A hosts a world,
   B joins by code, assert B boots to READY with A's seed and sees A's pose stream.

## Gotchas learned

- vite dep-optimization reloads the page on FIRST import of a new dep — net probes must warm up
  or retry once.
- trystero 0.25 API: `action.onMessage = cb` / `room.onPeerJoin = cb` (assignment, not calls);
  `action.send(data, { target })`.
- `interact` intents parse in Protocol but HostSession ignores them — resolve when wiring
  (creature combat/harvest sync); `hooks.onEntityRemoved` is the prepared seam.
