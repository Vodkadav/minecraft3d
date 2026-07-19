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
  /** E2.1: updates the orb layout's level-portrait badge; a no-op in bars
   *  layout (no portrait mounted) or when `hudStyle` wasn't "orbs" at mount. */
  setLevel(level: number): void;
  dispose(): void;
}

/** `maxHealthMult`/`maxEnergyMult` (E1.4b — a character's
 *  `effectiveMaxHealthMultiplier`/`effectiveMaxEnergyMultiplier`) scale the
 *  health/stamina bars' max/initial; both default to 1, identical to today.
 *  `hudStyle` (E2.1, Settings) switches bars/orbs presentation — hunger stays
 *  a bar even in orbs layout (only health/stamina become orbs, per the E2.1
 *  brief); defaults to "bars", a no-flags boot stays pixel-identical.
 *  `level` seeds the orb layout's portrait badge (E1's character level). */
export function createPlayerSurvivalBar(
  loc: Localizer,
  doc: Document = document,
  maxHealthMult = 1,
  maxEnergyMult = 1,
  hudStyle: "bars" | "orbs" = "bars",
  level = 1,
): PlayerSurvivalBarHandle {
  const reduceMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const maxHealth = PLAYER_MAX_HEALTH * maxHealthMult;
  const maxEnergy = STAMINA_MAX * maxEnergyMult;

  const cluster = VitalsCluster(
    [
      {
        id: "health",
        ariaLabel: loc.t("hud.vitals.health"),
        labelText: loc.t("hud.vitals.health.label"),
        max: maxHealth,
        initial: maxHealth,
      },
      {
        id: "stamina",
        ariaLabel: loc.t("hud.vitals.stamina"),
        labelText: loc.t("hud.vitals.stamina.label"),
        max: maxEnergy,
        initial: maxEnergy,
      },
      {
        id: "hunger",
        ariaLabel: loc.t("hud.vitals.hunger"),
        labelText: loc.t("hud.vitals.hunger.label"),
        max: HUNGER_MAX,
        initial: HUNGER_MAX,
        shape: "bar",
      },
    ],
    {
      reducedMotion: reduceMotion,
      layout: hudStyle,
      portrait: { level, ariaLabel: loc.t("character.level.label", { n: level }) },
    },
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
      cluster.setTarget("health", Math.max(0, Math.min(1, fraction)) * maxHealth);
    },
    setStamina(value: number): void {
      cluster.setTarget("stamina", Math.max(0, Math.min(maxEnergy, value)));
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
    setLevel(level: number): void {
      cluster.setLevel(level);
    },
    dispose(): void {
      if (raf !== null) win?.cancelAnimationFrame?.(raf);
      cluster.dispose();
    },
  };
}
