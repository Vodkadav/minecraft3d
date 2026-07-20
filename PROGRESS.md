# Progress — Diggy World (survival sandbox on LAAS)

> **Name:** the game is **Diggy World** (renamed 2026-07-19 from the `minecraft3d` working title —
> placeholder + trademark risk). Player-facing name done: menu `app.title`, `<title>`, PWA manifest.
> The GitHub repo slug, the `/minecraft3d/` deploy path + live URL, and the trystero `APP_ID`
> (`vodkadav-minecraft3d`) still carry the old identifier — those are coupled to the public URL and a
> GitHub repo rename, deferred to an explicit owner decision (they break the current live link).

Building a free, desktop-first-with-mobile-PWA Minecraft-style survival game on the LAAS procedural
WebGPU engine. Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) ·
Research: [`docs/research/BUILD_ON_LAAS_RESEARCH.md`](docs/research/BUILD_ON_LAAS_RESEARCH.md).

Live: https://vodkadav.github.io/minecraft3d/ (desktop Chrome + WebGPU).

## Status

- [x] Deep-research pass (mobile PWA, free multiplayer, hybrid voxel terrain, spawning, creatures, persistence, CI/CD)
- [x] Implementation plan recorded in repo (milestones M0–M8, tagged Opus-now / Fable-complex / research-first)
- [x] Repo connected to Vodkadav/minecraft3d (origin); upstream kept for provenance
- [x] CI gate (typecheck + build) — green
- [x] Deploy to GitHub Pages (free) — live
- [x] M0.4 ESLint blocking in CI (2026-07-06: flat config, js+ts recommended, --max-warnings 0,
  in `ci` script + GH Actions; Prettier skipped deliberately — style churn on the engine tree,
  review enforces consistency). npm audit clean (esbuild advisory fixed).
- [x] M0.5 Vitest + dependency-cruiser (layer rules) wired into the CI gate — game-logic layers
- [~] M1 Mobile PWA shell — manifest, service worker (offline precache), capability-tier gate,
  storage.persist done ([O]); M1.6 mobile-reduced render preset done ([F], 2026-07-06: engine
  `?preset=mobile` + tier/settings fallback resolution, froxels off, 4k particles, 2×1024 cascades,
  grass ring off, veg draw distance ×0.5); iOS check [R] resolved 2026-07-06: Safari 26 /
  iOS 26 ships WebGPU enabled by default (Metal-backed) — older iOS falls to the existing
  capability-gate message. Remaining: a real iPhone/iPad smoke test when a device is available
- [x] M2 World framing: save architecture (OPFS/IndexedDB ports + fakes), seed vault, adjustable boundary — TDD, renderer-free
- [x] M3 Game-logic core: item registry, inventory, crafting, gathering — TDD, renderer-free
- [x] M4 Menu, settings, multiplayer lobby UI — EN/ES/DA, a11y baseline, Host/Join loopback (netcode M7)
- [~] M5 Spawning — done 2026-07-06 except interaction: 5.1 research verified (Minecraft model,
  see research doc §4); 5.2 deterministic seeded field (`domain/spawn/SpawnField`, TDD:
  hash(seed, epoch, cell, salt), per-cell budget × the M4 `animalDensity` slider); 5.3 proximity
  gate (`domain/spawn/SpawnProximity`, TDD: 24 m no-spawn ring, 128 m spawn range, 160 m despawn
  hysteresis, nearest-player multi-player rule, removed-ids seam); 5.4 terrain placement
  (`src/spawn/`: walkable-ground validity above-water + slope, placeholder primitives per
  species, wired into voxeldev + world under the menu-launch/?spawns=1 gate; verified aerial
  shot + world boot). Remaining: harvest/kill interaction (arrives with M6 combat / M3 gathering
  wiring); global spawn caps deferred to M7 multiplayer.
