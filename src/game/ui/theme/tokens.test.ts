import { describe, expect, it } from "vitest";
import { THEME, THEME_CSS_VARS } from "./tokens";

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
