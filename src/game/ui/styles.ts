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

/* E2.1: Diablo-style corner orbs + level portrait. Procedural CSS only (no
   binary assets) — circles via border-radius, vertical fill via scaleY on
   the same .lw-bar-fill element the bar layout already uses. Health orb at
   the left edge, energy/"focus" orb at the right, portrait centered between
   them; data-layout="bars" (the default) keeps today's centered stack and
   hides the portrait entirely. */
.lw-vitals-cluster[data-layout="orbs"] {
  left: 0;
  right: 0;
  bottom: var(--lw-space-4);
  transform: none;
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0;
  padding: 0 var(--lw-space-6);
}
.lw-bar[data-shape="orb"] {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border-width: 3px;
  flex: none;
}
.lw-bar[data-shape="orb"] .lw-bar-fill {
  transform-origin: bottom;
}
.lw-bar[data-shape="orb"] .lw-bar-label {
  flex-direction: column;
  text-align: center;
}
.lw-vitals-cluster[data-layout="orbs"] #lw-vital-health { order: 1; }
.lw-vitals-cluster[data-layout="orbs"] #lw-vital-stamina { order: 3; }
.lw-vitals-cluster[data-layout="orbs"] #lw-vital-hunger {
  order: 2;
  align-self: center;
  width: 120px;
  height: 12px;
  margin-bottom: var(--lw-space-6);
}
.lw-orb-portrait {
  display: none;
  order: 2;
  align-self: flex-end;
  margin-bottom: var(--lw-space-2);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: var(--lw-bg-panel);
  color: var(--lw-fg);
  border: 3px solid var(--lw-accent);
  font-size: var(--lw-font-md);
  font-weight: 700;
}
.lw-vitals-cluster[data-layout="orbs"] .lw-orb-portrait {
  display: flex;
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

/* Inventory grid (Workstream 4) */
.lw-inv-grid {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
}
.lw-inv-row {
  display: flex;
  gap: var(--lw-space-1);
}
.lw-inv-row-divider {
  padding-top: var(--lw-space-2);
  border-top: 1px dashed var(--lw-border);
  margin-top: var(--lw-space-1);
}
.lw-inv-slot {
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
.lw-inv-slot[data-picked="true"] {
  border-color: var(--lw-accent);
  box-shadow: 0 0 0 2px var(--lw-accent);
}
/* Item filter (Workstream E4.2) — highlight/dim/hide per matching rule. */
.lw-inv-slot[data-filter-action="highlight"] {
  border-color: var(--lw-success);
  box-shadow: 0 0 0 2px var(--lw-success);
}
.lw-inv-slot[data-filter-action="dim"] {
  opacity: 0.55;
}
.lw-inv-slot[data-filter-action="hide"] {
  opacity: 0.15;
  filter: grayscale(1);
}
.lw-inv-slot:focus-visible {
  outline: 3px solid var(--lw-focus);
  outline-offset: 2px;
}
.lw-inv-slot-name {
  font-size: 0.65rem;
  line-height: 1.1;
}
.lw-inv-slot-count {
  position: absolute;
  bottom: 1px;
  right: 3px;
  font-size: 0.65rem;
  color: var(--lw-fg);
  text-shadow: 0 1px 1px #000;
}

/* Item filter editor (Workstream E4.2) */
.lw-filter-editor {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-3);
  max-height: 70vh;
  overflow-y: auto;
}
.lw-filter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.lw-filter-rule {
  display: flex;
  align-items: center;
  gap: var(--lw-space-2);
  padding: var(--lw-space-2);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
}
.lw-filter-rule-summary { flex: 1; }
.lw-filter-empty { color: var(--lw-fg-muted); }
.lw-filter-add {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--lw-space-3);
}
.lw-filter-field {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
}
.lw-filter-field label { color: var(--lw-fg); font-size: var(--lw-font-sm); }
.lw-filter-field select,
.lw-filter-field input {
  background: var(--lw-bg-track);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: var(--lw-space-1) var(--lw-space-2);
  min-height: 44px;
}