- [~] M6 Characters & creatures — core done 2026-07-06: 6.2 locomotion state machine
  (`domain/locomotion`, TDD: full idle/run/crouch/strafe/work/fight/die/ride set, death terminal,
  ride guards); 6.3 creature AI (`domain/ai/CreatureBrain`, TDD: temperament roam/flee/aggro,
  wounded-flee, deterministic wander waypoints; wired — creatures roam/flee/charge in both scenes,
  verified in-browser); 6.4 taming state machine (`domain/taming`, TDD: feed sequence, wrong-food/
  impatience resets, tamed ⇒ rideable); 6.6 combat/death (`domain/combat`, TDD: health,
  single-death-event, deterministic loot; wired — F attacks, E harvests nodes, loot + removed ids
  persist to the world save entities bag). This also closes M5's interaction gap.
  6.1/6.2 [F] done: CC0 Quaternius Deer+Wolf rigged glTF (CREDITS.md), CreatureModelLibrary
  (SkeletonUtils.clone per instance, height-normalized, behavior→clip AnimationMixer wiring,
  one-shot death), primitives upgrade in place when the async load lands. 6.4 wiring done:
  T feeds (consumes loot food), tamed ids persist, tamed creatures heel (follow behavior, TDD).
  6.5 done (MVP): G mounts a tamed creature — walk controller stays the mover, mount glued
  under the camera, speed-driven clips; no ride speed boost yet. Player health done
  (2026-07-06): `domain/combat/PlayerVitals` (TDD: damage, single death, grace-period
  full-heal regen, respawn), aggressive-creature contact damage in SpawnFieldView, a11y
  health-bar HUD, scene respawn via the fly-camera setPose seam; verified voxeldev boots
  with the bar mounted. Ride speed boost done (2026-07-07): mounts move 1.6× on-foot speed
  via FlyCamera.speedScale + a setMoveSpeedScale hook, toggled on mount/dismount/death.
  Humanoid avatars done (2026-07-19): remote players render the rigged CC0 KayKit Knight
  (CREDITS.md) via `src/net/PlayerModel.ts` — capsule fallback upgrades in place on load,
  idle/walk/run clips driven by smoothed speed, feet grounded at eye − 1.7 m. Nothing remaining.
