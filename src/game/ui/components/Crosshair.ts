/**
 * Crosshair — a context-sensitive reticle. Purely presentational: it renders
 * whatever `CrosshairState` (`domain/ui/CrosshairState`) it's given via
 * `setState`; the composition root feeds it from the actual game/aim state.
 * Procedural CSS shapes (dot/cross/ring/diamond/dashed box) — no icon art.
 */

import type { CrosshairState } from "../../domain/ui/CrosshairState";
import { injectStyles } from "../styles";

export interface CrosshairHandle {
  readonly el: HTMLElement;
  setState(state: CrosshairState): void;
  dispose(): void;
}

export function Crosshair(doc: Document = document): CrosshairHandle {
  injectStyles(doc);
  const el = doc.createElement("div");
  el.className = "lw-crosshair";
  el.dataset.state = "default";
  el.setAttribute("aria-hidden", "true");
  doc.body.appendChild(el);

  return {
    el,
    setState(state: CrosshairState): void {
      el.dataset.state = state;
    },
    dispose(): void {
      el.remove();
    },
  };
}
