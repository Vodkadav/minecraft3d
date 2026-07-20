# ADR 0005 — Procedural visual-language v2: rarity tokens, window chrome, rich tooltip & context-menu architecture

Date: 2026-07-20 · Status: accepted · Extends: ADR 0002 (multiplayer), ADR 0003 (host-authoritative
streaming) conventions where they apply to wire-touching UI; builds on the existing
`ui/theme/tokens.ts` token layer rather than replacing it.

## Context

Pre-E8, Diggy World's UI is functionally complete but visually thin: panels are flat
`bg-panel` rectangles with no depth, item icons are first-letter SVG glyphs
(`ui/icons/ItemIconSpec.ts`), tooltips are a single line (`ui/components/Tooltip.ts`), and the only
item interaction beyond click is a hardcoded right-click *stack split* in
`ui/components/InventoryGrid.ts` — there is no general-purpose context menu, no rarity/quality
language anywhere in the item model, and `PanelEmblem.ts` covers only a handful of screens. The E9
itemization wave (rarity tiers, affixes, equipment) is coming and needs a rarity color language and
an item-card tooltip to render into; building those ad hoc per-screen would fragment the one
injected stylesheet's discipline. This ADR freezes the E8 visual-language contract so E8's later
phases and E9's rarity/equipment UI build against the same seams instead of each inventing one.

## Decision

1. **Procedural-only, zero binary assets.** No PNG/binary art pipeline is introduced. All richer
   visuals — rarity frames, layered gradients, authored glyph paths, panel textures, emblems — are
   SVG/CSS generated at render time from the existing deterministic (FNV-1a hash seed) + theme-token
   conventions already used by `ItemIconSpec.ts`, `MarkerGlyphs.ts`, and `MenuBackdrop.ts`. This
   extends the prime directive's zero-asset invariant to the new surfaces rather than carving an
   exception.
2. **Rarity tokens + surface elevation are a frozen contract.** `ui/theme/tokens.ts` gains a
   `common/uncommon/rare/epic/legendary` color scale (frame + text + glow per tier, AA-contrast
   documented like the existing pairs) and a surface elevation scale (`--lw-surface-0..3`,
   `--lw-scrim`, `--lw-ornament`, `--lw-inset`), plus a colorblind-safe rarity alt palette behind a
   settings flag. These tokens are the single source of truth for rarity rendering everywhere
   (icons, tooltips, chat links, E9's equipment screens) — no screen invents its own rarity color.
3. **Shared-component seams, not per-screen rewrites.** Four new shared primitives own their slice
   of the visual language, and every existing/future screen composes them rather than reimplementing:
   - `ui/components/WindowFrame.ts` — the overlay-window shell (scrim, header with emblem/title/
     close, optional tab strip, footer keyhints). Every overlay screen (`InventoryScreen`,
     `CharacterScreen`, `BankScreen`, `ResearchScreen`, `MapScreen`, and the `components/`
     `ChestScreen`/`CampfireScreen`/`TradeScreen`) migrates onto it.
   - `ui/components/RichTooltip.ts` (backed by pure `domain/ui/TooltipModel.ts`) — the structured
     item-card tooltip, replacing single-line `Tooltip.ts` for item hovers specifically;
     `Tooltip.ts` stays for plain one-liners (buttons).
   - `ui/components/ContextMenu.ts` (backed by pure `domain/ui/ItemActions.ts`) — the accessible
     action menu (right-click / `Shift+F10` / long-press), replacing the ad-hoc `contextmenu` split
     handler in `InventoryGrid.ts`.
   - `ui/components/Field.ts` — the one styled text-input/select/number primitive, consolidating the
     per-screen input CSS already duplicated across `styles.ts`.
   Coupled with the token layer, this means a re-theme or a-11y fix at the primitive level
   propagates to every screen through the single injected stylesheet — the same low-risk lever the
   original token layer (`ui/theme/tokens.ts`'s design doc-block) was built for.
4. **Shape-not-color-only accessibility doctrine, extended.** The existing `MarkerGlyphs.ts`
   convention — shape is the primary differentiator, color is secondary — extends to rarity: icon
   silhouette/category is shape-differentiated regardless of rarity tier; the rarity frame adds
   color + a distinct frame/glow treatment on top, never as the sole signal. This is a hard
   requirement for the colorblind alt palette to be meaningful rather than cosmetic.
5. **Extends, does not replace, the existing token layer.** `THEME`/`THEME_CSS_VARS` in
   `ui/theme/tokens.ts` gain new keys; no existing `--lw-*` variable is renamed or removed, so every
   current screen keeps rendering unchanged until it's migrated onto the new primitives phase by
   phase (E8.1–E8.8). This mirrors ADR 0004 §5's "additive, no migration" posture for `ItemDefinition`.

## Alternatives considered

- **Per-screen ad hoc rarity styling** — rejected: would fragment the single-stylesheet discipline
  the token layer exists to enforce, and would leave E9's equipment/tooltip work with no shared
  contract to build against.
- **A binary icon-atlas pipeline for richer iconography** — rejected: violates the owner's
  procedural-only decision (program owner decision #1) and the prime directive's zero-asset
  invariant; procedural SVG/CSS was judged sufficient for AAA-cozy fidelity at this scope.
- **Color-only rarity differentiation** — rejected: fails the existing shape-not-color-only a11y
  doctrine and the colorblind audience; frame/shape treatment is mandatory alongside color.
- **Rebuilding the token layer from scratch** — rejected: the existing `THEME`/`THEME_CSS_VARS`
  layer with its documented AA-contrast ratios is sound; extending it additively is lower-risk than
  a rewrite and keeps every already-passing contrast guarantee intact.

## Consequences

- `ui/theme/tokens.ts` grows a rarity scale + surface elevation scale + colorblind alt palette,
  each needing its own AA-contrast documentation and a `tokens.test.ts` completeness/contrast
  assertion (E8.0) — the same discipline the existing token pairs already carry.
- Four new shared components (`WindowFrame`, `RichTooltip`, `ContextMenu`, `Field`) become the load-
  bearing seams for E8.1–E8.8 and for E9's equipment/tooltip UI; a change to any of them ripples to
  every consuming screen, so their tests need to be thorough before screens migrate onto them.
- `ui/icons/PanelEmblem.ts` grows from a handful of emblems into a per-screen emblem library plus a
  seeded party/faction crest generator — still deterministic and theme-reactive, no new state.
- The one wire-touching surface this ADR's scope introduces is E8.5's chat item-link chip (an
  already-owned item id rendered as a rarity-colored link) — light validation only, tracked in
  `docs/UX_PLAN.md`'s security-follow-ups section, security-reviewed before merge.
- E9's rarity/equipment work (ADR 0006, forthcoming) consumes these tokens and components rather
  than inventing its own — the coordination seam is explicitly the token layer + the four shared
  components, not a shared file both waves edit concurrently.