- [x] M7 Multiplayer — 7.1 research resolved + ADR 0002 (trystero/Nostr signaling, Metered TURN,
  room-code lobby, pause-on-host-offline, host validates intents); 7.2/7.5 [O] done TDD
  (`domain/net`: RoomCode/Protocol/IntentRules; `application`: NetTransport port, HostSession
  welcome-snapshot + validate→apply→broadcast, JoinSession, honest in-memory network — 72 tests);
  7.3 [F] done: TrysteroTransport adapter, live-verified P2P message exchange between two
  browsers over public Nostr rails. 7.4 [F] done (2026-07-06): host room-code badge, join-by-code
  boot from the welcome snapshot, 10 Hz pose + echo-guarded world-edit sync loop (`src/net/`),
  smoothed remote-player avatars, WireCodec for trystero's JSON transport. Root-caused + fixed a
  live 2-peer join deadlock (single dropped join packet → no welcome; now re-announced on a timer).
  Verified end-to-end over public Nostr rails (`tools/net-probe.ts`): B joins by code, boots with
  A's seed, mutual avatars. Host-offline UX done (2026-07-07, ADR 0002 §5): the joiner now detects
  a host drop (clean hostClosing OR a dropped connection via peerLeave, idempotent), freezes input,
  and shows a localized (EN/ES/DA) grace-window countdown → returns to the menu; a transient
  reconnect within the window cancels it and resumes (unit-tested). M7.x host-authoritative
  creature streaming done (2026-07-07, ADR 0003): creature AI was player-relative and diverged per
  client, so the host is now authoritative for every spawn-field entity — it streams the full active
  set ~10 Hz (`creatures` msg) and resolves joiner F/E/T intents, while joiners run no local spawn
  AI/proximity/resolution and puppet the stream via a pure `reconcileEntities` diff. TDD: Protocol
  snapshot msg, `domain/spawn/CreatureStream` reconciler, HostSession interact routing, JoinSession
  onCreatures/sendInteract; SpawnFieldView remote mode + 10 Hz emit + applySnapshot/applyInteract
  (F/E/T resolution extracted, reused by keydown and intents). Live-verified end-to-end
  (`tools/net-probe.ts`): B mirrored A's 10 creatures, a host kill and a joiner attack intent each
  despawned on BOTH peers over public Nostr rails. Joiner creature interpolation + death-clip sync
  done (2026-07-19): the 10 Hz `creatures` stream now smooths joiner-side positions/yaw via
  exponential smoothing (`domain/spawn/CreatureSmoothing`, TDD, same shape as the remote-player
  avatar smoothing but kept domain-pure); a dying creature keeps streaming (`dying: true`) through
  its death clip instead of vanishing from the set immediately, and the pure reconciler
  (`domain/spawn/CreatureStream`) surfaces a `died` diff so the joiner triggers the one-shot death
  clip once and only removes the instance when the host's own removal drops the id (TDD:
  Protocol/CreatureStream). `tools/net-probe.ts` extended to assert B actually saw the dying flag
  before removal (`dyingIds` probe seam) — live-verified 2026-07-19: both death-clip
  assertions PASS over public Nostr rails.
  Joiner-side mounting done (2026-07-19, ADR 0003 addendum): G now mounts/dismounts on a joiner
  too — `mount`/`dismount` join the existing `InteractAction` intent path (host validates
  tamed/dying/already-ridden, same as attack/harvest/feed), `HostSessionHooks.onInteract` now
  carries the sender's peerId, and a streamed `tamed` flag on `CreatureEntity` replaces the
  joiner's untracked local taming guess. A peer-ridden creature is glued to that peer's own
  already-streamed pose (no new wire traffic) with its AI frozen, so the host never fights the
  rider and the mount's motion is visible to any other peer for free; the riding client
  additionally glues its own view locally every frame (zero added latency), ignoring the
  network-smoothed stream target for that one id while riding. TDD: Protocol (mount/dismount
  shapes, tamed flag), HostSession/JoinSession peerId threading. `tools/net-probe.ts` extended
  with a cheap wiring check (a joiner's mount intent on an untamed creature must be rejected by
  the host, `riddenIds` probe seam) — live-verified 2026-07-19 (full probe PASS incl. mount-reject).
  Known edge (recorded): a joiner's optimistic G-mount isn't rolled back on a silent host
  rejection (two players racing to mount the same creature) — views diverge until that joiner
  dismounts; trigger to fix: seen in real play. Follow-up: move the snapshot to the
  unreliable channel (ADR 0002 §3) — investigated 2026-07-19, deferred (see ADR addendum).
