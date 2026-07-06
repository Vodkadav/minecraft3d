import { describe, expect, it } from "vitest";
import {
  add,
  cross,
  distance,
  dot,
  normalize,
  quatFromUnitVectors,
  quatFromYaw,
  rotateVec,
  scale,
  sub,
  type Vec3,
} from "./vec";

const UP: Vec3 = [0, 1, 0];

function close(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return distance(a, b) < eps;
}

describe("vec basics", () => {
  it("adds, subtracts, scales", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
  });

  it("computes dot, cross, distance", () => {
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(dot([1, 2, 3], [1, 2, 3])).toBe(14);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
  });

  it("normalizes and leaves a zero vector alone", () => {
    expect(close(normalize([0, 5, 0]), [0, 1, 0])).toBe(true);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("quatFromUnitVectors", () => {
  it("is identity when from == to", () => {
    const q = quatFromUnitVectors(UP, UP);
    expect(close(rotateVec(q, UP), UP)).toBe(true);
  });

  it("rotates up onto a tilted normal", () => {
    const normal = normalize([1, 1, 0]);
    const q = quatFromUnitVectors(UP, normal);
    expect(close(rotateVec(q, UP), normal)).toBe(true);
  });

  it("handles the antiparallel case (up -> down)", () => {
    const down: Vec3 = [0, -1, 0];
    const q = quatFromUnitVectors(UP, down);
    expect(close(rotateVec(q, UP), down)).toBe(true);
  });
});

describe("quatFromYaw + rotateVec", () => {
  it("yaws +X to -Z at 90 degrees about Y", () => {
    const q = quatFromYaw(Math.PI / 2);
    expect(close(rotateVec(q, [1, 0, 0]), [0, 0, -1])).toBe(true);
  });

  it("leaves the up axis fixed under yaw", () => {
    const q = quatFromYaw(Math.PI / 3);
    expect(close(rotateVec(q, UP), UP)).toBe(true);
  });
});
