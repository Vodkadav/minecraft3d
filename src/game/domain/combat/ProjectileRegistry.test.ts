import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  PROJECTILE_REGISTRY,
  ProjectileRegistry,
  STARTER_PROJECTILES,
  type ProjectileSpec,
} from "./ProjectileRegistry";

function spec(overrides: Partial<ProjectileSpec> = {}): ProjectileSpec {
  return {
    id: "test-bolt",
    speed: 20,
    gravity: 0,
    lifetimeMs: 2000,
    radius: 0.2,
    tracerVfx: "vfx.tracer.test",
    ...overrides,
  };
}

describe("ProjectileRegistry", () => {
  it("looks up a defined projectile by id", () => {
    const created = ProjectileRegistry.create([spec()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const found = created.value.get("test-bolt");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.speed).toBe(20);
  });

  it("returns UnknownProjectile for an id that was never registered", () => {
    const created = ProjectileRegistry.create([spec()]);
    if (!isOk(created)) throw new Error("setup");
    const found = created.value.get("ghost-bolt");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) expect(found.error.kind).toBe("UnknownProjectile");
  });

  it("rejects a table with a duplicate id", () => {
    const created = ProjectileRegistry.create([spec(), spec({ speed: 99 })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("DuplicateProjectile");
  });

  it("reports membership with has() and exposes all()", () => {
    const created = ProjectileRegistry.create([spec({ id: "a" }), spec({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("a")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
    expect(created.value.all().map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter projectile table integrity", () => {
  it("constructs without a fallible unwrap (no duplicate ids in the starter table)", () => {
    expect(() => PROJECTILE_REGISTRY).not.toThrow();
  });

  it("every entry has sane, non-negative physical parameters", () => {
    for (const s of STARTER_PROJECTILES) {
      expect(s.speed).toBeGreaterThan(0);
      expect(s.gravity).toBeGreaterThanOrEqual(0);
      expect(s.lifetimeMs).toBeGreaterThan(0);
      expect(s.radius).toBeGreaterThan(0);
      if (s.pierces !== undefined) expect(s.pierces).toBeGreaterThanOrEqual(0);
      expect(s.tracerVfx.length).toBeGreaterThan(0);
    }
  });
});