- [~] M8 Hybrid voxel terrain (Fable-led) — Fable [F] core done (2026-07-06): 8.1 SDF chunk store
  (TDD, delta persistence via M2 save), 8.2 Transvoxel regular-cell mesher (TDD; MIT Lengyel tables,
  see CREDITS.md), 8.3 break-ground seam (`?voxel=1`: dig-mask hole punch, dig/fill tool, walkable
  caverns, OPFS round-trip verified in `?scene=voxeldev` + `tools/voxel-shot.ts`), 8.4[F] vertex
  material painting behind the `MaterialSampler` port. ADR 0001. **Opus [O] done (2026-07-06,
  TDD, renderer-free — see `docs/HANDOFF-M8-OPUS.md`):** 8.6[R] placement research pass; 8.4[O]
  deterministic depth-seeded ore/gem function (`domain/voxel/OreGemSeeding` + `domain/rng/hash`,
  wired into VoxelTerrain, placeholder retired); 8.5[O] kinematic placement domain
  (`domain/placement`: grid/surface/socket snap + validity); 8.7[O] hidden treasures
  (`domain/treasure`: seeded placement + discovery); world-lifecycle app seam
  (`application/WorldLifecycle` + composeGameUi). **Fable [F] session 2+3 done (2026-07-06):**
  world-gen device-loss FIXED (two causes: GPU time-slicing `src/gpu/SlicedCompute.ts` for the
  TDR mega-dispatches, AND the atmosphere multi-scatter bake's 64×-unrolled shader killing Dawn —
  now a runtime loop; `?scene=world` boots READY ~48 s on the dev box, verified
  `tools/boot-probe.ts`); menu↔engine lifecycle wired in `src/main.ts` (menu mounts on plain URL,
  Solo launch boots the world, pose save/restore, shared save store); placement ghost
  (`src/voxel/placement`, B build mode) + hidden treasures (`src/voxel/treasure`, streamed tier
  markers) built TDD and wired into voxeldev + world scenes, persisting through
  `VoxelTerrain.entity()/setEntity()`; ore brassy verified visually (deep-pit shot), gem seeding
  unit-tested; end-to-end menu → Solo → full-world boot verified in Playwright.
  Dig-mask economy fixed (2026-07-06): only carves that intersect the surface sheet record a mask
  sphere, so deep tunnel carves no longer consume the 128 slots (~10× effective capacity for
  mining). **Deferred (recorded, not skipped):** field-derived hole mask — trigger: >128 SURFACE
  digs in real play; transvoxel transition-cell stitching — trigger: voxel chunks gaining LOD
  levels (today all edited chunks render LOD0, no cracks possible); rim material/veg-over-hole
  culling — cosmetic, trigger: playtest feedback (touches 15 veg node materials, prime-directive
  risk). **Remaining:** playtest gate.

## AAA Definition of Complete

AAA polish pass (docs/AAA_POLISH_PLAN.md), executed 2026-07-19 as verified slices — every checked
item re-verified by the orchestrator (full `npm run ci` + diff inspection), not claimed:

- [x] W1 Audio: procedural Web Audio SFX + buses + ambient/music beds (zero bundled audio files)
- [x] W2 Juice: FeedbackDirector — camera shake, hit-stop, damage numbers, screen fx, rumble; reduced-motion-aware
- [x] W3 HUD: theme tokens (AA contrast), hotbar, vitals cluster, toasts, crosshair states (minimap 3.5 deferred)
- [x] W4 Inventory/crafting UX: drag-drop ARIA grid, crafting screen, container reuse
- [x] W5 Survival loop: hunger/stamina/eating/sleep/respawn/difficulty (local-only, zero protocol surface)
- [x] W6 Progression/onboarding: keyhints, achievements tab, progression persistence
- [x] W7 Content gates: 50 items / 27 recipes / 17 build parts / 8 species / 3-biome spawn table
- [x] W8 Interactivity: chests, doors, campfires, beds, torches — all through the host-authoritative
  intent path; persists through reload (GameStatePersistence)
- [x] W9 Perf & pacing: F4 perf HUD (p50/p95/p99), GC-hitch fixes in per-frame paths, branded
  loading screen for the ~48 s boot, streaming pop-in grow-in
- [x] W10 Presentation: procedural Diggy World wordmark + menu backdrop, credits (EN/ES/DA),
  first-run pulse, menu/lobby/settings theme sweep
- [x] Security review of all new intent-path mutations — done 2026-07-19; material findings fixed
  in 6f03bf8: inventory-touching placeable actions gated off the wire until a host-side
  inventory-authority protocol exists (a joiner could conjure items into shared chests — the host
  holds no joiner inventory to debit), and joiners now pin the host peerId at welcome (trystero is
  a full mesh — host-kind messages from other joiners are dropped). Joiner chest/campfire/plot
  actions are consequently no-ops until the inventory-sync protocol lands (recorded deferral)
- [ ] Playtest gate (structured session — owner schedules)

Deferred (explicit, recorded in the plan doc): minimap/compass, breeding + boss, Tauri wrapper
(owner-gated), repo/URL rename (owner-gated), FlyCamera hook bundle (footsteps + physical
sprint-slow + door collision — one engine-dir decision), joiner inventory-sync protocol, live 3D
menu backdrop, engine-side terrain/vegetation pop-in.