.lw-chest-body {
  display: flex;
  gap: var(--lw-space-4);
}
.lw-chest-column {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.lw-inv-tab-body {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.lw-inv-sort-toolbar {
  display: flex;
  align-items: center;
  gap: var(--lw-space-2);
}
.lw-inv-sort-toolbar select {
  background: var(--lw-bg-track);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: var(--lw-space-1) var(--lw-space-2);
  min-height: 44px;
}

/* Crafting screen (Workstream 4) */
.lw-crafting {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-3);
  max-height: 70vh;
  overflow-y: auto;
}
.lw-crafting-controls {
  display: flex;
  gap: var(--lw-space-2);
  align-items: center;
}
.lw-crafting-controls input[type="text"] {
  flex: 1;
  background: var(--lw-bg-track);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: var(--lw-space-1) var(--lw-space-2);
}
.lw-crafting-tier {
  font-weight: 700;
  color: var(--lw-fg-muted);
  margin: var(--lw-space-2) 0 0;
}
.lw-crafting-empty {
  color: var(--lw-fg-muted);
}
.lw-recipe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lw-space-3);
  background: var(--lw-bg-panel);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-3);
  margin-bottom: var(--lw-space-2);
}
.lw-recipe[data-locked="true"] {
  opacity: 0.6;
}
.lw-recipe-title {
  font-weight: 700;
}
.lw-recipe-lock {
  font-size: var(--lw-font-xs);
  color: var(--lw-warning);
}
.lw-recipe-ingredients {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lw-space-2);
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
}
.lw-recipe-ingredient[data-satisfied="false"] {
  color: var(--lw-danger);
}
.lw-recipe-actions {
  display: flex;
  gap: var(--lw-space-2);
  flex-shrink: 0;
}

/* Objective tracker (Workstream 6.3) */
.lw-objective-tracker {
  position: fixed;
  top: var(--lw-space-4);
  left: var(--lw-space-4);
  z-index: 20;
  min-width: 220px;
  max-width: 280px;
}
.lw-objective-title {
  font-size: var(--lw-font-xs);
  font-weight: 700;
  color: var(--lw-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lw-objective-text {
  color: var(--lw-fg);
  margin: var(--lw-space-1) 0;
}
.lw-objective-progress {
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
  margin-bottom: var(--lw-space-2);
}

/* Achievements screen (Workstream 6.4) */
.lw-achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--lw-space-2);
  max-height: 60vh;
  overflow-y: auto;
}
.lw-achievement {
  background: var(--lw-bg-panel);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-3);
}
.lw-achievement[data-unlocked="false"] {
  opacity: 0.55;
}
.lw-achievement-title {
  font-weight: 700;
  color: var(--lw-fg);
}
.lw-achievement-desc {
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
  margin-top: var(--lw-space-1);
}

.lw-inv-open-button {
  position: fixed;
  top: var(--lw-space-4);
  right: var(--lw-space-4);
  z-index: 25;
}
.lw-bank-open-button {
  top: calc(var(--lw-space-4) + 44px);
}

/* Inventory/crafting overlay */
.lw-inv-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 60;
}
.lw-inv-overlay-panel {
  min-width: 420px;
  max-width: min(720px, 92vw);
}
.lw-inv-tabs {
  display: flex;
  gap: var(--lw-space-2);
  margin-bottom: var(--lw-space-3);
}
.lw-inv-tabs button[aria-selected="true"] {
  background: var(--lw-accent);
  color: var(--lw-bg);
}
.lw-inv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--lw-space-2);
}

