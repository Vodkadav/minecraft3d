/**
 * Design-token layer (Workstream 3, task 3.1) — one source of truth for the
 * HUD/menu visual language: an earthy, outdoors-survival palette (soil browns,
 * moss greens, ember amber) instead of the generic dark-purple-gradient look.
 * Exposed two ways: `THEME` for the rare spot JS needs a raw value (e.g. the
 * ImageBitmap-free procedural crosshair), and `THEME_CSS_VARS` — the actual
 * source of truth — as `:root`-scoped custom properties every component reads
 * via `var(--lw-*)`. `injectStyles` (../styles.ts) includes this string once.
 *
 * Contrast (WCAG AA, computed against the sRGB relative-luminance formula —
 * see the slice report for the exact ratios):
 *  - fg on bg-panel: 14.38:1 (body text)
 *  - fg-muted on bg-panel: 9.43:1 (secondary text)
 *  - accent on bg-panel: 6.52:1 (link/accent text, passes AA for any size)
 *  - focus ring on bg-panel: 11.94:1 (exceeds the 3:1 non-text UI floor)
 *  - vital fills (success/warning/danger) on bg-track: 7.33 / 8.74 / 3.89:1
 *    (all clear the 3:1 non-text-UI-component floor)
 *  - vital bar label: rendered in a translucent dark chip
 *    (--lw-label-chip-bg) over the fill, not directly on the fill color, so
 *    the label text is always fg-on-near-black — worst case (danger fill,
 *    65% black chip) is 12.69:1, comfortably AA even at small text sizes.
 *
 * --- E8.0 visual-language contract (additive, nothing renders these yet) ---
 *
 * Rarity color scale (`THEME.rarity`, `--lw-rarity-<tier>-{frame,text,glow}`):
 * common/uncommon/rare/epic/legendary, a cozy bright palette (not the harsh
 * saturated MMO look). `text` is verified AA body-text contrast (>=4.5:1)
 * against both `bg-panel` and the deepest new surface (`surface-3`); `frame`
 * is verified against the 3:1 non-text-UI-component floor, same convention as
 * the existing focus ring / vital fills. Computed ratios (text on bg-panel /
 * text on surface-3, frame on bg-panel / frame on surface-3):
 *  - common:    11.12:1 / 9.64:1   (text)   4.48:1 / 3.88:1  (frame)
 *  - uncommon:   9.74:1 / 8.45:1   (text)   6.20:1 / 5.37:1  (frame)
 *  - rare:       8.94:1 / 7.75:1   (text)   5.73:1 / 4.97:1  (frame)
 *  - epic:       7.66:1 / 6.64:1   (text)   4.62:1 / 4.01:1  (frame)
 *  - legendary: 10.28:1 / 8.91:1   (text)   6.80:1 / 5.90:1  (frame)
 * `glow` tokens are decorative box-shadow/text-shadow alphas only (never a
 * text-behind or standalone-information pairing — shape + frame + text already
 * carry the AA-verified signal per the existing shape-not-color-only
 * doctrine), so they're intentionally out of the contrast-test scope, same as
 * the existing `--lw-label-chip-bg` shadow-only overlay.
 *
 * Colorblind-safe rarity alt palette (`THEME.rarityColorblind`,
 * `--lw-rarity-cb-<tier>-*`): a parallel token set for a future settings flag
 * (wiring deferred to E8.8). Distinguishes tiers by a monotonic LIGHTNESS
 * ramp within one warm-neutral hue family (not hue), so it reads correctly
 * under any color-vision deficiency; every adjacent tier step is >=12%
 * relative luminance apart (common->uncommon 39%, uncommon->rare 30%,
 * rare->epic 25%, epic->legendary 19%). `THEME.rarityPattern` declares a
 * non-color pattern-hook per tier (none/dot/stripe/diamond/starburst) for
 * E8.2's icon-frame texture — the actual SVG rendering is a later slice, this
 * only fixes the contract each tier maps to.
 *
 * Surface elevation scale (`THEME.surface`, `--lw-surface-0..3`, `--lw-scrim`,
 * `--lw-ornament`, `--lw-inset`): a 4-step warm-brown depth ramp (0 = floor,
 * furthest back, 3 = topmost/popover) replacing the single flat `bg-panel`
 * panels use today (wiring into `Panel.ts`/`styles.ts` is E8.1). `fg` and
 * `fg-muted` stay AA-verified across every step (worst case is surface-3, the
 * lightest/most-recessed-contrast step): fg 11.59:1, fg-muted 7.60:1,
 * accent 5.25:1. `scrim` is the translucent world-dimming overlay behind a
 * window (decorative, not text-bearing). `ornament` is the corner/divider
 * accent line (7.23:1 fg contrast if ever text-bearing, though its intended
 * use is decorative). `inset` is the darkest recessed-well color (item slots,
 * text inputs) — fg 16.70:1, fg-muted 10.95:1, comfortably AA.
 *
 * Window-chrome spec and panel-background recipe (`WINDOW_CHROME_SPEC`,
 * `PANEL_BACKGROUND_RECIPE` below): typed doc-only contracts, consumed by
 * E8.1's `WindowFrame.ts` and `Panel.ts` — no component reads them yet.
 */

