/**
 * MapScreen — the full-screen discovered-area map (Phase E3.3). Structurally
 * the togglable-overlay twin of `InventoryScreen.ts`/`CharacterScreen.ts`:
 * same overlay/dialog/pointer-lock-release/focus pattern, `M` opens/closes
 * it (ignored while a text input has focus), Escape always closes. Reuses
 * E3.1's `Exploration` fog-of-war data and E3.2's `MinimapModel` icon/fog
 * math at a larger, pannable/zoomable scale — this module is composition +
 * DOM + canvas only, no new projection math.
 *
 * Pan: drag the map. Zoom: mouse wheel, or the +/- keys. Keyboard pan: arrow
 * keys (a11y — dragging is not the only way to move the view). A left click
 * that isn't the end of a drag drops a single waypoint pin at that world
 * position.
 */

import {
  computeFogGrid,
  computeMapIcons,
  playerArrowRotationDegrees,
  type FogCell,
  type MapIcon,
  type MapMarker,
  type MinimapView,
} from "../domain/map/MinimapModel";
import type { ExplorationState } from "../domain/map/Exploration";
import type { Localizer } from "../application/i18n/Localizer";
import { Button } from "./components/Button";
import { WindowFrame } from "./components/WindowFrame";
import { markerGlyphShape } from "./icons/MarkerGlyphs";
import { injectStyles } from "./styles";

export interface MapPlayer {
  readonly x: number;
  readonly z: number;
  readonly yawRadians: number;
}

export interface MapSnapshot {
  readonly player: MapPlayer;
  readonly exploration: ExplorationState;
  readonly markers: readonly MapMarker[];
}

export interface MapScreenOptions {
  readonly loc: Localizer;
  /** Pulled fresh on open and on each `refresh()` call — the live world
   *  state, mirroring the pull-based pattern `MinimapView.update` uses. */
  getSnapshot(): MapSnapshot;
  /** Pauses/resumes camera-look input; called on open(false)/close(true). */
  setInputEnabled?(enabled: boolean): void;
  readonly doc?: Document;
  readonly initialViewRadiusMeters?: number;
}

export interface MapScreenHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Re-samples `getSnapshot()` and re-renders — call while open from the
   *  composition root's own tick (no internal RAF loop). A no-op when closed. */
  refresh(): void;
  dispose(): void;
}

const MIN_VIEW_RADIUS = 30;
const MAX_VIEW_RADIUS = 800;
const DEFAULT_VIEW_RADIUS = 150;
const ZOOM_STEP = 1.2;
const KEYBOARD_PAN_METERS = 20;

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

function clampRadius(r: number): number {
  return Math.max(MIN_VIEW_RADIUS, Math.min(MAX_VIEW_RADIUS, r));
}

