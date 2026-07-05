/**
 * Shared UI styling injected once per document. Encodes the accessibility
 * baseline the DOM alone can't express: min 44x44px touch targets, a visible
 * focus ring, and motion suppression under prefers-reduced-motion or the
 * reducedMotion setting (applied as a root data attribute). Views call
 * `injectStyles` on mount; it is idempotent.
 */

import type { Settings } from "../domain/settings/Settings";

const STYLE_ID = "laas-game-ui-styles";

export const UI_STYLES = `
.laas-ui { font-size: calc(1rem * var(--laas-text-scale, 1)); }
.laas-ui button,
.laas-ui select,
.laas-ui input[type="range"],
.laas-ui input[type="number"] {
  min-width: 44px;
  min-height: 44px;
  font-size: inherit;
}
.laas-ui :focus-visible {
  outline: 3px solid currentColor;
  outline-offset: 2px;
}
.laas-ui[data-high-contrast="true"] {
  --laas-fg: #000;
  --laas-bg: #fff;
  color: var(--laas-fg);
  background: var(--laas-bg);
}
@media (prefers-reduced-motion: reduce) {
  .laas-ui *, .laas-ui *::before, .laas-ui *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
:root[data-reduced-motion="true"] .laas-ui *,
:root[data-reduced-motion="true"] .laas-ui *::before,
:root[data-reduced-motion="true"] .laas-ui *::after {
  animation-duration: 0.001ms !important;
  transition-duration: 0.001ms !important;
}
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = UI_STYLES;
  doc.head.appendChild(style);
}

/**
 * Reflect accessibility settings onto the DOM: text scale as a CSS variable,
 * high-contrast + reduced-motion as data attributes the stylesheet keys off.
 * Colour is never the sole signal — these are structural, not colour-only.
 */
export function applyAccessibility(root: HTMLElement, settings: Settings): void {
  root.style.setProperty("--laas-text-scale", String(settings.textScale));
  root.dataset.highContrast = String(settings.highContrast);
  const doc = root.ownerDocument;
  doc.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
}
