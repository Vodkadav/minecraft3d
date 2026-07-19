/**
 * Panel — the themed container every screen/HUD cluster sits inside.
 * Framework-free: a labelled <section> using the `lw-panel` theme class.
 */

import { injectStyles } from "../styles";

export interface PanelOptions {
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function Panel(children: readonly HTMLElement[], opts: PanelOptions = {}): HTMLElement {
  const doc = document;
  injectStyles(doc);
  const el = doc.createElement("section");
  el.className = ["laas-ui", "lw-panel", opts.className].filter(Boolean).join(" ");
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  el.append(...children);
  return el;
}
