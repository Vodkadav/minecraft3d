import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import {
  addRule,
  defaultFilterRules,
  evaluateItem,
  evaluateItemId,
  makeFilterRule,
  parseFilterRules,
  removeRule,
  toggleRule,
  type FilterRule,
} from "./ItemFilter";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function def(id: string) {
  const r = registry().get(id);
  if (!isOk(r)) throw new Error(`missing ${id}`);
  return r.value;
}

describe("evaluateItem", () => {
  it("returns null when no rule matches", () => {
    expect(evaluateItem([], def("wood"))).toBeNull();
  });

  it("matches by tag", () => {
    const rules: FilterRule[] = [
      { id: "r1", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" },
    ];
    expect(evaluateItem(rules, def("meat"))).toBe("highlight");
    expect(evaluateItem(rules, def("wood"))).toBeNull();
  });

  it("matches by tier", () => {
    const rules: FilterRule[] = [{ id: "r1", enabled: true, match: { kind: "tier", tier: 1 }, action: "dim" }];
    expect(evaluateItem(rules, def("ore"))).toBe("dim"); // ore is tier 1
    expect(evaluateItem(rules, def("wood"))).toBeNull(); // wood is tier 0
  });

  it("matches by name (case-insensitive substring against id or display name)", () => {
    const rules: FilterRule[] = [
      { id: "r1", enabled: true, match: { kind: "name", query: "iron" }, action: "hide" },
    ];
    expect(evaluateItem(rules, def("ore"))).toBe("hide"); // "Iron Ore"
    expect(evaluateItem(rules, def("ingot"))).toBe("hide"); // "Iron Ingot"
    expect(evaluateItem(rules, def("wood"))).toBeNull();
  });

  it("an empty name query never matches anything", () => {
    const rules: FilterRule[] = [{ id: "r1", enabled: true, match: { kind: "name", query: "  " }, action: "hide" }];
    expect(evaluateItem(rules, def("wood"))).toBeNull();
  });

  it("skips disabled rules", () => {
    const rules: FilterRule[] = [
      { id: "r1", enabled: false, match: { kind: "tag", tag: "food" }, action: "hide" },
    ];
    expect(evaluateItem(rules, def("meat"))).toBeNull();
  });

  it("precedence: the FIRST enabled matching rule wins, regardless of action severity", () => {
    const rules: FilterRule[] = [
      { id: "highlight-food", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" },
      { id: "hide-food", enabled: true, match: { kind: "tag", tag: "food" }, action: "hide" },
    ];
    expect(evaluateItem(rules, def("meat"))).toBe("highlight"); // first rule wins, not "hide"

    const reversed = [...rules].reverse();
    expect(evaluateItem(reversed, def("meat"))).toBe("hide"); // order flipped -> different winner
  });

  it("precedence: a disabled earlier rule is skipped in favor of a later enabled match", () => {
    const rules: FilterRule[] = [
      { id: "off", enabled: false, match: { kind: "tag", tag: "food" }, action: "hide" },
      { id: "on", enabled: true, match: { kind: "tag", tag: "food" }, action: "dim" },
    ];
    expect(evaluateItem(rules, def("meat"))).toBe("dim");
  });
});

describe("evaluateItemId", () => {
  it("resolves through the registry", () => {
    const reg = registry();
    const rules: FilterRule[] = [
      { id: "r1", enabled: true, match: { kind: "tag", tag: "tool" }, action: "highlight" },
    ];
    expect(evaluateItemId(reg, rules, "pickaxe")).toBe("highlight");
  });

  it("an unknown item id evaluates to null rather than throwing", () => {
    const reg = registry();
    expect(evaluateItemId(reg, defaultFilterRules(), "does-not-exist")).toBeNull();
  });
});

describe("defaultFilterRules", () => {
  it("ships a small, all-enabled, highlight-only starter set", () => {
    const rules = defaultFilterRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.enabled)).toBe(true);
    expect(rules.every((r) => r.action === "highlight")).toBe(true);
  });
});

describe("rule-builder reducers", () => {
  it("addRule appends without mutating the input array", () => {
    const before = defaultFilterRules();
    const rule: FilterRule = { id: "new", enabled: true, match: { kind: "tier", tier: 0 }, action: "dim" };
    const after = addRule(before, rule);
    expect(after).toHaveLength(before.length + 1);
    expect(before).not.toContain(rule);
  });

  it("removeRule drops the rule by id", () => {
    const rules = addRule(defaultFilterRules(), {
      id: "temp",
      enabled: true,
      match: { kind: "tier", tier: 0 },
      action: "dim",
    });
    const after = removeRule(rules, "temp");
    expect(after.some((r) => r.id === "temp")).toBe(false);
  });

  it("toggleRule flips enabled without touching other rules", () => {
    const rules = defaultFilterRules();
    const targetId = rules[0]!.id;
    const after = toggleRule(rules, targetId);
    expect(after.find((r) => r.id === targetId)?.enabled).toBe(false);
    expect(after.filter((r) => r.id !== targetId)).toEqual(rules.filter((r) => r.id !== targetId));
  });
});

describe("makeFilterRule / parseFilterRules validation", () => {
  it("accepts a well-formed rule", () => {
    const r = makeFilterRule({ id: "a", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" });
    expect(isOk(r)).toBe(true);
  });

  it("rejects an empty id", () => {
    const r = makeFilterRule({ id: "", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" });
    expect(isOk(r)).toBe(false);
  });

  it("rejects an unknown action", () => {
    const r = makeFilterRule({ id: "a", enabled: true, match: { kind: "tag", tag: "food" }, action: "explode" });
    expect(isOk(r)).toBe(false);
  });

  it("rejects a malformed match shape", () => {
    const r = makeFilterRule({ id: "a", enabled: true, match: { kind: "tag" }, action: "highlight" });
    expect(isOk(r)).toBe(false);
  });

  it("round-trips a valid list through JSON", () => {
    const rules = defaultFilterRules();
    const parsed = parseFilterRules(JSON.parse(JSON.stringify(rules)));
    expect(isOk(parsed)).toBe(true);
    if (isOk(parsed)) expect(parsed.value).toEqual(rules);
  });

  it("rejects a corrupt blob (not an array)", () => {
    expect(isOk(parseFilterRules({ not: "an array" }))).toBe(false);
  });

  it("rejects the whole list on the first bad entry", () => {
    const bad = [...defaultFilterRules(), { id: "bad", enabled: true, match: { kind: "nope" }, action: "highlight" }];
    expect(isOk(parseFilterRules(bad))).toBe(false);
  });
});
