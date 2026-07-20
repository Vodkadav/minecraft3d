/**
 * BuffStrip (E8.7 HUD cohesion) — a small, gentle row of active-effect chips
 * (name + countdown), presentation only over the pure
 * `domain/ui/BuffStripState.ts`. Automatic, not manually toggled: hidden
 * whenever there are no chips to show, mirroring `AttackMeter.ts`/
 * `CastBar.ts`'s "hidden when there's nothing useful to show" posture (so a
 * no-flags boot with no active effects stays visually identical). "Gentle"
 * by design: no shaming/urgent styling, muted surface tokens, no motion
 * beyond what the reduced-motion-safe `laas-ui` baseline already allows.
 *
 * Standing deferral: no real buff/status-effect source exists yet — see
 * `domain/ui/BuffStripState.ts`'s doc comment. This component's `render`
 * takes a plain `BuffChip[]`, so a future effect system wires in without
 * this component changing shape.
 */

import { buffRemainingFraction, formatBuffTimer, type BuffChip } from "../../domain/ui/BuffStripState";
import type { Localizer } from "../../application/i18n/Localizer";
import { attachTooltip, type TooltipHandle } from "./Tooltip";
import { injectStyles } from "../styles";

export interface BuffStripHandle {
  readonly el: HTMLElement;
  /** Renders the given chips; the strip hides itself when `chips` is empty. */
  render(chips: readonly BuffChip[]): void;
  dispose(): void;
}

export function BuffStrip(loc: Localizer, opts: { doc?: Document } = {}): BuffStripHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-buff-strip";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", loc.t("buffStrip.aria"));
  el.hidden = true;
  doc.body.appendChild(el);

  const tooltips: TooltipHandle[] = [];

  return {
    el,
    render(chips: readonly BuffChip[]): void {
      for (const t of tooltips) t.dispose();
      tooltips.length = 0;
      el.replaceChildren();
      el.hidden = chips.length === 0;
      if (chips.length === 0) return;

      for (const chip of chips) {
        const chipEl = doc.createElement("div");
        chipEl.className = "lw-buff-chip";
        chipEl.dataset.kind = chip.kind;

        const timer = doc.createElement("span");
        timer.className = "lw-buff-chip-timer";
        timer.textContent = formatBuffTimer(chip.remainingMs);
        chipEl.appendChild(timer);

        const fraction = doc.createElement("div");
        fraction.className = "lw-buff-chip-fraction";
        fraction.style.transform = `scaleX(${buffRemainingFraction(chip)})`;
        chipEl.appendChild(fraction);

        const name = loc.t(chip.nameKey);
        chipEl.setAttribute(
          "aria-label",
          loc.t(chip.kind === "debuff" ? "buffStrip.chip.debuff.aria" : "buffStrip.chip.buff.aria", {
            name,
            time: formatBuffTimer(chip.remainingMs),
          }),
        );
        el.appendChild(chipEl);
        tooltips.push(attachTooltip(chipEl, name));
      }
    },
    dispose(): void {
      for (const t of tooltips) t.dispose();
      tooltips.length = 0;
      el.remove();
    },
  };
}
