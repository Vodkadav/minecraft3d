/**
 * Attack-strength cooldown meter (E7.1, plan §4) — Minecraft-1.9-style
 * presentation: a small bar that empties on a swing and refills over the
 * currently-equipped weapon's `1/attackSpeed` seconds
 * (`domain/combat/MeleeResolve.chargeFraction`). Client-side only: the host
 * independently re-derives the real charge when it resolves a hit
 * (`SpawnFieldView.attackChargeFraction`'s doc comment) — this never feeds
 * anything back into simulation, purely a HUD readout.
 *
 * Hidden while at full charge — nothing useful to show — so a no-flags boot
 * (no attack ever thrown) stays visually identical to before E7.1.
 */

import type { Localizer } from "../../application/i18n/Localizer";
import { injectStyles } from "../styles";

export interface AttackMeterHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  /** `charge` 0..1 (see MeleeResolve.chargeFraction) — cheap, call every frame. */
  render(charge: number): void;
  dispose(): void;
}

/** Charge at/above this reads as "fully recharged" for hide purposes —
 *  avoids a persistent barely-visible sliver from float rounding. */
const FULL_CHARGE_EPS = 0.999;

export function mountAttackMeter(loc: Localizer, opts: { doc?: Document } = {}): AttackMeterHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "lw-attack-meter";
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-label", loc.t("combat.attackMeter.aria"));
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.setAttribute("aria-valuenow", "100");
  el.hidden = true;

  const fill = doc.createElement("div");
  fill.className = "lw-attack-meter-fill";
  el.appendChild(fill);
  doc.body.appendChild(el);

  let visible = false;

  return {
    el,
    get visible() {
      return visible;
    },
    render(charge: number): void {
      const c = Math.max(0, Math.min(1, charge));
      visible = c < FULL_CHARGE_EPS;
      el.hidden = !visible;
      fill.style.transform = `scaleX(${c})`;
      el.setAttribute("aria-valuenow", String(Math.round(c * 100)));
    },
    dispose(): void {
      el.remove();
    },
  };
}
