/**
 * Player health bar (M6, restyled Workstream 3 / task 3.4). A themed wrapper
 * over the reusable `VitalsCluster` component with a single "health" vital —
 * kept as its own small factory (rather than inlining VitalsCluster at each
 * call site) so the two scenes (`TerrainScene`, `VoxelDevScene`) that already
 * call `createPlayerHealthBar()` need no changes to pick up the new theme.
 *
 * a11y: unchanged from the original — not colour-only (an "HP n/max" label +
 * progressbar role), dark track / bright fill for contrast, damage flash
 * suppressed under prefers-reduced-motion. The low-health pulse (new) is
 * likewise suppressed under prefers-reduced-motion.
 */

import { PLAYER_MAX_HEALTH } from "../game/domain/combat/PlayerVitals";
import { VitalsCluster } from "../game/ui/components/VitalsCluster";

export interface PlayerHealthBar {
  /** fraction ∈ [0,1]. */
  set(fraction: number): void;
  flashDamage(): void;
  dispose(): void;
}

export function createPlayerHealthBar(doc: Document = document): PlayerHealthBar {
  const reduceMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const cluster = VitalsCluster(
    [
      {
        id: "health",
        ariaLabel: "Health",
        labelText: "HP {n}/{max}",
        max: PLAYER_MAX_HEALTH,
        initial: PLAYER_MAX_HEALTH,
      },
    ],
    { reducedMotion: reduceMotion },
  );
  doc.body.appendChild(cluster.el);

  // Self-driving tween loop: call sites only push new targets on health
  // change events, so this component animates its own fill toward them
  // rather than requiring every caller to thread a per-frame tick.
  const win = doc.defaultView;
  let lastT: number | null = null;
  let raf: number | null = null;
  const step = (t: number): void => {
    const dt = lastT === null ? 0 : Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    cluster.tick(dt);
    raf = win?.requestAnimationFrame?.(step) ?? null;
  };
  if (win?.requestAnimationFrame) raf = win.requestAnimationFrame(step);

  return {
    set(fraction: number): void {
      cluster.setTarget("health", Math.max(0, Math.min(1, fraction)) * PLAYER_MAX_HEALTH);
    },
    flashDamage(): void {
      if (reduceMotion) return;
      const fill = cluster.el.querySelector<HTMLElement>("#lw-vital-health .lw-bar-fill");
      fill?.animate(
        [{ boxShadow: "0 0 0 3px rgba(255,80,80,0.95)" }, { boxShadow: "0 0 0 0 rgba(255,80,80,0)" }],
        { duration: 260, easing: "ease-out" },
      );
    },
    dispose(): void {
      if (raf !== null) win?.cancelAnimationFrame?.(raf);
      cluster.dispose();
    },
  };
}
