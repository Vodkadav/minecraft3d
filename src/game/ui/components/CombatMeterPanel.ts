/**
 * Combat meter panel (E2.5/E5.6) — a collapsible, keyboard-toggled ("L") HUD
 * panel showing a damage meter: presentation only over the pure
 * `domain/combat/CombatLog` fold. Hidden by default (opt-in, same posture as
 * `PerfHud`'s F4 — a no-flags boot stays visually identical). Cozy framing:
 * celebratory per-source stat line, never a shaming leaderboard.
 *
 * Solo (no party): one "You" row from the local `CombatLogState`. In a party
 * (E5.6), the optional `partyMembers` param — the same `party` roster stream
 * E5.1 already delivers, reusing its `damageDealt`/`dps`/`healing`/`kills`
 * fields — ranks every member's contribution instead, highest damage first.
 */

import {
  LOCAL_PLAYER_SOURCE_ID,
  dpsFor,
  totalsFor,
  type CombatLogState,
} from "../../domain/combat/CombatLog";
import type { PartyMemberInfo } from "../../domain/net/Protocol";
import type { Localizer } from "../../application/i18n/Localizer";
import { Bar, type BarHandle } from "./Bar";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface CombatMeterPanelHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  setVisible(v: boolean): void;
  /** Redraw from the current fold state; `nowMs` drives the live DPS figure.
   *  `partyMembers` (E5.6), when non-empty, switches to a ranked multi-row
   *  meter driven by the party roster instead of the solo `state`/`nowMs`. */
  render(state: CombatLogState, nowMs: number, partyMembers?: readonly PartyMemberInfo[]): void;
  dispose(): void;
}

/** Ranked-order copy of `partyMembers`, highest damage dealt first. */
function rankByDamage(members: readonly PartyMemberInfo[]): readonly PartyMemberInfo[] {
  return [...members].sort((a, b) => b.damageDealt - a.damageDealt);
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
  let bars: BarHandle[] = [];

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
    render(state, nowMs, partyMembers): void {
      // Bar's `max` is fixed at construction, so every row is recreated each
      // render — cheap, this only runs on the panel's own throttled redraw,
      // never per frame (same posture as PerfHud).
      for (const b of bars) b.dispose();
      bars = [];
      rows.replaceChildren();

      if (partyMembers && partyMembers.length > 0) {
        const ranked = rankByDamage(partyMembers);
        const hasFought = ranked.some((m) => m.damageDealt > 0 || m.healing > 0 || m.kills > 0);
        empty.hidden = hasFought;
        rows.hidden = !hasFought;
        if (!hasFought) return;

        const topDamage = Math.max(1, ranked[0]?.damageDealt ?? 1);
        for (let i = 0; i < ranked.length; i++) {
          const m = ranked[i];
          const rowEl = doc.createElement("div");
          rowEl.className = "lw-combat-meter-row";
          const bar = Bar({
            id: `lw-combat-meter-${m.peerId}`,
            ariaLabel: m.playerName || m.peerId,
            labelText: `${loc.t("party.meter.rank", { n: i + 1 })} ${m.playerName || m.peerId} {n}`,
            max: topDamage,
            initial: m.damageDealt,
          });
          bars.push(bar);
          const stats = doc.createElement("div");
          stats.className = "lw-combat-meter-stats";
          stats.textContent = [
            loc.t("combatLog.stat.dealt", { n: Math.round(m.damageDealt) }),
            loc.t("combatLog.stat.dps", { n: m.dps.toFixed(1) }),
            loc.t("combatLog.stat.healed", { n: Math.round(m.healing) }),
            loc.t("combatLog.stat.kills", { n: m.kills }),
          ].join("   ");
          rowEl.append(bar.el, stats);
          rows.appendChild(rowEl);
        }
        return;
      }

      const hasFought = state.encounterStartMs !== null;
      empty.hidden = hasFought;
      rows.hidden = !hasFought;
      if (!hasFought) return;

      const totals = totalsFor(state, LOCAL_PLAYER_SOURCE_ID);
      const dps = dpsFor(state, LOCAL_PLAYER_SOURCE_ID, nowMs);

      const bar = Bar({
        id: "lw-combat-meter-you",
        ariaLabel: loc.t("combatLog.you"),
        labelText: `${loc.t("combatLog.you")} {n}`,
        max: Math.max(1, totals.damageDealt),
        initial: totals.damageDealt,
      });
      bars.push(bar);

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
      for (const b of bars) b.dispose();
      panel.remove();
    },
  };
}
