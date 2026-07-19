// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { defaultFilterRules, type FilterRule } from "../../domain/inventory/ItemFilter";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { createLocalizer } from "../i18n/strings";
import { ItemFilterEditor } from "./ItemFilterEditor";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("ItemFilterEditor", () => {
  it("renders one row per rule with a summary and a toggle", () => {
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry() });
    editor.render(defaultFilterRules());
    const rows = editor.el.querySelectorAll(".lw-filter-rule");
    expect(rows).toHaveLength(defaultFilterRules().length);
    expect(rows[0]?.querySelector("input[type='checkbox']")).toBeTruthy();
  });

  it("shows the empty-state message when there are no rules", () => {
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry() });
    editor.render([]);
    const empty = editor.el.querySelector<HTMLElement>(".lw-filter-empty");
    expect(empty?.hidden).toBe(false);
  });

  it("adding a tag rule via the builder form emits the new rule list (no text DSL)", () => {
    const onChange = vi.fn();
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry(), onChange });
    editor.render([]);
    document.body.appendChild(editor.el); // form submit needs a connected DOM tree

    const kindSelect = editor.el.querySelector<HTMLSelectElement>("#lw-filter-add-kind");
    expect(kindSelect?.value).toBe("tag"); // default match kind
    const tagSelect = editor.el.querySelector<HTMLSelectElement>("#lw-filter-add-tag");
    expect(tagSelect).toBeTruthy(); // a dropdown, never a free-text DSL field
    tagSelect!.value = "tool";
    const actionSelect = editor.el.querySelector<HTMLSelectElement>("#lw-filter-add-action");
    actionSelect!.value = "dim";

    editor.el.querySelector<HTMLButtonElement>(".lw-filter-add button[type='submit']")?.click();

    expect(onChange).toHaveBeenCalledTimes(1);
    const rules: readonly FilterRule[] = onChange.mock.calls[0][0];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ enabled: true, match: { kind: "tag", tag: "tool" }, action: "dim" });
    editor.el.remove();
  });

  it("switching match kind swaps the value control (tier select instead of tag select)", () => {
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry() });
    editor.render([]);
    const kindSelect = editor.el.querySelector<HTMLSelectElement>("#lw-filter-add-kind")!;
    kindSelect.value = "tier";
    kindSelect.dispatchEvent(new Event("change"));
    expect(editor.el.querySelector("#lw-filter-add-tier")).toBeTruthy();
    expect(editor.el.querySelector("#lw-filter-add-tag")).toBeFalsy();
  });

  it("toggling a rule's checkbox emits the flipped rule list", () => {
    const onChange = vi.fn();
    const rules = defaultFilterRules();
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry(), onChange });
    editor.render(rules);
    const checkbox = editor.el.querySelector<HTMLInputElement>(".lw-filter-rule input[type='checkbox']")!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: readonly FilterRule[] = onChange.mock.calls[0][0];
    expect(next.find((r) => r.id === rules[0]!.id)?.enabled).toBe(false);
  });

  it("removing a rule emits the list without it", () => {
    const onChange = vi.fn();
    const rules = defaultFilterRules();
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry(), onChange });
    editor.render(rules);
    const removeBtn = [...editor.el.querySelectorAll("button")].find((b) => b.textContent === "Remove");
    removeBtn?.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: readonly FilterRule[] = onChange.mock.calls[0][0];
    expect(next).toHaveLength(rules.length - 1);
  });

  it("dispose removes the mounted editor", () => {
    const editor = ItemFilterEditor({ loc: createLocalizer("en"), registry: registry() });
    document.body.appendChild(editor.el);
    editor.dispose();
    expect(document.body.contains(editor.el)).toBe(false);
  });
});