/** Ordered rarity tiers, common -> legendary — the single source of truth
 *  every rarity-keyed registry/component iterates against. */
export const RARITY_TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];

/** Non-color differentiator per rarity tier (shape/texture, not hue) for the
 *  colorblind-safe path — see the doc-block above. Rendering lands in E8.2. */
export type RarityPatternHook = "none" | "dot" | "stripe" | "diamond" | "starburst";

type RarityColorSet = Readonly<Record<"frame" | "text" | "glow", string>>;

export const THEME = {
  color: {
    bg: "#151009",
    bgPanel: "#241a12",
    bgTrack: "#0d0b08",
    fg: "#f2ead8",
    fgMuted: "#c9bfa8",
    border: "#4a3c2c",
    accent: "#d98f3c",
    accentHover: "#e8a34f",
    focus: "#ffd166",
    success: "#6fae4a",
    warning: "#d9a441",
    danger: "#c1443a",
    labelChipBg: "rgba(0,0,0,0.65)",
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.5rem",
    6: "2rem",
  },
  radius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.875rem",
    pill: "999px",
  },
  font: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.75rem",
  },
  motion: {
    fast: "120ms",
    base: "200ms",
    slow: "400ms",
  },
  rarity: {
    common: { frame: "#8a8272", text: "#d7d0c2", glow: "rgba(138,130,114,0.45)" },
    uncommon: { frame: "#5fae46", text: "#8fd66a", glow: "rgba(95,174,70,0.45)" },
    rare: { frame: "#3f9fce", text: "#6fc7e8", glow: "rgba(63,159,206,0.45)" },
    epic: { frame: "#a768df", text: "#c99bf0", glow: "rgba(167,104,223,0.45)" },
    legendary: { frame: "#e0932a", text: "#ffbd54", glow: "rgba(224,147,42,0.5)" },
  } satisfies Record<RarityTier, RarityColorSet>,
  rarityColorblind: {
    common: { frame: "#8f8570", text: "#b9ad98", glow: "rgba(143,133,112,0.45)" },
    uncommon: { frame: "#a89b78", text: "#d4c9a8", glow: "rgba(168,155,120,0.45)" },
    rare: { frame: "#bfae82", text: "#e8d9ae", glow: "rgba(191,174,130,0.45)" },
    epic: { frame: "#d4c08a", text: "#f5e6b0", glow: "rgba(212,192,138,0.5)" },
    legendary: { frame: "#e8cf94", text: "#fff3c2", glow: "rgba(232,207,148,0.55)" },
  } satisfies Record<RarityTier, RarityColorSet>,
  rarityPattern: {
    common: "none",
    uncommon: "dot",
    rare: "stripe",
    epic: "diamond",
    legendary: "starburst",
  } satisfies Record<RarityTier, RarityPatternHook>,
  surface: {
    0: "#1c140d",
    1: "#241a12",
    2: "#2e2116",
    3: "#3a291b",
    scrim: "rgba(10,7,4,0.72)",
    ornament: "#5c4830",
    inset: "#0a0806",
  },
} as const;

/**
 * Window-chrome spec (contract for E8.1's `WindowFrame.ts`): every overlay
 * window shares this shell — a header with a `PanelEmblem`, a title, a close
 * button, and an optional tab strip, plus a footer with optional keyhints.
 * Doc-only; no component builds this shell yet.
 */
export const WINDOW_CHROME_SPEC = {
  header: {
    emblem: "required",
    title: "required",
    close: "required",
    tabStrip: "optional",
  },
  footer: {
    keyhints: "optional",
  },
} as const;
export type WindowChromeSpec = typeof WINDOW_CHROME_SPEC;

/**
 * Panel-background recipe (contract for E8.1's `Panel.ts`/`styles.ts` upgrade
 * away from a flat rectangle): a layered CSS gradient (drawn from the
 * `surface` elevation ramp) plus a procedural SVG noise/texture overlay
 * (reusing the `MenuBackdrop.ts` seeded-SVG pattern), static (no animated
 * grain) so it's reduced-motion-safe by construction. Doc-only; no component
 * renders this yet.
 */
export const PANEL_BACKGROUND_RECIPE = {
  layers: ["surfaceGradient", "svgNoiseOverlay", "edgeVignette"],
  reducedMotion: "static-no-animation",
} as const;
export type PanelBackgroundRecipe = typeof PANEL_BACKGROUND_RECIPE;

