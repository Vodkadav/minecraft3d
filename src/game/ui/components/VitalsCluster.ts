/**
 * Vitals cluster — a stack of themed Bars (health today; stamina/hunger are
 * additive slots a later slice can add without touching this component,
 * since it takes a generic vitals list rather than hardcoding "health").
 * Mounted fixed above the hotbar, matching the old bare health-bar's spot.
 *
 * E2.1: `layout: "orbs"` restyles into Diablo-style corner orbs (procedural
 * CSS only — circular gauges, vertical fill) plus a level-portrait badge
 * between them, entirely via CSS (`data-layout`/`data-shape` attributes +
 * flex `order`) — the DOM/tween logic is unchanged, so `layout` defaults to
 * "bars" and a no-flags boot stays pixel-identical (ARPG-cozy invariant).
 * Each spec can override its own shape (e.g. hunger stays a bar even in
 * orbs layout) via `VitalSpec.shape`.
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
  /** Overrides the cluster's `layout`-derived default shape for this one
   *  vital (e.g. keep hunger a bar even when `layout: "orbs"`). */
  readonly shape?: "bar" | "orb";
}

export interface VitalsClusterHandle {
  readonly el: HTMLElement;
  setTarget(id: string, value: number): void;
  tick(dt: number): void;
  snap(id?: string): void;
  /** True if any vital is currently at/below the critical threshold. */
  isAnyCritical(): boolean;
  /** Updates the portrait badge's level number — a no-op if no portrait
   *  was configured. */
  setLevel(level: number): void;
  dispose(): void;
}

export function VitalsCluster(
  specs: readonly VitalSpec[],
  opts: {
    reducedMotion?: boolean;
    /** "orbs" restyles every spec without its own `shape` into a circular
     *  gauge and reveals the level portrait; defaults to "bars" (today's
     *  layout, portrait hidden). */
    layout?: "bars" | "orbs";
    /** Player level shown in the portrait badge (E2.1) — only rendered when
     *  provided. `ariaLabel` reads it out ("Level {n}") for a11y parity with
     *  the visual badge. */
    portrait?: { readonly level: number; readonly ariaLabel: string };
  } = {},
): VitalsClusterHandle {
  const doc = document;
  injectStyles(doc);
  const layout = opts.layout ?? "bars";

  const el = doc.createElement("div");
  el.className = "laas-ui lw-vitals-cluster";
  el.dataset.layout = layout;

  const fractions = new Map<string, number>();
  const bars = new Map<string, BarHandle>();
  for (const spec of specs) {
    const shape = spec.shape ?? (layout === "orbs" ? "orb" : "bar");
    const bar = Bar({
      id: `lw-vital-${spec.id}`,
      ariaLabel: spec.ariaLabel,
      labelText: spec.labelText,
      max: spec.max,
      initial: spec.initial,
      shape,
      ...(opts.reducedMotion !== undefined ? { reducedMotion: opts.reducedMotion } : {}),
    });
    bars.set(spec.id, bar);
    fractions.set(spec.id, spec.initial / spec.max);
    el.appendChild(bar.el);
  }

  let portraitBadge: HTMLElement | null = null;
  if (opts.portrait) {
    portraitBadge = doc.createElement("div");
    portraitBadge.className = "lw-orb-portrait";
    portraitBadge.setAttribute("role", "status");
    portraitBadge.setAttribute("aria-label", opts.portrait.ariaLabel);
    portraitBadge.textContent = String(opts.portrait.level);
    el.appendChild(portraitBadge);
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
    setLevel(level: number): void {
      if (portraitBadge) portraitBadge.textContent = String(level);
    },
    dispose(): void {
      el.remove();
    },
  };
}
