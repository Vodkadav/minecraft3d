import { describe, expect, it } from "vitest";
import { isOk } from "../../domain/Result";
import { defaultFilterRules } from "../../domain/inventory/ItemFilter";
import { InMemoryItemFilterStore } from "./InMemoryItemFilterStore";

describe("InMemoryItemFilterStore (ItemFilterStore contract)", () => {
  it("loads the default rule set before anything is saved", async () => {
    const store = new InMemoryItemFilterStore();
    const r = await store.load();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual(defaultFilterRules());
  });

  it("saves and reads back rules", async () => {
    const store = new InMemoryItemFilterStore();
    const next = [
      { id: "custom", enabled: true, match: { kind: "tier" as const, tier: 0 }, action: "dim" as const },
    ];
    expect(isOk(await store.save(next))).toBe(true);
    const r = await store.load();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual(next);
  });
});