/* Character screen (Phase E1.5) */
.lw-character-body {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-3);
  max-height: 70vh;
  overflow-y: auto;
}
.lw-character-level {
  font-weight: 700;
  font-size: var(--lw-font-md);
  color: var(--lw-fg);
}
.lw-character-xp,
.lw-character-points {
  font-size: var(--lw-font-sm);
  color: var(--lw-fg-muted);
}
.lw-character-attribute-list,
.lw-character-talent-list {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.lw-character-attribute,
.lw-character-talent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lw-space-3);
  background: var(--lw-bg-panel);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-3);
}
.lw-character-talent[data-allocated="true"] {
  border-color: var(--lw-accent);
}
.lw-character-attribute-title,
.lw-character-talent-title {
  font-weight: 700;
}
.lw-character-attribute-desc,
.lw-character-talent-desc {
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
}
.lw-character-talent-lock {
  font-size: var(--lw-font-xs);
  color: var(--lw-warning);
}
.lw-character-attribute-actions {
  display: flex;
  gap: var(--lw-space-2);
  flex-shrink: 0;
}

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

/* Main menu / lobby / settings shell (Workstream 10.3) */
.laas-main-menu,
.laas-lobby,
.laas-settings,
.laas-credits {
  position: relative;
  z-index: 1;
  background: var(--lw-bg-panel);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-lg);
  padding: var(--lw-space-5) var(--lw-space-6);
  max-width: min(480px, 92vw);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-3);
}
.laas-main-menu h1,
.laas-lobby h1,
.laas-settings h1,
.laas-credits h1 {
  color: var(--lw-fg);
  margin: 0 0 var(--lw-space-2);
}
.laas-main-menu nav,
.laas-lobby-footer {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.laas-main-menu button,
.laas-lobby button,
.laas-settings button,
.laas-credits button {
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
.laas-main-menu button:hover,
.laas-lobby button:hover,
.laas-settings button:hover,
.laas-credits button:hover {
  background: var(--lw-accent-hover);
}
.laas-main-menu button[data-first-run="true"] {
  box-shadow: 0 0 0 3px var(--lw-focus);
  animation: lw-bar-pulse 1400ms ease-in-out infinite;
}
.laas-code-row,
.laas-field {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
  text-align: left;
}
.laas-code-row {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}
.laas-code-input,
.laas-field input,
.laas-field select {
  background: var(--lw-bg-track);
  color: var(--lw-fg);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-sm);
  padding: var(--lw-space-1) var(--lw-space-2);
}
.laas-code-status,
.laas-world-empty,
.laas-storage-status {
  color: var(--lw-fg-muted);
  font-size: var(--lw-font-sm);
}
.laas-world-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-2);
}
.laas-world-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lw-space-2);
  background: var(--lw-bg-track);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  padding: var(--lw-space-2) var(--lw-space-3);
}
.laas-seed-picker {
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
}

/* Wordmark (Workstream 10.1) */
.lw-wordmark {
  display: flex;
  justify-content: center;
}
.lw-wordmark svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}
.lw-wordmark[data-size="compact"] svg {
  max-width: 200px;
}

/* Menu backdrop (Workstream 10.2) — procedural parallax hills, no 3D boot */
.lw-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--lw-bg) 70%, #2a3a52),
    var(--lw-bg)
  );
}
.lw-menu-backdrop-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: lw-backdrop-drift linear infinite;
}
.lw-menu-backdrop-layer svg {
  display: block;
  width: 200%;
  height: 100%;
}
@keyframes lw-backdrop-drift {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* Credits (Workstream 10.3) */
.lw-credits-list {
  list-style: none;
  margin: 0 0 var(--lw-space-3);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--lw-space-1);
  text-align: left;
}
.lw-credits-list a {
  color: var(--lw-accent);
}
.lw-credits-note {
  color: var(--lw-fg-muted);
  font-size: var(--lw-font-sm);
}
.lw-credits-madewith {
  color: var(--lw-fg-muted);
  font-size: var(--lw-font-sm);
}

