/**
 * Shared boom VFX (E7.4 [F]) — one cosmetic play for every AoE resolve
 * (thrown bombs today; spell AoEs/deployables/monster stomps reuse this once
 * their streams land, plan §4). An expanding ring + a confetti shower + a
 * brief flash, all celebratory (cozy charter — ADR 0004 §4: poofs/confetti,
 * no gore). Game-layer THREE.js only (this lives beside GroundItemField/
 * ImpactParticles in src/spawn, never src/gpu — engine render-pipeline
 * territory is off-limits).
 *
 * `spawnBoom` is purely presentational: it never computes damage or touches
 * the host's `resolveAoe` (domain/combat/Aoe.ts) — a future stream's `effect`
 * message handler resolves `AOE_REGISTRY.get(effectId)` and calls this with
 * the spec + world position, same as every other joiner-side cosmetic reply
 * to a host stream (ADR 0003/0004).
 *
 * Block-destroying explosions are a COMBAT_PLAN standing deferral (plan §9,
 * "block-safe by default"): `deps.digBlocksAt` is the gated call site for
 * that future work, off by default and never wired to a real digger here —
 * this slice does NOT implement voxel destruction.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  type Object3D,
} from "three";
import type { AoeSpec } from "../game/domain/combat/AoeRegistry";

/** Bounds concurrent booms against spam (many bombs thrown at once) —
 *  mirrors GroundItemField's MAX_ACTIVE_ITEMS eviction pattern. Each boom is
 *  short-lived on its own; this only guards the worst case. */
const MAX_ACTIVE_BOOMS = 6;

const RING_LIFE_S = 0.5;
const RING_START_SCALE = 0.15;
const FLASH_LIFE_S = 0.15;
const FLASH_INTENSITY = 6;
const FLASH_DISTANCE = 8;
const CONFETTI_COUNT = 36;
const CONFETTI_LIFE_S = 1.1;
/** Gentler than ImpactParticles' hit-spark gravity — reads as a floaty
 *  shower drifting down, not a violent spray. */
const CONFETTI_GRAVITY = 2.2;

/** Curated celebratory palette — cozy confetti, never a blood/danger red. */
const CONFETTI_COLORS: readonly (readonly [number, number, number])[] = [
  [0.95, 0.65, 0.25], // ember/accent
  [0.85, 0.32, 0.55], // pink
  [0.35, 0.75, 0.55], // mint/success
  [0.4, 0.6, 0.95], // sky
  [0.95, 0.85, 0.35], // gold
];

interface ActiveBoom {
  age: number;
  readonly life: number;
  readonly radius: number;
  readonly ring: Mesh;
  readonly ringMaterial: MeshBasicMaterial;
  readonly flash: PointLight;
  readonly confetti: Points;
  readonly confettiGeometry: BufferGeometry;
  readonly confettiMaterial: PointsMaterial;
  readonly velocities: Float32Array;
}

export interface AoeFieldDeps {
  /** Deferred (COMBAT_PLAN standing deferral, plan §9) — never true today;
   *  no caller sets it. When a future settings screen turns block-destroying
   *  booms on, this is the flag that gates the call below. */
  readonly blockDestructionEnabled?: boolean;
  /** The real voxel dig, if/when block-destroying booms ship — left
   *  unimplemented on purpose (out of scope for this slice). */
  digBlocksAt?(center: readonly [number, number, number], radius: number): void;
}

export interface AoeFieldHandle {
  /** Plays the ring+confetti+flash boom VFX for one AoE resolve. Cosmetic
   *  only — see module doc. */
  spawnBoom(spec: AoeSpec, worldPos: readonly [number, number, number]): void;
  dispose(): void;
}

