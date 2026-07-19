/**
 * Button — a real <button> with the theme's tap/click styling. `variant`
 * "quiet" is a low-emphasis (secondary) action; default is the accent CTA.
 * Keyboard-operable and focus-visible for free (native <button>).
 */

import { injectStyles } from "../styles";

export interface ButtonOptions {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly variant?: "default" | "quiet";
  onClick?(): void;
}

export function Button(opts: ButtonOptions): HTMLButtonElement {
  const doc = document;
  injectStyles(doc);
  const el = doc.createElement("button");
  el.type = "button";
  el.className = "laas-ui lw-button";
  if (opts.variant && opts.variant !== "default") el.dataset.variant = opts.variant;
  el.textContent = opts.label;
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.onClick) el.addEventListener("click", opts.onClick);
  return el;
}
