/**
 * Screen-space juice overlay (Workstream 2.5) — a DOM/CSS layer, deliberately
 * NOT a render-pipeline change (the post stack is engine territory): a fixed
 * full-viewport div per effect with a radial-gradient background, opacity
 * driven per-frame from the domain-decayed `VignettePulse` list. Reduced
 * motion: hurt/heal pulses are skipped outright (no flashing), only the
 * persistent low-health vignette remains, at a static opacity.
 */

import type { VignettePulse } from "../game/domain/feel/FeelState";
import { pulseIntensity } from "../game/domain/feel/FeelState";

const LOW_HEALTH_OPACITY = 0.35;

export interface ScreenEffectsHandle {
  /** Called once per frame with the live (already-decaying) pulse list. */
  render(pulses: readonly VignettePulse[]): void;
  setLowHealth(active: boolean): void;
  dispose(): void;
}

export function mountScreenEffects(
  doc: Document,
  reducedMotion: () => boolean,
): ScreenEffectsHandle {
  const base = (color: string): HTMLDivElement => {
    const el = doc.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      `position:fixed;inset:0;z-index:30;pointer-events:none;opacity:0;` +
      `background:radial-gradient(ellipse at center, transparent 55%, ${color} 100%);`;
    doc.body.appendChild(el);
    return el;
  };
  const hurtLayer = base("rgba(193,68,58,0.55)");
  const healLayer = base("rgba(111,174,74,0.4)");
  const lowHealthLayer = base("rgba(193,68,58,0.65)");

  return {
    render(pulses: readonly VignettePulse[]): void {
      if (reducedMotion()) {
        hurtLayer.style.opacity = "0";
        healLayer.style.opacity = "0";
        return;
      }
      let hurt = 0;
      let heal = 0;
      for (const p of pulses) {
        const i = pulseIntensity(p);
        if (p.kind === "hurt") hurt = Math.max(hurt, i);
        else heal = Math.max(heal, i);
      }
      hurtLayer.style.opacity = String(hurt);
      healLayer.style.opacity = String(heal);
    },
    setLowHealth(active: boolean): void {
      lowHealthLayer.style.opacity = active ? String(LOW_HEALTH_OPACITY) : "0";
    },
    dispose(): void {
      hurtLayer.remove();
      healLayer.remove();
      lowHealthLayer.remove();
    },
  };
}
