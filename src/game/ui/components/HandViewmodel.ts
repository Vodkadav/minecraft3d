/**
 * First-person hand/tool viewmodel (bottom-right HUD overlay). A DOM/SVG
 * viewmodel rather than a camera-attached 3D mesh: the engine renders the
 * world through the custom PostStack with no after-post overlay seam, so an
 * in-scene mesh would clip into terrain and pass through TRAA/AO/fog. This
 * overlay layer gives the player immediate "my swing registered" feedback with
 * zero render-pipeline risk (same idiom as Crosshair/AttackMeter).
 *
 * Self-driving: it attaches its own pointer-locked mousedown listener on the
 * canvas so a swing fires on every dig/place/build click — even when the dig
 * raycast misses — which is exactly the confirmation the player asked for. It
 * also exposes `swing()` so key-driven actions (the F melee attack) can reuse
 * the same animation.
 *
 * reduced-motion: the big rotate/translate arc is replaced by a brief settle
 * pulse — still a clear confirmation, no large sweeping motion.
 */

import { injectStyles } from "../styles";

export interface HandViewmodelOptions {
  /** the canvas element DigTool/PlacementTool bind their pointer-lock input to. */
  readonly dom: HTMLElement;
  readonly reducedMotion: () => boolean;
  readonly doc?: Document;
}

export interface HandViewmodelHandle {
  readonly el: HTMLElement;
  /** Play one swing. `kind` picks the arc direction (dig = down, place = push). */
  swing(kind?: "dig" | "place"): void;
  dispose(): void;
}

/** Swing animation length — kept short so rapid clicks each read as a hit. */
const SWING_MS = 260;

export function mountHandViewmodel(opts: HandViewmodelOptions): HandViewmodelHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "lw-hand";
  el.setAttribute("aria-hidden", "true"); // purely decorative feedback
  // Simple stylised arm + pickaxe. The handle group is what swings (pivot at
  // the wrist, bottom-right); the arm root stays planted in the corner.
  el.innerHTML = `
    <svg class="lw-hand-svg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g class="lw-hand-swing">
        <!-- tool: pickaxe head + shaft -->
        <g class="lw-hand-tool">
          <rect x="150" y="40" width="14" height="150" rx="6" transform="rotate(28 157 115)" fill="#7a5230"/>
          <path d="M96 44 q60 -18 120 8 q-58 8 -120 -8 Z" fill="#c9ccd1" stroke="#8b9099" stroke-width="3"/>
          <circle cx="156" cy="52" r="9" fill="#9aa0a8"/>
        </g>
        <!-- forearm rising from the corner -->
        <path class="lw-hand-arm" d="M132 250 L196 250 L150 120 q-8 -20 -30 -14 q-16 6 -10 26 Z" fill="#c98d5e"/>
        <!-- fist gripping the shaft -->
        <ellipse class="lw-hand-fist" cx="150" cy="118" rx="26" ry="22" transform="rotate(24 150 118)" fill="#d99968"/>
      </g>
    </svg>`;
  doc.body.appendChild(el);

  const swingLayer = el.querySelector(".lw-hand-swing") as SVGGElement | null;

  let clearAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function swing(kind: "dig" | "place" = "dig"): void {
    if (!swingLayer) return;
    const cls = opts.reducedMotion()
      ? "lw-hand-pulse"
      : kind === "place"
        ? "lw-hand-swinging-place"
        : "lw-hand-swinging";
    // restart the animation even mid-swing: strip both classes, force reflow,
    // re-add — otherwise a fast second click wouldn't retrigger the keyframes.
    swingLayer.classList.remove("lw-hand-swinging", "lw-hand-swinging-place", "lw-hand-pulse");
    void (swingLayer as unknown as HTMLElement).offsetWidth;
    swingLayer.classList.add(cls);
    clearAt = Date.now() + SWING_MS;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (Date.now() >= clearAt) {
        swingLayer.classList.remove("lw-hand-swinging", "lw-hand-swinging-place", "lw-hand-pulse");
      }
    }, SWING_MS + 20);
  }

  const onMouseDown = (e: MouseEvent): void => {
    if (doc.pointerLockElement !== opts.dom) return;
    if (e.button === 0) swing("dig");
    else if (e.button === 2) swing("place");
  };
  opts.dom.addEventListener("mousedown", onMouseDown);

  return {
    el,
    swing,
    dispose(): void {
      opts.dom.removeEventListener("mousedown", onMouseDown);
      if (timer) clearTimeout(timer);
      el.remove();
    },
  };
}
