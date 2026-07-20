import { describe, expect, it } from "vitest";
import { AOE_REGISTRY } from "./AoeRegistry";
import { isErr, isOk } from "../Result";
import {
  DEPLOYABLE_REGISTRY,
  DeployableRegistry,
  STARTER_DEPLOYABLES,
  type DeployableSpec,
} from "./DeployableRegistry";

function spec(overrides: Partial<DeployableSpec> = {}): DeployableSpec {
  return {
    id: "test-trap",
    trigger: "stepped",
    armDelayMs: 500,
    triggerRadius: 1.5,
    telegraphVfx: "vfx.telegraph.test",
    aoe: "test-boom",
    ...overrides,
  };
}

describe("DeployableRegistry", () => {
  it("looks up a defined deployable by id", () => {
    const created = DeployableRegistry.create([spec()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const found = created.value.get("test-trap");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.trigger).toBe("stepped");
  });

  it("returns UnknownDeployable for an id that was never registered", () => {
    const created = DeployableRegistry.create([spec()]);
    if (!isOk(created)) throw new Error("setup");
    const found = created.value.get("ghost-trap");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) expect(found.error.kind).toBe("UnknownDeployable");
  });

  it("rejects a table with a duplicate id", () => {
    const created = DeployableRegistry.create([spec(), spec({ trigger: "timed" })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("DuplicateDeployable");
  });

  it("reports membership with has() and exposes all()", () => {
    const created = DeployableRegistry.create([spec({ id: "a" }), spec({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("a")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
    expect(created.value.all().map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter deployable table integrity", () => {
  it("constructs without a fallible unwrap (no duplicate ids in the starter table)", () => {
    expect(() => DEPLOYABLE_REGISTRY).not.toThrow();
  });

  it("every entry has sane trigger parameters and a resolvable aoe reference", () => {
    for (const s of STARTER_DEPLOYABLES) {
      expect(["timed", "proximity", "stepped"]).toContain(s.trigger);
      expect(s.armDelayMs).toBeGreaterThanOrEqual(0);
      expect(s.triggerRadius).toBeGreaterThanOrEqual(0);
      expect(s.telegraphVfx.length).toBeGreaterThan(0);
      // Cross-registry completeness (the guarding invariant this table needs
      // once streams start appending, mirrors CreatureRegistry.test.ts):
      // every deployable's aoe id must resolve in AoeRegistry.
      expect(AOE_REGISTRY.has(s.aoe), `AoeRegistry missing ${s.aoe} (referenced by ${s.id})`).toBe(true);
    }
  });
});
