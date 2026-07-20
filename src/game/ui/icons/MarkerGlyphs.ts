/**
 * Map marker glyph shapes (Phase E6.7) — a pure `MapMarkerKind -> shape`
 * table so `.lw-map-icon` dots aren't color-only (a11y: shape is a second,
 * non-color channel distinguishing peer/creature/loot/etc. markers).
 * `MapScreen.ts`/`src/spawn/MinimapView.ts` set `data-shape` from this table;
 * `styles.ts` clip-paths each shape. Kept out of `domain/map/MinimapModel.ts`
 * on purpose — shape is a presentation concern, the domain module only owns
 * projection math.
 */

import type { MapMarkerKind } from "../../domain/map/MinimapModel";

export type MarkerGlyphShape =
  | "arrow"
  | "diamond"
  | "circle"
  | "hexagon"
  | "star"
  | "flag"
  | "pin";

const MARKER_GLYPH: Readonly<Record<MapMarkerKind, MarkerGlyphShape>> = {
  player: "arrow",
  peer: "diamond",
  creature: "circle",
  resourceNode: "hexagon",
  groundLoot: "star",
  poi: "flag",
  waypoint: "pin",
};

/** Every `MapMarkerKind` literal, kept as an explicit array (not derived
 *  from the const object above) so a completeness test catches a kind added
 *  to `MinimapModel.ts` without a matching glyph here. */
export const ALL_MAP_MARKER_KINDS: readonly MapMarkerKind[] = [
  "player",
  "peer",
  "creature",
  "resourceNode",
  "groundLoot",
  "poi",
  "waypoint",
];

export function markerGlyphShape(kind: MapMarkerKind): MarkerGlyphShape {
  return MARKER_GLYPH[kind];
}
