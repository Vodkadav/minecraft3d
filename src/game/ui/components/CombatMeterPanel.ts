/**
 * Combat meter panel (E2.5) — a collapsible, keyboard-toggled ("L") HUD
 * panel showing the solo self damage meter: presentation only over the pure
 * `domain/combat/CombatLog` fold. Hidden by default (opt-in, same posture as
 * `PerfHud`'s F4 — a no-flags boot stays visually identical). Cozy framing:
 * celebratory per-source stat line, never a shaming leaderboard — today
 * there's exactly one row ("You"); E5.6 adds more rows from the same
 * `CombatLogState.totals` map with no shape change here.
 */

import {
  LOCAL_PLAYER_SOURCE_ID,
  dpsFor,
  totalsFor,
  type CombatLogState,
} from "../../domain/combat/CombatLog";
import type { Localizer } from "../../application/i18n/Localizer";
import { Bar, type BarHandle } from "./Bar";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface CombatMeterPanelHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  setVisible(v: boolean): void;
  /** Redraw from the current fold state; `nowMs` drives the live DPS figure. */
  render(state: CombatLogState, nowMs: number): void;
  dispose(): void;
}

function isTextInputFocused(doc: Document): boolean {
  const el = doc.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}

export function mountCombatMeterPanel(
  loc: Localizer,
  opts: { doc?: Document } = {},
): CombatMeterPanelHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const title = doc.createElement("div");
  title.className = "lw-combat-meter-title";
  title.textContent = loc.t("combatLog.title");

  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "laas-ui lw-button";
  closeBtn.dataset.variant = "quiet";
  closeBtn.textContent = loc.t("combatLog.close");
  closeBtn.setAttribute("aria-label", loc.t("combatLog.close.aria"));
  closeBtn.addEventListener("click", () => setVisible(false));

  const header = doc.createElement("div");
  header.className = "lw-combat-meter-header";
  header.append(title, closeBtn);

  const empty = doc.createElement("div");
  empty.className = "lw-combat-meter-empty";
  empty.textContent = loc.t("combatLog.empty");

  const rows = doc.createElement("div");
  rows.className = "lw-combat-meter-rows";
  rows.hidden = true;

  const panel = Panel([header, empty, rows], {
    className: "lw-combat-meter",
    ariaLabel: loc.t("combatLog.title"),
  });
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-live", "polite");
  panel.style.display = "none";
  doc.body.appendChild(panel);

  let visible = false;
  let bar: BarHandle | null = null;

  function setVisible(v: boolean): void {
    visible = v;
    panel.style.display = v ? "block" : "none";
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isTextInputFocused(doc)) return;
    if (e.code === "KeyL") {
      setVisible(!visible);
    } else if (e.code === "Escape" && visible) {
      setVisible(false);
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    el: panel,
    get visible() {
      return visible;
    },
    setVisible,
    render(state, nowMs): void {
      const hasFought = state.encounterStartMs !== null;
      empty.hidden = hasFought;
      rows.hidden = !hasFought;
      if (!hasFought) return;

      const totals = totalsFor(state, LOCAL_PLAYER_SOURCE_ID);
      const dps = dpsFor(state, LOCAL_PLAYER_SOURCE_ID, nowMs);

      // Bar's `max` is fixed at construction; a solo meter's own total IS
      // the max (there's nothing to rank against yet), so the row is
      // recreated each render — cheap, this only runs on the panel's own
      // throttled redraw, never per frame (same posture as PerfHud).
      bar?.dispose();
      bar = Bar({
        id: "lw-combat-meter-you",
        ariaLabel: loc.t("combatLog.you"),
        labelText: `${loc.t("combatLog.you")} {n}`,
        max: Math.max(1, totals.damageDealt),
        initial: totals.damageDealt,
      });

      const stats = doc.createElement("div");
      stats.className = "lw-combat-meter-stats";
      stats.textContent = [
        loc.t("combatLog.stat.dealt", { n: Math.round(totals.damageDealt) }),
        loc.t("combatLog.stat.dps", { n: dps.toFixed(1) }),
        loc.t("combatLog.stat.healed", { n: Math.round(totals.healing) }),
        loc.t("combatLog.stat.kills", { n: totals.kills }),
      ].join("   ");

      rows.replaceChildren(bar.el, stats);
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      bar?.dispose();
      panel.remove();
    },
  };
}
