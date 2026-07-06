/**
 * Minimal pure vector + quaternion math for the placement domain (plan 8.5).
 * Plain readonly tuples, zero THREE — the domain snaps and aligns without ever
 * touching a renderer (the [F] adapter converts to/from THREE types at the
 * seam). Kept local to placement per lib-extraction-discipline (extract to a
 * shared math module only once a second consumer appears).
 */

export type Vec3 = readonly [number, number, number];
/** Quaternion as [x, y, z, w] (three.js order). */
export type Quat = readonly [number, number, number, number];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Unit vector; returns the input unchanged when it is (near) zero-length. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len < 1e-9 ? a : scale(a, 1 / len);
}

/** Shortest-arc quaternion rotating unit `from` onto unit `to` (setFromUnitVectors). */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const f = normalize(from);
  const t = normalize(to);
  let r = dot(f, t) + 1;
  let q: [number, number, number, number];
  if (r < 1e-6) {
    // f and t are antiparallel — rotate 180° about any axis orthogonal to f.
    r = 0;
    q =
      Math.abs(f[0]) > Math.abs(f[2])
        ? [-f[1], f[0], 0, r]
        : [0, -f[2], f[1], r];
  } else {
    const c = cross(f, t);
    q = [c[0], c[1], c[2], r];
  }
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Quaternion for a yaw of `radians` about world-up Y. */
export function quatFromYaw(radians: number): Quat {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

/** Rotate a vector by a quaternion (q * v * q⁻¹). */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
