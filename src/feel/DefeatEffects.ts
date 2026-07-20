/**
 * Defeat VFX toolkit (E7.7 [F]) — the celebratory "poof" a creature leaves
 * behind on death (cream smoke + confetti shower + a small gold loot-
 * fountain toss, reusing AoeField's bounded active-burst/rAF pattern) plus a
 * floating "Defeated!" note (reusing DamageNumbers' pooled-DOM-element
 * projection technique), and the gentle, NO-ITEM-LOSS player-down polish
 * (screen desaturate + a brief camera dip + a golden respawn shimmer).
 *
 * Cozy charter (COMBAT_PLAN "Locked design decisions"): creatures "poof,"
 * never bleed — no BURST_COLOR entry here ever reads as blood/gore. Presented
 * only; deaths themselves stay driven by the existing `dying` flag/streaming
 * (SpawnFieldView) — this module never touches the wire.
 *
 * Mobile-preset-gated at the mount call site exactly like ImpactParticles/
 * AoeField (see TerrainScene): skip the whole module under `?preset=mobile`.
 * Reduced motion additionally skips the particle bursts and the camera dip
 * (still shows the "Defeated!" note and the desaturate/shimmer state change,
 * same "state change without motion" policy as ScreenEffects' pulses).
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from "three";
import type { Localizer } from "../game/application/i18n/Localizer";

/** Bounds concurrent bursts against spam (a wave of simultaneous kills) —
 *  mirrors AoeField's MAX_ACTIVE_BOOMS eviction pattern, sized for a few
 *  deaths' worth of the 3 sub-bursts `defeat()` fires per call. */
const MAX_ACTIVE_BURSTS = 24;
const NOTE_POOL_SIZE = 4;
const NOTE_RISE_PX = 56;
const NOTE_DURATION_MS = 1000;
/** Note floats above the creature's ground-anchored position, not on top of
 *  the poof burst. */
const NOTE_Y_OFFSET_M = 0.9;

const DESATURATE_MS = 450;
const SHIMMER_MS = 700;
const FALL_DURATION_S = 0.7;
/** Gentle sink, never a hard drop — cozy, not punishing (charter). */
const MAX_FALL_OFFSET_M = 0.45;
const MAX_FALL_FOV_PUNCH_DEG = 5;

interface BurstSpec {
  readonly count: number;
  readonly life: number;
  readonly gravity: number;
  readonly size: number;
  readonly speedMin: number;
  readonly speedMax: number;
  readonly upMin: number;
  readonly upMax: number;
  readonly colors: readonly (readonly [number, number, number])[];
}

// Soft cream smoke — a gentle upward puff, low gravity (reads as smoke, not spray).
const POOF_SPEC: BurstSpec = {
  count: 12,
  life: 0.55,
  gravity: 1.2,
  size: 0.24,
  speedMin: 0.3,
  speedMax: 0.7,
  upMin: 1.0,
  upMax: 1.8,
  colors: [[0.95, 0.93, 0.86]],
};

// Curated celebratory palette (matches AoeField's confetti — cozy, never red/gore).
const CONFETTI_SPEC: BurstSpec = {
  count: 22,
  life: 0.9,
  gravity: 2.4,
  size: 0.14,
  speedMin: 1.0,
  speedMax: 2.4,
  upMin: 2.0,
  upMax: 3.5,
  colors: [
    [0.95, 0.65, 0.25], // ember/accent
    [0.85, 0.32, 0.55], // pink
    [0.35, 0.75, 0.55], // mint/success
    [0.4, 0.6, 0.95], // sky
    [0.95, 0.85, 0.35], // gold
  ],
};

// Gold sparkle toss — a tighter, higher launch that arcs back down like a
// tiny fountain of coins (purely cosmetic; the real ground-item drop is a
// separate, unrelated GroundItemField mesh at the same position).
const FOUNTAIN_SPEC: BurstSpec = {
  count: 10,
  life: 0.75,
  gravity: 3.6,
  size: 0.13,
  speedMin: 0.2,
  speedMax: 0.7,
  upMin: 3.2,
  upMax: 5.0,
  colors: [[0.98, 0.82, 0.35]],
};

interface ActiveBurst {
  age: number;
  readonly life: number;
  readonly gravity: number;
  readonly points: Points;
  readonly geometry: BufferGeometry;
  readonly material: PointsMaterial;
  readonly velocities: Float32Array;
}

