# AAA Polish & Native Analysis — minecraft3d

> **Purpose:** a self-contained brief another LLM can execute against without prior context.
> It answers the native-vs-web question, defines what "feels like a AAA game" concretely
> (a measurable *Definition of Complete*), and lays out a phased, dependency-ordered plan of new
> systems, mechanics, and UI polish.
>
> **Read these first (they hold the invariants every task below inherits):**
> - [`PROGRESS.md`](../PROGRESS.md) — live status of M0–M8 (what already exists).
> - [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — the milestone plan this extends.
> - [`README.md`](../README.md) — engine capabilities and controls.
>
> **Inherited invariants (do not break — these are hard constraints, not preferences):**
> 1. **Prime directive:** never regress the finished LAAS desktop render. All new work is *additive*
>    and **flag/preset-gated**; a no-flags desktop boot must stay pixel-identical to today.
> 2. **Layered architecture**, dependency-cruiser enforced:
>    `domain ← application ← infrastructure ← ui`. Pure logic in `domain`, I/O behind ports.
> 3. **TDD** for all testable logic (Red→Green→Refactor); honest fakes over mocks.
> 4. **Free-only** — no paid service anywhere in the shipped path.
> 5. **i18n** (EN/ES/DA, no hardcoded UI strings) + **a11y baseline** (contrast, keyboard focus,
>    text-scale, reduced-motion) on every user-facing surface.
> 6. **Assets:** the repo ships *zero* bundled art today (all procedural). Any new asset must be
>    procedural, or CC0/self-generated with provenance recorded in `CREDITS.md` /
>    `docs/ASSET_SOURCES.md` (see the asset-sourcing rule). Prefer procedural first.
> 7. **Target platform:** desktop Chrome + WebGPU primary; mobile PWA reduced path secondary.

---

## Part 1 — Native app: would it increase FPS? (Verdict: no, not meaningfully. Don't rewrite.)

### The short answer

**A native rewrite will not give you a meaningful FPS increase, and a native *wrapper* (Tauri/Electron)
gives you installability with essentially the same frame rate — not more.** The game is already
running on a native GPU path. Spend the effort on the GPU workload and JS-GC hitches instead (Part 2's
Perf workstream), not on a port.

### Why — the technical reason

Chrome's WebGPU implementation **is Dawn**, Google's native C++ WebGPU library, which compiles your
render/compute commands straight down to **D3D12 on Windows, Vulkan on Linux, Metal on macOS**. When
this game submits a draw call, it is already hitting the same native graphics API a hand-written C++
engine would use. There is no interpreter, no translation layer sitting between WebGPU and the driver —
WebGPU *is* the thin abstraction over the native API.

So the only things a native shell removes are **browser-shell costs**, not GPU costs:

| Cost a native shell can remove | Realistic FPS impact |
|---|---|
| Browser compositor / tab-management overhead | Low single-digit % |
| Renderer-process IPC for present | Low single-digit % (Firefox notes this; Chrome less so) |
| Sandbox syscall filtering | Negligible for GPU-bound work |
| **The actual GPU shading/meshing/compute workload** | **Zero — identical** |

This game is **GPU-bound** (190k trees, ~1M grass blades, volumetric clouds, 4-cascade PCSS shadows,
131k particles, WebGPU compute for erosion/hydrology/voxel meshing). When you are GPU-bound, removing a
few percent of CPU/compositor overhead does not move your frame rate — the GPU is still doing the same
work per frame. Independent benchmarking through 2025–2026 puts browser WebGPU at ~80% of native for
*CPU-side* inference-style workloads and much closer for GPU-bound rendering; the gap is on the CPU
submission side, which is not your bottleneck.

### The two things that *are* web-specific and could hitch frames

1. **JavaScript GC pauses** — the one genuinely web/JS-specific cause of frame *hitches* (not average
   FPS). A garbage-collection pause can drop a frame. This is addressable **on the web** by reducing
   per-frame allocations in the hot loop (object pooling, typed arrays, no closures/array literals in
   `requestAnimationFrame`). A native rewrite in Rust/C++ removes GC entirely — but so does disciplined
   allocation-free hot-loop code, at a fraction of the cost. **This is a Perf-workstream task, not a
   reason to port.**
2. **Conservative WebGPU limits** — WebGPU caps some buffer sizes / binding counts below what raw D3D12
   exposes. Only relevant if you hit a specific limit; you are not currently limited by these.

### The wrapper options, ranked (if you want a desktop app at all)

You would wrap for **distribution and feel** (a Steam-able .exe, an icon, no browser chrome, offline by
default), **not for FPS**:

- **Tauri v2 (recommended if you wrap).** On Windows it uses **WebView2**, which is Chromium/Edge — so
  you get the *same* WebGPU (Dawn) path as Chrome, ~28–50 MB RAM idle, sub-second launch, <10 MB
  installer. **Caveat:** macOS/Linux Tauri uses WebKit/WebKitGTK, whose WebGPU is immature — so a Tauri
  build is effectively **Windows-only** for this engine today. That matches your primary platform.
- **Electron.** Bundles its own Chromium, so WebGPU is consistent across all three OSes, but ships a
  ~150–200 MB app using 200–400 MB RAM. Heavier; only pick it if cross-OS desktop parity matters more
  than size.
- **A true native engine rewrite (wgpu/Bevy/C++/Dawn).** Rewrites ~21k lines of a finished, verified
  engine. **Not recommended** — enormous cost, marginal FPS gain, loses the "runs from a URL" property
  and the mobile PWA in one stroke.

### Recommendation

- **Now:** stay web. Put the effort into the **Perf & Frame-Pacing workstream** (Part 2, Workstream 9) —
  that is where real, felt smoothness lives, and it benefits every platform including the mobile PWA.
- **Later, optionally:** ship a **thin Tauri (Windows) wrapper** purely for a native install/Steam
  presence once the game content is AAA-complete. Treat it as packaging, not performance. It reuses the
  exact same build output; budget ~1–2 days, not a rewrite. Record it as an ADR if pursued.

**Sources:**
- [WebGPU browser support & performance, ToDetect 2025](https://www.todetect.net/article/webgpu/webgpu-browser-support-2025/)
- [WebGPU supported in all major browsers, web.dev](https://web.dev/blog/webgpu-supported-major-browsers)
- [Tauri v2 vs Electron 2026, buildmvpfast](https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026)
- [Tauri vs Electron real-world, levminer](https://www.levminer.com/blog/tauri-vs-electron)
- [WebGPU performance gains 2026, byteiota](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/)

---

## Part 2 — Making it feel AAA

### What "AAA feel" actually means (the definition, then the rubric)

"AAA" is not more content or better graphics — this engine already out-renders most indie games. AAA
*feel* is **cohesion, feedback density, and the absence of rough edges**: every action has an immediate
audiovisual response, the player is never confused about what to do, nothing looks placeholder, and the
core loop is deep enough to be worth repeating. The current game is a strong *tech demo with systems*;
the gap to AAA is **juice, audio, UX, onboarding, and loop depth** — not rendering.

Below is the **Definition of Complete**: a rubric of 10 pillars. The game "feels AAA" when every pillar
is at **Level 3**. Each pillar has objective gates so another LLM (and you) can verify "done" without
subjective argument.

#### Definition of Complete — the 10-pillar rubric

| # | Pillar | Level 1 (today, roughly) | Level 3 = "AAA-complete" (the gate) |
|---|---|---|---|
| 1 | **Audio** | Silent | Spatial SFX on every action, ambient beds per biome/time, music states, UI sounds, mixer + volume settings. **Gate:** no interaction is silent; audio has its own settings panel. |
| 2 | **Game feel / juice** | State changes, no feedback | Hit-stop, camera shake, damage numbers, screen vignette, impact particles, hurt/heal flashes, controller rumble. **Gate:** attack, take-damage, harvest, craft, place, level-up, tame each have ≥2 feedback channels (visual + audio). |
| 3 | **HUD & UI polish** | Minimal bars | Cohesive designed HUD: hotbar, health/stamina/hunger, minimap+compass, crosshair states, toasts, animated transitions, consistent visual language. **Gate:** every HUD element themed to one design system; no default/unstyled DOM. |
| 4 | **Inventory & crafting UX** | Logic exists, thin UI | Drag-drop grid inventory, crafting screen with recipe browser + search + "craftable" filter, tooltips, quick-move, split-stack. **Gate:** a player can craft any unlocked recipe with mouse only, no keyboard memorization. |
| 5 | **Survival core loop** | Health only | Hunger, stamina, temperature (optional), day/night threat, sleep/respawn, eating, a death→respawn penalty loop. **Gate:** a full survival day (gather→craft→eat→shelter→sleep) is playable and readable. |
| 6 | **Progression & goals** | None | Onboarding tutorial, objective/quest tracker, achievements, an unlock/tech curve, and a first-session "what do I do" answer. **Gate:** a new player reaches their first craft + first shelter guided, without external help. |
| 7 | **Content depth** | Demo-scale item/recipe/creature set | Enough items, recipes, buildable parts, and creature variety that the loop sustains ≥1 hour. **Gate:** ≥40 items, ≥25 recipes, ≥6 creature types, ≥15 buildable parts, ≥3 biomes with distinct resources. |
| 8 | **World interactivity** | Dig/build/place | Storage containers, doors/gates, farming/agriculture, cooking station, light sources, functional furniture. **Gate:** the player can build a lockable, lit, storage-equipped shelter and grow/cook food. |
| 9 | **Perf & frame pacing** | Good average FPS | Locked frame pacing (no GC hitches), a loading screen, streaming with no pop-in stutter, a perf HUD, verified on the mobile preset. **Gate:** 99th-percentile frame time within 1.5× median on the dev box; no full-second hitch during normal play. |
| 10 | **Presentation & identity** | Menu + world | Branded main-menu scene, title/logo, cohesive art direction, credits, settings depth, polished loading/first-run. **Gate:** the game has a name, a logo, a themed main menu with a live 3D backdrop, and a credits screen. |

**The game is "AAA-complete" when all 10 pillars pass their gate.** Track this as a checklist in
`PROGRESS.md` under a new `## AAA Definition of Complete` block (mirror the existing `## Status` block
so the Command Center dashboard reads it).

---

### The plan — 10 workstreams, dependency-ordered

Each workstream below maps to a rubric pillar and is written so it can be picked up cold. Every
workstream states: **Goal**, **Why (AAA rationale)**, **Tasks** (with the target layer/directory),
**Acceptance criteria** (the pillar gate, made concrete), and **Architecture notes** (how it plugs into
the existing ports without violating invariants).

Ownership tags carry over from `IMPLEMENTATION_PLAN.md`: **[O]** pure logic / UI shell / config (TDD,
any capable model); **[F]** GPU/render/audio-DSP/perf depth; **[R]** research-first.

Recommended sequencing rationale: **Audio + Juice + HUD first** — they transform the *feel* of every
existing system for the least work and unlock playtesting. Then **Inventory/Crafting UX** and **Survival
loop** deepen the core. **Progression/Onboarding** makes it learnable. **Content + Interactivity** fill
it out. **Perf** and **Presentation** are the final polish gates.

---

#### Workstream 1 — Audio system  *(Pillar 1)*  **[O for logic/ports, F for DSP/spatializer]**

**Goal.** A spatial audio system so nothing in the game is silent.

**Why.** Audio is the single highest-leverage AAA jump for this project because the game is currently
100% silent. Sound sells impact, weight, and place more than any shader.

**Tasks.**
- **1.1 [O]** `domain/audio` — pure audio *intent* model: an `AudioEvent` enum/registry (footstep,
  harvest, craft, place, hit, hurt, tame, ui-click, ambient-loop-id, music-state) with per-event
  metadata (category, gain, spatial vs 2D, cooldown to prevent machine-gunning). TDD the event
  dedup/cooldown/priority logic — no Web Audio here.
- **1.2 [O]** `application/ports/AudioPort.ts` — `play(event, {position?, gain?})`, `setBusVolume(bus,
  v)`, `startMusicState(id)`, `stopAmbient(id)`. An in-memory fake records calls for tests.
- **1.3 [F]** `infrastructure/audio/WebAudioAdapter.ts` — Web Audio API `AudioContext`, a bus graph
  (master → music / sfx / ambient / ui), `PannerNode` for spatial 3D tied to the camera listener,
  pooling of `AudioBufferSourceNode`. Resume-on-user-gesture handling (browsers block autoplay).
- **1.4 [O]** Settings: master/music/sfx/ambient sliders in the existing settings screen; persist via
  the settings store; wire to `setBusVolume`.
- **1.5 [asset]** Source SFX/music **procedurally or CC0** (see the `assetfactory` sound generator and
  the asset-sourcing rule; record provenance). Start with a small kit: footsteps (per surface),
  harvest/dig, craft, place, UI click/hover, hurt, ambient wind/forest/water beds, one exploration
  music loop. Music *state* switching (calm ↔ threat) can start as a crossfade between two loops.
- **1.6 [O]** Wire `AudioPort.play(...)` calls at every existing game event site (combat hit/hurt in
  `SpawnFieldView`, harvest/craft in the gathering/crafting wiring, place/dig in the voxel seam, UI in
  the menu components). Reduced-motion/a11y: respect an OS "prefers-reduced-*"—there is no audio
  equivalent, but honor a mute-by-default-until-interaction and expose the master toggle prominently.

**Acceptance (Pillar 1 gate).** Every player action produces a sound; spatial sounds attenuate/pan with
distance and direction; an Audio settings panel controls four buses and persists; no autoplay-blocked
console errors; logic layers unit-tested against the fake.

**Architecture notes.** Domain stays Web-Audio-free (testable); all browser audio is behind
`AudioPort`. This mirrors how `NetTransport`/`WorldSave` are already structured.

---

#### Workstream 2 — Game feel / juice  *(Pillar 2)*  **[O for logic, F for camera/particles/post]**

**Goal.** Immediate multi-channel feedback on every meaningful action.

**Why.** "Juice" is what separates a systems demo from a game. Same mechanics, 10× the satisfaction.

**Tasks.**
- **2.1 [O]** `domain/feel` — a pure `FeedbackDirector`: given a game event, returns a declarative
  feedback bundle (shake magnitude+duration, hit-stop ms, vignette color+intensity, damage-number
  value+crit flag, particle-burst id). TDD the mapping and the decay/stacking rules (e.g. shakes sum
  but clamp).
- **2.2 [F]** **Camera shake** — additive trauma-based shake layered onto the existing walk-camera
  (never overwrite the LAAS camera; add an offset). Respect `prefers-reduced-motion` (scale to 0).
- **2.3 [F]** **Hit-stop** — a few frames of time-scale dip on impactful hits (guard the fixed-step
  sim so netcode/physics stay deterministic — scale *presentation* only, or a capped dt).
- **2.4 [O/F]** **Damage numbers** — floating world-space DOM or sprite numbers on hits; crits larger.
  Domain decides values; a thin UI adapter renders.
- **2.5 [F]** **Screen effects** — hurt vignette (red pulse), heal flash (green), low-health desaturate,
  layered into the existing post stack behind a flag so the base grade is untouched.
- **2.6 [F]** **Impact particles** — reuse the existing GPU particle system for harvest chips, dig dust,
  hit sparks, footstep puffs. Budget-gated on the mobile preset.
- **2.7 [O]** **Gamepad rumble** (Gamepad API `vibrationActuator`) driven by the same feedback bundle;
  no-ops if absent.

**Acceptance (Pillar 2 gate).** Attack, take-damage, harvest, craft, place, level-up, and tame each fire
≥2 feedback channels (visual + audio, audio via Workstream 1); reduced-motion disables shake/hit-stop
cleanly; the base no-flags render is unchanged.

**Architecture notes.** `FeedbackDirector` is pure and pairs with the `AudioPort` — one game event fans
out to both. Presentation adapters (camera, post, particles) live in `src/` render-adjacent code, gated.

---

#### Workstream 3 — HUD & UI design system  *(Pillar 3)*  **[O]**

**Goal.** A cohesive, themed HUD and a reusable UI kit so nothing looks like default DOM.

**Why.** A unified visual language is the most visible AAA signal after audio. Today's HUD is functional
bars; AAA needs one design system applied everywhere.

**Tasks.**
- **3.1 [O]** `ui/theme` — a design-token layer (colors, spacing, radii, type scale, motion durations,
  focus-ring) as CSS custom properties + a small TS accessor. One source of truth; a11y contrast-checked.
  (Consider running the `frontend-taste` and `dataviz`-palette guidance to avoid AI-slop styling.)
- **3.2 [O]** Reusable components (framework-free or match the current UI approach): `Panel`, `Button`,
  `Slider`, `Tooltip`, `Toast`, `Bar` (health/stamina/hunger), `Hotbar`, `Crosshair`, `Keyhint`.
  Keyboard-navigable, focus-visible, text-scalable.
- **3.3 [O]** **Hotbar** — 1–9 slot bar bound to inventory; selected-slot highlight; scroll-to-select;
  reads the existing inventory model.
- **3.4 [O]** **Vitals cluster** — health + stamina + hunger bars (stamina/hunger arrive in Workstream 5)
  with smooth tweened fills and low-value pulse.
- **3.5 [F]** **Minimap + compass** — a top-down minimap (render a cheap ortho pass or sample the
  heightfield/biome map to a canvas) + a compass strip with cardinal + waypoint markers. Mobile-gated.
- **3.6 [O]** **Toast/notification** system — "item acquired", "recipe unlocked", "objective complete";
  queued, auto-dismiss, reduced-motion aware.
- **3.7 [O]** **Crosshair states** — context-sensitive reticle (interact / attack / mine / place),
  driven by what the player is looking at.

**Acceptance (Pillar 3 gate).** Every HUD element uses the theme tokens; all interactive UI is
keyboard-navigable with visible focus and honors text-scale; toasts and bars animate (reduced-motion
respected); i18n for all new strings (EN/ES/DA).

**Architecture notes.** Pure presentation in `ui/`; reads existing domain state through the app layer.
No new domain logic except toast queue rules (which can be TDD'd).

---

#### Workstream 4 — Inventory & crafting UX  *(Pillar 4)*  **[O]**

**Goal.** A real drag-drop inventory and a browsable crafting screen on top of the existing
`domain/inventory` + `domain/crafting` logic.

**Why.** The systems exist and are tested; the *interface* to them is the gap. This is high-value,
pure-Opus, low-risk work.

**Tasks.**
- **4.1 [O]** **Inventory grid UI** — slots rendered from the inventory model; drag-drop move/swap;
  split-stack (shift/right-click); merge; quick-move (double-click to chest/hotbar); tooltips with item
  metadata from the item registry. Pointer + keyboard operable.
- **4.2 [O]** **Crafting screen** — recipe list from the recipe graph, grouped by tier/category, a
  search box, a "craftable now" filter (uses the existing can-craft resolver), an ingredient panel
  showing have/need, and a craft button (single + craft-all). Unlock-gated recipes shown locked.
- **4.3 [O]** **Container UI reuse** — the same grid component powers storage chests (Workstream 8).
- **4.4 [O]** i18n all item/recipe display names + UI chrome.

**Acceptance (Pillar 4 gate).** A player crafts any unlocked recipe using mouse only; drag-drop covers
move/swap/split/merge/quick-move; tooltips show accurate registry data; search + craftable filter work;
fully keyboard-operable; unit tests for any new UI-state logic (selection, filter predicate).

**Architecture notes.** Zero new domain rules beyond view-state; everything routes through the existing
`domain/inventory` and `domain/crafting` and their save port.

---

#### Workstream 5 — Survival core loop  *(Pillar 5)*  **[O for logic, F for tuning/effects]**

**Goal.** Turn "walk around with health" into a survival loop: hunger, stamina, day/night threat, sleep,
respawn penalty.

**Why.** Depth of the core loop is what makes the hour-2 experience worth reaching. Builds directly on
the existing `PlayerVitals` domain.

**Tasks.**
- **5.1 [O]** Extend `domain/combat/PlayerVitals` (or a new `domain/survival`) with **hunger** (decays
  over time/activity, restored by eating, starvation damages) and **stamina** (drained by sprint/attack,
  regenerates, gates sprint/attack when empty). TDD the decay/restore/threshold rules deterministically.
- **5.2 [O]** **Eating** — consumables in the item registry restore hunger/health; wired through
  inventory use. TDD.
- **5.3 [O]** **Sleep & respawn** — a bed/spawn-point domain; sleep skips to morning (reads the existing
  `?T=` time-of-day system); death drops/keeps inventory per a configurable penalty rule; respawn at the
  set point. TDD the respawn-point + penalty logic.
- **5.4 [O]** **Day/night threat hook** — expose "is night" from the time system; feed the creature AI
  temperament (Workstream 7 / existing `CreatureBrain`) so nights are more dangerous. Logic only.
- **5.5 [F]** **Tuning & effects** — starvation vignette, exhaustion breathing SFX, sleep fade — reuse
  Workstreams 1–2. Balance pass is a Fable/playtest task.
- **5.6 [O]** **Difficulty settings** — peaceful/normal/hard multipliers on hunger rate, damage, death
  penalty; in the settings screen; persisted.

**Acceptance (Pillar 5 gate).** A full loop is playable: gather food → craft → eat → sprint costs
stamina → night is dangerous → build/sleep → respawn on death with the configured penalty. All threshold
logic is unit-tested; difficulty settings persist and visibly change rates.

**Architecture notes.** All in `domain/` with a per-frame `tick(dt)` driven from the app layer; HUD
(Workstream 3) visualizes it; no renderer coupling in the logic.

---

#### Workstream 6 — Progression, onboarding & goals  *(Pillar 6)*  **[O]**

**Goal.** A new player knows what to do; the game has objectives, achievements, and an unlock curve.

**Why.** "What do I do?" is the #1 killer of first sessions. Onboarding + goals is the difference between
a sandbox people bounce off and one they stay in.

**Tasks.**
- **6.1 [O]** `domain/progression` — objective/quest model (id, prereqs, completion predicate over game
  state, reward), an achievement set, and a tech/unlock curve that gates recipes (ties into crafting
  unlock tiers). TDD predicates and unlock propagation.
- **6.2 [O]** **Tutorial / first-run** — a scripted opening objective chain ("punch a tree → craft X →
  place a workbench → eat → build a shelter → survive the night"), surfaced via the toast + objective
  tracker HUD. Skippable; state persisted so it doesn't repeat.
- **6.3 [O]** **Objective tracker HUD** — a corner panel showing the current objective(s) with progress;
  reads `domain/progression`.
- **6.4 [O]** **Achievements screen** — grid of locked/unlocked with descriptions; persisted.
- **6.5 [O]** **Contextual control hints** — first-time-you-can-do-X keyhint prompts (reuse `Keyhint`),
  dismissed permanently once used.

**Acceptance (Pillar 6 gate).** A brand-new player, given no external instructions, is guided to their
first craft and first shelter by the tutorial chain; the objective tracker always answers "what now?";
achievements unlock and persist; recipe unlock gating is unit-tested.

**Architecture notes.** Pure `domain/progression` reading a read-model of game state through the app
layer; HUD renders it. Persist via the existing save port.

---

#### Workstream 7 — Content depth (creatures, items, biomes)  *(Pillar 7)*  **[O for data, F for models/AI]**

**Goal.** Enough content that the loop sustains ≥1 hour without feeling thin.

**Why.** AAA feel needs *volume* behind the systems — the gate numbers below are the concrete target.

**Tasks.**
- **7.1 [O]** **Item/recipe expansion** — grow the registries to ≥40 items and ≥25 recipes across a
  coherent tech curve (wood → stone → metal → refined), data-driven, unit-tested for graph validity (no
  orphan recipes, no unreachable unlocks — write a test that asserts the graph is fully reachable).
- **7.2 [O/F]** **Creature variety** — ≥6 creature types reusing the existing `CreatureModelLibrary`,
  `CreatureBrain` temperaments, and taming/combat domains. New types are mostly config (model + stats +
  temperament + loot); source models CC0 (KayKit/Quaternius, as already done) with provenance.
- **7.3 [O]** **Creature breeding** (optional stretch) — a domain state machine: two tamed, fed adults →
  offspring; TDD.
- **7.4 [F]** **Biome-distinct resources** — ≥3 biomes with distinct gatherables/ores (the biome
  classification already exists in the engine; map resource tables to biome ids). Placement reuses the
  spawn field.
- **7.5 [O]** **A boss / apex encounter** (stretch) — one high-health, distinct-AI creature as a goal.

**Acceptance (Pillar 7 gate).** ≥40 items, ≥25 recipes (graph reachable, tested), ≥6 creature types, ≥3
biomes with distinct resources; content is data-driven and localized.

**Architecture notes.** Almost entirely data + existing systems; the discipline is keeping it in the
registries and testing graph integrity, not scattering hardcoded values.

---

#### Workstream 8 — World interactivity (base-building depth)  *(Pillar 8)*  **[O for logic, F for meshes/lighting]**

**Goal.** A buildable, functional shelter: storage, doors, farming, cooking, light.

**Why.** Base-building is the retention engine of survival games; the voxel place/build seam already
exists — this makes placed things *functional*, not just geometry.

**Tasks.**
- **8.1 [O]** **Functional placeables** — extend the placement/entity system with typed placeables:
  **storage chest** (opens the inventory container UI, its own inventory persisted), **door/gate**
  (open/close state, optional lock tied to owner/peer), **workbench** (unlocks crafting tiers when near),
  **campfire/cooking station** (cooks raw→cooked food over time), **light source** (torch/lantern).
  Domain state per placeable; TDD open/close/lock/cook timers.
- **8.2 [F]** **Light sources** — dynamic point lights for torches/campfire integrated into the lighting
  path, budget-limited and mobile-gated (never regress the base render).
- **8.3 [O]** **Farming/agriculture** — a plot + crop-growth domain (plant → growth stages over
  game-time → harvest), reading the time system; TDD growth stages.
- **8.4 [O]** **Cooking** — recipes that require a cooking station (a crafting subgraph gated by
  proximity to a campfire); ties into hunger restoration values.
- **8.5 [F]** **Building parts** — ≥15 buildable structural parts (walls, floors, roofs, stairs, pillars,
  windows, doors, fences) with snapping (the ghost/snap system exists); mostly config + meshes.

**Acceptance (Pillar 8 gate).** A player builds a shelter with walls/roof/door, places a lit torch, a
storage chest they can deposit into, and a campfire that cooks food; grows and harvests a crop; all
placeable state persists through the save; base render unaffected when no placeables exist.

**Architecture notes.** Placeable *state/behavior* is domain (TDD'd); their meshes/lights are gated
render adapters. Container inventories reuse Workstream 4's grid and the existing inventory model.
Multiplayer: placeable mutations must route through the host-authoritative intent path (like
dig/build/attack already do) — do **not** let joiners mutate placeables locally.

---

#### Workstream 9 — Perf & frame pacing  *(Pillar 9)*  **[F, with O for the profiler HUD]**

**Goal.** Smoothness: no GC hitches, no pop-in stutter, a loading screen, verified mobile preset.

**Why.** This is the *real* answer to "would native be faster" — felt smoothness comes from frame pacing,
not from leaving the browser. (See Part 1.)

**Tasks.**
- **9.1 [F]** **GC-hitch audit** — profile the game hot loop (the new game-layer per-frame code, not the
  finished engine) for per-frame allocations; pool objects, reuse typed arrays, hoist closures/array
  literals out of `requestAnimationFrame`. Use the existing `tools/` GPU profiler + a JS allocation
  trace.
- **9.2 [O]** **Perf HUD** — extend the existing F3 debug HUD with frame-time percentiles (median, 95th,
  99th), a frame-time graph, and GC-pause markers if observable.
- **9.3 [F]** **Loading screen** — a real branded loading state covering the ~48 s full-world boot (see
  PROGRESS: `?scene=world` boots READY ~48 s) with progress + tips, replacing the current blank wait.
- **9.4 [F]** **Streaming pop-in** — audit spawn/vegetation/voxel streaming for hitches during normal
  play; stagger/budget per-frame work so no chunk load drops a frame.
- **9.5 [F]** **Mobile-preset verification** — run the full new feature set under `?preset=mobile` and
  confirm the frame budget holds; gate any expensive new effect (particles, lights, minimap) off on
  mobile.

**Acceptance (Pillar 9 gate).** During normal play on the dev box, 99th-percentile frame time ≤ 1.5×
median with no full-second hitch; a loading screen covers world boot; the mobile preset runs the new
features within budget; the perf HUD shows percentiles.

**Architecture notes.** Only touches the *game-layer* hot loop and gated render adapters — the finished
LAAS engine loop stays untouched (prime directive). Every main-loop change needs a before/after profile.

---

#### Workstream 10 — Presentation & identity  *(Pillar 10)*  **[O for menu/UI, F for backdrop]**

**Goal.** A named, branded game: title, logo, themed main menu with a live 3D backdrop, credits, polished
first-run.

**Why.** Identity is the frame around everything else — it's the first and last thing a player sees, and
its absence is the most obvious "unfinished" signal.

**Tasks.**
- **10.1 [O]** **Name + logo** — pick a game name (currently the working title `minecraft3d` is a
  placeholder and a trademark risk — **rename before any public release**); generate a logo (procedural
  or `assetfactory` image, provenance recorded).
- **10.2 [F]** **Main-menu backdrop** — the existing engine already renders a beautiful world; boot a
  slow cinematic camera orbit (reuse the flythrough/bookmark system) behind the menu instead of a static
  screen.
- **10.3 [O]** **Menu polish** — apply the Workstream 3 theme to the existing menu/lobby; add settings
  depth (audio buses, difficulty, accessibility, controls remap if feasible), a credits screen (reads
  `CREDITS.md`), and a polished first-run flow (name your character/world → tutorial).
- **10.4 [O]** **Consistency pass** — every screen uses the theme; no orphan default-styled surface.

**Acceptance (Pillar 10 gate).** The game has a non-placeholder name, a logo, a themed main menu over a
live 3D backdrop, a settings screen covering audio/difficulty/a11y/controls, and a credits screen; all
localized.

**Architecture notes.** Pure presentation over existing systems; the backdrop reuses the existing camera
bookmark/flythrough machinery (no new engine work).

---

### Suggested execution order (dependency-ordered)

1. **Workstream 1 (Audio)** + **Workstream 2 (Juice)** + **Workstream 3 (HUD)** — the "feel" foundation;
   do these first, together, because they multiply the value of everything already built and unlock
   meaningful playtesting.
2. **Workstream 4 (Inventory/Crafting UX)** — surfaces the existing tested systems.
3. **Workstream 5 (Survival loop)** — deepens the core; needs HUD (3) for vitals.
4. **Workstream 6 (Progression/Onboarding)** — makes it learnable; needs 4 + 5 to have things to teach.
5. **Workstream 8 (World interactivity)** + **Workstream 7 (Content)** — fill it out; 8 needs 4's
   container UI.
6. **Workstream 9 (Perf)** — polish gate once the feature set is in.
7. **Workstream 10 (Presentation)** — the final framing pass and the pre-public rename.

Each workstream is independently shippable and additive; none regresses the base render. Land each as a
coherent commit set with its tests green (the `npm run ci` gate: lint → typecheck → test → arch → build).

---

### Working notes for the implementing LLM

- **Before starting a workstream,** read the actual code it touches — the domain layers listed exist and
  have real tests; match their style. Do not guess file contents.
- **Every new domain concept gets a test first.** The repo's whole identity is TDD + layered purity; a PR
  that adds domain logic without tests will violate the arch gate.
- **Keep i18n and a11y in every UI task** — they are invariants, not extras. New strings go through the
  i18n service in EN/ES/DA.
- **Multiplayer safety:** any new mutation (placeables, farming, eating, doors) must go through the
  host-authoritative intent path already used by dig/build/attack/harvest/tame — never let a joiner
  mutate shared world state locally. This is a security invariant (see the child-safety / netcode
  reviewer agents).
- **Assets:** prefer procedural; otherwise CC0 or `assetfactory`-generated, provenance recorded. Never
  bundle unlicensed art/audio.
- **Update `PROGRESS.md`** — add the `## AAA Definition of Complete` checklist block and keep it live as
  workstreams land (the dashboard reads it).
- **Perf discipline:** any change to the per-frame loop needs a before/after profile with the existing
  `tools/` harness. The finished LAAS engine loop is off-limits (prime directive) — new work is gated
  game-layer code.
