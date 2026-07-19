/**
 * Combined health + stamina + hunger vitals bar (Workstream 5, HUD task).
 * Mirrors `PlayerHealthBar.ts`'s shape (a themed `VitalsCluster` wrapper with
 * a self-driving tween loop) but with all three specs — used only where
 * survival ticks (the `spawnsOn` gate in TerrainScene), replacing the
 * health-only bar there; `createPlayerHealthBar` is untouched for the
 * dig-only/no-spawns path and other scenes.
 */

import { PLAYER_MAX_HEALTH } from "../game/domain/combat/PlayerVitals";
import { HUNGER_MAX, STAMINA_MAX } from "../game/domain/survival/Survival";
import type { Localizer } from "../game/application/i18n/Localizer";
import { VitalsCluster } from "../game/ui/components/VitalsCluster";

export interface PlayerSurvivalBarHandle {
  /** fraction ∈ [0,1]. */
  setHealth(fraction: number): void;
  setStamina(value: number): void;
  setHunger(value: number): void;
  flashDamage(): void;
  dispose(): void;
}

export function createPlayerSurvivalBar(
  loc: Localizer,
  doc: Document = document,
): PlayerSurvivalBarHandle {
  const reduceMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const cluster = VitalsCluster(
    [
      {
        id: "health",
        ariaLabel: loc.t("hud.vitals.health"),
        labelText: loc.t("hud.vitals.health.label"),
        max: PLAYER_MAX_HEALTH,
        initial: PLAYER_MAX_HEALTH,
      },
      {
        id: "stamina",
        ariaLabel: loc.t("hud.vitals.stamina"),
        labelText: loc.t("hud.vitals.stamina.label"),
        max: STAMINA_MAX,
        initial: STAMINA_MAX,
      },
      {
        id: "hunger",
        ariaLabel: loc.t("hud.vitals.hunger"),
        labelText: loc.t("hud.vitals.hunger.label"),
        max: HUNGER_MAX,
        initial: HUNGER_MAX,
      },
    ],
    { reducedMotion: reduceMotion },
  );
  doc.body.appendChild(cluster.el);

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
    setHealth(fraction: number): void {
      cluster.setTarget("health", Math.max(0, Math.min(1, fraction)) * PLAYER_MAX_HEALTH);
    },
    setStamina(value: number): void {
      cluster.setTarget("stamina", Math.max(0, Math.min(STAMINA_MAX, value)));
    },
    setHunger(value: number): void {
      cluster.setTarget("hunger", Math.max(0, Math.min(HUNGER_MAX, value)));
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
