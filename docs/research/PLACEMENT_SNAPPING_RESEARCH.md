# Research: Building-Placement & Snapping Patterns (fills open question #3)

> **Status:** Focused deep-research pass complete (2026-07-06). Fills **open question #3** and the
> **§6 evidence gap** in [`BUILD_ON_LAAS_RESEARCH.md`](./BUILD_ON_LAAS_RESEARCH.md). Gates
> implementation milestone **8.5** (placement system) — see
> [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §8.5/8.6/8.7.
>
> ~9 web searches, 6 primary/secondary sources fetched, cross-source adversarial check on every
> load-bearing claim (a single blog's assertion is *not* reported as ✅).
>
> **Confidence legend:** ✅ verified (primary source or ≥2 independent sources agree) · ⚠️ interpretive
> stretch (grounded but not unanimous) · ❌ refuted · 🕳️ **evidence gap** — no verified claim; falls back
> to clearly-labelled domain knowledge, must be re-checked if it becomes load-bearing.
>
> **Scope note:** this pass separates the **pure-logic placement DOMAIN** (renderer-free, unit-testable
> — Opus **[O]**) from the **render adapter [F]** (translucent mesh, GPU raycasting). The last section is
> the concrete build target for 8.5.

---

## 1. Ghost / preview placement

**✅ The universal loop (Rust, Valheim, Satisfactory, Minecraft, every three.js demo agree):**
raycast the pointer/crosshair to a surface → position a **semi-transparent "ghost"/"hologram" clone** of
the piece at the resolved snap position → **tint it green when placement is legal, red when blocked** →
**rotate with a key** → **commit on click**. Rust's preview "turns green when the placement is legal and
red when it is blocked (clipping terrain, no socket, outside build privilege, or unstable)"; Satisfactory
calls the same thing a "build hologram." This green/red + commit-on-click pattern is convergent across all
shipping games surveyed — treat it as settled.
Sources: Rust building guide, Satisfactory wiki/guides, three.js Raycaster docs.

**Domain vs render split (the key architectural finding):**
- **DOMAIN [O]** owns: the *resolved* placement transform (position + rotation) after snapping, the
  **validity result** (valid / blocked + reason), the selected piece's footprint/socket metadata, the
  current rotation state, and the active snap mode. All of this is pure data derived from
  `{hitPoint, hitNormal, hitCell}` + the world occupancy grid.
- **RENDER ADAPTER [F]** owns: the actual translucent `Mesh` + tint material, the **`THREE.Raycaster`
  against live GPU/terrain geometry** that *produces* `{hitPoint, hitNormal, hitCell}`, and cloning the
  real mesh on commit. The domain never touches a `Mesh` or `Raycaster`.

**✅ three.js gives the render adapter exactly what the domain needs.** `THREE.Raycaster` returns
intersection objects carrying the world-space `point` **and** the `face.normal` of the hit surface — the
two inputs the domain snapping functions require. So the render adapter's job is a thin translation:
raycast → `{point, normal, cell}` → hand to domain → get back `{transform, validity}` → paint the ghost.
Source: three.js Raycaster docs (primary).

---

## 2. Rotation

**✅ Discrete step rotation about the up-axis is the shipping standard.** Rust/Valheim/Satisfactory
rotate the ghost in **fixed increments on a key press** (Rust default `R`). The Modular Snap System
(UE) exposes this as per-axis snap angles with a sensible default of **90° about the "connect" axis and
360°/free about the others** — i.e. yaw (about world-up **Y**) is the meaningful rotation for placed
structures; pitch/roll are usually locked for building pieces. **90°** suits blocky/grid pieces; **45°**
is the common "finer" option; **free** rotation is offered mainly for decorative/free-placement pieces.
Sources: Rust guide, Inu Games Modular Snap System docs, Valheim community.

**✅ Rotation interacts with snapping in two distinct ways** (both observed):
1. **Grid/surface mode:** rotation is an *independent* discrete yaw applied to the footprint; snapping
   then re-resolves the occupied cells. For an even-footprint piece, a 90° turn can swap which axis needs
   the half-cell offset (§3) — rotation must be applied *before* footprint→cell resolution.
2. **Socket mode:** rotation is *implied by the match* — aligning the incoming socket to the target
   socket fully determines orientation (§3), so manual rotation instead **cycles between candidate
   snap points / faces** rather than free-spinning. Valheim's build key "changes the centre of rotation
   from the middle of an object to its corners/ends," and Rust's `R` on a wall "flips which face is the
   hard side" rather than free-rotating. ⚠️ Interpretive framing, but consistent across both games.

---

## 3. Smart snapping

Three snap strategies exist; a good system offers all three and lets context pick.

### 3a. Grid snapping ✅
**The formula is universal:** `snapped = round((pos - origin) / cell) * cell + origin`. Confirmed
verbatim-equivalent across Unity docs, gamedevbeginner, and Satisfactory's "1-meter grid" behaviour
(Satisfactory: foundations snap to an **8 m grid** coarse / **1 m grid** fine; all foundation positions
are **defined by their center point**, e.g. a 1 m foundation's surface sits at `N*100 + 50` cm).
Sources: gamedevbeginner (concrete formula), Unity manual, Satisfactory wiki.

**⚠️ Half-cell offset for even footprints.** A piece spanning an **odd** number of cells centers on a
**cell center**; a piece spanning an **even** number of cells centers on a **cell boundary/corner** — so
its anchor must be offset by half a cell on the even axes to stay grid-aligned. gamedevbeginner states
this directly (`snapped += cell/2` to "center on cells rather than edges"); Satisfactory's center-point
math corroborates the parity concern. Tagged ⚠️ because it's a single explicit source + corroborating
math, not a unanimous named pattern — but it is standard and the domain should encode footprint parity.

### 3b. Surface / normal snapping ✅
Raycast to a surface, place at the hit `point`, and **align the piece's up-vector to the hit face
normal**. three.js does this with `Quaternion.setFromUnitVectors(fromDir, toNormal)` (built-in) or the
tiny `three-quaternion-from-normal` helper. This is the "stick it flat on any slope/wall" behaviour.
The quaternion math is pure and can live in the domain; only the *raycast that yields the normal* is [F].
Sources: three.js Quaternion docs, three.js issue #1486, mattdesl/three-quaternion-from-normal.

### 3c. Snap-point / socket systems ✅ (the richest pattern — how shipping games do modular building)
A piece carries a set of **sockets**: named/typed local anchor points, each with an **outward direction
(forward vector)**. Placement snaps by matching a socket on the incoming piece to a socket on a nearby
placed piece. The **canonical matching algorithm** (Inu Games Modular Snap System — the most detailed
primary source, corroborated by Rust's socket model and Unity survival-building tutorials) is three
geometric predicates + a nearest-selection:

1. **Type/name match** — compare the socket **type tag** (name before `_`), case-insensitive. Optional
   **polarity**: `Door+` matches `Door−`, neutral `Door` matches both, but `Door+` never matches `Door+`.
   This encodes "a wall edge connects to a wall edge, not to a roof."
2. **Distance** — only target sockets within a **search radius** (sphere query) around each incoming
   socket are candidates.
3. **Angle / anti-parallel** — the two sockets' **forward vectors must point roughly opposite** (within a
   `maxAngle` tolerance, default ~75°). Two sockets connect only when their outward directions are
   roughly anti-parallel — a socket facing `+Y` mates with one facing `−Y`, never another `+Y`.
4. **Nearest wins** — of all candidates passing 1–3, the **closest** is chosen; the piece is then
   translated+rotated so the two sockets share the same world location and orientation.

**Shipping-game confirmations:**
- **Valheim** ✅ — pieces expose **multiple discrete snap points** you cycle through (a stone brick has
  **8**); snapping locks the pivot to a chosen corner/end; `Shift` places free (no snap). (Multiple
  community sources converge; core mechanic verified, exact counts are per-piece data.)
- **Rust** ✅ — foundations expose **wall sockets on their four edges + a floor socket above**; walls
  expose sockets on each vertical edge + top. **You cannot place a wall in mid-air — it must snap to a
  socket.** Nudging the crosshair picks which candidate socket locks.
- **Fortnite/Satisfactory** ✅ (weaker on Fortnite specifics) — foundation pieces expose a **grid of
  snap points**; deployables snap "into the right positions on floors and against walls."
- **Minecraft/voxel** ✅ — the degenerate case: the "socket" is the **face of the targeted block**, and
  the piece drops into the **adjacent empty integer cell**. Axis-aligned integer grid, `placement_filter`
  can restrict `allowed_faces`. This is grid-snapping with cell size = 1 and face-based adjacency.
Sources: Inu Games MSS docs, Rust guide, Valheim community, Satisfactory wiki, Microsoft Learn (Bedrock
block placement/voxel shapes).

---

## 4. Validity / collision — cheap geometric predicates (all domain)

Every game's green/red verdict decomposes into **cheap, pure predicates over the occupancy grid + piece
footprint** — no physics solver needed. From the Rust reason list ("clipping terrain, no socket, outside
build privilege, unstable") plus Satisfactory/Minecraft:

- **Overlap** — does the piece's occupied cell-set intersect any already-occupied cell? (cell-set
  intersection, or AABB-vs-AABB). ✅ Minecraft uses axis-aligned bounding boxes / voxel shapes for exactly
  this; cheap and exact on a grid.
- **Support / not floating** — is there a solid cell beneath, or an adjacent structural socket? ("cannot
  place a wall in mid-air"). ✅
- **Boundary** — are all occupied cells inside the world/build boundary (ties into M2.3 boundary radius)?
- **Below-floor / terrain-clip** — for the hybrid voxel world, is the piece inside the non-editable
  heightfield or below the subterranean floor?

All four are **O(footprint) integer/vector predicates** — ideal for the domain layer and trivially
unit-testable against an in-memory occupancy fake. The *only* part that isn't cheap-and-pure is testing
overlap against arbitrary rendered triangle soup — but on a voxel/grid world we test against the
occupancy grid (domain data from M8.1), so we stay pure.

---

## 5. Physics building vs kinematic snap-and-stay

**✅ The terms mean two genuinely different things:**
- **Kinematic snap-and-stay** — the piece is placed by **setting its transform** and then it simply
  *stays* (Minecraft, Valheim, Rust, Satisfactory, Fortnite Creative builds are all fundamentally this).
  In physics terms these are **kinematic/static bodies**: they "exist in the physics world but defy the
  laws of physics — they move without forces." Stability, if modelled at all, is a **discrete rule**
  (Rust "stability" is a support-propagation heuristic, not a rigid-body simulation).
- **Physics/structural building** — pieces are **dynamic rigid bodies** in a solver (Rapier/cannon-es)
  that can sag, topple, or collapse under load (Besiege, Fortnite's destructible structures, bridge
  builders). This needs a real physics step every frame and is **non-deterministic** across machines/
  timesteps unless carefully fixed.
Sources: Rapier docs (kinematic vs dynamic bodies), Rust building guide (rule-based stability).

### Recommendation (trade-offs)
> **For this Minecraft-style survival sandbox with a swappable-asset ethos: kinematic snap-and-stay, with
> rule-based support checks in the domain. Do NOT reach for Rapier/cannon-es for building.**
>
> - **Kinematic snap-and-stay [recommended]** — Pros: **deterministic** (essential for the M7 P2P
>   host-authority + seed/delta persistence model — every peer must resolve the same placement from the
>   same inputs); **pure and unit-testable** (placement is geometry, no solver, no frame budget);
>   **asset-swappable** (validity comes from declarative footprint/socket *metadata*, so swapping a mesh
>   never re-tunes a collider). Cons: no emergent "it collapsed" drama — but the brief doesn't ask for it.
> - **Physics/structural (Rapier)** — Pros: emergent collapse/sag, realistic. Cons: non-deterministic
>   (breaks P2P determinism + seeded reproducibility), a per-frame cost against the mobile 60fps budget,
>   hard to unit-test, and forces every swappable asset to ship a tuned collider. Wrong fit here.
>
> Keep Rapier as an **optional, later, opt-in layer** *only if* structural collapse ever becomes a design
> goal — @dimforge/rapier3d is Apache-2.0 (commercial-safe) and already vetted in the ecosystem. It is
> not needed for 8.5.

---

## 6. three.js-specific libraries & reference implementations (license-checked, free-only)

**🕳️ No off-the-shelf JS/three.js building-placement/socket library surfaced** that is a drop-in fit.
The reusable pieces are primitives, not a system — so per the reuse-before-build carve-out, **build the
placement domain ourselves** (thin, pure, testable) and reuse only these primitives:

| Primitive | License | Use |
|---|---|---|
| `THREE.Raycaster` (built-in) | MIT | Render adapter: pointer → `{point, face.normal}`. ✅ |
| `THREE.Quaternion.setFromUnitVectors` (built-in) | MIT | Surface-normal alignment (§3b). Prefer over a dep. ✅ |
| `mattdesl/three-quaternion-from-normal` | MIT | Optional helper if the built-in is awkward. |
| `WesUnwin/three-game-engine` | MIT | **Reference only** (three.js + Rapier wiring); not a dependency. |
| `@dimforge/rapier3d` | Apache-2.0 | Only if the optional physics path (§5) is ever chosen. Commercial-safe. |
| Inu Games Modular Snap System | (UE plugin, paid) | **Algorithm reference only** (§3c) — we reimplement the math, we do not use the plugin. |

All recommended primitives are MIT/Apache-2.0 → commercial-safe. The socket-matching algorithm (§3c) is
the one non-trivial thing to author, and it's ~40 lines of pure vector math.

---

## Source table

| Angle | Source | Quality |
|---|---|---|
| Ghost/preview, sockets, rotation, stability | Rust building guide (rust-survival.com) | secondary (game-specific, corroborated) |
| Grid formula, half-cell, surface raycast, edge snap | gamedevbeginner.com "How to snap objects" | secondary (concrete code) |
| Grid snapping, world grid | Unity Manual — Scene view grid snapping | primary |
| Foundation grid, center-point math, soft clearance | Satisfactory wiki / Steam guides | secondary (game docs) |
| Socket matching algorithm (name/distance/angle/polarity) | Inu Games Modular Snap System docs | secondary (most detailed) |
| Grid vs socket vs free trade-offs, "connection awareness" | StraySpark UE5 snapping comparison (2026) | secondary |
| Snap points, cycling, corner pivot, Shift-free-place | Valheim community (pcgamesn, valheimians, Steam) | community (converged) |
| Voxel grid, face adjacency, AABB, placement_filter | Microsoft Learn — Bedrock voxel shapes / Place Block | primary |
| Raycaster point+normal | three.js docs — Raycaster | primary |
| Normal alignment via quaternion | three.js docs — Quaternion; issue #1486; three-quaternion-from-normal | primary + repo |
| Kinematic vs dynamic bodies | rapier.rs docs | primary |
| three.js+Rapier engine (MIT reference) | github.com/WesUnwin/three-game-engine | primary (repo/license) |

---

## What this means for the 8.5 domain model

The placement **DOMAIN [O]** (pure, TDD'd, renderer-free) should expose these value objects and pure
functions. Everything here is testable against an in-memory occupancy fake with zero three.js imports.

**Value objects (immutable):**
- **`GridSpec`** — `{ cellSize: Vec3, origin: Vec3 }` (the world's build grid; cell size 1 for the voxel
  layer, larger for foundation-style pieces).
- **`Footprint`** — cell extents `{ w, d, h }` + per-axis **parity** (odd/even), plus a method to yield
  the set of occupied cells given an anchor cell and a `RotationState`. Encodes the §3a half-cell offset.
- **`RotationState`** — discrete **yaw about world-up Y**: `{ stepDeg: 90 | 45, index }` with
  `rotate(±1)`, `toQuaternion()` (pure), and `applyToFootprint()`. (Pitch/roll locked for building
  pieces.)
- **`SnapPoint` (socket)** — `{ localOffset: Vec3, outwardDir: Vec3, type: string, polarity: '+'|'-'|'0' }`.
- **`PieceDef`** — a piece's declarative metadata: `Footprint` + `SnapPoint[]` + support rule. **This is
  the swappable-asset seam** — swapping the mesh never changes this; validity reads only this.
- **`PlacementValidity`** — a **Result-style** type: `Valid` | `Blocked{ reasons: BlockReason[] }` where
  `BlockReason ∈ { Overlap, NoSupport, OutOfBounds, TerrainClip, BelowFloor, NoSocket }`
  (models expected failures as values per the explicit-error rule).
- **`PlacementMode`** — `Grid | Surface | Socket`.
- **`PlacementState`** (small aggregate) — `{ pieceDef, mode, rotation, resolvedTransform, validity }`;
  `commit()` returns a `PlacePieceCommand` (pure) for the M8.1 chunk store to apply.

**Pure functions:**
- **`snapToGrid(worldPos, gridSpec, footprint): Vec3`** — `round((p-origin)/cell)*cell+origin` with the
  even-footprint half-cell offset baked in.
- **`snapToSurface(hitPoint, hitNormal, up): { position: Vec3, orientation: Quat }`** — position at hit,
  orientation via `setFromUnitVectors(up, hitNormal)`.
- **`matchSocket(incomingSockets, candidateSockets, searchRadius, maxAngleDeg): SnapMatch | null`** — the
  §3c algorithm: filter by type+polarity, then within `searchRadius`, then forward-vectors anti-parallel
  within `maxAngleDeg`; pick nearest; return the aligning `{ translation, rotation }`.
- **`resolvePlacement(hit, mode, pieceDef, rotation, world): PlacementState`** — the orchestrator that
  picks the snap strategy and produces transform + validity.
- **Validity predicates** (each pure, over the occupancy grid + occupied cell-set):
  `overlaps(cells, occupancy)`, `hasSupport(cells, occupancy, supportRule)`,
  `withinBoundary(cells, boundaryRadius)`, `isBelowFloor(cells, floorDepth)`.

**Explicitly render-adapter [F] concerns (NOT in the domain, NOT unit-tested with the domain):**
- The **translucent ghost `Mesh`** and its **green/red tint material**.
- The **`THREE.Raycaster` against live GPU/terrain geometry** that produces the `{ point, normal, cell }`
  input the domain consumes. (The domain is handed the *result*, never the meshes.)
- **Cloning/instantiating the real mesh** on commit and any placement VFX/SFX.
- Reading occupancy is **domain data** (M8.1 chunk store), but resolving a ray against the *rendered*
  surface is [F].

**Test seam:** the render adapter is a thin port — `raycast(pointer) → { point, normal, cell } | null`.
Feed the domain synthetic hits and assert on `PlacementState.validity` and `resolvedTransform`. That is
the entire 8.5 test surface, and it needs no WebGPU.
