import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../game/domain/placement/vec";
import { sdfNormal, type SdfFn } from "./SdfNormal";

function close(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;
}

describe("sdfNormal", () => {
  it("a horizontal half-space yields world-up anywhere on it", () => {
    const plane: SdfFn = (_x, y, _z) => y - 5;
    expect(close(sdfNormal(plane, [0, 5, 0]), [0, 1, 0])).toBe(true);
    expect(close(sdfNormal(plane, [17, 5, -3]), [0, 1, 0])).toBe(true);
  });

  it("a vertical wall yields its outward axis", () => {
    const wall: SdfFn = (x) => x - 2;
    expect(close(sdfNormal(wall, [2, 10, 4]), [1, 0, 0])).toBe(true);
  });

  it("a sphere yields the radial direction at the surface point", () => {
    const sphere: SdfFn = (x, y, z) => Math.hypot(x, y, z) - 3;
    const p: Vec3 = [0, 3, 0];
    expect(close(sdfNormal(sphere, p), [0, 1, 0], 1e-3)).toBe(true);
    const q: Vec3 = [3 / Math.SQRT2, 3 / Math.SQRT2, 0];
    expect(close(sdfNormal(sphere, q), [1 / Math.SQRT2, 1 / Math.SQRT2, 0], 1e-3)).toBe(true);
  });

  it("a degenerate (constant) field falls back to world-up", () => {
    const flat: SdfFn = () => -1;
    expect(sdfNormal(flat, [4, 4, 4])).toEqual([0, 1, 0]);
  });
});
