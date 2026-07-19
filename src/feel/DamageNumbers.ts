/**
 * Floating damage numbers (Workstream 2.4) — pooled DOM elements, projected
 * world-space -> screen-space once at spawn time (Vector3.project), then a
 * pure CSS/WAAPI rise-and-fade animation carries them (no per-frame
 * projection update, no per-frame allocation: the pool is pre-created and
 * reused). Crits render larger and in the theme's warning tone.
 */

import { PerspectiveCamera, Vector3 } from "three";
import { THEME } from "../game/ui/theme/tokens";

const POOL_SIZE = 16;
const RISE_PX = 60;
const DURATION_MS = 900;

interface PoolSlot {
  readonly el: HTMLDivElement;
  busy: boolean;
}

export interface DamageNumbersHandle {
  /** Spawn a number at a world position; a no-op if the pool is fully busy
   *  (budget-capped by design — a wall of numbers would be unreadable anyway). */
  spawn(worldPos: readonly [number, number, number], value: number, crit: boolean): void;
  dispose(): void;
}

const PROJECT_V = new Vector3();

export function mountDamageNumbers(
  doc: Document,
  camera: PerspectiveCamera,
  canvas: HTMLElement,
): DamageNumbersHandle {
  const root = doc.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;inset:0;z-index:25;pointer-events:none;overflow:hidden;";
  doc.body.appendChild(root);

  const pool: PoolSlot[] = Array.from({ length: POOL_SIZE }, () => {
    const el = doc.createElement("div");
    el.style.cssText =
      `position:absolute;font:700 1rem/1 system-ui,sans-serif;color:${THEME.color.danger};` +
      `text-shadow:0 1px 2px rgba(0,0,0,0.8);opacity:0;will-change:transform,opacity;`;
    root.appendChild(el);
    return { el, busy: false };
  });

  return {
    spawn(worldPos, value, crit): void {
      const slot = pool.find((s) => !s.busy);
      if (!slot) return; // pool exhausted — budget cap, skip silently
      const rect = canvas.getBoundingClientRect();
      PROJECT_V.set(worldPos[0], worldPos[1], worldPos[2]).project(camera);
      if (PROJECT_V.z > 1) return; // behind the camera
      const x = rect.left + ((PROJECT_V.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - PROJECT_V.y) / 2) * rect.height;

      slot.busy = true;
      const el = slot.el;
      el.textContent = String(Math.round(value));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.fontSize = crit ? "1.5rem" : "1rem";
      el.style.color = crit ? THEME.color.warning : THEME.color.danger;
      el.style.opacity = "1";
      el.style.transform = "translate(-50%, -50%)";

      const anim = el.animate(
        [
          { transform: "translate(-50%, -50%)", opacity: 1 },
          { transform: `translate(-50%, calc(-50% - ${RISE_PX}px))`, opacity: 0 },
        ],
        { duration: DURATION_MS, easing: "ease-out" },
      );
      anim.onfinish = (): void => {
        el.style.opacity = "0";
        slot.busy = false;
      };
    },
    dispose(): void {
      root.remove();
    },
  };
}
