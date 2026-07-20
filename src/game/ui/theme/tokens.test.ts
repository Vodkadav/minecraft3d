import { describe, expect, it } from "vitest";
import {
  PANEL_BACKGROUND_RECIPE,
  RARITY_TIERS,
  THEME,
  THEME_CSS_VARS,
  WINDOW_CHROME_SPEC,
} from "./tokens";

const EXPECTED_VARS = [
  "--lw-bg",
  "--lw-bg-panel",
  "--lw-bg-track",
  "--lw-fg",
  "--lw-fg-muted",
  "--lw-border",
  "--lw-accent",
  "--lw-accent-hover",
  "--lw-focus",
  "--lw-success",
  "--lw-warning",
  "--lw-danger",
  "--lw-label-chip-bg",
  "--lw-space-4",
  "--lw-radius-md",
  "--lw-font-md",
  "--lw-motion-base",
];

describe("theme tokens", () => {
  it("defines every custom property the component kit depends on", () => {
    for (const name of EXPECTED_VARS) {
      expect(THEME_CSS_VARS, name).toContain(`${name}:`);
    }
  });

  it("keeps the TS accessor in sync with the emitted CSS values", () => {
    expect(THEME_CSS_VARS).toContain(THEME.color.bgPanel);
    expect(THEME_CSS_VARS).toContain(THEME.color.accent);
    expect(THEME_CSS_VARS).toContain(THEME.color.danger);
  });
});

// --- E8.0 visual-language contract -----------------------------------------