## Expansion

Diggy World expansion wave (plan: [`docs/EXPANSION_PLAN.md`](docs/EXPANSION_PLAN.md)), executed
2026-07-19/20 as security-reviewed, orchestrator-verified slices (full `npm run ci` + diff
inspection per merge; mandatory `claude-infra:security` review on every networking-touching slice):

- [x] E0 Foundations: billboard text, CreatureRegistry (single add-a-creature seam), WorldClock
  day/night, **host-authoritative per-peer inventories** (seed-once join claim, owner-only state,
  bounded wire validators), ground-drop loot with authoritative peek→credit→remove pickup
- [x] E1 Stats/talents: character level/XP + talent points, additive-only multipliers, free respec;
  wired live into vitals/stamina/combat/gather/loot
- [x] E2 ARPG HUD: bars/orbs vitals styles, creature nameplates + overhead lifebars (faction-aware,
  policy settings), floating damage/heal/XP numbers, combat log + solo damage meter (L)
- [x] E3 Maps: exploration fog-of-war (persisted), corner minimap, full-screen map (M) with
  creature/resource/ground-loot markers; waypoints session-only (deferral)
- [x] E4 Inventory depth: autosort + merge, item filters (persisted), autoloot toggle+radius,
  account-wide bank (K, IndexedDB) — multiplayer bank path deferred behind seed-trust revisit
- [x] E5 Social: party groups (4-cap, leader succession, invite/kick, P panel, party frames),
  trade escrow (offer-change resets both confirms, atomic host-side swap, no dupe paths),
  kid-safe chat (host-filtered EN/ES/DA profanity masking + PII redaction covering text AND
  display names, party channel over live membership), opt-in read-only party inventory lookup,
  party damage meter — every mutation a host-authoritative intent; all three slices passed
  independent security review before merge (follow-ups recorded in `docs/EXPANSION_PLAN.md`)
- [x] E6 World content: E6.1 caves (seeded 3D-noise carving unioned into the voxel SDF,
  worldgen-version-gated — pre-existing worlds regenerate byte-identical), E6.2 seeded
  structures/POIs (4 cozy types on a deterministic 96m grid, chests are ordinary placeables,
  map POIs), E6.3 biome/time-gated spawning (registry-side affinity as source of truth,
  owl/badger nocturnal, global caps, spawn-rate settings), E6.4 research tree (13-node starter
  tree over ProgressionEvents-derived points, J screen, per-owner persistence), E6.5 asset
  library (+5 creatures, +17 items incl. the coin/gem/relic latent-gap fix, +9 recipes,
  beehive/silver-vein nodes, +5 build parts), E6.7 iconography (procedural item icons, distinct
  map-marker glyph shapes, panel emblems). Achievements for the new systems deferred — not
  expressible as a pure-data registry addition (see `docs/EXPANSION_PLAN.md` deferrals)
- [ ] Expansion playtest gate (structured session — owner schedules)

## Combat (E7)

Combat & encounters wave (plan: [`docs/COMBAT_PLAN.md`](docs/COMBAT_PLAN.md)): hybrid aimed +
melee-assist targeting, cozy-whimsical abilities (charter amended — see ADR 0004), host-owned
projectile/deployable simulation. Mandatory `claude-infra:security` review on every wire-touching
slice (E7.0 protocol growth, E7.2–E7.6).

- [x] E7.0 Contracts: WeaponMetadata/DamageType on ItemDefinition, 5 combat registries
  (weapon/projectile/ability/aoe/deployable, completeness-tested), wire intents
  equipItem/aimedAttack/castSpell/deployItem + host streams projectiles/deployables/effect,
  FeelEvents combat ids — security-reviewed, merged 9b746a5
