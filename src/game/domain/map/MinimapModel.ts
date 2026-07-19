/**
 * Minimap/full-map icon + fog-of-war math (E3.2/E3.3) — pure domain, no
 * canvas/DOM/three.js. North-aligned: the view never rotates with player
 * facing, only translates as the player (or map pan) moves, so the same
 * projection serves both the small corner minimap and the full-screen map at
 * a larger `viewRadiusMeters` (= zoomed out). World convention: -Z is north
 * (screen-up), +Z is south (screen-down) — matches the engine's existing
 * camera-forward convention elsewhere in this codebase.
 *
 * Marker sources are pluggable: a `MarkerSource` is just "give me your
 * current markers". The composition root combines however many exist today
 * (creatures, resource nodes) via `mergeMarkers`; wiring a new source later
 * (e.g. E0.5 ground loot, once it lands) is one array entry — this module
 * never assumes which sources exist.
 */

import { isCellDiscovered, worldToCell, type ExplorationState } from "./Exploration";

export type MapMarkerKind =
  | "player"
  | "peer"
  | "creature"
  | "resourceNode"
  | "groundLoot"
  | "poi"
  | "waypoint";

export interface MapMarker {
  readonly id: string;
  readonly kind: MapMarkerKind;
  readonly x: number;
  readonly z: number;
}

/** One subsystem's live marker snapshot (e.g. "current creatures"). */
export type MarkerSource = () => readonly MapMarker[];

export function mergeMarkers(sources: readonly MarkerSource[]): readonly MapMarker[] {
  return sources.flatMap((source) => source());
}

export interface MapIcon {
  readonly id: string;
  readonly kind: MapMarkerKind;
  /** Widget-local pixels, (0,0) = top-left. */
  readonly screenX: number;
  readonly screenY: number;
  /** False when outside `viewRadiusMeters` — cull, don't drop, so a caller
   *  can still choose to draw an edge indicator later. */
  readonly visible: boolean;
}

export interface MinimapView {
  /** World position the view is centered on (player pos for the minimap;
   *  pan target for the full map). */
  readonly centerX: number;
  readonly centerZ: number;
  /** World meters shown from center to the (shorter) widget edge — smaller
   *  = more zoomed in. */
  readonly viewRadiusMeters: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

function pxPerMeter(view: MinimapView): number {
  return Math.min(view.widthPx, view.heightPx) / 2 / view.viewRadiusMeters;
}

/** Projects world markers to widget-local screen pixels, north-up, no
 *  rotation. Culls anything beyond `viewRadiusMeters` from center. */
export function computeMapIcons(
  markers: readonly MapMarker[],
  view: MinimapView,
): readonly MapIcon[] {
  const scale = pxPerMeter(view);
  const halfW = view.widthPx / 2;
  const halfH = view.heightPx / 2;
  return markers.map((m) => {
    const dx = m.x - view.centerX;
    const dz = m.z - view.centerZ;
    const distance = Math.hypot(dx, dz);
    return {
      id: m.id,
      kind: m.kind,
      screenX: halfW + dx * scale,
      screenY: halfH + dz * scale,
      visible: distance <= view.viewRadiusMeters,
    };
  });
}

/** Rotation (degrees, clockwise) for the player-facing arrow icon. Three.js
 *  yaw convention: 0 = facing -Z (north); this maps directly to a clockwise
 *  screen rotation since screen-up is also -Z. */
export function playerArrowRotationDegrees(yawRadians: number): number {
  return (yawRadians * 180) / Math.PI;
}

export interface FogCell {
  readonly cx: number;
  readonly cz: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly sizePx: number;
  readonly discovered: boolean;
}

/** Grid of cell rects covering the current view, each flagged discovered/not
 *  — the full-map adapter (E3.3) paints fog over the `discovered: false`
 *  ones. Bounded by the view's world extent, so cost scales with zoom level,
 *  not with total explored area. */
export function computeFogGrid(
  exploration: ExplorationState,
  view: MinimapView,
): readonly FogCell[] {
  const cell = exploration.cellMeters;
  const scale = pxPerMeter(view);
  const sizePx = cell * scale;
  const halfW = view.widthPx / 2;
  const halfH = view.heightPx / 2;

  const [cx0, cz0] = worldToCell(
    view.centerX - view.viewRadiusMeters,
    view.centerZ - view.viewRadiusMeters,
    cell,
  );
  const [cx1, cz1] = worldToCell(
    view.centerX + view.viewRadiusMeters,
    view.centerZ + view.viewRadiusMeters,
    cell,
  );

  const out: FogCell[] = [];
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const wx = cx * cell;
      const wz = cz * cell;
      out.push({
        cx,
        cz,
        screenX: halfW + (wx - view.centerX) * scale,
        screenY: halfH + (wz - view.centerZ) * scale,
        sizePx,
        discovered: isCellDiscovered(exploration, cx, cz),
      });
    }
  }
  return out;
}