/** WCAG 2.x contrast-ratio helper (sRGB relative-luminance formula), the same
 *  formula the tokens.ts doc-block ratios are computed against. Accepts hex
 *  (#rgb/#rrggbb) only — the new tokens' text/frame pairs are all opaque hex;
 *  `glow` tokens are decorative rgba and are deliberately out of scope
 *  (see the doc-block). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Contrast ratio between two hex colors, per WCAG's (L1+0.05)/(L2+0.05). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;
const AA_UI_COMPONENT = 3.0;

describe("contrastRatio helper", () => {
  // Sanity-check the helper itself against the doc-block's already-recorded
  // existing ratios before trusting it for the new tokens below.
  it("reproduces the documented existing fg/accent/danger ratios", () => {
    expect(contrastRatio(THEME.color.fg, THEME.color.bgPanel)).toBeGreaterThan(14);
    expect(contrastRatio(THEME.color.accent, THEME.color.bgPanel)).toBeGreaterThan(6);
    expect(contrastRatio(THEME.color.danger, THEME.color.bgTrack)).toBeGreaterThan(3.8);
  });
});

describe("rarity color scale", () => {
  it("defines a frame/text/glow token for every rarity tier, primary and colorblind-safe", () => {
    for (const tier of RARITY_TIERS) {
      expect(THEME.rarity[tier], tier).toMatchObject({
        frame: expect.any(String),
        text: expect.any(String),
        glow: expect.any(String),
      });
      expect(THEME.rarityColorblind[tier], `cb-${tier}`).toMatchObject({
        frame: expect.any(String),
        text: expect.any(String),
        glow: expect.any(String),
      });
      expect(THEME.rarityPattern[tier], `pattern-${tier}`).toEqual(expect.any(String));
    }
  });

  it("keeps every rarity text token >=4.5:1 against bg-panel and the deepest surface", () => {
    for (const tier of RARITY_TIERS) {
      const text = THEME.rarity[tier].text;
      expect(contrastRatio(text, THEME.color.bgPanel), `${tier} on bg-panel`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(text, THEME.surface[3]), `${tier} on surface-3`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps every rarity frame token >=3:1 (non-text UI floor) against bg-panel and the deepest surface", () => {
    for (const tier of RARITY_TIERS) {
      const frame = THEME.rarity[tier].frame;
      expect(contrastRatio(frame, THEME.color.bgPanel), `${tier} on bg-panel`).toBeGreaterThanOrEqual(
        AA_UI_COMPONENT,
      );
      expect(contrastRatio(frame, THEME.surface[3]), `${tier} on surface-3`).toBeGreaterThanOrEqual(
        AA_UI_COMPONENT,
      );
    }
  });

  it("keeps every colorblind-safe rarity text/frame token AA-compliant the same way", () => {
    for (const tier of RARITY_TIERS) {
      const { text, frame } = THEME.rarityColorblind[tier];
      expect(contrastRatio(text, THEME.color.bgPanel), `cb-${tier} text on bg-panel`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(frame, THEME.color.bgPanel), `cb-${tier} frame on bg-panel`).toBeGreaterThanOrEqual(
        AA_UI_COMPONENT,
      );
    }
  });

  it("orders the colorblind-safe palette by strictly increasing luminance (lightness carries the tier, not hue)", () => {
    const luminances = RARITY_TIERS.map((tier) => relativeLuminance(THEME.rarityColorblind[tier].text));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!, `${RARITY_TIERS[i]} lighter than ${RARITY_TIERS[i - 1]}`).toBeGreaterThan(
        luminances[i - 1]!,
      );
    }
  });
});

describe("surface elevation scale", () => {
  const surfaces = [THEME.surface[0], THEME.surface[1], THEME.surface[2], THEME.surface[3]];

  it("defines the 0..3 ramp plus scrim/ornament/inset", () => {
    for (const s of surfaces) expect(s).toEqual(expect.any(String));
    expect(THEME.surface.scrim).toEqual(expect.any(String));
    expect(THEME.surface.ornament).toEqual(expect.any(String));
    expect(THEME.surface.inset).toEqual(expect.any(String));
  });

  it("keeps fg and fg-muted AA-compliant on every surface step and inset", () => {
    for (const s of [...surfaces, THEME.surface.inset]) {
      expect(contrastRatio(THEME.color.fg, s), `fg on ${s}`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(THEME.color.fgMuted, s), `fg-muted on ${s}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("emits every surface/scrim/ornament/inset custom property", () => {
    for (const name of [
      "--lw-surface-0",
      "--lw-surface-1",
      "--lw-surface-2",
      "--lw-surface-3",
      "--lw-scrim",
      "--lw-ornament",
      "--lw-inset",
    ]) {
      expect(THEME_CSS_VARS, name).toContain(`${name}:`);
    }
  });
});

describe("rarity custom properties", () => {
  it("emits a frame/text/glow property for every tier, primary and colorblind-safe", () => {
    for (const tier of RARITY_TIERS) {
      for (const channel of ["frame", "text", "glow"]) {
        expect(THEME_CSS_VARS, `--lw-rarity-${tier}-${channel}`).toContain(`--lw-rarity-${tier}-${channel}:`);
        expect(THEME_CSS_VARS, `--lw-rarity-cb-${tier}-${channel}`).toContain(
          `--lw-rarity-cb-${tier}-${channel}:`,
        );
      }
    }
  });
});

describe("window-chrome spec and panel-background recipe", () => {
  it("declares the required chrome slots and the optional ones", () => {
    expect(WINDOW_CHROME_SPEC.header).toMatchObject({
      emblem: "required",
      title: "required",
      close: "required",
      tabStrip: "optional",
    });
    expect(WINDOW_CHROME_SPEC.footer).toMatchObject({ keyhints: "optional" });
  });

  it("declares a reduced-motion-safe layered background recipe", () => {
    expect(PANEL_BACKGROUND_RECIPE.layers.length).toBeGreaterThan(0);
    expect(PANEL_BACKGROUND_RECIPE.reducedMotion).toBe("static-no-animation");
  });
});

describe("no regression to existing tokens", () => {
  it("keeps the pre-E8.0 color values byte-identical", () => {
    expect(THEME.color).toEqual({
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
    });
  });
});
