# Diggy World UI/UX Plan (E8)

The UI/UX overhaul wave: window chrome + procedural backgrounds, richer iconography, a rich
tooltip/item-card system, context menus, input/chat polish, a menus/lobby/settings restyle, HUD
cohesion, and an accessibility/colorblind pass — every element made to read AAA-cozy while staying
procedural-only and kid-friendly (~11-year-old audience). Live status: the `## UI/UX (E8)`
checklist in [`PROGRESS.md`](../PROGRESS.md). Architecture decision:
[ADR 0005](adr/0005-procedural-visual-language-v2.md).

Reuse-first: this wave mostly *upgrades* the existing token layer (`ui/theme/tokens.ts`) and
shared component layer (`ui/styles.ts` + `ui/components/*`) rather than rewriting the ~18 existing
screens — because every screen already reads through the single injected stylesheet, a re-theme at
the token/primitive level is low-risk and propagates automatically.

## Locked design decisions

- **Procedural-only art** — no binary/PNG pipeline (owner decision #1 of the program). Investment
  goes into richer SVG/CSS: rarity frames, layered gradients, authored per-category glyph paths,
  animated emblems, procedural panel backgrounds. Everything stays theme-reactive and deterministic
  (the existing FNV-1a seeded-icon convention). Zero-asset invariant holds.
- **AAA-cozy visual language** — window chrome (header emblem + title + close + optional tab strip
  + footer keyhints), layered procedural backgrounds (no flat-black panels), and a surface
  elevation scale so panels read with depth — while staying warm/earthy, never sterile or
  aggressive, matching the existing palette.
- **Rarity color language** — a `common/uncommon/rare/epic/legendary` frame + text + glow token
  scale, AA-contrast-verified like the existing token pairs, plus a colorblind-safe alt palette
  behind a settings flag. Shape (icon silhouette/frame shape), not color alone, carries the primary
  differentiation — matching the existing `MarkerGlyphs` doctrine.
- **Rich tooltips + context menus** — every item gets a structured tooltip "card" (icon, rarity
  name, stat/affix rows, keyhints) reachable by hover, keyboard focus, and touch long-press; and an
  accessible action menu (right-click / `Shift+F10` / long-press) replacing the ad-hoc
  `InventoryGrid` split-only `contextmenu` handler.
- **Prime directive unchanged** — the no-flags desktop LAAS boot never regresses; `domain/**` stays
  Three.js-free; everything additive and flag/preset/composition-gated; engine dirs
  (`src/{core,render,gpu,world,sky,vegetation,debug}`) stay off-limits.
- **Mandatory security review** (`claude-infra:security`) for E8.5's chat item-links — the one
  wire-touching bit in this wave.

## Phases

| Phase | Content | Status |
|---|---|---|
| E8.0 Visual-language contract | Rarity color scale + surface elevation tokens, window-chrome spec, panel-background recipe, colorblind rarity alt palette — types/tokens only, no behavior | ✅ Done (17b00d4) |
| E8.1 Window chrome & procedural backgrounds | `WindowFrame` shared overlay shell; every overlay screen migrates onto it; layered-gradient + SVG-noise panel backgrounds replace flat rectangles | ✅ Done (50b2216, 2801cca, f88daad) |
| E8.2 Iconography v2 | Authored per-category glyph paths, rarity frame ring, overlay badges (equipped/new/qty); `PanelEmblem` grows into a per-screen emblem library + party/faction crest generator | ✅ Done (9e2b0c9; badge slot-wiring deferred — no state source) |
| E8.3 Rich tooltip system | Pure `domain/ui/TooltipModel.ts` item-card model; `RichTooltip` component (hover/focus/long-press) replaces single-line hovers for items everywhere | ✅ Done (7dfed91) |
| E8.4 Context menus | Pure `domain/ui/ItemActions.ts` action list; `ContextMenu` component (mouse/keyboard/touch), replacing the `InventoryGrid` split-only handler | ✅ Done (1c3c087) |
| E8.5 Inputs & chat polish | Shared `Field.ts` input primitive; chat gains rarity-colored item links, channel pills, unread badge, kid-safe canned emote palette | Pending |
| E8.6 Menus, lobby & settings overhaul | `MainMenuView`/`LobbyView`/`SettingsView`/`CreditsScreen`/`LoadingScreen` restyle onto E8.1 chrome; Settings UI category (hud style, tooltip verbosity, colorblind palette, reduce-flair); lobby becomes the "play together" surface | Pending |
| E8.7 HUD cohesion & action bar | Unify hotbar/vitals/minimap/objective/party/combat-meter into one visual system; togglable ability/consumable action bar; gentle buff/effect strip; toasts restyled | 🟡 Partial — components built, composition-root wiring deferred (see below) |
| E8.8 Accessibility, responsive & colorblind pass | Wire `--lw-*` tokens under `[data-high-contrast="true"]` (closes the recorded gap); ship colorblind rarity palette; full keyboard nav + ARIA for chrome/tooltip/menu; mobile layouts | Pending |

## Dependency order

```
E8.0 Visual-language contract (tokens) ─┬─► E8.1 Window chrome & backgrounds ─┬─► E8.6 Menus/lobby/settings
                                         ├─► E8.2 Iconography v2              ├─► E8.7 HUD cohesion
                                         ├─► E8.3 RichTooltip ─┐              └─► E8.8 A11y/responsive/colorblind
                                         └─► E8.4 ContextMenu ─┴─► E8.5 Inputs & chat polish
```

E8.0 lands first, small and stable, so the rest of E8 (and E9's rarity system) build against frozen
seams. E8.1/E8.2 are the substrate every later screen restyle depends on; E8.3/E8.4 are the shared
item-interaction primitives E8.5's chat links and E9's equipment tooltips reuse.

## How to add a screen/component

**Overlay windows (E8.1+).** Build the shell with `components/WindowFrame.ts`, never a
hand-rolled `lw-inv-header`. Pass `{ doc, title, close: { label, ariaLabel, onClose }, body }`;
append the returned `frame.panel` into your own `role="dialog"` overlay wrapper (the wrapper,
Escape handling, and pointer-lock release stay per-screen — they're not chrome). Optional slots:
`emblem` (a `PanelEmblemKind`), `headerExtra` (a pre-built tab strip — you keep its state/handlers),
`titleVisuallyHidden: true` (tab-dominant windows keep the title as the a11y heading only),
`headerActions` (extra header buttons before close, e.g. Map's recenter), `keyhints` (footer chips).

**Panels & backgrounds.** Everything themed reads `var(--lw-*)` and sits inside `.lw-panel`
(via `Panel`/`WindowFrame`), which owns the procedural background — don't set per-panel
`background`. New surfaces use the `--lw-surface-0..3` / `--lw-inset` elevation ramp.

**Visual QA — import the real styles, never scrape them.** `THEME_CSS_VARS`/`UI_STYLES` are
template literals with `${THEME.*}` interpolations that only resolve when the TS module is
imported. A preview harness must `import { UI_STYLES } from ".../styles"` (run via `tsx`) — copying
the template *source* text yields a themeless page where every `--lw-*` var is a literal `${...}`
string (learned the hard way in E8.1). Judge panels over a *dimmed-world* backdrop, not pure black:
overlays sit over the lit world at ~45%, so a pure-black preview reads far darker than reality.

## Security follow-ups

- **E8.5 chat item-links** — the one wire-touching bit in this wave. A shift-click item link is
  just an item id the sender already owns (no new payload shape beyond what chat already carries);
  requires light validation that the linked id is a real, ownable item before it renders as a
  clickable chip, and a `claude-infra:security` review before merge. All other E8 phases are
  local-only presentation/DOM work with no new wire surface.

## Standing deferrals (recorded, not skipped)

- **Item rarity source (E8.2/E8.3)** — items carry no explicit `rarity` field, only a progression
  `tier` (`domain/items/ItemDefinition`). The single rarity source is `ui/icons/ItemRarity.ts`
  (`rarityTierForItemTier`: tier 0→common … 4+→legendary), the honest proxy. Both the icon rarity
  ring (`ItemIconElement` `rarityTier` param) and the tooltip (`domain/ui/TooltipModel.ts`
  `buildTooltipModel`, which defaults to `"common"` and takes a `rarityTier` override) consume it —
  wired at the E8 integration step. A real per-item rarity field (and UI to assign/roll it) is E9's
  itemization wave, which only has to set the tier the override param already threads.
- **E8.2 slot-wiring of rarity rings + badges** — the ring/badge *capabilities* landed
  (`ItemIconElement` optional `rarityTier`; `ItemBadges.ts`); wiring them onto the actual inventory/
  hotbar slots was deferred to the E8 integration step because `InventoryGrid.ts`/`Hotbar.ts` were
  being edited in parallel by the E8.3/E8.4 slices — done at integration to avoid a three-way conflict.
- **E8.7 HUD cohesion & action bar's composition-root wiring.** `ActionBar.ts`/`BuffStrip.ts` (+ the
  pure `domain/ui/ActionBarState.ts`/`BuffStripState.ts` they're backed by) are built and tested but
  not mounted anywhere live: the only place that composes the play HUD's panels together
  (`mountCombatMeterPanel`/`mountPartyPanel`/`mountAttackMeter`, etc.) is `src/debug/TerrainScene.ts`,
  an engine dir the prime directive puts off-limits to additive game-code slices. Also deferred:
  per-ability client-side cooldown tracking (E7.3 built host-authoritative cast resolution only, no
  client cooldown clock — `ActionBarState.buildAbilitySlots` accepts a `readyFractions` override ready
  for one) and a real buff/status-effect source (none exists yet — `BuffStrip.render` takes a plain
  chip array ready for whenever one lands). Revisit at the E8 integration step, same posture as E8.2's
  badge slot-wiring deferral above.
- **E8.4 ContextMenu's Use/Equip actions are UI-only stubs.** `ItemActions.ts` offers "Eat" for
  food-tagged items and "Equip" for weapon-tagged items (enabled whenever the tag applies), and
  `InventoryGrid.ts` exposes `onUseItem`/`onEquipItem` extension hooks — but nothing wires them yet:
  eating today is `GameHud`'s hotbar-only `eatSelected` (no eat-from-arbitrary-slot exists), and
  there's no equip-slot system before E9's equipment work. Mirrors `onExternalDrop`'s existing
  "unused until a second grid exists" pattern. Split/Quick-Move/Drop/Info are fully wired against
  existing domain operations. Revisit once E9 (equipment) or a generalized eat-from-inventory flow
  lands.
