import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../../domain/Result";
import type { SeedEntry } from "../../domain/seedvault/SeedVault";
import { InMemorySeedVaultStore } from "./InMemorySeedVaultStore";

function entry(overrides: Partial<SeedEntry> = {}): SeedEntry {
  return { id: "s1", seed: 42, name: "Home", createdAt: 100, ...overrides };
}

describe("InMemorySeedVaultStore (SeedVaultStore contract)", () => {
  it("adds and lists seeds in stable order", async () => {
    const store = new InMemorySeedVaultStore();
    await store.add(entry({ id: "b", createdAt: 200 }));
    await store.add(entry({ id: "a", createdAt: 100 }));

    const listed = await store.list();

    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) expect(listed.value.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("rejects a duplicate id", async () => {
    const store = new InMemorySeedVaultStore();
    await store.add(entry());

    const dup = await store.add(entry({ seed: 9, name: "Other" }));

    expect(isErr(dup)).toBe(true);
    if (isErr(dup)) expect(dup.error.kind).toBe("DuplicateId");
  });

  it("rejects an invalid name", async () => {
    const store = new InMemorySeedVaultStore();

    const r = await store.add(entry({ name: "   " }));

    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("InvalidName");
  });

  it("renames an existing seed", async () => {
    const store = new InMemorySeedVaultStore();
    await store.add(entry());

    expect(isOk(await store.rename("s1", "Renamed"))).toBe(true);
    const listed = await store.list();
    if (isOk(listed)) expect(listed.value[0].name).toBe("Renamed");
  });

  it("reports NotFound when renaming an unknown seed", async () => {
    const store = new InMemorySeedVaultStore();

    const r = await store.rename("nope", "Name");

    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });

  it("removes a seed and reports NotFound on a second remove", async () => {
    const store = new InMemorySeedVaultStore();
    await store.add(entry());

    expect(isOk(await store.remove("s1"))).toBe(true);
    expect(isErr(await store.remove("s1"))).toBe(true);
  });
});
