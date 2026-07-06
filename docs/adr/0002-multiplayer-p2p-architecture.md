# ADR 0002 — Multiplayer: player-hosted P2P over free rails (M7)

Date: 2026-07-06 · Status: accepted (design; implementation is M7)

## Context

The plan (M7) requires free-only multiplayer: a player hosts their saved world,
friends see and join it, host-authoritative, no paid service in the shipped
path. The game is a static PWA on GitHub Pages — there is no backend. Open
question #4 (netcode design) was researched 2026-07-06 (verified sources in
the research pass; summary below).

## Decision

1. **Transport + signaling: trystero, Nostr strategy.** trystero piggybacks
   the WebRTC SDP/ICE handshake on free public relay networks (Nostr default;
   MQTT/BitTorrent/IPFS rails are a one-line switch, giving free redundancy).
   Only handshake data touches the relays; game traffic is direct P2P and
   E2E-encrypted. Actively maintained (v0.25.x, 2026). Rejected: PeerJS public
   broker (documented 429 rate-limiting, no SLA, team recommends self-hosting);
   simple-peer (unmaintained ~4 years); y-webrtc (CRDT-shaped, wrong fit for
   host-authoritative).
2. **TURN fallback: Metered Open Relay** (free 20 GB/mo, TURN over ports
   80/443, free account required). ~1 in 5 peer pairs typically need TURN
   (folklore-grade figure — verified directionally, not to a dataset); data
   channels are kB/s so the quota is ample at hobby scale.
3. **Two data channels:** reliable+ordered (default) for world deltas,
   inventory, chat, and the join handshake (seed + chunk deltas); unreliable
   unordered (`ordered: false, maxRetransmits: 0`) for position/animation sync
   — a stale position packet is worse than a dropped one.
4. **Lobby = room codes, not a browsable world list.** A public server browser
   requires a live registry — a backend by definition. The host generates a
   short invite code (hash of worldId + session nonce) rendered as a copyable
   link; joiners' "world list" is locally-remembered codes. This matches every
   no-backend P2P browser game found.
5. **Host offline = pause and wait.** Joiners freeze the sim, show "waiting
   for host" with a ~60 s timeout, then return to menu. No host migration:
   the industry's own frameworks don't ship it (Unity NGO has none; Mirror
   advises avoiding it), and it conflicts with "the host owns the OPFS save".
6. **Trust boundary:** joiners treat host messages as truth; the host
   validates joiner *intents* (movement/action sanity checks) from day one —
   "client sends intent, host resolves outcome".

## Consequences

- Zero servers and zero paid services; one new dependency (trystero) to vet
  into the lockfile at M7 implementation time.
- Public-rail dependency is third-party goodwill: mitigation is the built-in
  rail switch plus a documented escape hatch (self-hosted signaling Worker on
  Cloudflare Durable Objects free tier — comfortably fits its free quota) if
  rails degrade. Ship a connectivity self-test in the multiplayer UI.
- Room codes mean no world discovery between strangers — acceptable: the
  audience is friends/family.
- ~20 % of pairs silently depend on the Metered quota; monitor if the game
  grows beyond hobby scale.
