/**
 * Creature nameplate + overhead lifebar overlay (E2.2/E2.3) — mounts on top
 * of the E0.1 billboard overlay (`BillboardOverlay.ts`), one marker per live
 * creature `SpawnFieldView.nameplateTargets()` streams in. Each marker is a
 * themed label (`domain/hud/Nameplate.ts` decides faction + show/hide; this
 * adapter only resolves the faction to an actual `ui/theme` color, same
 * cross-layer precedent as `src/feel/DamageNumbers.ts`) plus a compact fill
 * bar in the existing vital-bar visual language (`ui/components/Bar.ts`'s
 * tone-by-fraction colors), shown only while the creature is damaged.
 *
 * Gated by construction like `BillboardOverlay`: `mountNameplateView` itself
 * mounts the (inert) child overlay, but nothing appears until `sync()` is
 * first called with a non-empty target list — a no-flags boot, or a boot
 * with a settings/composition path that never wires this in, pays zero DOM
 * and zero per-frame cost. `dispose()` tears the whole thing down.
 */

import type { PerspectiveCamera } from "three";
import type { Localizer } from "../game/application/i18n/Localizer";
import { CREATURE_REGISTRY } from "../game/domain/creatures/CreatureRegistry";
import {
  nameplateFor,
  shouldShowLifebar,
  shouldShowNameplate,
  type NameplateFaction,
  type NameplatePolicy,
} from "../game/domain/hud/Nameplate";
import { THEME } from "../game/ui/theme/tokens";
import { mountBillboardOverlay, type BillboardMarkerHandle } from "./BillboardOverlay";
import type { NameplateTargetEntity } from "./SpawnFieldView";

/** Nameplates float above the creature's tracked (center-ish) anchor point. */
const HEIGHT_OFFSET_M = 1.4;

const FACTION_COLOR: Readonly<Record<NameplateFaction, string>> = {
  friendly: THEME.color.success,
  neutral: THEME.color.fgMuted,
  hostile: THEME.color.danger,
  tamed: THEME.color.accent,
  player: THEME.color.focus,
};

function lifebarTone(fraction: number): string {
  if (fraction > 0.5) return THEME.color.success;
  if (fraction > 0.25) return THEME.color.warning;
  return THEME.color.danger;
}

export interface NameplateViewDeps {
  readonly doc: Document;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  /** Budget cap — mobile preset callers pass a smaller value (composition root's call). */
  readonly poolSize?: number;
  readonly maxDistance?: number;
  readonly loc: Localizer;
  /** Read fresh each `sync()` call — reflects live Settings. */
  getPolicy(): NameplatePolicy;
  /** True when this creature id is the crosshair/reach target. */
  isHovered(id: string): boolean;
  /** True while the local player is in a combat encounter. */
  isInCombat(): boolean;
}

export interface NameplateViewHandle {
  /** Reconcile markers against the live target list — call once per frame
   *  (or per streaming tick) with `SpawnFieldHandle.nameplateTargets()`. */
  sync(targets: readonly NameplateTargetEntity[]): void;
  dispose(): void;
}

interface Marker {
  readonly handle: BillboardMarkerHandle;
  readonly wrapper: HTMLElement;
  readonly label: HTMLElement;
  readonly barTrack: HTMLElement;
  readonly barFill: HTMLElement;
}

/**
 * `handle.el`'s own `display` is owned by `BillboardOverlay.tick()` (flipped
 * bare `"none"`/`""` every frame based on visibility) — this adapter must
 * never fight that. So the flex column layout lives on a child `wrapper` div
 * instead of on `handle.el` directly.
 */
function buildMarkerDom(doc: Document): Omit<Marker, "handle"> {
  const wrapper = doc.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;";

  const label = doc.createElement("div");
  label.style.cssText =
    "font:700 0.75rem/1.1 system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,0.85);" +
    "text-align:center;white-space:nowrap;margin-bottom:2px;";

  const barTrack = doc.createElement("div");
  barTrack.style.cssText =
    `width:40px;height:4px;border-radius:2px;background:${THEME.color.bgTrack};` +
    `border:1px solid rgba(0,0,0,0.6);overflow:hidden;display:none;`;

  const barFill = doc.createElement("div");
  barFill.style.cssText =
    `width:100%;height:100%;transform-origin:left center;background:${THEME.color.success};` +
    `transition:transform ${THEME.motion.fast} ease-out,background ${THEME.motion.fast} ease-out;`;
  barTrack.appendChild(barFill);
  wrapper.append(label, barTrack);

  return { wrapper, label, barTrack, barFill };
}

export function mountNameplateView(deps: NameplateViewDeps): NameplateViewHandle {
  const overlay = mountBillboardOverlay(deps.doc, deps.camera, deps.canvas, {
    ...(deps.poolSize !== undefined ? { poolSize: deps.poolSize } : {}),
    ...(deps.maxDistance !== undefined ? { maxDistance: deps.maxDistance } : {}),
  });

  const markers = new Map<string, Marker>();

  function dispositionFor(species: string): "friendly" | "neutral" | "hostile" {
    const found = CREATURE_REGISTRY.get(species);
    return found.ok ? found.value.disposition : "neutral";
  }

  function sync(targets: readonly NameplateTargetEntity[]): void {
    const policy = deps.getPolicy();
    const seen = new Set<string>();

    for (const t of targets) {
      seen.add(t.id);
      const spec = nameplateFor({
        kind: "creature",
        disposition: dispositionFor(t.species),
        tamed: t.tamed,
        name: deps.loc.t(`creature.${t.species}.name`),
      });
      const visible = shouldShowNameplate(policy, spec.faction, {
        isHovered: deps.isHovered(t.id),
        inCombat: deps.isInCombat(),
      });

      const existing = markers.get(t.id);
      if (!visible) {
        if (existing) {
          existing.handle.unregister();
          markers.delete(t.id);
        }
        continue;
      }

      const worldPos: readonly [number, number, number] = [
        t.worldPos[0],
        t.worldPos[1] + HEIGHT_OFFSET_M,
        t.worldPos[2],
      ];

      let marker = existing;
      if (!marker) {
        const handle = overlay.register(worldPos);
        if (!handle) continue; // pool exhausted — budget cap, skip silently
        const dom = buildMarkerDom(deps.doc);
        // A recycled pool slot's `el` may still carry a previous marker's
        // DOM from before it was unregistered (BillboardOverlay never clears
        // it, only hides it) — always start from an empty element.
        handle.el.replaceChildren(dom.wrapper);
        marker = { handle, ...dom };
        markers.set(t.id, marker);
      } else {
        marker.handle.setWorldPos(worldPos);
      }

      marker.label.textContent = spec.text;
      marker.label.style.color = FACTION_COLOR[spec.faction];

      const healthFraction =
        t.maxHealth !== null && t.maxHealth > 0 ? (t.health ?? t.maxHealth) / t.maxHealth : 1;
      const showBar = shouldShowLifebar(true, healthFraction);
      marker.barTrack.style.display = showBar ? "block" : "none";
      if (showBar) {
        const clamped = Math.max(0, Math.min(1, healthFraction));
        marker.barFill.style.transform = `scaleX(${clamped})`;
        marker.barFill.style.background = lifebarTone(clamped);
      }
    }

    for (const [id, marker] of markers) {
      if (seen.has(id)) continue;
      marker.handle.unregister();
      markers.delete(id);
    }
  }

  return {
    sync,
    dispose(): void {
      for (const marker of markers.values()) marker.handle.unregister();
      markers.clear();
      overlay.dispose();
    },
  };
}
