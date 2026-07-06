/**
 * Surface normal from a signed distance field (plan 8.5 [F], research §1):
 * the normalized central-difference gradient of the SDF at the raycast hit —
 * the domain's RaycastHit.normal input, computed without any mesh face data.
 */

import { normalize, type Vec3 } from "../../game/domain/placement/vec";

export type SdfFn = (x: number, y: number, z: number) => number;

const DEFAULT_EPS_M = 0.1;
const WORLD_UP: Vec3 = [0, 1, 0];

export function sdfNormal(sdf: SdfFn, p: Vec3, eps = DEFAULT_EPS_M): Vec3 {
  const g: Vec3 = [
    sdf(p[0] + eps, p[1], p[2]) - sdf(p[0] - eps, p[1], p[2]),
    sdf(p[0], p[1] + eps, p[2]) - sdf(p[0], p[1] - eps, p[2]),
    sdf(p[0], p[1], p[2] + eps) - sdf(p[0], p[1], p[2] - eps),
  ];
  if (Math.hypot(g[0], g[1], g[2]) < 1e-9) return WORLD_UP;
  return normalize(g);
}
