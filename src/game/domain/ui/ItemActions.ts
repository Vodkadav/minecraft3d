/**
 * Pure item-action-list logic (Phase E8.4): given a slot's state, produces the
 * ordered set of context-menu actions `ContextMenu.ts` renders. No DOM, no
 * Inventory knowledge beyond the plain fields the caller already has —
 * mirrors `InventoryGridState.ts`'s "pure view-state, component composes it"
 * split.
 *
 * "Use"/"Equip" only appear when the item's tags say they apply (a rock
 * doesn't offer "Eat"); "Quick Move" only appears when the grid has a
 * hotbar/backpack zone to move between (matches the existing double-click
 * quick-move gate in `InventoryGrid.ts`). "Split"/"Drop"/"Info" always appear
 * for a non-empty slot, each with its own `enabled` flag — Split is the one
 * carried over unchanged from the old ad-hoc `contextmenu` handler (enabled
 * only for a stack of 2+). An empty slot offers no actions at all, matching
 * the prior handler's silent no-op on an empty right-click.
 */

export type ItemActionId = "use" | "equip" | "split" | "quickMove" | "linkToChat" | "drop" | "info";

export interface ItemAction {
  readonly id: ItemActionId;
  /** i18n key the component looks up via `Localizer.t()` — never a literal string. */
  readonly labelKey: string;
  readonly enabled: boolean;
}

export interface ItemActionContext {
  /** null = empty slot. */
  readonly itemId: string | null;
  readonly count: number;
  readonly tags: readonly string[];
  /** Whether the grid this slot lives in has a hotbar/backpack zone split to
   *  quick-move between (i.e. `hotbarSize > 0` in `InventoryGrid`). */
  readonly canQuickMove: boolean;
  /** Whether an item→chat link handler is wired (E8.5) — only the play HUD's
   *  grid can reach the chat composer, so isolated grids (chest/bank/trade,
   *  tests) leave this unset and never offer the action. */
  readonly canLink?: boolean;
}

export function itemActions(ctx: ItemActionContext): readonly ItemAction[] {
  if (ctx.itemId === null) return [];

  const actions: ItemAction[] = [];
  if (ctx.tags.includes("food")) {
    actions.push({ id: "use", labelKey: "contextMenu.action.use", enabled: true });
  }
  if (ctx.tags.includes("weapon")) {
    actions.push({ id: "equip", labelKey: "contextMenu.action.equip", enabled: true });
  }
  actions.push({ id: "split", labelKey: "contextMenu.action.split", enabled: ctx.count > 1 });
  if (ctx.canQuickMove) {
    actions.push({ id: "quickMove", labelKey: "contextMenu.action.quickMove", enabled: true });
  }
  if (ctx.canLink) {
    actions.push({ id: "linkToChat", labelKey: "contextMenu.action.linkToChat", enabled: true });
  }
  actions.push({ id: "drop", labelKey: "contextMenu.action.drop", enabled: true });
  actions.push({ id: "info", labelKey: "contextMenu.action.info", enabled: true });
  return actions;
}