export function mountMapScreen(opts: MapScreenOptions): MapScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let open = false;
  let viewCenterX = 0;
  let viewCenterZ = 0;
  let viewRadiusMeters = clampRadius(opts.initialViewRadiusMeters ?? DEFAULT_VIEW_RADIUS);
  let waypoint: { readonly x: number; readonly z: number } | null = null;

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-map-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("map.title"));

  const recenterBtn = Button({
    label: opts.loc.t("map.recenter"),
    ariaLabel: opts.loc.t("map.recenter.aria"),
    variant: "quiet",
    onClick: () => {
      const snap = opts.getSnapshot();
      viewCenterX = snap.player.x;
      viewCenterZ = snap.player.z;
      render();
    },
  });


  const canvasWrap = doc.createElement("div");
  canvasWrap.className = "lw-map-canvas-wrap";
  canvasWrap.tabIndex = 0;

  const canvas = doc.createElement("canvas");
  canvas.className = "lw-map-canvas";
  canvasWrap.appendChild(canvas);

  const iconLayer = doc.createElement("div");
  iconLayer.className = "lw-map-icons";
  canvasWrap.appendChild(iconLayer);

  const hint = doc.createElement("p");
  hint.className = "lw-map-hint";
  hint.textContent = opts.loc.t("map.hint");

  const body = doc.createElement("div");
  body.className = "lw-inv-header"; // reuse flex-column-friendly container below
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.flex = "1";
  body.style.minHeight = "0";
  body.append(canvasWrap, hint);

  const frame = WindowFrame({
    doc,
    title: opts.loc.t("map.title"),
    emblem: "map",
    headerActions: [recenterBtn],
    close: {
      label: opts.loc.t("map.close"),
      ariaLabel: opts.loc.t("map.close.aria"),
      onClose: () => close(),
    },
    body: [body],
    panelClassName: "lw-map-overlay-panel",
  });
  overlay.appendChild(frame.panel);
  doc.body.appendChild(overlay);

  function currentView(widthPx: number, heightPx: number): MinimapView {
    return { centerX: viewCenterX, centerZ: viewCenterZ, viewRadiusMeters, widthPx, heightPx };
  }

  function drawFog(fog: readonly FogCell[], ctx: CanvasRenderingContext2D | null): void {
    if (!ctx) return;
    for (const cell of fog) {
      ctx.fillStyle = cell.discovered ? "rgba(90, 110, 70, 0.55)" : "rgba(0, 0, 0, 0.88)";
      ctx.fillRect(cell.screenX, cell.screenY, Math.ceil(cell.sizePx) + 1, Math.ceil(cell.sizePx) + 1);
    }
  }

  function renderIcons(icons: readonly MapIcon[], player: MapPlayer, widthPx: number, heightPx: number): void {
    const nodes: HTMLElement[] = [];
    for (const icon of icons) {
      if (!icon.visible) continue;
      const dot = doc.createElement("div");
      dot.className = "lw-map-icon";
      dot.dataset.kind = icon.kind;
      dot.dataset.shape = markerGlyphShape(icon.kind);
      dot.style.left = `${icon.screenX}px`;
      dot.style.top = `${icon.screenY}px`;
      nodes.push(dot);
    }
    if (waypoint) {
      const view = currentView(widthPx, heightPx);
      const [wp] = computeMapIcons([{ id: "waypoint", kind: "waypoint", x: waypoint.x, z: waypoint.z }], view);
      if (wp?.visible) {
        const pin = doc.createElement("div");
        pin.className = "lw-map-icon";
        pin.dataset.kind = "waypoint";
        pin.dataset.shape = markerGlyphShape("waypoint");
        pin.style.left = `${wp.screenX}px`;
        pin.style.top = `${wp.screenY}px`;
        nodes.push(pin);
      }
    }
    const view = currentView(widthPx, heightPx);
    const [playerIcon] = computeMapIcons(
      [{ id: "player", kind: "player", x: player.x, z: player.z }],
      view,
    );
    if (playerIcon) {
      const arrow = doc.createElement("div");
      arrow.className = "lw-map-icon";
      arrow.dataset.kind = "player";
      arrow.dataset.shape = markerGlyphShape("player");
      arrow.style.left = `${playerIcon.screenX}px`;
      arrow.style.top = `${playerIcon.screenY}px`;
      arrow.style.transform = `rotate(${playerArrowRotationDegrees(player.yawRadians)}deg)`;
      nodes.push(arrow);
    }
    iconLayer.replaceChildren(...nodes);
  }

  function render(): void {
    const widthPx = canvasWrap.clientWidth || 800;
    const heightPx = canvasWrap.clientHeight || 600;
    canvas.width = widthPx;
    canvas.height = heightPx;

    const snap = opts.getSnapshot();
    const view = currentView(widthPx, heightPx);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, widthPx, heightPx);
    drawFog(computeFogGrid(snap.exploration, view), ctx);
    renderIcons(computeMapIcons(snap.markers, view), snap.player, widthPx, heightPx);
  }

  // --- Pan (drag) ---
  let dragging = false;
  let dragMoved = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartCenterX = 0;
  let dragStartCenterZ = 0;

  function pxPerMeter(): number {
    const widthPx = canvasWrap.clientWidth || 800;
    const heightPx = canvasWrap.clientHeight || 600;
    return Math.min(widthPx, heightPx) / 2 / viewRadiusMeters;
  }

  canvasWrap.addEventListener("mousedown", (e) => {
    dragging = true;
    dragMoved = false;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragStartCenterX = viewCenterX;
    dragStartCenterZ = viewCenterZ;
  });
  (doc.defaultView ?? window).addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dxPx = e.clientX - dragStartClientX;
    const dyPx = e.clientY - dragStartClientY;
    if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) dragMoved = true;
    const scale = pxPerMeter();
    viewCenterX = dragStartCenterX - dxPx / scale;
    viewCenterZ = dragStartCenterZ - dyPx / scale;
    render();
  });
  (doc.defaultView ?? window).addEventListener("mouseup", () => {
    dragging = false;
  });
  canvasWrap.addEventListener("click", (e) => {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    const rect = canvasWrap.getBoundingClientRect();
    const scale = pxPerMeter();
    const widthPx = canvasWrap.clientWidth || 800;
    const heightPx = canvasWrap.clientHeight || 600;
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    waypoint = {
      x: viewCenterX + (localX - widthPx / 2) / scale,
      z: viewCenterZ + (localY - heightPx / 2) / scale,
    };
    render();
  });
  canvasWrap.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      viewRadiusMeters = clampRadius(e.deltaY > 0 ? viewRadiusMeters * ZOOM_STEP : viewRadiusMeters / ZOOM_STEP);
      render();
    },
    { passive: false },
  );

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    if ((e.key === "m" || e.key === "M") && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      toggle();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowUp") { viewCenterZ -= KEYBOARD_PAN_METERS; render(); }
    else if (e.key === "ArrowDown") { viewCenterZ += KEYBOARD_PAN_METERS; render(); }
    else if (e.key === "ArrowLeft") { viewCenterX -= KEYBOARD_PAN_METERS; render(); }
    else if (e.key === "ArrowRight") { viewCenterX += KEYBOARD_PAN_METERS; render(); }
    else if (e.key === "+" || e.key === "=") { viewRadiusMeters = clampRadius(viewRadiusMeters / ZOOM_STEP); render(); }
    else if (e.key === "-" || e.key === "_") { viewRadiusMeters = clampRadius(viewRadiusMeters * ZOOM_STEP); render(); }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  function open_(): void {
    if (open) return;
    open = true;
    overlay.hidden = false;
    const snap = opts.getSnapshot();
    viewCenterX = snap.player.x;
    viewCenterZ = snap.player.z;
    render();
    doc.exitPointerLock?.();
    opts.setInputEnabled?.(false);
    canvasWrap.focus();
  }
  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    opts.setInputEnabled?.(true);
  }
  function toggle(): void {
    if (open) close();
    else open_();
  }

  return {
    get isOpen() {
      return open;
    },
    open: open_,
    close,
    toggle,
    refresh(): void {
      if (open) render();
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
