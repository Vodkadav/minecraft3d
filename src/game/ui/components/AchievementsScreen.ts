/**
 * AchievementsScreen — a grid of locked/unlocked achievements (Workstream
 * 6.4). Mounted as a third tab of the inventory overlay (InventoryScreen.ts)
 * since this game has no separate pause/menu surface in-session — the
 * inventory overlay is the only existing in-game modal, matching how S4's
 * crafting screen was added as a sibling tab rather than a new surface.
 */

import type { Achievement } from "../../domain/progression/ProgressionState";
import type { Localizer } from "../../application/i18n/Localizer";
import { injectStyles } from "../styles";

export interface AchievementsScreenHandle {
  readonly el: HTMLElement;
  render(unlockedIds: readonly string[]): void;
  dispose(): void;
}

export function AchievementsScreen(
  loc: Localizer,
  achievements: readonly Achievement[],
  opts: { doc?: Document } = {},
): AchievementsScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-achievements-grid";
  el.setAttribute("role", "list");
  el.setAttribute("aria-label", loc.t("achievement.title"));

  const cards = new Map<string, { card: HTMLElement; desc: HTMLElement }>();
  for (const a of achievements) {
    const card = doc.createElement("div");
    card.className = "lw-achievement";
    card.setAttribute("role", "listitem");
    card.dataset.achievementId = a.id;
    card.tabIndex = 0;

    const title = doc.createElement("div");
    title.className = "lw-achievement-title";
    title.textContent = loc.t(a.titleKey);

    const desc = doc.createElement("div");
    desc.className = "lw-achievement-desc";

    card.append(title, desc);
    el.appendChild(card);
    cards.set(a.id, { card, desc });
  }

  return {
    el,
    render(unlockedIds): void {
      const unlocked = new Set(unlockedIds);
      for (const a of achievements) {
        const entry = cards.get(a.id);
        if (!entry) continue;
        const isUnlocked = unlocked.has(a.id);
        entry.card.dataset.unlocked = String(isUnlocked);
        entry.desc.textContent = isUnlocked ? loc.t(a.descKey) : loc.t("achievement.locked");
      }
    },
    dispose(): void {
      el.remove();
    },
  };
}
