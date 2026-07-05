# Implementation Plan — Minecraft-style Survival Sandbox on LAAS

> **Evidence base:** [`research/BUILD_ON_LAAS_RESEARCH.md`](research/BUILD_ON_LAAS_RESEARCH.md)
> (deep-research pass, 2026-07-05). Read it first — every design choice here traces to a ✅/⚠️/🕳️ finding.
>
> **Prime directive:** the existing LAAS desktop experience is a *finished, verified artifact*
> (~21k lines strict TS, all brief phases built). **Do not regress it.** Everything below is *additive*
> and gated behind capability/preset flags so a desktop boot with no game flags renders exactly today's
> world.

## Ownership tags

| Tag | Meaning |
|---|---|
| **[O]** | **Opus can do now** — scaffolding, config, CI, data models, UI shells, pure-logic systems (TDD). |
| **[F]** | **Fable — complex engine work** — GPU/render, voxel meshing compute, mobile fidelity tuning, netcode. |
| **[R]** | **Research-first** — a 🕳️ evidence gap; run a focused research pass before building. |

Tasks are ordered by dependency. Each milestone lists **acceptance criteria**. Follow the repo's global
rules: **TDD** for all testable logic (Red→Green→Refactor), **layered architecture**
(`domain ← application ← infrastructure ← ui`), ports at I/O seams, no hardcoded secrets, ADRs for
significant decisions.

---

## Milestone 0 — Foundation, repo, CI/CD  **[O — mostly done in this session]**

Goal: green pipeline + correct remote before any feature lands (global rule: CI from commit one).

- **0.1 [O]** Repoint git remote to `github.com/Vodkadav/minecraft3d.git` as `origin`; keep the
  upstream (`Braffolk/fable5-world-demo`) as `upstream` for provenance. *(done this session)*
- **0.2 [O]** GitHub Actions CI: `npm ci` → `typecheck` (`tsc --noEmit`) → `build` (`vite build`).
  Green on the current tree. GPU-render tests are **excluded** from CI (WebGPU needs a GPU runner —
  research §8); they stay in `tools/` for local runs. *(done this session)*
- **0.3 [O]** GitHub Actions deploy: build → publish `./dist` to **GitHub Pages** (free). Set Vite
  `base` to `/minecraft3d/` for the project-pages URL. Cloudflare Pages is the documented fallback.
  *(done this session — deploy workflow added; Pages must be enabled in repo settings)*
- **0.4 [O]** Add **ESLint + Prettier** (typescript-eslint) as a *non-blocking* CI step initially
  (21k inherited lines) → promote to blocking once the tree is clean. **Deferred** — flagged, not done.
- **0.5 [O]** Add **Vitest** for the pure game-logic layers (nothing to test yet; framework lands with
  Milestone 3). **Deferred** until first testable logic.

**Acceptance:** push to `origin` triggers a green CI; a tagged build deploys a playable desktop LAAS to
`vodkadav.github.io/minecraft3d/`.

---

## Milestone 1 — Mobile PWA shell + capability gating  **[O + F]**

Goal: the same URL installs to a phone/tablet home screen and either runs a reduced path or gates
cleanly. Desktop unchanged.

- **1.1 [O]** **Web App Manifest** (`manifest.webmanifest`): name, icons, `display: standalone`,
  theme/background color, start URL. Wire into `index.html`.
- **1.2 [O]** **Service worker** (via `vite-plugin-pwa`, Workbox): precache the JS/WASM/asset bundle for
  offline boot; runtime-cache strategy for the large three.js chunk. Research §1: installed PWA gets full
  browser storage quota, so offline caching the bundle is viable.
- **1.3 [O]** **Extend `BrowserGate.ts`** (already does desktop Chrome/WebGPU detection) to a
  **capability tier**: `desktop-full | mobile-reduced | unsupported`. Probe `navigator.gpu`, adapter
  limits, and coarse device class. ⚠️ Handle Android-16 "Advanced Protection" disabling WebGPU
  (research §1) — fail into the `unsupported` notice, not a crash.
