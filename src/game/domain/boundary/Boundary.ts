/**
 * The adjustable world boundary: a circular limit in the horizontal (XZ) plane
 * with a soft push-back band, plus a reference to a swappable barrier model.
 * Pure geometry, no renderer.
 *
 * Radius default — the design calls for a ~3-mile play area. The engine's world
 * units are metres (1 unit = 1 m), and 3 miles = 3 × 1609.344 m = 4828.032 m,
 * so DEFAULT_BOUNDARY_RADIUS is that many world units. Hosts can shrink/grow it
 * per world (M4 lobby), hence "adjustable".
 */

const METRES_PER_MILE = 1609.344;

export const DEFAULT_BOUNDARY_RADIUS = 3 * METRES_PER_MILE;

/** How far inside the hard radius push-back begins, giving a soft edge feel. */
export const DEFAULT_BOUNDARY_SOFT_MARGIN = 4;

export interface Boundary {
  /** Centre in the XZ plane. */
  readonly center: readonly [number, number];
  readonly radius: number;
  /** Push-back starts at `radius - softMargin`. */
  readonly softMargin: number;
  readonly barrierModelId: string;
}

export interface BoundaryInit {
  readonly center?: readonly [number, number];
  readonly radius?: number;
  readonly softMargin?: number;
  readonly barrierModelId: string;
}

export function createBoundary(init: BoundaryInit): Boundary {
  return {
    center: init.center ?? [0, 0],
    radius: init.radius ?? DEFAULT_BOUNDARY_RADIUS,
    softMargin: init.softMargin ?? DEFAULT_BOUNDARY_SOFT_MARGIN,
    barrierModelId: init.barrierModelId,
  };
}

export interface PushBackResult {
  readonly position: readonly [number, number, number];
  readonly pushedBack: boolean;
}

/**
 * Clamp a player position within the boundary's soft edge. Positions at or
 * inside `radius - softMargin` (horizontally) pass through unchanged; positions
 * beyond it are pulled back onto that soft edge along the same direction from
 * the centre, leaving height (Y) untouched.
 */
export function resolvePosition(
  boundary: Boundary,
  position: readonly [number, number, number],
): PushBackResult {
  const [cx, cz] = boundary.center;
  const [x, y, z] = position;
  const dx = x - cx;
  const dz = z - cz;
  const distance = Math.hypot(dx, dz);
  const clampRadius = boundary.radius - boundary.softMargin;

  if (distance <= clampRadius) {
    return { position, pushedBack: false };
  }

  const scale = clampRadius / distance;
  return {
    position: [cx + dx * scale, y, cz + dz * scale],
    pushedBack: true,
  };
}