- [x] E7.1 Melee variety: per-weapon damage/speed/reach/cone, attack-strength cooldown meter,
  forward-cone soft-lock assist, heavy-weapon sweep (MeleeResolve.ts, AttackMeter HUD, 4 weapons)
  — host-only, no wire growth; joiner attack stays bare-hands until equip-sync (E7.2 follow-up)
- [x] E7.2 Ranged + ammo: draw-to-charge, host-simulated arcing projectiles, ammo consumption,
  cosmetic client tracers (bow/sling/dart-thrower + arrow/pebble/dart) — host-authoritative
  aimedAttack wire with all 6 E7.0-sec guards; security-reviewed (APPROVED), merged
- [x] E7.3 Spellcasting: Sparkle Bolt / Frost Puff / Healing Bloom / Vine Snare, regenerating
  focus resource, cast bar (Ability resolver, Focus, castSpell handler, CastBar HUD) —
  security-reviewed (APPROVED + groundPoint range-bound hardening applied), merged
- [x] E7.4 AoE/explosives: shared `resolveAoe` radius/falloff resolver (domain/combat/Aoe.ts, pure,
  host-only), starter "bomb-boom" AoeSpec + thrown "bomb" item/recipe, ring+confetti+flash boom VFX
  (spawn/AoeField.ts) with a deferred, off-by-default block-dig seam — no wire/protocol changes
  (E7.0's `effect` message already covers this); security-reviewed (APPROVED), merged
- [x] E7.5 Deployables: timed grenade, proximity mine, telegraphed bumble-trap; host-owned
  arm/trigger (Deployable state machine, DeployableRegistry, deployItem handler + trigger tick,
  DeployableField VFX) — security-reviewed (APPROVED), merged
- [x] E7.6 Monster abilities: telegraphed windups (spit/cast/stomp), stand-and-cast /
  retreat-and-fire brain decisions (CreatureAbilities, optional abilities? on wolf/bear/badger)
  — host-driven, no new wire; security-reviewed (APPROVED), merged
- [x] E7.7 Defeat VFX: poof + confetti + loot fountain, gentle player-down (no item loss)
  (feel/DefeatEffects.ts, squash-and-recover, respawn shimmer) — presentation-only, no wire; merged
- [x] E7.8 Loot pools: weighted rarity tiers, difficulty/encounter multiplier, deterministic
  single-roll (domain/loot/LootTable.ts + CreatureLootPools.ts, reward items) — merged 7879ab4
- [ ] Combat playtest gate (structured session — owner schedules)

## UI/UX (E8)

UI/UX overhaul wave (plan: [`docs/UX_PLAN.md`](docs/UX_PLAN.md)): window chrome + procedural
backgrounds, richer iconography, rich item tooltips, context menus, input/chat polish, menus/lobby/
settings restyle, HUD cohesion, accessibility/colorblind pass. Reuse-first: upgrades the existing
token layer + shared components so all ~18 existing screens inherit the new look. Architecture
decision: ADR 0005. Mandatory `claude-infra:security` review for E8.5's chat item-links (the one
wire-touching slice).

- [x] E8.0 Visual-language contract (merged 17b00d4): rarity color scale (`THEME.rarity`, AA-verified
  text ≥4.5:1 / frame ≥3:1 on bg-panel AND surface-3) + colorblind alt palette (monotonic-lightness
  ramp, `rarityColorblind`) + per-tier non-color `rarityPattern` hook, 4-step warm surface-elevation
  scale (`surface-0..3` + scrim/ornament/inset), `WINDOW_CHROME_SPEC` + `PANEL_BACKGROUND_RECIPE`
  typed doc-contracts, all `--lw-*` CSS vars — `ui/theme/tokens.ts`, types/tokens only, nothing
  renders them yet (wiring is E8.1+). 192-line contract test
