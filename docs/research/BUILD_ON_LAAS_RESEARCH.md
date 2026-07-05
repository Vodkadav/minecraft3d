# Research: Building a Minecraft-style Survival Sandbox on the LAAS Engine

> **Status:** Deep-research pass complete (2026-07-05). 105 research agents, 23 sources fetched,
> 92 claims extracted, 25 adversarially verified (3-vote, need 2/3 to kill). 24 confirmed, 1 refuted.
> This document is the evidence base for [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md).
>
> **Confidence legend:** ✅ verified (primary source, unanimous) · ⚠️ interpretive stretch flagged by
> verifiers · ❌ refuted · 🕳️ **evidence gap** — no verified claim survived; planning rests on general
> domain knowledge and must be re-researched before that milestone starts.

## The two fixed decisions (from the user)

1. **Dual-path, desktop-first.** Keep the full LAAS desktop fidelity untouched. Add a *reduced-fidelity*
   mobile/tablet render path, delivered as an installable PWA ("add to home screen").
2. **Hybrid world model.** Keep the beautiful non-editable heightfield **surface**. Only the
   **underground** (dug areas, caves, mines) and **player-placed structures** become voxel/SDF-editable.
   Mine downward through depth-seeded ore/gem layers bounded by a subterranean floor.

Additional hard constraint the user set mid-research: **everything must be free to run — no paid hosting
or paid services** for multiplayer or deployment.

---

## 1. Mobile WebGPU + PWA delivery

