/**
 * Vitals cluster — a stack of themed Bars (health today; stamina/hunger are
 * additive slots a later slice can add without touching this component,
 * since it takes a generic vitals list rather than hardcoding "health").
 * Mounted fixed above the hotbar, matching the old bare health-bar's spot.
 */

import { isVitalCritical } from "../../domain/ui/VitalsBar";
import { Bar, type BarHandle } from "./Bar";
import { injectStyles } from "../styles";

export interface VitalSpec {
  readonly id: string;
  readonly ariaLabel: string;
  /** Template with `{n}`/`{max}` placeholders, e.g. "HP {n}/{max}". */
  readonly labelText: string;
  readonly max: number;
  readonly initial: number;
}

export interface VitalsClusterHandle {
  readonly el: HTMLElement;
  setTarget(id: string, value: number): void;
  tick(dt: number): void;
  snap(id?: string): void;
  /** True if any vital is currently at/below the critical threshold. */
  isAnyCritical(): boolean;
  dispose(): void;
}

export function VitalsCluster(
  specs: readonly VitalSpec[],
  opts: { reducedMotion?: boolean } = {},
): VitalsClusterHandle {
  const doc = document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-vitals-cluster";

  const fractions = new Map<string, number>();
  const bars = new Map<string, BarHandle>();
  for (const spec of specs) {
    const bar = Bar({
      id: `lw-vital-${spec.id}`,
      ariaLabel: spec.ariaLabel,
      labelText: spec.labelText,
      max: spec.max,
      initial: spec.initial,
      ...(opts.reducedMotion !== undefined ? { reducedMotion: opts.reducedMotion } : {}),
    });
    bars.set(spec.id, bar);
    fractions.set(spec.id, spec.initial / spec.max);
    el.appendChild(bar.el);
  }

  return {
    el,
    setTarget(id, value): void {
      const bar = bars.get(id);
      if (!bar) return;
      const spec = specs.find((s) => s.id === id);
      fractions.set(id, spec ? value / spec.max : value);
      bar.setTarget(value);
    },
    tick(dt): void {
      for (const bar of bars.values()) bar.tick(dt);
    },
    snap(id): void {
      if (id) {
        bars.get(id)?.snap();
        return;
      }
      for (const bar of bars.values()) bar.snap();
    },
    isAnyCritical(): boolean {
      for (const fraction of fractions.values()) {
        if (isVitalCritical(fraction)) return true;
      }
      return false;
    },
    dispose(): void {
      el.remove();
    },
  };
}
