/**
 * ItemFilterEditor — the PoE-style item-filter rule BUILDER (Workstream
 * E4.2). Cozy constraint: dropdowns + toggles only, never a text DSL. Every
 * change funnels through the pure `domain/inventory/ItemFilter` reducers
 * (addRule/removeRule/toggleRule) so the component owns no filter logic of
 * its own — it just renders the rule list and a small "add a rule" form,
 * and reports the resulting list via `onChange`. Themed (Panel/Button),
 * keyboard-operable (native select/input/button/checkbox), i18n throughout.
 */

import {
  addRule,
  removeRule,
  toggleRule,
  type FilterAction,
  type FilterMatch,
  type FilterRule,
} from "../../domain/inventory/ItemFilter";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { Localizer } from "../../application/i18n/Localizer";
import { Button } from "./Button";
import { injectStyles } from "../styles";

export interface ItemFilterEditorOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  onChange?(rules: readonly FilterRule[]): void;
  readonly doc?: Document;
}

export interface ItemFilterEditorHandle {
  readonly el: HTMLElement;
  render(rules: readonly FilterRule[]): void;
  dispose(): void;
}

type MatchKind = FilterMatch["kind"];
const MATCH_KINDS: readonly MatchKind[] = ["tag", "tier", "name"];
const ACTIONS: readonly FilterAction[] = ["highlight", "dim", "hide"];

let ruleSeq = 0;

function field(doc: Document, id: string, labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = doc.createElement("div");
  wrapper.className = "lw-filter-field";
  const label = doc.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  wrapper.append(label, control);
  return wrapper;
}

export function ItemFilterEditor(opts: ItemFilterEditorOptions): ItemFilterEditorHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-filter-editor";

  const heading = doc.createElement("h2");
  heading.textContent = opts.loc.t("filter.title");

  const list = doc.createElement("ul");
  list.className = "lw-filter-list";
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", opts.loc.t("filter.title"));

  const empty = doc.createElement("p");
  empty.className = "lw-filter-empty";
  empty.textContent = opts.loc.t("filter.rules.empty");

  const form = doc.createElement("form");
  form.className = "lw-filter-add";
  form.setAttribute("aria-label", opts.loc.t("filter.add.title"));

  const kindSelect = doc.createElement("select");
  for (const kind of MATCH_KINDS) {
    const o = doc.createElement("option");
    o.value = kind;
    o.textContent = opts.loc.t(`filter.add.matchKind.${kind}`);
    kindSelect.appendChild(o);
  }

  const tagSelect = doc.createElement("select");
  const uniqueTags = [...new Set(opts.registry.all().flatMap((d) => d.tags))].sort();
  for (const tag of uniqueTags) {
    const o = doc.createElement("option");
    o.value = tag;
    o.textContent = tag;
    tagSelect.appendChild(o);
  }

  const tierSelect = doc.createElement("select");
  const uniqueTiers = [...new Set(opts.registry.all().map((d) => d.tier))].sort((a, b) => a - b);
  for (const tier of uniqueTiers) {
    const o = doc.createElement("option");
    o.value = String(tier);
    o.textContent = String(tier);
    tierSelect.appendChild(o);
  }

  const nameInput = doc.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = opts.loc.t("filter.add.name.placeholder");

  const matchValueSlot = doc.createElement("div");
  matchValueSlot.className = "lw-filter-add-matchvalue";

  const actionSelect = doc.createElement("select");
  for (const action of ACTIONS) {
    const o = doc.createElement("option");
    o.value = action;
    o.textContent = opts.loc.t(`filter.action.${action}`);
    actionSelect.appendChild(o);
  }

  // Submitting the form (Enter in a field, or clicking this button) fires
  // one native "submit" event — the form listener below is the single call
  // site for onAdd(), so this button carries no onClick of its own.
  const addButton = Button({
    label: opts.loc.t("filter.add.button"),
    ariaLabel: opts.loc.t("filter.add.button.aria"),
  });
  addButton.type = "submit";

  function controlFor(kind: MatchKind): HTMLElement {
    if (kind === "tag") return field(doc, "lw-filter-add-tag", opts.loc.t("filter.add.tag"), tagSelect);
    if (kind === "tier") return field(doc, "lw-filter-add-tier", opts.loc.t("filter.add.tier"), tierSelect);
    return field(doc, "lw-filter-add-name", opts.loc.t("filter.add.name"), nameInput);
  }

  function syncMatchValueControl(): void {
    matchValueSlot.replaceChildren(controlFor(kindSelect.value as MatchKind));
  }
  kindSelect.addEventListener("change", syncMatchValueControl);
  syncMatchValueControl();

  form.append(
    field(doc, "lw-filter-add-kind", opts.loc.t("filter.add.matchKind"), kindSelect),
    matchValueSlot,
    field(doc, "lw-filter-add-action", opts.loc.t("filter.add.action"), actionSelect),
    addButton,
  );

  el.append(heading, list, empty, form);

  let rules: readonly FilterRule[] = [];

  function matchOf(): FilterMatch | null {
    const kind = kindSelect.value as MatchKind;
    if (kind === "tag") {
      if (!tagSelect.value) return null;
      return { kind: "tag", tag: tagSelect.value };
    }
    if (kind === "tier") {
      if (!tierSelect.value) return null;
      return { kind: "tier", tier: Number(tierSelect.value) };
    }
    const query = nameInput.value.trim();
    if (!query) return null;
    return { kind: "name", query };
  }

  function summaryFor(rule: FilterRule): string {
    const action = opts.loc.t(`filter.action.${rule.action}`);
    if (rule.match.kind === "tag") return opts.loc.t("filter.rule.summary.tag", { tag: rule.match.tag, action });
    if (rule.match.kind === "tier") return opts.loc.t("filter.rule.summary.tier", { tier: rule.match.tier, action });
    return opts.loc.t("filter.rule.summary.name", { query: rule.match.query, action });
  }

  function emit(next: readonly FilterRule[]): void {
    rules = next;
    renderList();
    opts.onChange?.(rules);
  }

  function onAdd(): void {
    const match = matchOf();
    if (!match) return; // no value chosen yet (e.g. empty name query) — nothing to add
    const rule: FilterRule = {
      id: `rule-${Date.now()}-${++ruleSeq}`,
      enabled: true,
      match,
      action: actionSelect.value as FilterAction,
    };
    emit(addRule(rules, rule));
    nameInput.value = "";
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onAdd();
  });

  function renderList(): void {
    list.replaceChildren();
    empty.hidden = rules.length > 0;
    for (const rule of rules) {
      const li = doc.createElement("li");
      li.className = "lw-filter-rule";
      li.dataset.ruleId = rule.id;

      const toggle = doc.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = rule.enabled;
      const summary = summaryFor(rule);
      toggle.setAttribute("aria-label", opts.loc.t("filter.rule.toggle.aria", { summary }));
      toggle.addEventListener("change", () => emit(toggleRule(rules, rule.id)));

      const label = doc.createElement("span");
      label.className = "lw-filter-rule-summary";
      label.textContent = summary;

      const remove = Button({
        label: opts.loc.t("filter.rule.remove"),
        ariaLabel: opts.loc.t("filter.rule.remove.aria", { summary }),
        variant: "quiet",
        onClick: () => emit(removeRule(rules, rule.id)),
      });

      li.append(toggle, label, remove);
      list.appendChild(li);
    }
  }
  renderList();

  return {
    el,
    render(next: readonly FilterRule[]): void {
      rules = next;
      renderList();
    },
    dispose(): void {
      el.remove();
    },
  };
}