**✅ WebGPU is real on mobile.** Enabled by default on Android via **Chrome 121+** on devices running
**Android 12+** with Qualcomm/ARM GPUs (Chrome 121 stable ≈ 2024-01-24). This validates a
reduced-fidelity mobile `WebGPURenderer` path as the basis for the PWA.
Sources: [Chrome for Developers](https://developer.chrome.com/blog/webgpu-supported-major-browsers),
[web.dev](https://web.dev/blog/webgpu-supported-major-browsers).

**⚠️ / 🕳️ iOS Safari WebGPU status was NOT confirmed** as enabled-by-default in any surviving claim.
This is an **open question that gates Apple-device viability** — must be re-verified before committing
mobile scope to iPhone/iPad. (WebGPU shipped in Safari 26 / iOS 26 per Apple announcements, but the
research did not surface a verified primary claim; treat as "likely, verify first".)

**⚠️ Android 16 "Advanced Protection" mode can disable Chrome WebGPU** — a moving target; the mobile
path needs a capability probe + graceful "your device/browser can't run the 3D world" gate (the engine
already has `BrowserGate.ts` doing exactly this shape of detection).

**✅ Installed PWA storage = browser storage.** A home-screen PWA gets the **same origin/overall quota**
as the browser context. Chromium desktop: an origin can store **up to 60% of total disk**. iOS/macOS
Safari 17+: **up to 60% of disk for a browser-context origin** (only 15% for non-browser standalone
apps — but a home-screen PWA counts as browser-context and gets the full 60%).
Sources: [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/),
[MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
*Caveat:* quota is computed from **total** (not free) disk for anti-fingerprinting, so the real ceiling
is lower than the headline number.

**PWA delivery mechanics** (from MDN service-worker tutorial, secondary): a Web App Manifest +
service worker for offline caching of the JS/WASM bundle enables add-to-home-screen on both Android and
iOS. The large three.js/WebGPU bundle is cacheable by the service worker for offline boot.

---

## 2. Free multiplayer hosting (hard "no paid service" constraint)

The research compared the two models the user asked for and the recommendation is shaped by the
free-only constraint.

### Authoritative-server frameworks — polished, but self-host burden
- **✅ geckos.io** — client/server UDP-over-WebRTC (socket.io-like API, MIT). Requires a **hostable Node
  server**. For production NAT traversal it needs operator-supplied STUN/TURN, and it forwards
  **TCP 9208 + UDP 1025-65535** — impractical on free/restricted PaaS and behind consumer NAT.
  Source: [geckos.io](https://github.com/geckosio/geckos.io).
- **✅ Colyseus** — provides a built-in **`LobbyRoom`** that gives a live "list available worlds + join"
  lobby with no custom code (auto-notifies on room create/join/leave/dispose, enabled by chaining
  `enableRealtimeListing()`). Self-hostable Node server. This is the closest off-the-shelf match to the
  user's exact lobby spec. Source: [Colyseus lobby docs](https://docs.colyseus.io/room/built-in/lobby)
  (⚠️ cited URL path 404s — correct path `/room/built-in/lobby`; example API is pre-1.0, concept intact).

### Browser P2P — fits "free static hosting" best
- **✅ NetplayJS-style P2P WebRTC** — peer-to-peer over WebRTC data channels, deployable on **static hosts
  (GitHub Pages / Itch.io)** with **no dedicated game server**. ⚠️ **Two critical caveats:**
  (1) "no server" means no *authoritative game* server — a **signaling/matchmaking server dependency
  remains** (self-hostable, or a free public instance = reliability risk).
  (2) NetplayJS's *rollback* netcode targets **deterministic real-time games (fighters), NOT persistent
  open worlds** — so it is architecturally instructive but **not drop-in usable** for a sandbox.
  The takeaway is the *pattern* (WebRTC data channels + free TURN + self-hosted signaling + static
  hosting), not the library. Source: [NetplayJS](https://github.com/rameshvarun/netplayjs).
- **✅ Free TURN relay for NAT traversal:** Metered's **Open Relay Project** — **20 GB/month free** TURN
  on **ports 80/443** (TCP+UDP, TURNS+SSL, STUN), tested to bypass most firewalls.
  Source: [Metered Open Relay](https://www.metered.ca/tools/openrelay/).

### 🕳️ Gap flagged by verifiers (open question #4)
Because rollback netcode is unsuited to a persistent world, the **specific browser-P2P netcode for a
persistent sandbox** (designated player-host authority + delta persistence + world-list lobby without a
paid server, and **what happens when the hosting peer goes offline**) is **not settled by evidence** and
needs dedicated design work.

### Recommendation (trade-offs)
> **Player-hosted, host-authoritative P2P** matches the user's exact requirements — a "host" player owns
> the world (like Minecraft LAN/friend-join), others join via WebRTC data channels, a free TURN relay
> handles NAT, and a tiny self-hosted (free-tier) signaling/lobby service provides the world list.
>
> - **Player-hosted P2P** — Pros: no paid server, matches the "host a saved seed, others join" spec,
>   world lives on host's machine. Cons: world only online while host is; host bears CPU/bandwidth;
>   host has authority (trust). **← recommended given the free-only constraint.**
> - **Self-hosted authoritative (Colyseus/geckos)** — Pros: best lobby UX out of the box, persistence
>   independent of any one player, anti-cheat. Cons: someone must run/keep-alive a Node server (free
>   tiers sleep/limit; consumer NAT port-forwarding friction). Keep Colyseus's `LobbyRoom` as the
>   *reference design* for the lobby even if we implement P2P.
>
> The signaling + world-list service is small enough to fit a free tier (or be self-hosted by whoever
> runs a persistent world), so it does not violate the no-paid constraint.

---

## 3. Hybrid voxel-under-heightfield terrain

**✅ Data model: Signed Distance Field (SDF) voxels.** Each voxel stores a signed distance —
**negative = solid** (matter below surface), **positive = air** (above surface). This is the standard
smooth-voxel convention. Source: [Godot Voxel Tools](https://voxel-tools.readthedocs.io/en/latest/smooth_terrain/).

**✅ Meshing: the Transvoxel algorithm.** An extension of Marching Cubes that **eliminates cracks at LOD
boundaries** by inserting **transition cells** between a chunk and one at exactly half its resolution —
the exact "stitch different-resolution chunks without gaps" problem the hybrid model faces (mirrors the
existing CDLOD surface). Source: [transvoxel.org](https://transvoxel.org/) (Eric Lengyel, inventor;
UC Davis dissertation).

**✅ Real-time digging is performant.** Transvoxel's transition cells require **only local voxel data**,
which "allows fast retriangulation in cases where the voxel data is dynamically changing in a real-time
application" (verbatim, inventor's site). This is a structural property — it does not go stale. This is
the key enabler for live digging/placing.

**Design decision the team must make:** Transvoxel/SDF gives **smooth, isosurface** caverns (not blocky
Minecraft cubes). If a blocky aesthetic is wanted underground, that is a *different* mesher
(greedy-meshed cubes) and a different data model. Smooth suits LAAS's realistic look; blocky suits
Minecraft familiarity. **Recommendation: smooth SDF underground** to preserve the visual bar, with
material-painted layers for the "ore/gem" reading.

**Persistence:** stream and persist **only modified chunks** (the delta from procedural generation),
regenerating unmodified chunks from the seed on demand. (See §7.)

---

## 4. 🕳️ Spawn-density & proximity systems — EVIDENCE GAP

Research angle 4 yielded **zero surviving verified claims** (the Minecraft/Survivalcraft wiki sources
were rated unreliable and dropped). The following is **domain knowledge, not verified by this pass**, and
**must be re-researched before the spawn milestone**:

- The canonical pattern (Minecraft): mobs spawn only in loaded chunks with a player within a spawn radius
  (~128 blocks), despawn beyond it, bounded by a **global cap** and a **per-player cap**.
- For "only spawn when no players nearby": invert the trigger — a spawn candidate cell is eligible only
  when the **nearest player is beyond a min-distance**, using a spatial grid / partition for the nearest-
  player query.
- **Tunable density** = a single multiplier on the per-cell spawn budget.
- **Deterministic seeded spawning** = `hash(worldSeed, cellCoord, spawnEpoch)` so a node/creature is
  reproducible and consistent across peers without syncing every spawn.

**This section needs its own research pass** (see open questions).

---

## 5. Creature AI, taming & character systems (three.js)

**✅ Swappable skins via retargeting.** three.js ships a built-in
**`SkeletonUtils.retargetClip(target, source, clip, options)`** — retargets one `AnimationClip` onto a
different model with a **compatible skeleton** (matching bone names). This is the mechanism for
"easily swappable skins/models": one locomotion clip set drives many creature/character meshes.
Source: [three.js SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html).
*Gotchas flagged:* off-by-one-frame issue (three.js #25288), mixamoRig naming quirks — practical, not
blocking.

**Supporting (blog-tier, lower confidence):**
- glTF avatar systems support runtime-swappable skins (clothes/hair/accessories) sharing one skeleton
  ([gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs)).
- Third-person controllers load animated models via `GLTFLoader` + drive a locomotion state machine
  (idle/run/…) through `AnimationMixer`.
- Taming as a **multi-step interaction sequence**; some designs make a permanently-tamed animal
  immediately rideable (**no saddle required**) — simplifies taming→riding.

The full locomotion set the user wants (idle/run/crouch/strafe/work/fight/die/ride) is standard
`AnimationMixer` + a state machine; swappable skins is the retarget path above.

---

## 6. 🕳️ Crafting / inventory / physics building — EVIDENCE GAP

Research angle 6 yielded **zero surviving verified claims** (only a low-signal forum thread on snapping).
The following is **domain knowledge, not verified**, and **must be re-researched before that milestone**:

- **Ghost/overlay placement:** render a semi-transparent clone of the item at the raycast hit point;
  tint green (valid) / red (blocked); rotate with a key; commit on click. Standard three.js raycaster +
  a translucent material.
- **Smart snapping:** snap to a grid, to surface normals, or to snap-points defined on nearby placed
  objects (nearest-socket search).
- **Physics building:** a physics engine (e.g. Rapier/cannon-es via WASM) for stability/collision if
  "physics building" means structural realism; or purely kinematic placement if it means "snaps and
  stays".
- **Crafting/inventory data model:** item registry + recipe graph (ingredients→output+unlock-tier);
  inventory as slot arrays; persist as part of the save (§7).

**This section needs its own research pass** (see open questions).

---

## 7. Persistence & save architecture (browser sandbox)

**✅ Best-effort storage can be evicted; `persist()` protects it.** By default (best-effort mode) stored
data can be evicted under storage pressure via **LRU**. Only calling **`navigator.storage.persist()`**
exempts an origin from automatic eviction. **The app must call `persist()` on first save.**
Source: [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

**❌ Refuted (0-3):** the feared "Safari deletes storage after 7 days of no interaction" does **NOT** apply
to this context — reduces but does not eliminate iOS risk (user-initiated clearing still possible).

**Storage engine (supporting, secondary):** OPFS benchmarked ~4× faster than IndexedDB for large binary
writes (100 MB ArrayBuffer ≈ 90 ms OPFS vs ≈ 850 ms IndexedDB) because IndexedDB serializes through the
main thread. → **OPFS for bulk modified-chunk blobs; IndexedDB for structured metadata/index.**
Source: [RxDB storage comparison](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html).

**Reconciliation with multiplayer:** the host peer holds the authoritative save (modified-chunk deltas +
entities + inventories); it persists locally (OPFS/IndexedDB) and streams deltas to joining peers.
World **seeds are saved locally and shareable** (a seed regenerates the untouched procedural world; only
deltas need transfer). Unmodified chunks are never stored — regenerated from seed on demand.

---

## 8. CI/CD to free hosting

**✅ GitHub Pages via GitHub Actions:** `npm ci` → `npm run build` → upload `./dist` artifact. Vite
requires a build step; set `base: '/<REPO>/'` for a project-pages URL.
Source: [Vite static deploy](https://vite.dev/guide/static-deploy).

**✅ Cloudflare Pages (free tier):** deploys the same Vite static site via Git integration (build command
+ output dir, or framework preset). Source: [Cloudflare Pages](https://developers.cloudflare.com/pages).

**✅ WebGPU headless-CI constraint:** WebGPU is **disabled by default in Headless Chrome**. Enabling it on
Linux CI requires: `--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan
--disable-vulkan-surface --no-sandbox --headless=new`. → **Split CI: pure-logic/typecheck/build tests
run everywhere; GPU-render smoke tests need a configured GPU-enabled runner** (or run them locally, as
the existing `tools/` harness already does on the developer's Metal/Chromium).
Source: [Chrome supercharge-web-ai-testing](https://developer.chrome.com/blog/supercharge-web-ai-testing).

---

## Open questions (must resolve before the affected milestone)

1. **Confirmed 2025-2026 iOS/iPadOS Safari WebGPU status** (enabled-by-default vs flag-gated, which iOS
   version) — gates the Apple-device half of the mobile PWA path.
2. **Proximity-gated spawn-density systems** (spatial partitioning, spawn budgets, despawn, deterministic
   seeded spawning) — angle 4 had zero verified claims.
3. **Physics-building placement + crafting/inventory patterns** in three.js — angle 6 had zero verified
   claims.
4. **Browser-P2P netcode for a *persistent* world** (host-authority + delta persistence + lobby without a
   paid server; behavior when the hosting peer goes offline).

## Refuted claim (for the record)

❌ "Safari/WebKit proactively deletes script-created storage for an origin with no user interaction in 7
days." **Voted down 0-3.** Does not apply to this context.

## Full source list

Primary/spec sources carry the ✅ findings; blog/forum/wiki sources were mostly dropped in verification.

| Angle | Source | Quality |
|---|---|---|
| Mobile/PWA | webkit.org/blog/14403 (storage policy) | primary |
| Mobile/PWA | web.dev / developer.chrome.com (WebGPU browsers) | secondary/primary |
| Mobile/PWA | MDN service workers offline | secondary |
| Multiplayer | github.com/geckosio/geckos.io | primary |
| Multiplayer | docs.colyseus.io (LobbyRoom) | primary |
| Multiplayer | metered.ca/tools/openrelay | primary |
| Multiplayer | github.com/rameshvarun/netplayjs | primary |
| Voxel terrain | transvoxel.org | primary |
| Voxel terrain | voxel-tools.readthedocs.io (smooth terrain) | primary |
| Voxel terrain | ngildea.blogspot.com (dual contouring chunked) | blog |
| Characters | threejs.org SkeletonUtils | primary |
| Characters | github.com/shrekshao/gltf-avatar-threejs | blog |
| Persistence | MDN storage quotas & eviction | primary |
| Persistence | rxdb.info (storage comparison) | secondary |
| CI/CD | vite.dev/guide/static-deploy | primary |
| CI/CD | developer.chrome.com (headless WebGPU testing) | primary |
| CI/CD | developers.cloudflare.com/pages | primary |
