/**
 * Spellcasting focus gauge (E7.3, plan §4) — mirrors `AttackMeter.ts`'s
 * shape exactly (a slim bar, hidden at full — nothing useful to show).
 * Client-side readout only: the host independently re-derives the real
 * focus cost/affordability when it resolves a `castSpell`
 * (`HostSession.handleCastSpell`) — this never feeds anything back into
 * simulation, purely a HUD readout of `domain/survival/Focus`.
 *
 * Hidden while at full focus, so a no-flags boot (no spell ever cast) stays
 * visually identical to before E7.3.
 */

import type { Localizer } from "../../application/i18n/Localizer";
import { injectStyles } from "../styles";

export interface CastBarHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  /** `focusFraction` 0..1 (current focus / max focus) — cheap, call every frame. */
  render(focusFraction: number): void;
  dispose(): void;
}

/** Focus at/above this reads as "fully recharged" for hide purposes —
 *  avoids a persistent barely-visible sliver from float rounding. */
const FULL_FOCUS_EPS = 0.999;

export function mountCastBar(loc: Localizer, opts: { doc?: Document } = {}): CastBarHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "lw-cast-bar";
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-label", loc.t("combat.castBar.aria"));
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.setAttribute("aria-valuenow", "100");
  el.hidden = true;

  const fill = doc.createElement("div");
  fill.className = "lw-cast-bar-fill";
  el.appendChild(fill);
  doc.body.appendChild(el);

  let visible = false;

  return {
    el,
    get visible() {
      return visible;
    },
    render(focusFraction: number): void {
      const f = Math.max(0, Math.min(1, focusFraction));
      visible = f < FULL_FOCUS_EPS;
      el.hidden = !visible;
      fill.style.transform = `scaleX(${f})`;
      el.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    },
    dispose(): void {
      el.remove();
    },
  };
}
