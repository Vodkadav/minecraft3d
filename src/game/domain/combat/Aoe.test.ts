import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { resolveAoe, type AoeTarget } from "./Aoe";
import type { AoeSpec } from "./AoeRegistry";

function spec(overrides: Partial<AoeSpec> = {}): AoeSpec {
  return {
    id: "test-boom",
    radius: 4,
    falloff: "linear",
    blockSafe: true,
    vfx: "vfx.boom.test",
    ...overrides,
  };
}

function target(overrides: Partial<AoeTarget> = {}): AoeTarget {
  return { id: "t1", x: 0, y: 0, z: 0, ...overrides };
}

describe("resolveAoe", () => {
  it("hits a target at the exact center with full magnitude", () => {
    const result = resolveAoe(spec(), { x: 0, y: 0, z: 0 }, [target()]);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual([{ id: "t1", distance: 0, magnitude: 1 }]);
  });

  it("scales magnitude linearly down to 0 at the edge of the radius", () => {
    const result = resolveAoe(spec({ radius: 4, falloff: "linear" }), { x: 0, y: 0, z: 0 }, [
      target({ id: "half", x: 2, y: 0, z: 0 }),
      target({ id: "edge", x: 4, y: 0, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    const half = result.value.find((h) => h.id === "half");
    const edge = result.value.find((h) => h.id === "edge");
    expect(half?.magnitude).toBeCloseTo(0.5);
    expect(edge?.magnitude).toBeCloseTo(0);
  });

  it("holds full magnitude everywhere inside the radius when falloff is none", () => {
    const result = resolveAoe(spec({ radius: 5, falloff: "none" }), { x: 0, y: 0, z: 0 }, [
      target({ x: 4.9, y: 0, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value[0]?.magnitude).toBe(1);
  });

  it("excludes a target outside the radius", () => {
    const result = resolveAoe(spec({ radius: 3 }), { x: 0, y: 0, z: 0 }, [
      target({ x: 10, y: 0, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value).toEqual([]);
  });

  it("computes 3D straight-line distance, not a flat 2D one", () => {
    const result = resolveAoe(spec({ radius: 10 }), { x: 0, y: 0, z: 0 }, [
      target({ x: 3, y: 4, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value[0]?.distance).toBeCloseTo(5);
  });

  it("sorts hits by ascending distance", () => {
    const result = resolveAoe(spec({ radius: 10 }), { x: 0, y: 0, z: 0 }, [
      target({ id: "far", x: 8, y: 0, z: 0 }),
      target({ id: "near", x: 1, y: 0, z: 0 }),
      target({ id: "mid", x: 4, y: 0, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value.map((h) => h.id)).toEqual(["near", "mid", "far"]);
  });

  it("skips a target with a non-finite position without failing the whole batch", () => {
    const result = resolveAoe(spec({ radius: 10 }), { x: 0, y: 0, z: 0 }, [
      target({ id: "bad", x: Number.NaN, y: 0, z: 0 }),
      target({ id: "good", x: 1, y: 0, z: 0 }),
    ]);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value.map((h) => h.id)).toEqual(["good"]);
  });

  it("rejects a non-finite center", () => {
    const result = resolveAoe(spec(), { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }, [target()]);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("InvalidCenter");
  });

  it("rejects a non-positive radius", () => {
    const result = resolveAoe(spec({ radius: 0 }), { x: 0, y: 0, z: 0 }, [target()]);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("InvalidRadius");
  });

  it("returns an empty hit list for an empty target set", () => {
    const result = resolveAoe(spec(), { x: 0, y: 0, z: 0 }, []);
    if (!isOk(result)) throw new Error("setup");
    expect(result.value).toEqual([]);
  });
});