- [x] E8.1 Window chrome & procedural backgrounds: `components/WindowFrame.ts` shared overlay shell
  (emblem + title + optional headerExtra/tab-strip + optional headerActions + close, over body, with
  optional footer keyhints; encodes `WINDOW_CHROME_SPEC`, doc-pure, 7 tests). All 8 overlay dialogs
  migrated off the hand-rolled `lw-inv-header` onto it — Chest/Campfire/Trade/Research (single title),
  Character/Bank (emblem + tab strip, sr-only title), Inventory (tab strip), Map (emblem + recenter
  headerAction); each screen keeps its own Escape/close/tab-state logic. `.lw-panel` now renders
  `PANEL_BACKGROUND_RECIPE` (edge vignette over static SVG fractal-noise grain over a warm
  surface-2→surface-1 gradient + soft drop shadow) — static, reduced-motion-safe by construction,
  propagating to all Panel() consumers incl. HUD clusters for free. Browser visual-QA'd against a
  dimmed-world backdrop. Also fixed a long-standing dropped `}` on `.laas-room-code` that had nested
  the whole sheet (4351ddc)
- [ ] E8.2 Iconography v2: authored per-category glyph paths, rarity frame ring, overlay badges
  (equipped/new/qty); `PanelEmblem` grows into a per-screen emblem library + party/faction crest
- [ ] E8.3 Rich tooltip system: pure `domain/ui/TooltipModel.ts` item-card model + `RichTooltip`
  component (hover/keyboard-focus/touch long-press), replacing single-line hovers for items
- [ ] E8.4 Context menus: pure `domain/ui/ItemActions.ts` action list + `ContextMenu` component
  (mouse right-click / keyboard / touch long-press), replacing the `InventoryGrid` split-only handler
- [ ] E8.5 Inputs & chat polish: shared `Field.ts` input primitive; chat gains rarity-colored item
  links, channel pills, unread badge, kid-safe canned emote palette — security-reviewed (wire-touching)
- [ ] E8.6 Menus, lobby & settings overhaul: `MainMenuView`/`LobbyView`/`SettingsView`/
  `CreditsScreen`/`LoadingScreen` restyle onto E8.1 chrome; Settings UI category; lobby becomes the
  "play together" surface
- [ ] E8.7 HUD cohesion & action bar: unify hotbar/vitals/minimap/objective/party/combat-meter;
  togglable ability/consumable action bar; gentle buff/effect strip; toasts restyled
- [ ] E8.8 Accessibility, responsive & colorblind pass: wire `--lw-*` tokens under
  `[data-high-contrast="true"]` (closes the recorded gap); ship colorblind rarity palette; full
  keyboard nav + ARIA for chrome/tooltip/menu; mobile layouts
- [ ] UI/UX visual-QA pass (aerial/close screenshots scored against the cozy-tone + a11y checklist:
  rarity legible + colorblind-safe, no empty panels, AA contrast, shape-not-color-only,
  reduced-motion honored)
- [ ] UI/UX playtest gate (structured session — owner schedules)

## Notes

- Prime directive: never regress the finished desktop LAAS render — all new work is additive and
  flag/preset-gated.
- Open research questions (resolve before their milestone): iOS Safari WebGPU status; spawn-density
  systems; physics-building/crafting patterns; persistent-world P2P netcode. See the research doc.
- Game logic lives under `src/game/{domain,application,infrastructure,ui}` (layered, dependency-cruiser
  enforced) — additive, renderer-free, and separate from the untouched LAAS engine (`src/core`, `render`,
  `gpu`, `world`, `sky`, `vegetation`, `debug`). This is the Opus-owned block; Fable's [F] engine work
  (voxel terrain, mobile fidelity, netcode transport) plugs into these ports. Fable's M8 subsystem:
  pure voxel domain in `src/game/domain/voxel`, mesher + three.js adapters in `src/voxel` (vitest
  covers both).
- `?scene=voxeldev` is the lightweight voxel proving ground (analytic ground, full dig stack).
  The full-world device loss is FIXED (2026-07-06, see M8 status) — `?scene=world` runs in
  Playwright Chromium on the dev box again.
