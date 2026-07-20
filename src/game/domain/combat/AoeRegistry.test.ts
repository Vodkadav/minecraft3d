import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { AOE_REGISTRY, AoeRegistry, STARTER_AOES, type AoeSpec } from "./AoeRegistry";

function spec(overrides: Partial<AoeSpec> = {}): AoeSpec {
  return {
    id: "test-boom",
    radius: 3,
    falloff: "linear",
    blockSafe: true,
    vfx: "vfx.boom.test",
    ...overrides,
  };
}

describe("AoeRegistry", () => {
  it("looks up a defined aoe spec by id", () => {
    const created = AoeRegistry.create([spec()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const found = created.value.get("test-boom");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.radius).toBe(3);
  });

  it("returns UnknownAoe for an id that was never registered", () => {
    const created = AoeRegistry.create([spec()]);
    if (!isOk(created)) throw new Error("setup");
    const found = created.value.get("ghost-boom");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) expect(found.error.kind).toBe("UnknownAoe");
  });

  it("rejects a table with a duplicate id", () => {
    const created = AoeRegistry.create([spec(), spec({ radius: 5 })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("DuplicateAoe");
  });

  it("reports membership with has() and exposes all()", () => {
    const created = AoeRegistry.create([spec({ id: "a" }), spec({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("a")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
    expect(created.value.all().map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter aoe table integrity", () => {
  it("constructs without a fallible unwrap (no duplicate ids in the starter table)", () => {
    expect(() => AOE_REGISTRY).not.toThrow();
  });

  it("every entry has a positive radius, a valid falloff, and a vfx id", () => {
    for (const s of STARTER_AOES) {
      expect(s.radius).toBeGreaterThan(0);
      expect(["none", "linear"]).toContain(s.falloff);
      expect(typeof s.blockSafe).toBe("boolean");
      expect(s.vfx.length).toBeGreaterThan(0);
    }
  });
});
