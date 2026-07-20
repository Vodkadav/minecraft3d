/**
 * Tiny pooled impact-particle burst (Workstream 2.6). The engine's GPU
 * particle system (src/gpu/passes/Particles.ts) is render-pipeline territory
 * (off-limits); this is a minimal game-layer THREE.Points burst instead —
 * one shared BufferGeometry/PointsMaterial, a fixed-size typed-array pool
 * (no per-burst allocation), budget-capped. Skipped entirely under
 * `?preset=mobile` by the caller (TerrainScene).
 */

import { BufferAttribute, BufferGeometry, Points, PointsMaterial, type Scene } from "three";

const MAX_PARTICLES = 128;
const PARTICLES_PER_BURST = 8;
const LIFE_S = 0.45;
const GRAVITY = 4;

const BURST_COLOR: Record<string, readonly [number, number, number]> = {
  hit: [0.76, 0.27, 0.23], // danger
  harvest: [0.44, 0.68, 0.29], // success
  dig: [0.29, 0.24, 0.17], // soil brown
  place: [0.62, 0.56, 0.44],
  tame: [0.85, 0.56, 0.24], // accent/ember
  // E7.4 — the "boom" FeelEventId (declared E7.0) had no visual yet; without
  // this entry it would silently fall back to the "hit" danger-red, reading
  // as violent. Ember/gold instead, matching AoeField's confetti palette —
  // cozy charter (ADR 0004 §4), no blood/gore.
  boom: [0.95, 0.65, 0.25],
  // E7.1: the melee swing whoosh reads as a bright, cozy sparkle rather than
  // reusing "hit"'s danger red — fires alongside every landed hit, in
  // addition to "hit" (SpawnFieldView.applyMeleeHit), for a swing-specific
  // flourish distinct from the plain damage-impact burst.
  meleeSwing: [0.85, 0.85, 0.95], // silvery-white swoosh
  // E7.5 — "trapArm"/"trapTrigger" (declared E7.0) had no visual yet; without
  // these they'd fall back to "hit"'s danger red, reading as a violent gotcha
  // rather than a cozy telegraphed bumble-trap (ADR 0004 §4). Bright gold for
  // the arming pulse, minty-green "poof" for the snare/knock-up trigger.
  trapArm: [0.95, 0.85, 0.35],
  trapTrigger: [0.35, 0.75, 0.55],
};

interface Slot {
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ImpactParticlesHandle {
  burst(kind: string, worldPos: readonly [number, number, number]): void;
  dispose(): void;
}

export function mountImpactParticles(scene: Scene): ImpactParticlesHandle {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const colorBase: [number, number, number][] = Array.from({ length: MAX_PARTICLES }, () => [0, 0, 0]);
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const colorAttr = new BufferAttribute(colors, 3);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("color", colorAttr);
  const material = new PointsMaterial({ size: 0.12, vertexColors: true, transparent: true });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const slots: Slot[] = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  let cursor = 0; // ring-buffer allocation — oldest particles recycle first

  const update = (dt: number): void => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = slots[i]!;
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= GRAVITY * dt;
      positions[i * 3] += s.vx * dt;
      positions[i * 3 + 1] += s.vy * dt;
      positions[i * 3 + 2] += s.vz * dt;
      // fade toward black as life runs out — cheap alpha illusion without a
      // custom shader (base PointsMaterial has no per-vertex alpha)
      const fade = Math.max(0, s.life / LIFE_S);
      const base = colorBase[i]!;
      colors[i * 3] = base[0] * fade;
      colors[i * 3 + 1] = base[1] * fade;
      colors[i * 3 + 2] = base[2] * fade;
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  };

  let lastT = performance.now();
  let rafHandle = 0;
  const raf = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    rafHandle = requestAnimationFrame(raf);
  };
  rafHandle = requestAnimationFrame(raf);

  return {
    burst(kind: string, worldPos: readonly [number, number, number]): void {
      const color = BURST_COLOR[kind] ?? BURST_COLOR.hit!;
      for (let n = 0; n < PARTICLES_PER_BURST; n++) {
        const i = cursor;
        cursor = (cursor + 1) % MAX_PARTICLES;
        const s = slots[i]!;
        s.life = LIFE_S;
        const ang = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.2;
        s.vx = Math.cos(ang) * speed;
        s.vy = 1.2 + Math.random() * 1.4;
        s.vz = Math.sin(ang) * speed;
        positions[i * 3] = worldPos[0];
        positions[i * 3 + 1] = worldPos[1];
        positions[i * 3 + 2] = worldPos[2];
        colorBase[i] = [color[0], color[1], color[2]];
        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
      }
    },
    dispose(): void {
      cancelAnimationFrame(rafHandle);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
