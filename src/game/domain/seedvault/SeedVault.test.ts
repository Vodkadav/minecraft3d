import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  addSeed,
  emptyVault,
  listSeeds,
  removeSeed,
  renameSeed,
  validateSeedName,
  type SeedEntry,
} from "./SeedVault";

function entry(overrides: Partial<SeedEntry> = {}): SeedEntry {
  return { id: "s1", seed: 42, name: "Home", createdAt: 100, ...overrides };
}

describe("validateSeedName", () => {
  it("accepts a normal name and trims surrounding whitespace", () => {
    const r = validateSeedName("  Cosy Valley  ");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("Cosy Valley");
  });

  it("rejects an empty or whitespace-only name", () => {
    for (const bad of ["", "   ", "\t"]) {
      const r = validateSeedName(bad);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error.reason).toBe("empty");
    }
  });

  it("rejects a name longer than the bound (after trimming)", () => {
    const r = validateSeedName("x".repeat(61));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe("tooLong");
  });

  it("accepts a name exactly at the bound", () => {
    expect(isOk(validateSeedName("x".repeat(60)))).toBe(true);
  });
});

describe("addSeed", () => {
  it("adds an entry with a normalized name", () => {
    const r = addSeed(emptyVault(), entry({ name: "  Home  " }));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(listSeeds(r.value)).toHaveLength(1);
      expect(listSeeds(r.value)[0].name).toBe("Home");
    }
  });

  it("rejects an invalid name", () => {
    const r = addSeed(emptyVault(), entry({ name: "" }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("InvalidName");
  });

  it("rejects a duplicate id", () => {
    const one = addSeed(emptyVault(), entry());
    if (!isOk(one)) throw new Error("setup");
    const r = addSeed(one.value, entry({ seed: 7, name: "Other" }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DuplicateId");
  });

  it("does not mutate the input vault", () => {
    const base = emptyVault();
    addSeed(base, entry());
    expect(listSeeds(base)).toHaveLength(0);
  });
});

describe("listSeeds", () => {
  it("orders by createdAt ascending, breaking ties by id", () => {
    let vault = emptyVault();
    for (const e of [
      entry({ id: "b", createdAt: 200 }),
      entry({ id: "a", createdAt: 100 }),
      entry({ id: "c", createdAt: 100 }),
    ]) {
      const r = addSeed(vault, e);
      if (isOk(r)) vault = r.value;
    }

    expect(listSeeds(vault).map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});

describe("renameSeed", () => {
  it("renames an existing entry with a normalized name", () => {
    const added = addSeed(emptyVault(), entry());
    if (!isOk(added)) throw new Error("setup");

    const r = renameSeed(added.value, "s1", "  New Name  ");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(listSeeds(r.value)[0].name).toBe("New Name");
  });

  it("rejects an unknown id", () => {
    const r = renameSeed(emptyVault(), "nope", "Name");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });

  it("rejects an invalid new name", () => {
    const added = addSeed(emptyVault(), entry());
    if (!isOk(added)) throw new Error("setup");

    const r = renameSeed(added.value, "s1", "   ");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("InvalidName");
  });
});

describe("removeSeed", () => {
  it("removes an existing entry", () => {
    const added = addSeed(emptyVault(), entry());
    if (!isOk(added)) throw new Error("setup");

    const r = removeSeed(added.value, "s1");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(listSeeds(r.value)).toHaveLength(0);
  });

  it("rejects an unknown id", () => {
    const r = removeSeed(emptyVault(), "nope");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });
});
