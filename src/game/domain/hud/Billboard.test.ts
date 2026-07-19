import { describe, expect, it } from "vitest";
import { type Mat4, projectBillboard } from "./Billboard";

/**
 * Standard right-handed perspective matrix (same convention as three.js
 * `Matrix4.makePerspective`, forward = -Z), built independently of the
 * production code under test so these expectations aren't tautological.
 */
function perspectiveMatrix(fovYDeg: number, aspect: number, near: number, far: number): Mat4 {
  const fov = (fovYDeg * Math.PI) / 180;
  const f = 1 / Math.tan(fov / 2);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ];
}

const VP = perspectiveMatrix(60, 800 / 600, 0.1, 1000);
const VIEWPORT = { width: 800, height: 600 };
const ORIGIN: readonly [number, number, number] = [0, 0, 0];

describe("projectBillboard", () => {
  it("projects a point straight ahead to the viewport center", () => {
    const p = projectBillboard([0, 0, -5], VP, ORIGIN, VIEWPORT, 100);
    expect(p.x).toBeCloseTo(400, 5);
    expect(p.y).toBeCloseTo(300, 5);
    expect(p.visible).toBe(true);
    expect(p.distance).toBeCloseTo(5, 5);
  });

  it("culls a point behind the camera (NDC z > 1)", () => {
    const p = projectBillboard([0, 0, 5], VP, ORIGIN, VIEWPORT, 100);
    expect(p.visible).toBe(false);
  });

  it("moves right on screen for a positive world-space X offset", () => {
    const p = projectBillboard([1, 0, -5], VP, ORIGIN, VIEWPORT, 100);
    expect(p.x).toBeCloseTo(503.9230484541326, 5);
    expect(p.y).toBeCloseTo(300, 5);
    expect(p.visible).toBe(true);
  });

  it("moves up on screen for a positive world-space Y offset", () => {
    const p = projectBillboard([0, 1, -5], VP, ORIGIN, VIEWPORT, 100);
    expect(p.x).toBeCloseTo(400, 5);
    expect(p.y).toBeCloseTo(196.07695154586736, 5);
    expect(p.visible).toBe(true);
  });

  it("stays visible exactly at maxDistance (inclusive boundary)", () => {
    const p = projectBillboard([0, 0, -5], VP, ORIGIN, VIEWPORT, 5);
    expect(p.visible).toBe(true);
  });

  it("culls a point just beyond maxDistance", () => {
    const p = projectBillboard([0, 0, -5], VP, ORIGIN, VIEWPORT, 4.999);
    expect(p.visible).toBe(false);
  });

  it("measures distance from the camera's world position, not the origin", () => {
    const p = projectBillboard([10, 0, -5], VP, [10, 0, 0], VIEWPORT, 100);
    expect(p.distance).toBeCloseTo(5, 5);
    expect(p.visible).toBe(true);
  });

  it("culls a point beyond maxDistance even when it is directly ahead", () => {
    const p = projectBillboard([0, 0, -50], VP, ORIGIN, VIEWPORT, 10);
    expect(p.visible).toBe(false);
    expect(p.distance).toBeCloseTo(50, 5);
  });
});