interface NoteSlot {
  readonly el: HTMLDivElement;
  busy: boolean;
}

export interface DefeatEffectsHandle {
  /** Creature defeat: cream poof + confetti shower + a gold loot-fountain
   *  toss (skipped under reduced motion) and a floating "Defeated!" note
   *  (always shown), all at the kill's world position. Called from BOTH the
   *  killer's own resolve and every peer's streamed death (the existing
   *  `dying` flag), so every peer sees the same defeat. */
  defeat(worldPos: readonly [number, number, number]): void;
  /** Player-down (no item loss, charter): desaturates the view and arms a
   *  brief gentle camera dip. Call once from the death branch. */
  playerDown(): void;
  /** Respawn: lifts the desaturate and plays a soft golden shimmer pulse
   *  (skipped under reduced motion — no flash pulses, ScreenEffects' policy).
   *  Call once after the respawn pose has landed. */
  respawnShimmer(): void;
  /** Per-frame camera dip step — register AFTER FlyCamera's own onUpdate,
   *  same ordering rule as `stepCameraShake` (the offset is additive and
   *  implicitly cleared by FlyCamera's next full recompute). A no-op most
   *  frames (no active dip). Particle bursts self-drive via rAF, matching
   *  ImpactParticles/AoeField, so they need no per-frame call here. */
  step(dt: number): void;
  dispose(): void;
}

const PROJECT_V = new Vector3();

