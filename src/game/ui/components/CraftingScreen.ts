/**
 * CraftingScreen — recipe browser over the existing `domain/crafting` graph
 * (Workstream 4, task 4.2): grouped by tier, a search box, a "craftable now"
 * filter (the existing `canCraft` resolver), an ingredient have/need panel,
 * and craft / craft-all buttons. Locked recipes render disabled with their
 * required tier. Craft goes through the real `doCraft` domain function
 * against the live inventory the composition root owns; on success it plays
 * the Workstream-1 `craft` audio event (closes S1's deferred SFX wiring).
 */

import { isOk } from "../../domain/Result";
import {
  canCraft,
  doCraft,
  ingredientStatus,
  type Recipe,
} from "../../domain/crafting/Crafting";
import type { Inventory } from "../../domain/inventory/Inventory";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import { filterRecipes, groupByTier } from "../../domain/ui/CraftingFilter";
import type { AudioPort } from "../../application/ports/AudioPort";
import type { Localizer } from "../../application/i18n/Localizer";
import { itemDisplayName } from "../i18n/itemNames";
import { injectStyles } from "../styles";

const MAX_CRAFT_ALL = 999;

export interface CraftingScreenOptions {
  readonly registry: ItemRegistry;
  readonly loc: Localizer;
  readonly recipes: readonly Recipe[];
  readonly unlockedTier: number;
  readonly audio?: AudioPort;
  onChange?(next: Inventory): void;
  readonly doc?: Document;
}

export interface CraftingScreenHandle {
  readonly el: HTMLElement;
  render(inventory: Inventory): void;
  dispose(): void;
}

export function CraftingScreen(opts: CraftingScreenOptions): CraftingScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-crafting";

  const controls = doc.createElement("div");
  controls.className = "lw-crafting-controls";

  const searchLabel = doc.createElement("label");
  searchLabel.htmlFor = "lw-crafting-search";
  searchLabel.textContent = opts.loc.t("crafting.search");

  const search = doc.createElement("input");
  search.type = "text";
  search.id = "lw-crafting-search";
  search.placeholder = opts.loc.t("crafting.search.placeholder");
  search.setAttribute("aria-label", opts.loc.t("crafting.search"));

  const craftableOnlyLabel = doc.createElement("label");
  const craftableOnly = doc.createElement("input");
  craftableOnly.type = "checkbox";
  craftableOnlyLabel.append(craftableOnly, doc.createTextNode(` ${opts.loc.t("crafting.craftableOnly")}`));

  controls.append(searchLabel, search, craftableOnlyLabel);

  const list = doc.createElement("div");
  list.className = "lw-crafting-list";

  el.append(controls, list);

  let inventory: Inventory | null = null;
  let searchQuery = "";
  let onlyCraftable = false;

  function nameFor(itemId: string): string {
    return itemDisplayName(opts.loc, opts.registry, itemId);
  }

  function craft(recipe: Recipe): void {
    if (!inventory) return;
    const result = doCraft(inventory, recipe, opts.unlockedTier);
    if (!isOk(result)) return;
    inventory = result.value;
    opts.audio?.play("craft");
    opts.onChange?.(inventory);
    renderList();
  }

  function craftAll(recipe: Recipe): void {
    if (!inventory) return;
    let crafted = 0;
    while (crafted < MAX_CRAFT_ALL && isOk(canCraft(inventory, recipe, opts.unlockedTier))) {
      const result = doCraft(inventory, recipe, opts.unlockedTier);
      if (!isOk(result)) break;
      inventory = result.value;
      crafted++;
    }
    if (crafted > 0) {
      opts.audio?.play("craft");
      opts.onChange?.(inventory);
    }
    renderList();
  }

  function buildRecipeRow(recipe: Recipe): HTMLElement {
    const inv = inventory;
    const row = doc.createElement("div");
    row.className = "lw-recipe";
    row.dataset.recipeId = recipe.id;

    const locked = inv ? !isOk(canCraft(inv, recipe, opts.unlockedTier)) : true;
    const lockedByTier = recipe.unlockTier > opts.unlockedTier;
    row.dataset.locked = String(lockedByTier);

    const info = doc.createElement("div");
    const title = doc.createElement("div");
    title.className = "lw-recipe-title";
    title.textContent = `${nameFor(recipe.output.itemId)} x${recipe.output.count}`;
    info.appendChild(title);

    const ingredients = doc.createElement("div");
    ingredients.className = "lw-recipe-ingredients";
    const status = inv ? ingredientStatus(inv, recipe) : recipe.ingredients.map((i) => ({
      itemId: i.itemId,
      need: i.count,
      have: 0,
      satisfied: false,
    }));
    for (const s of status) {
      const chip = doc.createElement("span");
      chip.className = "lw-recipe-ingredient";
      chip.dataset.satisfied = String(s.satisfied);
      chip.textContent = opts.loc.t("crafting.need", { name: nameFor(s.itemId), count: s.need, have: s.have });
      ingredients.appendChild(chip);
    }
    info.appendChild(ingredients);

    if (lockedByTier) {
      const lockNote = doc.createElement("div");
      lockNote.className = "lw-recipe-lock";
      lockNote.textContent = opts.loc.t("crafting.locked", { n: recipe.unlockTier });
      info.appendChild(lockNote);
    }

    const actions = doc.createElement("div");
    actions.className = "lw-recipe-actions";

    const craftBtn = doc.createElement("button");
    craftBtn.type = "button";
    craftBtn.className = "laas-ui lw-button";
    craftBtn.textContent = opts.loc.t("crafting.craft");
    craftBtn.disabled = locked;
    craftBtn.addEventListener("click", () => craft(recipe));

    const craftAllBtn = doc.createElement("button");
    craftAllBtn.type = "button";
    craftAllBtn.className = "laas-ui lw-button";
    craftAllBtn.dataset.variant = "quiet";
    craftAllBtn.textContent = opts.loc.t("crafting.craftAll");
    craftAllBtn.disabled = locked;
    craftAllBtn.addEventListener("click", () => craftAll(recipe));

    actions.append(craftBtn, craftAllBtn);

    row.append(info, actions);
    return row;
  }

  function renderList(): void {
    list.replaceChildren();
    if (!inventory) return;
    const filtered = filterRecipes({
      recipes: opts.recipes,
      inventory,
      unlockedTier: opts.unlockedTier,
      search: searchQuery,
      craftableOnly: onlyCraftable,
      nameOf: nameFor,
    });
    if (filtered.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "lw-crafting-empty";
      empty.textContent = opts.loc.t("crafting.empty");
      list.appendChild(empty);
      return;
    }
    const grouped = groupByTier(filtered);
    for (const [tier, recipes] of grouped) {
      const heading = doc.createElement("h3");
      heading.className = "lw-crafting-tier";
      heading.textContent = opts.loc.t("crafting.tier", { n: tier });
      list.appendChild(heading);
      for (const recipe of recipes) list.appendChild(buildRecipeRow(recipe));
    }
  }

  search.addEventListener("input", () => {
    searchQuery = search.value;
    renderList();
  });
  craftableOnly.addEventListener("change", () => {
    onlyCraftable = craftableOnly.checked;
    renderList();
  });

  return {
    el,
    render(next: Inventory): void {
      inventory = next;
      renderList();
    },
    dispose(): void {
      el.remove();
    },
  };
}
