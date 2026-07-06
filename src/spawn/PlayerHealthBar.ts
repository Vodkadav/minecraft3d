/**
 * Player health bar (M6). A minimal player-facing HUD element — the scenes
 * own the PlayerVitals state and drive this. Only mounted in spawn-enabled
 * worlds (no wild creatures ⇒ nothing to take damage from ⇒ no bar).
 *
 * a11y: not colour-only (carries an "HP n/max" label + progressbar role),
 * dark track / bright fill for contrast, and the damage flash is suppressed
 * under prefers-reduced-motion.
 */

const MAX_LABEL = 100;

export interface PlayerHealthBar {
  /** fraction ∈ [0,1]. */
  set(fraction: number): void;
  flashDamage(): void;
  dispose(): void;
}

export function createPlayerHealthBar(doc: Document = document): PlayerHealthBar {
  const reduceMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const root = doc.createElement("div");
  root.id = "laas-health";
  root.setAttribute("role", "progressbar");
  root.setAttribute("aria-label", "Health");
  root.setAttribute("aria-valuemin", "0");
  root.setAttribute("aria-valuemax", String(MAX_LABEL));
  root.style.cssText =
    "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20;" +
    "width:240px;height:22px;border-radius:11px;background:rgba(0,0,0,0.72);" +
    "box-shadow:0 0 0 2px rgba(255,255,255,0.25);overflow:hidden;pointer-events:none;";

  const fill = doc.createElement("div");
  fill.style.cssText =
    "position:absolute;inset:0;width:100%;transform-origin:left;background:#3fbf5f;" +
    (reduceMotion ? "" : "transition:transform 160ms ease-out,background 160ms;");
  root.appendChild(fill);

  const label = doc.createElement("span");
  label.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
    "font:700 12px/1 ui-monospace,Consolas,monospace;color:#fff;text-shadow:0 1px 2px #000;";
  root.appendChild(label);
  doc.body.appendChild(root);

  let lastPct = -1;
  const render = (fraction: number): void => {
    const clamped = Math.max(0, Math.min(1, fraction));
    const pct = Math.round(clamped * MAX_LABEL);
    if (pct === lastPct) return;
    lastPct = pct;
    fill.style.transform = `scaleX(${clamped})`;
    // green → amber → red as it drops (still labelled, never colour-only)
    fill.style.background = clamped > 0.5 ? "#3fbf5f" : clamped > 0.25 ? "#d9a441" : "#d64545";
    label.textContent = `HP ${pct}/${MAX_LABEL}`;
    root.setAttribute("aria-valuenow", String(pct));
  };
  render(1);

  return {
    set: render,
    flashDamage(): void {
      if (reduceMotion) return;
      root.animate(
        [{ boxShadow: "0 0 0 2px rgba(255,80,80,0.95)" }, { boxShadow: "0 0 0 2px rgba(255,255,255,0.25)" }],
        { duration: 260, easing: "ease-out" },
      );
    },
    dispose(): void {
      root.remove();
    },
  };
}
