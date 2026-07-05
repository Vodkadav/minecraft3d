import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  createBoundary,
  DEFAULT_BOUNDARY_RADIUS,
  resolvePosition,
  type Boundary,
} from "./Boundary";
import {
  createBarrierRegistry,
  resolveBarrierModel,
  type BarrierModelDef,
} from "./BarrierRegistry";

function boundary(overrides: Partial<Boundary> = {}): Boundary {
  return createBoundary({
    center: [0, 0],
    radius: 100,
    softMargin: 10,
    barrierModelId: "default",
    ...overrides,
  });
}

describe("createBoundary", () => {
  it("exposes a documented default radius (~3 miles in world units)", () => {
    expect(DEFAULT_BOUNDARY_RADIUS).toBeCloseTo(4828.032, 3);
  });

  it("holds the given fields", () => {
    const b = boundary({ radius: 50 });
    expect(b.radius).toBe(50);
    expect(b.barrierModelId).toBe("default");
  });
});

describe("resolvePosition (soft push-back)", () => {
  it("leaves a position well inside the soft edge untouched", () => {
    const r = resolvePosition(boundary(), [10, 64, 10]);
    expect(r.pushedBack).toBe(false);
    expect(r.position).toEqual([10, 64, 10]);
  });

  it("does not push back a position exactly on the soft edge", () => {
    // clamp radius = 100 - 10 = 90, on the +X axis
    const r = resolvePosition(boundary(), [90, 64, 0]);
    expect(r.pushedBack).toBe(false);
    expect(r.position[0]).toBeCloseTo(90, 6);
  });

  it("clamps a position just outside the soft edge back to it", () => {
    const r = resolvePosition(boundary(), [95, 64, 0]);
    expect(r.pushedBack).toBe(true);
    expect(r.position[0]).toBeCloseTo(90, 6);
    expect(r.position[2]).toBeCloseTo(0, 6);
  });

  it("clamps a far-outside position onto the soft edge, preserving direction", () => {
    const r = resolvePosition(boundary(), [1000, 64, 0]);
    expect(r.pushedBack).toBe(true);
    expect(r.position[0]).toBeCloseTo(90, 6);
  });

  it("clamps along the diagonal keeping the radius", () => {
    const r = resolvePosition(boundary(), [100, 64, 100]);
    const dist = Math.hypot(r.position[0], r.position[2]);
    expect(r.pushedBack).toBe(true);
    expect(dist).toBeCloseTo(90, 6);
    // direction preserved: equal x and z
    expect(r.position[0]).toBeCloseTo(r.position[2], 6);
  });

  it("preserves the Y (height) component unchanged", () => {
    const r = resolvePosition(boundary(), [1000, 42, 0]);
    expect(r.position[1]).toBe(42);
  });

  it("respects a non-origin center", () => {
    const b = boundary({ center: [100, 100] });
    const r = resolvePosition(b, [300, 64, 100]);
    expect(r.pushedBack).toBe(true);
    // pushed to center.x + clampRadius = 100 + 90 = 190
    expect(r.position[0]).toBeCloseTo(190, 6);
    expect(r.position[2]).toBeCloseTo(100, 6);
  });

  it("does not push back a player exactly at the center", () => {
    const r = resolvePosition(boundary(), [0, 64, 0]);
    expect(r.pushedBack).toBe(false);
    expect(r.position).toEqual([0, 64, 0]);
  });
});

describe("BarrierRegistry (swappable barrier model)", () => {
  const dome: BarrierModelDef = {
    id: "dome",
    displayName: "Shimmer Dome",
    assetKey: "barrier/dome",
  };
  const wall: BarrierModelDef = {
    id: "wall",
    displayName: "Stone Wall",
    assetKey: "barrier/wall",
  };

  it("resolves a registered model by id", () => {
    const registry = createBarrierRegistry([dome, wall]);
    const r = resolveBarrierModel(registry, "dome");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.assetKey).toBe("barrier/dome");
  });

  it("errors for an unknown model id", () => {
    const registry = createBarrierRegistry([dome]);
    const r = resolveBarrierModel(registry, "missing");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownBarrierModel");
  });

  it("swaps the mesh/art by changing one registry entry", () => {
    const registry = createBarrierRegistry([dome]);
    registry.set("dome", { ...dome, assetKey: "barrier/dome-v2" });

    const r = resolveBarrierModel(registry, "dome");
    if (isOk(r)) expect(r.value.assetKey).toBe("barrier/dome-v2");
  });
});
