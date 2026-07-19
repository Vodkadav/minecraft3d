/**
 * Minimap engine adapter (E3.2) — a north-aligned corner widget: a cheap
 * top-down canvas terrain shading sampled from the engine heightfield
 * through a small additive read-only seam (`heightAt`, the same shape
 * `SpawnFieldView`'s `ground.heightAt` already uses — see TerrainScene.ts),
 * overlaid with pooled DOM icon markers positioned by the pure
 * `MinimapModel.computeMapIcons` (icon math is fully unit-tested there; this
 * adapter is DOM/canvas plumbing only).
 *
 * Pull-based, not a self-driving RAF loop: the composition root calls
 * `update()` from its own tick at whatever cadence it likes (no per-frame
 * cost when the caller doesn't call it). Mobile-gated: a smaller widget and
 * a coarser terrain sample grid on `graphicsPreset === 'mobile'`.
 */

import {
  computeMapIcons,
  playerArrowRotationDegrees,
  type MapMarker,
  type MinimapView,
} from "../game/domain/map/MinimapModel";
import { injectStyles } from "../game/ui/styles";

const DEFAULT_VIEW_RADIUS_METERS = 60;
const DESKTOP_WIDTH_PX = 160;
const MOBILE_WIDTH_PX = 96;
const DESKTOP_TERRAIN_SAMPLES = 20;
const MOBILE_TERRAIN_SAMPLES = 10;

export interface MinimapViewOptions {
  readonly doc?: Document;
  /** Read-only heightfield sample — the one permitted engine touch (small
   *  gated read seam). Pass `(x, z) => hf.heightAtCpu(x, z)`. */
  readonly heightAt: (x: number, z: number) => number;
  readonly mobile?: boolean;
  readonly viewRadiusMeters?: number;
}

export interface MinimapPlayer {
  readonly x: number;
  readonly z: number;
  readonly yawRadians: number;
}

export interface MinimapViewHandle {
  readonly el: HTMLElement;
  update(player: MinimapPlayer, markers: readonly MapMarker[]): void;
  dispose(): void;
}

export function mountMinimapView(opts: MinimapViewOptions): MinimapViewHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const mobile = opts.mobile ?? false;
  const widthPx = mobile ? MOBILE_WIDTH_PX : DESKTOP_WIDTH_PX;
  const heightPx = widthPx;
  const viewRadiusMeters = opts.viewRadiusMeters ?? DEFAULT_VIEW_RADIUS_METERS;
  const terrainSamples = mobile ? MOBILE_TERRAIN_SAMPLES : DESKTOP_TERRAIN_SAMPLES;

  const el = doc.createElement("div");
  el.className = "laas-ui lw-minimap";
  el.dataset.mobile = String(mobile);
  el.setAttribute("role", "img");

  const canvas = doc.createElement("canvas");
  canvas.className = "lw-minimap-canvas";
  canvas.width = widthPx;
  canvas.height = heightPx;
  el.appendChild(canvas);

  const iconLayer = doc.createElement("div");
  iconLayer.className = "lw-minimap-icons";
  el.appendChild(iconLayer);

  doc.body.appendChild(el);

  // happy-dom/jsdom test environments have no 2D canvas backend — drawing is
  // best-effort and silently skipped there; icon positioning (the tested
  // part) still runs.
  const ctx = canvas.getContext("2d");

  function drawTerrain(centerX: number, centerZ: number): void {
    if (!ctx) return;
    const cellPx = widthPx / terrainSamples;
    const worldStep = (viewRadiusMeters * 2) / terrainSamples;
    for (let row = 0; row < terrainSamples; row++) {
      for (let col = 0; col < terrainSamples; col++) {
        const wx = centerX - viewRadiusMeters + col * worldStep;
        const wz = centerZ - viewRadiusMeters + row * worldStep;
        const h = opts.heightAt(wx, wz);
        const shade = Math.max(0, Math.min(255, 90 + h * 2.2));
        ctx.fillStyle = `rgb(${Math.round(shade * 0.32)}, ${Math.round(shade * 0.5)}, ${Math.round(shade * 0.28)})`;
        ctx.fillRect(Math.floor(col * cellPx), Math.floor(row * cellPx), Math.ceil(cellPx) + 1, Math.ceil(cellPx) + 1);
      }
    }
  }

  function drawIcons(player: MinimapPlayer, markers: readonly MapMarker[]): void {
    const view: MinimapView = {
      centerX: player.x,
      centerZ: player.z,
      viewRadiusMeters,
      widthPx,
      heightPx,
    };
    const projected = computeMapIcons(markers, view);
    const nodes: HTMLElement[] = [];
    for (const icon of projected) {
      if (!icon.visible) continue;
      const dot = doc.createElement("div");
      dot.className = "lw-map-icon";
      dot.dataset.kind = icon.kind;
      dot.style.left = `${icon.screenX}px`;
      dot.style.top = `${icon.screenY}px`;
      nodes.push(dot);
    }
    const arrow = doc.createElement("div");
    arrow.className = "lw-map-icon";
    arrow.dataset.kind = "player";
    arrow.style.left = `${widthPx / 2}px`;
    arrow.style.top = `${heightPx / 2}px`;
    arrow.style.transform = `rotate(${playerArrowRotationDegrees(player.yawRadians)}deg)`;
    nodes.push(arrow);
    iconLayer.replaceChildren(...nodes);
  }

  return {
    el,
    update(player: MinimapPlayer, markers: readonly MapMarker[]): void {
      drawTerrain(player.x, player.z);
      drawIcons(player, markers);
    },
    dispose(): void {
      el.remove();
    },
  };
}
