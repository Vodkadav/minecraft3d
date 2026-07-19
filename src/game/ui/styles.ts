/**
 * Shared UI styling injected once per document. Encodes the accessibility
 * baseline the DOM alone can't express: min 44x44px touch targets, a visible
 * focus ring, and motion suppression under prefers-reduced-motion or the
 * reducedMotion setting (applied as a root data attribute). Views call
 * `injectStyles` on mount; it is idempotent.
 */

import type { Settings } from "../domain/settings/Settings";
import { THEME_CSS_VARS } from "./theme/tokens";

const STYLE_ID = "laas-game-ui-styles";

export const UI_STYLES = `
${THEME_CSS_VARS}
.laas-ui { font-size: calc(1rem * var(--laas-text-scale, 1)); }
.laas-ui, .laas-ui button, .laas-ui select, .laas-ui input {
  font-family: inherit;
}

/* Panel */
.lw-panel {
  background: var(--lw-bg-panel);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-lg);
  padding: var(--lw-space-4);
}

/* Button */
.lw-button {
  background: var(--lw-accent);
  color: var(--lw-bg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-4);
  font-size: var(--lw-font-md);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--lw-motion-fast) ease-out;
}
.lw-button:hover { background: var(--lw-accent-hover); }
.lw-button[data-variant="quiet"] {
  background: transparent;
  color: var(--lw-fg);
}
.lw-button[data-variant="quiet"]:hover { background: var(--lw-border); }

/* Slider */
.lw-slider { display: flex; flex-direction: column; gap: var(--lw-space-1); }
.lw-slider label { color: var(--lw-fg); font-size: var(--lw-font-sm); }
.lw-slider input[type="range"] { accent-color: var(--lw-accent); }

/* Tooltip */
.lw-tooltip {
  position: absolute;
  background: var(--lw-bg-panel);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: var(--lw-space-1) var(--lw-space-2);
  font-size: var(--lw-font-xs);
  pointer-events: none;
  white-space: nowrap;
  z-index: 40;
}

/* Toast */
.lw-toast-region {
  position: fixed;
  top: var(--lw-space-4);
  right: var(--lw-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
  z-index: 50;
  pointer-events: none;
}
.lw-toast {
  background: var(--lw-bg-panel);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-left: 4px solid var(--lw-accent);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-3);
  font-size: var(--lw-font-sm);
  min-width: 200px;
  animation: lw-toast-in var(--lw-motion-base) ease-out;
}
@keyframes lw-toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Bar (health/stamina/hunger) */
.lw-bar {
  position: relative;
  width: 220px;
  height: 20px;
  border-radius: var(--lw-radius-pill);
  background: var(--lw-bg-track);
  border: 1px solid var(--lw-border);
  overflow: hidden;
}
.lw-bar-fill {
  position: absolute;
  inset: 0;
  width: 100%;
  transform-origin: left;
  background: var(--lw-success);
  transition: background var(--lw-motion-fast) ease-out;
}
.lw-bar-fill[data-tone="warning"] { background: var(--lw-warning); }
.lw-bar-fill[data-tone="danger"] { background: var(--lw-danger); }
.lw-bar-fill[data-critical="true"] { animation: lw-bar-pulse 900ms ease-in-out infinite; }
@keyframes lw-bar-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
}
.lw-bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--lw-space-1);
  font-size: var(--lw-font-xs);
  font-weight: 700;
  color: var(--lw-fg);
}
.lw-bar-label span {
  background: var(--lw-label-chip-bg);
  border-radius: var(--lw-radius-sm);
  padding: 0 var(--lw-space-1);
}
.lw-vitals-cluster {
  position: fixed;
  left: 50%;
  bottom: var(--lw-space-4);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
  z-index: 20;
  pointer-events: none;
}

/* Hotbar */
.lw-hotbar {
  position: fixed;
  left: 50%;
  bottom: var(--lw-space-6);
  transform: translateX(-50%);
  display: flex;
  gap: var(--lw-space-1);
  z-index: 20;
  list-style: none;
  margin: 0;
  padding: 0;
}
.lw-hotbar-slot {
  position: relative;
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  background: var(--lw-bg-panel);
  border: 2px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  color: var(--lw-fg);
  font-size: var(--lw-font-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  padding: var(--lw-space-1);
  cursor: pointer;
}
.lw-hotbar-slot[data-selected="true"] {
  border-color: var(--lw-focus);
  box-shadow: 0 0 0 2px var(--lw-focus);
}
.lw-hotbar-slot-key {
  position: absolute;
  top: 1px;
  left: 3px;
  font-size: 0.6rem;
  color: var(--lw-fg-muted);
}
.lw-hotbar-slot-count {
  position: absolute;
  bottom: 1px;
  right: 3px;
  font-size: 0.65rem;
  color: var(--lw-fg);
  text-shadow: 0 1px 1px #000;
}

/* Crosshair */
.lw-crosshair {
  position: fixed;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  pointer-events: none;
  z-index: 15;
}
.lw-crosshair::before,
.lw-crosshair::after {
  content: "";
  position: absolute;
  background: var(--lw-fg);
  box-shadow: 0 0 2px rgba(0,0,0,0.9);
}
.lw-crosshair[data-state="default"]::before {
  left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%;
}
.lw-crosshair[data-state="default"]::after { content: none; }
.lw-crosshair[data-state="attack"] { background: var(--lw-danger); border-radius: 50%; opacity: 0.9; }
.lw-crosshair[data-state="attack"]::before { left: 3px; top: 9px; width: 14px; height: 2px; }
.lw-crosshair[data-state="attack"]::after { left: 9px; top: 3px; width: 2px; height: 14px; }
.lw-crosshair[data-state="interact"] {
  border: 2px solid var(--lw-accent);
  border-radius: 50%;
}
.lw-crosshair[data-state="interact"]::before,
.lw-crosshair[data-state="interact"]::after { content: none; }
.lw-crosshair[data-state="mine"]::before {
  left: 50%; top: 2px; width: 2px; height: 16px; margin-left: -1px; background: var(--lw-warning);
}
.lw-crosshair[data-state="mine"]::after {
  left: 2px; top: 50%; width: 16px; height: 2px; margin-top: -1px; background: var(--lw-warning);
}
.lw-crosshair[data-state="place"] {
  border: 2px dashed var(--lw-success);
  border-radius: var(--lw-radius-sm);
}
.lw-crosshair[data-state="place"]::before,
.lw-crosshair[data-state="place"]::after { content: none; }

/* Keyhint */
.lw-keyhint {
  display: inline-flex;
  align-items: center;
  gap: var(--lw-space-1);
  color: var(--lw-fg-muted);
  font-size: var(--lw-font-xs);
}
.lw-keyhint-key {
  background: var(--lw-bg-panel);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: 0 var(--lw-space-1);
  color: var(--lw-fg);
  font-weight: 700;
  min-width: 1.25rem;
  text-align: center;
}

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