export function mountDefeatEffects(
  scene: Scene,
  doc: Document,
  camera: PerspectiveCamera,
  canvas: HTMLElement,
  loc: Localizer,
  reducedMotion: () => boolean,
): DefeatEffectsHandle {
  const active: ActiveBurst[] = [];

  function disposeBurst(burst: ActiveBurst): void {
    scene.remove(burst.points);
    burst.geometry.dispose();
    burst.material.dispose();
  }

  function spawnBurst(pos: readonly [number, number, number], spec: BurstSpec): void {
    if (active.length >= MAX_ACTIVE_BURSTS) {
      const oldest = active.shift();
      if (oldest) disposeBurst(oldest);
    }
    const [x, y, z] = pos;
    const positions = new Float32Array(spec.count * 3);
    const colors = new Float32Array(spec.count * 3);
    const velocities = new Float32Array(spec.count * 3);
    for (let i = 0; i < spec.count; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const ang = Math.random() * Math.PI * 2;
      const speed = spec.speedMin + Math.random() * (spec.speedMax - spec.speedMin);
      velocities[i * 3] = Math.cos(ang) * speed;
      velocities[i * 3 + 1] = spec.upMin + Math.random() * (spec.upMax - spec.upMin);
      velocities[i * 3 + 2] = Math.sin(ang) * speed;
      const color = spec.colors[i % spec.colors.length]!;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: spec.size,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    active.push({ age: 0, life: spec.life, gravity: spec.gravity, points, geometry, material, velocities });
  }

  function tickBursts(dt: number): void {
    for (let i = active.length - 1; i >= 0; i--) {
      const burst = active[i]!;
      burst.age += dt;
      const positions = burst.geometry.getAttribute("position") as BufferAttribute;
      const count = positions.count;
      for (let p = 0; p < count; p++) {
        burst.velocities[p * 3 + 1] -= burst.gravity * dt;
        positions.setX(p, positions.getX(p) + burst.velocities[p * 3]! * dt);
        positions.setY(p, positions.getY(p) + burst.velocities[p * 3 + 1]! * dt);
        positions.setZ(p, positions.getZ(p) + burst.velocities[p * 3 + 2]! * dt);
      }
      positions.needsUpdate = true;
      // whole-burst opacity fade toward the end of life (PointsMaterial has
      // no per-vertex alpha — same tradeoff ImpactParticles/AoeField accept).
      burst.material.opacity = Math.max(0, 1 - burst.age / burst.life);
      if (burst.age >= burst.life) {
        disposeBurst(burst);
        active.splice(i, 1);
      }
    }
  }

  let rafT = performance.now();
  let rafHandle = 0;
  const raf = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - rafT) / 1000);
    rafT = now;
    tickBursts(dt);
    rafHandle = requestAnimationFrame(raf);
  };
  rafHandle = requestAnimationFrame(raf);

  // ---- floating "Defeated!" note — pooled DOM elements, projected once at
  // spawn (DamageNumbers' technique), a plain CSS/WAAPI rise-and-fade. ----
  const noteRoot = doc.createElement("div");
  noteRoot.setAttribute("aria-hidden", "true");
  noteRoot.style.cssText = "position:fixed;inset:0;z-index:25;pointer-events:none;overflow:hidden;";
  doc.body.appendChild(noteRoot);
  const notePool: NoteSlot[] = Array.from({ length: NOTE_POOL_SIZE }, () => {
    const el = doc.createElement("div");
    el.style.cssText =
      "position:absolute;font:700 1.1rem/1 system-ui,sans-serif;color:#e8a34f;" +
      "text-shadow:0 1px 2px rgba(0,0,0,0.8);opacity:0;will-change:transform,opacity;";
    noteRoot.appendChild(el);
    return { el, busy: false };
  });

  function spawnNote(worldPos: readonly [number, number, number]): void {
    const slot = notePool.find((s) => !s.busy);
    if (!slot) return; // pool exhausted — budget cap, skip silently
    const rect = canvas.getBoundingClientRect();
    PROJECT_V.set(worldPos[0], worldPos[1] + NOTE_Y_OFFSET_M, worldPos[2]).project(camera);
    if (PROJECT_V.z > 1) return; // behind the camera
    const x = rect.left + ((PROJECT_V.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - PROJECT_V.y) / 2) * rect.height;

    slot.busy = true;
    const el = slot.el;
    el.textContent = loc.t("combat.defeated");
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, -50%)";
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%)", opacity: 1 },
        { transform: `translate(-50%, calc(-50% - ${NOTE_RISE_PX}px))`, opacity: 0 },
      ],
      { duration: NOTE_DURATION_MS, easing: "ease-out" },
    );
    anim.onfinish = (): void => {
      el.style.opacity = "0";
      slot.busy = false;
    };
  }

  // ---- player-down: canvas desaturate + a brief camera dip + a golden
  // respawn shimmer. A DOM overlay div (ScreenEffects' layer technique). ----
  const shimmerLayer = doc.createElement("div");
  shimmerLayer.setAttribute("aria-hidden", "true");
  shimmerLayer.style.cssText =
    "position:fixed;inset:0;z-index:31;pointer-events:none;opacity:0;" +
    "background:radial-gradient(ellipse at center, rgba(255,209,102,0.55) 0%, transparent 70%);";
  doc.body.appendChild(shimmerLayer);

  let fallElapsed: number | null = null;

  return {
    defeat(worldPos): void {
      if (!reducedMotion()) {
        spawnBurst(worldPos, POOF_SPEC);
        spawnBurst(worldPos, CONFETTI_SPEC);
        spawnBurst(worldPos, FOUNTAIN_SPEC);
      }
      spawnNote(worldPos);
    },

    playerDown(): void {
      fallElapsed = reducedMotion() ? null : 0;
      const ms = reducedMotion() ? 0 : DESATURATE_MS;
      canvas.style.transition = ms > 0 ? `filter ${ms}ms ease` : "";
      canvas.style.filter = "grayscale(1)";
    },

    respawnShimmer(): void {
      fallElapsed = null;
      const ms = reducedMotion() ? 0 : DESATURATE_MS;
      canvas.style.transition = ms > 0 ? `filter ${ms}ms ease` : "";
      canvas.style.filter = "grayscale(0)";
      if (reducedMotion()) return; // no flash pulses under reduced motion
      shimmerLayer.style.opacity = "1";
      const anim = shimmerLayer.animate(
        [{ opacity: 0.5 }, { opacity: 0 }],
        { duration: SHIMMER_MS, easing: "ease-out" },
      );
      anim.onfinish = (): void => {
        shimmerLayer.style.opacity = "0";
      };
    },

    step(dt): void {
      if (fallElapsed === null) return;
      fallElapsed += dt;
      if (fallElapsed >= FALL_DURATION_S) {
        fallElapsed = null;
        return;
      }
      const p = fallElapsed / FALL_DURATION_S;
      const amp = MAX_FALL_OFFSET_M * (1 - p);
      camera.position.y -= amp;
      camera.fov += MAX_FALL_FOV_PUNCH_DEG * (1 - p);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },

    dispose(): void {
      cancelAnimationFrame(rafHandle);
      for (const burst of [...active]) disposeBurst(burst);
      active.length = 0;
      noteRoot.remove();
      shimmerLayer.remove();
      canvas.style.filter = "";
      canvas.style.transition = "";
    },
  };
}
