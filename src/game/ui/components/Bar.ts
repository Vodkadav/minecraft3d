/**
 * Bar — a themed segmented/fill bar (health/stamina/hunger). Wraps the pure
 * `domain/ui/VitalsBar` math: `setTarget` sets where the fill is heading,
 * `tick(dt)` advances the tween each frame. Never colour-only — always
 * carries a text label ("HP n/max"), progressbar role, and a critical pulse
 * suppressed under prefers-reduced-motion.
 */

import { clampFraction, isVitalCritical, stepVitalFill } from "../../domain/ui/VitalsBar";
import { injectStyles } from "../styles";

export interface BarOptions {
  readonly id: string;
  readonly ariaLabel: string;
  readonly labelText: string;
  readonly max: number;
  readonly initial: number;
  readonly reducedMotion?: boolean;
}

export interface BarHandle {
  readonly el: HTMLElement;
  /** Sets the value this bar tweens toward (0..max). */
  setTarget(value: number): void;
  /** Advances the tween by `dt` seconds; call every frame. */
  tick(dt: number): void;
  /** Snaps immediately to the current target (no tween) — e.g. on respawn. */
  snap(): void;
  dispose(): void;
}

export function Bar(opts: BarOptions): BarHandle {
  const doc = document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.id = opts.id;
  el.className = "lw-bar";
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-label", opts.ariaLabel);
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", String(opts.max));

  const fill = doc.createElement("div");
  fill.className = "lw-bar-fill";

  const label = doc.createElement("span");
  label.className = "lw-bar-label";
  const chip = doc.createElement("span");
  label.appendChild(chip);

  el.append(fill, label);

  let target = clampFraction(opts.initial / opts.max);
  let current = target;

  function toneFor(fraction: number): "success" | "warning" | "danger" {
    if (fraction > 0.5) return "success";
    if (fraction > VITAL_MID_CUTOFF) return "warning";
    return "danger";
  }
  const VITAL_MID_CUTOFF = 0.25;

  function render(): void {
    fill.style.transform = `scaleX(${current})`;
    const tone = toneFor(current);
    fill.dataset.tone = tone;
    const critical = isVitalCritical(current) && !opts.reducedMotion;
    fill.dataset.critical = String(critical);
    const rounded = Math.round(current * opts.max);
    chip.textContent = opts.labelText.replace("{n}", String(rounded)).replace("{max}", String(opts.max));
    el.setAttribute("aria-valuenow", String(rounded));
  }
  render();

  return {
    el,
    setTarget(value: number): void {
      target = clampFraction(value / opts.max);
    },
    tick(dt: number): void {
      const next = opts.reducedMotion ? target : stepVitalFill(current, target, dt);
      if (next === current) return;
      current = next;
      render();
    },
    snap(): void {
      current = target;
      render();
    },
    dispose(): void {
      el.remove();
    },
  };
}