export const THEME_CSS_VARS = `
:root {
  --lw-bg: ${THEME.color.bg};
  --lw-bg-panel: ${THEME.color.bgPanel};
  --lw-bg-track: ${THEME.color.bgTrack};
  --lw-fg: ${THEME.color.fg};
  --lw-fg-muted: ${THEME.color.fgMuted};
  --lw-border: ${THEME.color.border};
  --lw-accent: ${THEME.color.accent};
  --lw-accent-hover: ${THEME.color.accentHover};
  --lw-focus: ${THEME.color.focus};
  --lw-success: ${THEME.color.success};
  --lw-warning: ${THEME.color.warning};
  --lw-danger: ${THEME.color.danger};
  --lw-label-chip-bg: ${THEME.color.labelChipBg};

  --lw-space-1: ${THEME.space[1]};
  --lw-space-2: ${THEME.space[2]};
  --lw-space-3: ${THEME.space[3]};
  --lw-space-4: ${THEME.space[4]};
  --lw-space-5: ${THEME.space[5]};
  --lw-space-6: ${THEME.space[6]};

  --lw-radius-sm: ${THEME.radius.sm};
  --lw-radius-md: ${THEME.radius.md};
  --lw-radius-lg: ${THEME.radius.lg};
  --lw-radius-pill: ${THEME.radius.pill};

  --lw-font-xs: ${THEME.font.xs};
  --lw-font-sm: ${THEME.font.sm};
  --lw-font-md: ${THEME.font.md};
  --lw-font-lg: ${THEME.font.lg};
  --lw-font-xl: ${THEME.font.xl};

  --lw-motion-fast: ${THEME.motion.fast};
  --lw-motion-base: ${THEME.motion.base};
  --lw-motion-slow: ${THEME.motion.slow};

  --lw-rarity-common-frame: ${THEME.rarity.common.frame};
  --lw-rarity-common-text: ${THEME.rarity.common.text};
  --lw-rarity-common-glow: ${THEME.rarity.common.glow};
  --lw-rarity-uncommon-frame: ${THEME.rarity.uncommon.frame};
  --lw-rarity-uncommon-text: ${THEME.rarity.uncommon.text};
  --lw-rarity-uncommon-glow: ${THEME.rarity.uncommon.glow};
  --lw-rarity-rare-frame: ${THEME.rarity.rare.frame};
  --lw-rarity-rare-text: ${THEME.rarity.rare.text};
  --lw-rarity-rare-glow: ${THEME.rarity.rare.glow};
  --lw-rarity-epic-frame: ${THEME.rarity.epic.frame};
  --lw-rarity-epic-text: ${THEME.rarity.epic.text};
  --lw-rarity-epic-glow: ${THEME.rarity.epic.glow};
  --lw-rarity-legendary-frame: ${THEME.rarity.legendary.frame};
  --lw-rarity-legendary-text: ${THEME.rarity.legendary.text};
  --lw-rarity-legendary-glow: ${THEME.rarity.legendary.glow};

  --lw-rarity-cb-common-frame: ${THEME.rarityColorblind.common.frame};
  --lw-rarity-cb-common-text: ${THEME.rarityColorblind.common.text};
  --lw-rarity-cb-common-glow: ${THEME.rarityColorblind.common.glow};
  --lw-rarity-cb-uncommon-frame: ${THEME.rarityColorblind.uncommon.frame};
  --lw-rarity-cb-uncommon-text: ${THEME.rarityColorblind.uncommon.text};
  --lw-rarity-cb-uncommon-glow: ${THEME.rarityColorblind.uncommon.glow};
  --lw-rarity-cb-rare-frame: ${THEME.rarityColorblind.rare.frame};
  --lw-rarity-cb-rare-text: ${THEME.rarityColorblind.rare.text};
  --lw-rarity-cb-rare-glow: ${THEME.rarityColorblind.rare.glow};
  --lw-rarity-cb-epic-frame: ${THEME.rarityColorblind.epic.frame};
  --lw-rarity-cb-epic-text: ${THEME.rarityColorblind.epic.text};
  --lw-rarity-cb-epic-glow: ${THEME.rarityColorblind.epic.glow};
  --lw-rarity-cb-legendary-frame: ${THEME.rarityColorblind.legendary.frame};
  --lw-rarity-cb-legendary-text: ${THEME.rarityColorblind.legendary.text};
  --lw-rarity-cb-legendary-glow: ${THEME.rarityColorblind.legendary.glow};

  --lw-surface-0: ${THEME.surface[0]};
  --lw-surface-1: ${THEME.surface[1]};
  --lw-surface-2: ${THEME.surface[2]};
  --lw-surface-3: ${THEME.surface[3]};
  --lw-scrim: ${THEME.surface.scrim};
  --lw-ornament: ${THEME.surface.ornament};
  --lw-inset: ${THEME.surface.inset};
}
`;