/* Host-offline overlay + room-code badge (src/main.ts) */
.laas-host-offline {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--lw-space-2);
  text-align: center;
  background: rgba(6, 10, 14, 0.82);
  color: var(--lw-fg);
  padding: var(--lw-space-6);
  font: 600 20px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: pre-line;
}
.laas-room-code {
  position: fixed;
  top: var(--lw-space-2);
  right: var(--lw-space-2);
  z-index: 20;
  padding: var(--lw-space-1) var(--lw-space-3);
  font: 700 16px/1.2 ui-monospace, Consolas, monospace;
  letter-spacing: 2px;
  color: var(--lw-fg);
  background: var(--lw-bg-panel);
  border: 1px solid var(--lw-border);
  border-radius: var(--lw-radius-md);
  user-select: text;
/* Combat meter panel (E2.5) — opt-in, L-toggled, OFF by default */
.lw-combat-meter {
  position: fixed;
  bottom: var(--lw-space-4);
  right: var(--lw-space-4);
  z-index: 55;
  min-width: 220px;
  max-width: 300px;
}
.lw-combat-meter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lw-space-2);
  margin-bottom: var(--lw-space-2);
}
.lw-combat-meter-title {
  font-size: var(--lw-font-xs);
  font-weight: 700;
  color: var(--lw-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lw-combat-meter-empty {
  color: var(--lw-fg-muted);
  font-size: var(--lw-font-sm);
}
.lw-combat-meter-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lw-space-2);
  margin-top: var(--lw-space-2);
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
}

/* Perf HUD (Workstream 9.2) — opt-in, F4-toggled, OFF by default */
.lw-perf-hud {
  position: fixed;
  top: var(--lw-space-4);
  right: var(--lw-space-4);
  z-index: 60;
  font-family: ui-monospace, Menlo, monospace;
  font-size: var(--lw-font-xs);
  white-space: pre;
  pointer-events: none;
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

/* Minimap (Phase E3.2) */
.lw-minimap {
  position: fixed;
  top: var(--lw-space-4);
  left: var(--lw-space-4);
  width: 160px;
  height: 160px;
  border-radius: var(--lw-radius-lg);
  border: 2px solid var(--lw-border);
  background: var(--lw-bg-track);
  overflow: hidden;
  z-index: 20;
}
.lw-minimap[data-mobile="true"] {
  width: 96px;
  height: 96px;
}
.lw-minimap-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.lw-minimap-icons {
  position: absolute;
  inset: 0;
}
.lw-map-icon {
  position: absolute;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  margin-top: -5px;
  border-radius: var(--lw-radius-pill);
  border: 1px solid rgba(0, 0, 0, 0.6);
}
.lw-map-icon[data-kind="player"] {
  background: var(--lw-accent);
  width: 12px;
  height: 12px;
  margin-left: -6px;
  margin-top: -6px;
  border-radius: 2px;
}
.lw-map-icon[data-kind="creature"] { background: var(--lw-danger); }
.lw-map-icon[data-kind="peer"] { background: var(--lw-accent-hover); }
.lw-map-icon[data-kind="resourceNode"] { background: var(--lw-success); }
.lw-map-icon[data-kind="groundLoot"] { background: var(--lw-warning); }
.lw-map-icon[data-kind="poi"] { background: var(--lw-focus); }
.lw-map-icon[data-kind="waypoint"] {
  background: var(--lw-fg);
  border-radius: 2px;
  transform: rotate(45deg);
}

/* Full map overlay (Phase E3.3) */
.lw-map-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 60;
}
.lw-map-overlay-panel {
  width: min(900px, 94vw);
  height: min(700px, 88vh);
  display: flex;
  flex-direction: column;
}
.lw-map-canvas-wrap {
  position: relative;
  flex: 1;
  border-radius: var(--lw-radius-md);
  border: 1px solid var(--lw-border);
  background: var(--lw-bg-track);
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.lw-map-canvas-wrap:active { cursor: grabbing; }
.lw-map-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.lw-map-icons {
  position: absolute;
  inset: 0;
}
.lw-map-hint {
  font-size: var(--lw-font-xs);
  color: var(--lw-fg-muted);
  margin-top: var(--lw-space-2);
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