export function attachAoeField(parent: Object3D, deps: AoeFieldDeps = {}): AoeFieldHandle {
  const ringGeometry = new RingGeometry(0.85, 1, 32);
  const active: ActiveBoom[] = [];

  function disposeBoom(boom: ActiveBoom): void {
    parent.remove(boom.ring, boom.flash, boom.confetti);
    boom.ringMaterial.dispose();
    boom.confettiGeometry.dispose();
    boom.confettiMaterial.dispose();
  }

  function removeOldest(): void {
    const oldest = active.shift();
    if (oldest) disposeBoom(oldest);
  }

  function spawnBoom(spec: AoeSpec, worldPos: readonly [number, number, number]): void {
    if (active.length >= MAX_ACTIVE_BOOMS) removeOldest();
    const [x, y, z] = worldPos;

    const ringMaterial = new MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide, // visible from below too (a boom near the ground)
    });
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    ring.scale.setScalar(RING_START_SCALE);
    parent.add(ring);

    const flash = new PointLight(0xfff2c0, FLASH_INTENSITY, FLASH_DISTANCE);
    flash.position.set(x, y + 0.5, z);
    parent.add(flash);

    const positions = new Float32Array(CONFETTI_COUNT * 3);
    const colors = new Float32Array(CONFETTI_COUNT * 3);
    const velocities = new Float32Array(CONFETTI_COUNT * 3);
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y + 0.2;
      positions[i * 3 + 2] = z;
      const ang = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2;
      velocities[i * 3] = Math.cos(ang) * speed;
      velocities[i * 3 + 1] = 2.5 + Math.random() * 2.5;
      velocities[i * 3 + 2] = Math.sin(ang) * speed;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    const confettiGeometry = new BufferGeometry();
    confettiGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    confettiGeometry.setAttribute("color", new BufferAttribute(colors, 3));
    const confettiMaterial = new PointsMaterial({ size: 0.16, vertexColors: true, transparent: true });
    const confetti = new Points(confettiGeometry, confettiMaterial);
    confetti.frustumCulled = false;
    parent.add(confetti);

    active.push({
      age: 0,
      life: Math.max(RING_LIFE_S, FLASH_LIFE_S, CONFETTI_LIFE_S),
      radius: spec.radius,
      ring,
      ringMaterial,
      flash,
      confetti,
      confettiGeometry,
      confettiMaterial,
      velocities,
    });

    // Deferred (COMBAT_PLAN standing deferral, plan §9): block-destroying
    // booms stay off unless a future settings screen flips this AND supplies
    // a real digger — both are absent today, so this is a no-op seam.
    if (!spec.blockSafe && deps.blockDestructionEnabled && deps.digBlocksAt) {
      deps.digBlocksAt(worldPos, spec.radius);
    }
  }

  function tick(dt: number): void {
    for (let i = active.length - 1; i >= 0; i--) {
      const boom = active[i]!;
      boom.age += dt;

      const ringT = Math.min(1, boom.age / RING_LIFE_S);
      boom.ring.scale.setScalar(RING_START_SCALE + (boom.radius - RING_START_SCALE) * ringT);
      boom.ringMaterial.opacity = Math.max(0, 0.9 * (1 - ringT));

      boom.flash.intensity = FLASH_INTENSITY * Math.max(0, 1 - boom.age / FLASH_LIFE_S);

      const positions = boom.confettiGeometry.getAttribute("position") as BufferAttribute;
      const confettiT = Math.min(1, boom.age / CONFETTI_LIFE_S);
      for (let p = 0; p < CONFETTI_COUNT; p++) {
        boom.velocities[p * 3 + 1] -= CONFETTI_GRAVITY * dt;
        positions.setX(p, positions.getX(p) + boom.velocities[p * 3]! * dt);
        positions.setY(p, positions.getY(p) + boom.velocities[p * 3 + 1]! * dt);
        positions.setZ(p, positions.getZ(p) + boom.velocities[p * 3 + 2]! * dt);
      }
      positions.needsUpdate = true;
      // Base material opacity fades the whole shower toward the end of its
      // life (PointsMaterial has no per-vertex alpha, same tradeoff
      // ImpactParticles documents for its own fade).
      boom.confettiMaterial.opacity = Math.max(0, 1 - confettiT);

      if (boom.age >= boom.life) {
        disposeBoom(boom);
        active.splice(i, 1);
      }
    }
  }

  let lastT = performance.now();
  let rafHandle = 0;
  const raf = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    tick(dt);
    rafHandle = requestAnimationFrame(raf);
  };
  rafHandle = requestAnimationFrame(raf);

  return {
    spawnBoom,
    dispose(): void {
      cancelAnimationFrame(rafHandle);
      for (const boom of [...active]) disposeBoom(boom);
      active.length = 0;
      ringGeometry.dispose();
    },
  };
}
