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
 */

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
} as const;

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
}
`;
