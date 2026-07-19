/**
 * Per-frame billboard overlay (E0.1) — the moving-target sibling of
 * `src/feel/DamageNumbers.ts`. That module projects world -> screen once at
 * spawn (Vector3.project) for a fire-and-forget rise/fade; this adapter
 * re-projects a small set of *tracked* markers every frame from the live
 * camera, using the pure `projectBillboard` extraction so the math itself is
 * unit-tested without three.js or a renderer.
 *
 * Gated by construction: nothing is appended to the document and no
 * `requestAnimationFrame` loop runs until the first marker registers, and the
 * loop self-stops the moment the last one unregisters — a no-flags boot that
 * never calls `mountBillboardOverlay`/`register` pays zero DOM and zero
 * per-frame cost, satisfying the "pixel-identical" prime directive. Read-only
 * on the camera (never mutates it); pool-capped and distance-culled so a
 * later phase can't accidentally blow the frame budget with markers.
 */

import { Matrix4, type PerspectiveCamera, Vector3 } from "three";
import { type Mat4, projectBillboard } from "../game/domain/hud/Billboard";

const DEFAULT_POOL_SIZE = 32;
const DEFAULT_MAX_DISTANCE = 80;

interface PoolSlot {
  el: HTMLDivElement | null;
  busy: boolean;
  worldPos: [number, number, number];
}

export interface BillboardMarkerHandle {
  /** The pooled DOM node the caller styles/positions its content into (left/top are adapter-owned). */
  readonly el: HTMLElement;
  /** Update the world position this marker tracks; re-projected on the next frame. */
  setWorldPos(pos: readonly [number, number, number]): void;
  /** Release the pool slot; hides the element and stops it from being projected. */
  unregister(): void;
}

export interface BillboardOverlayOptions {
  /** Max concurrently tracked markers (default 32) — a hard budget cap. */
  readonly poolSize?: number;
  /** World-distance cull, matching `projectBillboard`'s `maxDistance` (default 80). */
  readonly maxDistance?: number;
}

export interface BillboardOverlayHandle {
  /**
   * Track a world position every frame. Returns `null` when the pool is
   * exhausted (budget cap, skip silently — matches `DamageNumbers.spawn`).
   */
  register(worldPos: readonly [number, number, number]): BillboardMarkerHandle | null;
  dispose(): void;
}

export function mountBillboardOverlay(
  doc: Document,
  camera: PerspectiveCamera,
  canvas: HTMLElement,
  options: BillboardOverlayOptions = {},
): BillboardOverlayHandle {
  const poolSize = options.poolSize ?? DEFAULT_POOL_SIZE;
  const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;

  const root = doc.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-billboard-overlay", ""); // stable test hook, not user-facing
  root.style.cssText = "position:fixed;inset:0;z-index:24;pointer-events:none;overflow:hidden;";

  const pool: PoolSlot[] = Array.from({ length: poolSize }, () => ({
    el: null,
    busy: false,
    worldPos: [0, 0, 0],
  }));

  const viewProjection = new Matrix4();
  const cameraWorldPos = new Vector3();

  let rootMounted = false;
  let activeCount = 0;
  let raf: number | null = null;

  function ensureRootMounted(): void {
    if (rootMounted) return;
    rootMounted = true;
    doc.body.appendChild(root);
  }

  function scheduleTick(): void {
    if (raf !== null) return;
    raf = doc.defaultView?.requestAnimationFrame?.(tick) ?? null;
  }

  function tick(): void {
    raf = null;
    if (activeCount === 0) return; // self-stopping: nothing tracked, nothing to do

    const rect = canvas.getBoundingClientRect();
    const viewport = { width: rect.width, height: rect.height };
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = viewProjection.elements as unknown as Mat4;
    camera.getWorldPosition(cameraWorldPos);
    const camPos: [number, number, number] = [cameraWorldPos.x, cameraWorldPos.y, cameraWorldPos.z];

    for (const slot of pool) {
      if (!slot.busy || !slot.el) continue;
      const p = projectBillboard(slot.worldPos, e, camPos, viewport, maxDistance);
      if (!p.visible) {
        slot.el.style.display = "none";
        continue;
      }
      slot.el.style.display = "";
      slot.el.style.left = `${rect.left + p.x}px`;
      slot.el.style.top = `${rect.top + p.y}px`;
    }

    scheduleTick();
  }

  return {
    register(worldPos): BillboardMarkerHandle | null {
      const slot = pool.find((s) => !s.busy);
      if (!slot) return null; // pool exhausted — budget cap, skip silently

      ensureRootMounted();
      if (!slot.el) {
        const el = doc.createElement("div");
        el.style.cssText = "position:absolute;transform:translate(-50%, -50%);display:none;";
        root.appendChild(el);
        slot.el = el;
      }
      slot.busy = true;
      slot.worldPos = [worldPos[0], worldPos[1], worldPos[2]];
      activeCount++;
      scheduleTick();

      return {
        el: slot.el,
        setWorldPos(pos): void {
          slot.worldPos = [pos[0], pos[1], pos[2]];
        },
        unregister(): void {
          if (!slot.busy) return;
          slot.busy = false;
          if (slot.el) slot.el.style.display = "none";
          activeCount--;
        },
      };
    },
    dispose(): void {
      if (raf !== null) {
        doc.defaultView?.cancelAnimationFrame?.(raf);
        raf = null;
      }
      activeCount = 0;
      for (const slot of pool) slot.busy = false;
      if (rootMounted) root.remove();
      rootMounted = false;
    },
  };
}
