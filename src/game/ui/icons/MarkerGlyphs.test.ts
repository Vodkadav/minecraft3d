import { describe, expect, it } from "vitest";
import { ALL_MAP_MARKER_KINDS, markerGlyphShape } from "./MarkerGlyphs";

describe("markerGlyphShape", () => {
  it("is complete: every MapMarkerKind maps to a shape", () => {
    for (const kind of ALL_MAP_MARKER_KINDS) {
      expect(markerGlyphShape(kind)).toBeTruthy();
    }
  });

  it("assigns a distinct shape per kind (no color-only distinction)", () => {
    const shapes = ALL_MAP_MARKER_KINDS.map(markerGlyphShape);
    expect(new Set(shapes).size).toBe(ALL_MAP_MARKER_KINDS.length);
  });

  it("is deterministic", () => {
    expect(markerGlyphShape("creature")).toBe(markerGlyphShape("creature"));
  });
});