- **1.4 [O]** **Storage permission:** call `navigator.storage.persist()` at first save so the world is
  not LRU-evicted (research §7, ✅). Surface the grant result in the UI.
- **1.5 [R]** **Verify iOS/iPadOS Safari WebGPU status** (open question #1) *before* promising iPhone/iPad
  support. If flag-gated, iOS ships as "install works, 3D world requires a supported browser" until it
  lands.
- **1.6 [F]** **Mobile-reduced render path.** Hook the existing **`?preset=low|high|ultra`** system —
  add a `mobile` preset that: cuts volumetric clouds/froxels, drops shadow cascades, slashes particle
  counts (131k → a few k), shrinks view distance, lowers vegetation instance budgets. Target a mid phone
  GPU at 30-60 fps. This is real GPU-tuning work → Fable. Desktop presets untouched.

**Acceptance:** installs to Android home screen; boots offline; desktop boot with no flags is
pixel-identical to today; unsupported devices see a clear notice (not a crash).

---

## Milestone 2 — World framing: boundary, seeds, save skeleton  **[O]**

Goal: the persistence and world-identity plumbing every later system writes into. Pure-logic → **TDD**.

- **2.1 [O]** **Save architecture** (research §7): `WorldSave` port with two adapters — **OPFS** for bulk
  modified-chunk blobs, **IndexedDB** for structured metadata/index. Domain model: `worldId`, `seed`,
  `createdAt`, `modifiedChunks`, `entities`, `inventories`, `playerState`. Only *deltas* from procedural
  generation are stored; unmodified world regenerates from seed. TDD the serialization + delta logic
  against an in-memory fake adapter (honest fakes, not mocks).
- **2.2 [O]** **Local seed vault:** save/list/name/share world seeds locally (feeds the "host chooses a
  saved seed" lobby flow). Reuses existing `Seed.ts` / `?seed=N`.
- **2.3 [O]** **Adjustable boundary system.** A configurable radius (default e.g. 3 mi from spawn) with a
  **swappable barrier model** — a `Boundary` component holding radius + a model reference resolved from a
  registry, so the fence/wall mesh can be replaced by config. Enforce with a soft push-back at the edge.
  Pure boundary math is TDD'd; the visible barrier mesh is simple three.js (Opus) but its *art* is a
  swappable asset.

**Acceptance:** create/save/load a world by seed; boundary radius is a single config value; barrier model
is one registry entry to swap. Full unit coverage on save-delta + boundary logic.

---

## Milestone 3 — Game-logic core (inventory, items, crafting)  **[O]**

Goal: the pure domain the whole survival loop needs. Zero rendering. Strict **TDD**, `domain` layer.

- **3.1 [O]** **Item registry** — id, display, stack size, tags, tier. Data-driven (JSON/TS table).
- **3.2 [O]** **Inventory model** — slot arrays, add/remove/move/split/merge, capacity. TDD.
- **3.3 [O]** **Crafting progression** — recipe graph (ingredients → output + unlock tier); can-craft /
  do-craft resolution; progression gates. TDD the recipe resolver.
- **3.4 [O]** **Gathering/resource-node domain** — node types, yields, respawn rules (state only; spawn
  placement is Milestone 5). TDD.
- **3.5 [O]** Persist all of the above through the Milestone 2 `WorldSave` port.

**Acceptance:** a headless test suite exercises craft trees, inventory ops, and save round-trips with no
renderer. This is the cleanest Opus-owned block — high value, fully testable.

---

## Milestone 4 — Menu, settings, and multiplayer lobby UI  **[O]**

Goal: the front-of-game the user specified. UI shells with real wiring to Milestones 2-3; netcode
transport lands in Milestone 7.

- **4.1 [O]** **Main menu:** `Solo (offline)`, `Online`, `Settings`, wired to real actions.
- **4.2 [O]** **Settings screen:** graphics preset (incl. mobile), animal-density slider (feeds
  Milestone 5), boundary radius, controls, accessibility (contrast/text-scale/reduced-motion per global
  a11y rule).
- **4.3 [O]** **Online lobby** exactly as specified: scrollable list of available worlds each with a
  `Join` button; below it a `Back` (→ main menu) and a `Host` button. `Host` → pick a locally-saved seed
  → world becomes visible/joinable. Model the lobby list on Colyseus's `LobbyRoom` UX (research §2) even
  though transport is P2P.
- **4.4 [O]** i18n scaffolding — all menu strings through a localization service (global rule: EN + ES +
  DA); no hardcoded UI strings.

**Acceptance:** every menu/lobby button is wired to a real handler (host/join stubbed to a local loopback
until Milestone 7); density slider persists and is read by the spawn system; strings are localized.

---

## Milestone 5 — Spawning: nodes & creatures (proximity-gated, tunable)  **[R → O/F]**

Goal: resource nodes and creatures that spawn only when no player is near, with a density knob.

- **5.1 [R]** **Research pass** (open question #2): proximity-gated spawn budgets, spatial partitioning,
  despawn, deterministic seeded spawning. Do this before building.
- **5.2 [O]** **Deterministic seeded spawn** — `hash(seed, cellCoord, epoch)` so spawns are reproducible
  and consistent across peers without syncing each one. TDD the hash/eligibility logic.
- **5.3 [O]** **Proximity gate** — spatial grid; a cell is spawn-eligible only when the nearest player is
  beyond a min distance; despawn when a player gets too close / too far per rules. **Density = one
  multiplier** on the per-cell budget (wired to the Milestone 4 slider). TDD.
- **5.4 [F]** **Placement on terrain** — sample the heightfield for valid ground, integrate with LOD
  streaming and culling. Touches the render/world streaming path → Fable.

**Acceptance:** density slider visibly changes node/creature counts; nothing spawns within the min radius
of a player; spawns are identical for the same seed across two clients. Logic unit-tested.

---

## Milestone 6 — Characters & creatures (animation, taming, riding)  **[O + F]**

Goal: animated, swappable-skin characters/beasts with the full locomotion set, taming, and mounts.

- **6.1 [O]** **Skin/skeleton registry** — swappable glTF models sharing a compatible skeleton;
  one clip set retargeted via **`SkeletonUtils.retargetClip`** (research §5, ✅). Skins are config
  entries, easily replaced.
- **6.2 [O]** **Locomotion state machine** — idle / run / crouch / strafe / work / fight / die / ride,
  driven by `AnimationMixer`. State logic is TDD'd; the mixer wiring is thin.
- **6.3 [F]** **Creature AI** — roaming, fleeing, aggro behaviors; performant across many instances
  (integrate with spawn/culling). Fable.
- **6.4 [O]** **Taming/befriending** — multi-step interaction sequence → tamed state; tamed beast becomes
  rideable (research §5 supporting: no-saddle model simplifies taming→riding). TDD the taming state
  machine.
- **6.5 [F]** **Mount/ride** — attach player to mount, drive mount locomotion, dismount. Touches
  controller + physics → Fable.
- **6.6 [O]** **Combat/death domain** — health, damage, loot drops from beasts. TDD the rules; effects
  are Fable.

**Acceptance:** swapping a creature skin is a one-line registry change; all locomotion states play; a
beast can be tamed then ridden; combat/loot logic is unit-tested.

---

## Milestone 7 — Multiplayer (free, player-hosted P2P)  **[R → O/F]**

Goal: host a saved-seed world; others see and join it; free-only. Recommended model from research §2:
**player-hosted, host-authoritative WebRTC P2P** + free TURN + tiny self-hosted signaling/lobby.

- **7.1 [R]** **Netcode design pass** (open question #4): host-authority + delta persistence + world-list
  lobby without a paid server; **behavior when the hosting peer goes offline**. Settle before building.
- **7.2 [O]** **Signaling + world-list service** — minimal, fits a free tier or self-host (does not
  violate no-paid). Provides the lobby's "available worlds" list (Colyseus `LobbyRoom` as reference UX).
- **7.3 [F]** **WebRTC transport** — data channels between host and joiners; **Metered Open Relay** TURN
  (20 GB/mo free, ports 80/443) for NAT traversal (research §2, ✅). Fable.
- **7.4 [F]** **State sync** — host streams world deltas (modified chunks, entities, positions,
  animation states) to joiners; joiners send *intent*, host resolves (authoritative). Fable.
- **7.5 [O]** **Persistence reconciliation** — host owns the save (Milestone 2); on join, transfer seed +
  deltas; on host offline, define the handoff/pause behavior decided in 7.1.

**Acceptance:** two browsers on different networks join the same hosted world through the free TURN relay;
host sees joiners; world persists on the host; no paid service in the path.

---

## Milestone 8 — Hybrid voxel terrain: mining, building, treasures  **[F, the hardest — Fable-led]**

Goal: keep the heightfield surface; dig down through seeded ore/gem layers; place/remove voxel structures.
This is the deepest engine work and the biggest new subsystem.

- **8.1 [F]** **SDF voxel chunk store** — negative=solid / positive=air (research §3, ✅); chunked;
  streams and persists **only modified chunks** (regenerate the rest from seed). Integrates with the
  Milestone 2 save.
- **8.2 [F]** **Transvoxel meshing** — crack-free LOD stitching via local-only transition cells,
  supporting real-time retriangulation while digging (research §3, ✅). Mirrors the existing CDLOD LOD
  scheme for the surface. **Recommendation: smooth SDF underground** (preserves LAAS's realistic look;
  blocky would be a different mesher).
- **8.3 [F]** **"Break ground" seam** — the transition where a player digs through the non-editable
  heightfield surface into editable voxel space; carve a voxel volume under the dig point and blend.
- **8.4 [F/O]** **Depth-seeded material layers** — procedurally seed ore/gems/gemstones by depth with a
  subterranean floor boundary. The *seeding function* (deterministic by seed+depth) is testable **[O]**;
  the GPU/mesh material painting is **[F]**.
- **8.5 [O]** **Placement system** — translucent ghost overlay (valid/blocked tint), rotation, smart
  snapping (grid / surface / snap-points). ⚠️ Research §6 is an evidence gap — see 8.6.
- **8.6 [R]** **Research pass** (open question #3) for physics-building placement + snapping patterns
  before finalizing 8.5.
- **8.7 [O]** **Hidden treasures** — deterministic treasure placement (seed-based) + discovery/reward
  domain. TDD the placement/discovery logic.

**Acceptance:** dig from the surface into a cavern; ores/gems appear in depth-appropriate layers and are
consistent for a seed; place and rotate a snapped structure with a ghost preview; only modified chunks
persist; surface fidelity is unchanged where undug.

---

## Cross-cutting requirements (apply to every milestone)

- **Never regress desktop LAAS** — additive, flag-gated; a no-flags desktop boot = today's world.
- **TDD** all testable logic; **layered architecture** + ports at seams; **honest fakes** over mocks.
- **Free-only** — no paid hosting/service anywhere in the shipped path.
- **Performance baseline** — desktop keeps its bar; mobile targets a mid phone GPU; any main-loop change
  needs a before/after profile (the `tools/` GPU profiler already exists).
- **Accessibility + i18n** — contrast/keyboard/text-scale/reduced-motion; EN+ES+DA strings.
- **ADRs** — record the significant choices: hybrid-terrain data model, P2P-vs-authoritative, mobile
  render path, storage engine.

## Suggested execution order for the Opus→Fable handoff

**Opus does now:** M0 (done), M1.1-1.4, M2, M3, M4, plus every **[O]** logic block in M5-M8 (TDD'd,
renderer-free). **Research passes** (M1.5, M5.1, M7.1, M8.6) can be run as focused deep-research before
their milestone.
**Fable does the complex engine work:** M1.6 (mobile fidelity), M5.4, M6.3/6.5, all of M7 transport/sync,
and M8 voxel terrain — the GPU, meshing, and netcode depth.
