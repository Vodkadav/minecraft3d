/**
 * Perf HUD (Workstream 9.2) — an opt-in frame-time percentile overlay, OFF
 * by default and toggled with F4 (F3 is the existing engine debug HUD's key
 * — this is a separate, additive panel so a no-flags boot stays pixel-
 * identical). Thin: all the math lives in the pure `FrameTimeBuffer`
 * (domain/perf); this just samples `frameMs` every tick, reuses the S2
 * `lw-panel` theme class, and re-renders on a throttle while visible so the
 * overlay itself never becomes a source of per-frame allocation.
 */

import { FrameTimeBuffer } from "../../domain/perf/FrameTimeBuffer";
import { injectStyles } from "../styles";

const DEFAULT_CAPACITY = 180; // ~3s at 60fps
const RENDER_INTERVAL_MS = 250;

export interface PerfHudHandle {
  /** Record this frame's duration (ms). Call every frame — cheap even
   *  while hidden (no render work happens unless visible). */
  sample(ms: number): void;
  readonly visible: boolean;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function mountPerfHud(doc: Document = document, capacity = DEFAULT_CAPACITY): PerfHudHandle {
  injectStyles(doc);
  const buffer = new FrameTimeBuffer(capacity);

  const el = doc.createElement("div");
  el.className = "laas-ui lw-panel lw-perf-hud";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Frame time percentiles");
  el.style.display = "none";
  doc.body.appendChild(el);

  let visible = false;
  let renderAcc = 0;

  function render(): void {
    const p = buffer.percentiles();
    el.textContent =
      p.count === 0
        ? "perf: warming up…"
        : `perf  p50 ${p.p50.toFixed(2)}ms  p95 ${p.p95.toFixed(2)}ms  p99 ${p.p99.toFixed(2)}ms  (n=${p.count})`;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code !== "F4") return;
    visible = !visible;
    el.style.display = visible ? "block" : "none";
    if (visible) render();
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    sample(ms: number): void {
      buffer.push(ms);
      if (!visible) return;
      renderAcc += ms;
      if (renderAcc >= RENDER_INTERVAL_MS) {
        renderAcc = 0;
        render();
      }
    },
    get visible() {
      return visible;
    },
    setVisible(v: boolean): void {
      visible = v;
      el.style.display = visible ? "block" : "none";
      if (visible) render();
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
