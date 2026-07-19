/**
 * Branded loading-screen tips (Workstream 9.3) — mounted over the existing
 * `#boot` overlay (index.html; BootUI itself is engine-owned/off-limits, this
 * only ADDS a rotating tip line under its real progress bar/message, same as
 * how the host-offline overlay in main.ts adds its own element rather than
 * touching BootUI). Real progress already exists (`ctx.progress`/BootUI) —
 * this is the "+ tips" half of task 9.3, not a fake progress indicator.
 *
 * Respects reduced motion: rotation just doesn't advance past the first tip
 * (no auto-updating content) instead of speeding up/slowing an animation —
 * the one-time fade-in is a single, non-repeating transition either way.
 */

import type { Localizer } from "../../application/i18n/Localizer";

/** Keys `loading.tip.1..N` in the UI catalog. */
const TIP_COUNT = 6;
const ROTATE_INTERVAL_MS = 4500;

export interface LoadingScreenHandle {
  dispose(): void;
}

export interface LoadingScreenOptions {
  readonly doc?: Document;
  /** Defaults to `#boot` (index.html's boot overlay). */
  readonly root?: HTMLElement | null;
  readonly reducedMotion?: () => boolean;
  readonly intervalMs?: number;
}

export function mountLoadingScreen(
  loc: Localizer,
  opts: LoadingScreenOptions = {},
): LoadingScreenHandle {
  const doc = opts.doc ?? document;
  const root = opts.root === undefined ? doc.getElementById("boot") : opts.root;
  const win = doc.defaultView ?? window;
  const reducedMotion =
    opts.reducedMotion ?? ((): boolean => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const intervalMs = opts.intervalMs ?? ROTATE_INTERVAL_MS;

  if (!root) return { dispose(): void {} };

  const tip = doc.createElement("div");
  tip.id = "boot-tip";
  tip.setAttribute("role", "note");
  tip.setAttribute("aria-live", "polite");
  tip.style.cssText = [
    "margin-top:22px",
    "max-width:340px",
    "font-size:11px",
    "line-height:1.5",
    "letter-spacing:0.03em",
    "color:#7a9a90",
    "opacity:0",
    "transition:opacity 600ms ease",
  ].join(";");
  root.appendChild(tip);

  let index = 0;
  function render(): void {
    tip.textContent = loc.t(`loading.tip.${index + 1}`);
    tip.style.opacity = "1";
  }
  render();

  const timer = reducedMotion()
    ? undefined
    : win.setInterval(() => {
        index = (index + 1) % TIP_COUNT;
        render();
      }, intervalMs);

  return {
    dispose(): void {
      if (timer !== undefined) win.clearInterval(timer);
      tip.remove();
    },
  };
}
