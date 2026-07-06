/**
 * Rigged creature models (plan 6.1/6.2 [F]) — loads the CC0 Quaternius
 * animals (see CREDITS.md) once per species and stamps per-creature
 * instances via SkeletonUtils.clone (skinned meshes cannot be shared).
 * Behavior → clip mapping is the thin AnimationMixer wiring over the pure
 * locomotion/AI domains: idle→Idle, roam→Walk, flee/aggro→Gallop,
 * death→Death (one-shot). Models are normalized to a per-species height so
 * asset-space units never leak into gameplay.
 */

import { AnimationMixer, Box3, LoopOnce, Vector3, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { Behavior } from "../game/domain/ai/CreatureBrain";

interface SpeciesModel {
  readonly template: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly scale: number;
  /** Ground offset after scaling (model origin is at the feet for Quaternius). */
  readonly lift: number;
}

/** Species → model URL (under the vite base) + target shoulder height (m). */
const MODEL_SPECS: Readonly<Record<string, { file: string; heightM: number }>> = {
  deer: { file: "assets/models/animals/Deer.gltf", heightM: 1.6 },
  wolf: { file: "assets/models/animals/Wolf.gltf", heightM: 0.9 },
};

const BEHAVIOR_CLIP: Readonly<Record<Behavior, string>> = {
  idle: "Idle",
  roam: "Walk",
  flee: "Gallop",
  aggro: "Gallop",
  follow: "Walk",
};

export const DEATH_CLIP = "Death";
const CROSSFADE_S = 0.25;

export class CreatureModelLibrary {
  private readonly models = new Map<string, SpeciesModel>();

  /** Fire-and-forget: species without a loaded model fall back to primitives.
   *  `onLoaded(species)` lets the field upgrade already-spawned primitives. */
  load(onLoaded?: (species: string) => void): void {
    const loader = new GLTFLoader();
    for (const [species, spec] of Object.entries(MODEL_SPECS)) {
      loader.load(
        `${import.meta.env.BASE_URL}${spec.file}`,
        (gltf) => {
          const box = new Box3().setFromObject(gltf.scene);
          const size = box.getSize(new Vector3());
          const scale = size.y > 0 ? spec.heightM / size.y : 1;
          this.models.set(species, {
            template: gltf.scene,
            clips: gltf.animations,
            scale,
            lift: -box.min.y * scale,
          });
          onLoaded?.(species);
        },
        undefined,
        (err) => console.warn(`[spawn] model load failed for ${species}`, err),
      );
    }
  }

  has(species: string): boolean {
    return this.models.has(species);
  }

  /** New per-creature instance, or null when the model isn't loaded (yet). */
  instantiate(species: string): CreatureInstance | null {
    const m = this.models.get(species);
    if (!m) return null;
    const root = SkeletonUtils.clone(m.template);
    root.scale.setScalar(m.scale);
    root.traverse((o) => {
      o.castShadow = true;
    });
    return new CreatureInstance(root, m.clips, m.lift);
  }
}

export class CreatureInstance {
  private readonly mixer: AnimationMixer;
  private current = "";

  constructor(
    readonly root: Object3D,
    private readonly clips: readonly AnimationClip[],
    readonly lift: number,
  ) {
    this.mixer = new AnimationMixer(root);
  }

  /** Crossfade to the behavior's clip; no-op when already playing it. */
  setBehavior(behavior: Behavior): void {
    this.play(BEHAVIOR_CLIP[behavior]);
  }

  /** One-shot death clip; returns its duration (s) so the caller can defer removal. */
  playDeath(): number {
    const clip = this.clips.find((c) => c.name === DEATH_CLIP);
    if (!clip) return 0;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    this.fadeTo(DEATH_CLIP);
    action.play();
    this.current = DEATH_CLIP;
    return clip.duration;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  private play(name: string): void {
    if (this.current === name || this.current === DEATH_CLIP) return;
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return;
    this.fadeTo(name);
    this.mixer.clipAction(clip).reset().fadeIn(CROSSFADE_S).play();
    this.current = name;
  }

  private fadeTo(next: string): void {
    if (!this.current || this.current === next) return;
    const prev = this.clips.find((c) => c.name === this.current);
    if (prev) this.mixer.clipAction(prev).fadeOut(CROSSFADE_S);
  }
}