- **[F] World-gen device-loss fix — DONE (2026-07-06):** two independent causes, both fixed.
  (1) Gen-time mega-dispatches tripped the Windows TDR watchdog on AMD RDNA-3 → time-sliced via
  `src/gpu/SlicedCompute.ts` (uint-uniform base offset + tail guard + `gpuFence` between
  submissions; applied to synthesis, erosion, hydrology, biome, scatter). (2) The atmosphere
  multiple-scattering bake unrolled 64 sphere directions × an 18-step march at COMPILE time —
  a shader big enough to kill Dawn outright ("valid external Instance reference no longer
  exists"); the directions are now computed in-shader from a runtime loop. Also helps
  low-end/mobile.
- Menu/lobby ↔ engine world lifecycle glue — DONE both halves (2026-07-06): `src/main.ts` mounts
  the menu on a plain URL (`shouldMountMenu`), boots from `WorldLaunch` (seed + pose restore),
  keys VoxelTerrain to the real worldId, saves pose on pagehide/visibilitychange; verified
  end-to-end (menu → Solo → full-world READY) in Playwright.
- **AAA polish — Workstream 1 (Audio), Slice S1 — DONE (2026-07-19):** `domain/audio` pure event
  registry (footstep/dig/place/harvest/craft/hit/hurt/tame/uiClick/uiHover/ambientWind/musicCalm)
  + TDD'd cooldown/priority logic (`AudioCooldown`); `application/ports/AudioPort` (play/
  setBusVolume/startMusicState/startAmbient/stopAmbient) with an `InMemoryAudioPort` fake;
  `infrastructure/audio/WebAudioAdapter` — a real Web Audio bus graph (master → music/sfx/
  ambient/ui), PannerNode spatialization tied to a per-frame camera listener pose, ALL SFX
  synthesized procedurally (oscillators + filtered noise + linear-ramp envelopes, zero audio
  files), resume-on-first-gesture. Settings gained 4 volume sliders (EN/ES/DA), persisted,
  live-wired to `setBusVolume`. Wired at existing call sites: combat hit + player-hurt + harvest
  + tame in `SpawnFieldView`, dig/place in `DigTool`/`PlacementTool`, UI click/hover on every
  menu/lobby/settings button (`ui/audioUi.ts`), ambient wind bed + calm music loop started on a
  real menu-launched world boot only (never on a tooling/dev `?scene=` URL). Deferred (explicit):
  footstep SFX wiring — no velocity hook exists outside `FlyCamera` (LAAS core, off-limits per
  the prime directive) — the footstep event/synth exists, unwired; craft SFX — no crafting UI/
  call site exists yet (arrives with Workstream 4). `npm run ci` green: 74 files/635 tests
  (was 69/605), lint/typecheck/arch/build all pass.
- **AAA polish — Workstream 10 (Presentation & identity), Slice S9 — DONE (2026-07-19):** a
  procedural wordmark (SVG text + theme gradient, zero image/font assets) on the main menu; the
  boot-screen title (`index.html`, `BootUI.ts` untouched — engine dir) now shares the same brand
  palette for cross-surface identity. A cheap parallax hill-silhouette backdrop
  (`domain/presentation/Skyline`, seeded via the existing `hash32`/`hashUnitFloat`, drifted with
  CSS keyframes — reduced-motion-safe for free) replaces the deferred live-3D flythrough: booting
  the full world behind the menu costs ~48 s (see M8 above), far too slow for a menu, and the
  engine dirs are off-limits to this slice. New Credits screen (menu-reachable, EN/ES/DA) lists
  runtime tech + CC0/MIT assets mirrored from CREDITS.md. A localStorage-backed first-run touch
  gently highlights "Solo" on first load (CSS pulse only, no text change). Consistency sweep:
  MainMenuView/LobbyView/SettingsView had never received the S2 theme kit since M4 (unstyled
  default DOM) — themed via CSS on their existing root classes; `src/main.ts`'s host-offline
  overlay + room-code badge moved off hardcoded hex onto theme tokens. `npm run ci` green:
  129 files/1032 tests (was 124/1010), lint/typecheck/arch/build all pass.
