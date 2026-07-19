/**
 * Billboard world-to-screen projection (E0.1) — pure extraction of the
 * projection math `src/feel/DamageNumbers.ts` does inline (`Vector3.project`
 * + the manual NDC-to-pixel remap), generalized so a per-frame overlay
 * adapter can re-project a *moving* target every tick instead of once at
 * spawn. No three.js/DOM dependency: the camera's view-projection matrix and
 * world position come in as plain numbers, keeping this domain-pure and
 * TDD-able without a renderer.
 */

export interface BillboardProjection {
  /** Screen-space X in viewport-local pixels (0 = left edge). */
  readonly x: number;
  /** Screen-space Y in viewport-local pixels (0 = top edge). */
  readonly y: number;
  /** False when behind the camera or beyond `maxDistance` — callers hide the marker. */
  readonly visible: boolean;
  /** Euclidean world distance from the camera. */
  readonly distance: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Column-major 4x4 matrix, matching three.js `Matrix4.elements` order:
 * `elements[col * 4 + row]`. Pass `camera.projectionMatrix.clone()
 * .multiply(camera.matrixWorldInverse).elements` (or equivalent) from the
 * adapter — domain code never touches three.js types.
 */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/**
 * Project a world position to viewport-local screen pixels using a
 * precomputed camera view-projection matrix. Culls points behind the camera
 * (NDC z > 1, same check `DamageNumbers.ts` uses) and points farther than
 * `maxDistance` from the camera. `distance` is boundary-inclusive (a point
 * exactly at `maxDistance` stays visible).
 */
export function projectBillboard(
  worldPos: readonly [number, number, number],
  viewProjectionMatrix: Mat4,
  cameraWorldPos: readonly [number, number, number],
  viewport: Viewport,
  maxDistance: number,
): BillboardProjection {
  const [x, y, z] = worldPos;
  const e = viewProjectionMatrix;

  const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
  const cz = e[2] * x + e[6] * y + e[10] * z + e[14];
  const cw = e[3] * x + e[7] * y + e[11] * z + e[15];

  const ndcX = cw !== 0 ? cx / cw : cx;
  const ndcY = cw !== 0 ? cy / cw : cy;
  const ndcZ = cw !== 0 ? cz / cw : cz;

  const dx = x - cameraWorldPos[0];
  const dy = y - cameraWorldPos[1];
  const dz = z - cameraWorldPos[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const behindCamera = ndcZ > 1;
  const tooFar = distance > maxDistance;

  return {
    x: ((ndcX + 1) / 2) * viewport.width,
    y: ((1 - ndcY) / 2) * viewport.height,
    visible: !behindCamera && !tooFar,
    distance,
  };
}
