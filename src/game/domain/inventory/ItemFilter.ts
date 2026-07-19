/**
 * PoE-style item filter rule model (Workstream E4.2) — a cozy, kid-simple
 * **rule builder**, never a text DSL: match by tag/tier/name -> highlight,
 * dim, or hide. Pure and JSON-serializable, so it round-trips through
 * persistence unchanged (mirrors `domain/settings/Settings`'s validated
 * factory) and is safe to reuse verbatim for ground-loot visibility
 * (E0.5/E4.3) and the bank (E4.4) once those land — they only ever need
 * `evaluateItemId`/`evaluateItem`, never touch rule storage.
 */

import { err, isOk, ok, type Result } from "../Result";
import type { ItemDefinition } from "../items/ItemDefinition";
import type { ItemRegistry } from "../items/ItemRegistry";

export type FilterAction = "highlight" | "dim" | "hide";

export const FILTER_ACTIONS: readonly FilterAction[] = ["highlight", "dim", "hide"];

export type FilterMatch =
  | { readonly kind: "tag"; readonly tag: string }
  | { readonly kind: "tier"; readonly tier: number }
  | { readonly kind: "name"; readonly query: string };

export interface FilterRule {
  readonly id: string;
  readonly enabled: boolean;
  readonly match: FilterMatch;
  readonly action: FilterAction;
}

export type FilterRuleError = { readonly kind: "InvalidRule"; readonly detail: string };

function isFilterAction(value: unknown): value is FilterAction {
  return value === "highlight" || value === "dim" || value === "hide";
}

function parseMatch(raw: unknown): Result<FilterMatch, FilterRuleError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "InvalidRule", detail: "match must be an object" });
  }
  const m = raw as { kind?: unknown; tag?: unknown; tier?: unknown; query?: unknown };
  if (m.kind === "tag" && typeof m.tag === "string") return ok({ kind: "tag", tag: m.tag });
  if (m.kind === "tier" && typeof m.tier === "number") return ok({ kind: "tier", tier: m.tier });
  if (m.kind === "name" && typeof m.query === "string") return ok({ kind: "name", query: m.query });
  return err({ kind: "InvalidRule", detail: `unknown match shape: ${JSON.stringify(raw)}` });
}

/** Validated construction — the factory every persisted/UI-authored rule
 *  goes through, mirroring `Settings.makeSettings`. */
export function makeFilterRule(input: {
  readonly id: unknown;
  readonly enabled: unknown;
  readonly match: unknown;
  readonly action: unknown;
}): Result<FilterRule, FilterRuleError> {
  if (typeof input.id !== "string" || input.id.length === 0) {
    return err({ kind: "InvalidRule", detail: "id must be a non-empty string" });
  }
  if (typeof input.enabled !== "boolean") {
    return err({ kind: "InvalidRule", detail: "enabled must be a boolean" });
  }
  if (!isFilterAction(input.action)) {
    return err({ kind: "InvalidRule", detail: `unknown action: ${String(input.action)}` });
  }
  const match = parseMatch(input.match);
  if (!isOk(match)) return match;
  return ok({ id: input.id, enabled: input.enabled, match: match.value, action: input.action });
}

/** Validates a whole persisted/loaded rule list; the whole list is rejected
 *  on the first bad entry (same posture as `Settings` — no silent partial
 *  application of a corrupt blob). */
export function parseFilterRules(raw: unknown): Result<readonly FilterRule[], FilterRuleError> {
  if (!Array.isArray(raw)) return err({ kind: "InvalidRule", detail: "rules must be an array" });
  const rules: FilterRule[] = [];
  for (const entry of raw) {
    const parsed = makeFilterRule(entry as { id: unknown; enabled: unknown; match: unknown; action: unknown });
    if (!isOk(parsed)) return parsed;
    rules.push(parsed.value);
  }
  return ok(rules);
}

function matches(match: FilterMatch, def: ItemDefinition): boolean {
  switch (match.kind) {
    case "tag":
      return def.tags.includes(match.tag);
    case "tier":
      return def.tier === match.tier;
    case "name": {
      const q = match.query.trim().toLowerCase();
      if (!q) return false;
      return def.id.toLowerCase().includes(q) || def.displayName.toLowerCase().includes(q);
    }
  }
}

/**
 * Precedence: the first ENABLED rule in list order whose match hits `def`
 * wins — top-to-bottom, exactly like a PoE filter script (list order IS the
 * precedence; later rules never override an earlier match). No matching
 * rule -> `null` ("normal" rendering, no highlight/dim/hide).
 */
export function evaluateItem(rules: readonly FilterRule[], def: ItemDefinition): FilterAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (matches(rule.match, def)) return rule.action;
  }
  return null;
}

/** Convenience for callers that only have an item id — the one entry point
 *  ground-loot (E4.3) and the bank (E4.4) reuse unchanged. Unknown ids
 *  evaluate to `null` (no filter opinion) rather than erroring; a stray/
 *  removed item id should never crash a render pass. */
export function evaluateItemId(
  registry: ItemRegistry,
  rules: readonly FilterRule[],
  itemId: string,
): FilterAction | null {
  const def = registry.get(itemId);
  if (!isOk(def)) return null;
  return evaluateItem(rules, def.value);
}

/** A small, sensible starter set — highlights the two things a new player
 *  most wants to spot at a glance. Cozy-simple: two rules, both additive
 *  (highlight only), nothing hidden/dimmed by default. */
export function defaultFilterRules(): readonly FilterRule[] {
  return [
    { id: "default-food", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" },
    { id: "default-tools", enabled: true, match: { kind: "tag", tag: "tool" }, action: "highlight" },
  ];
}

/** Pure reducer helpers backing the rule-builder UI (add/remove/toggle) —
 *  no rule ever mutates in place. */
export function addRule(rules: readonly FilterRule[], rule: FilterRule): readonly FilterRule[] {
  return [...rules, rule];
}

export function removeRule(rules: readonly FilterRule[], id: string): readonly FilterRule[] {
  return rules.filter((r) => r.id !== id);
}

export function toggleRule(rules: readonly FilterRule[], id: string): readonly FilterRule[] {
  return rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
}
