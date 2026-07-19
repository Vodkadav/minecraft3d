/**
 * Rigged humanoid model for remote-player avatars (M7.x follow-up) — loads
 * the CC0 KayKit Knight glb once (see CREDITS.md) and stamps a per-peer
 * instance via SkeletonUtils.clone (skinned meshes cannot be shared). Clip
 * selection is thin AnimationMixer wiring over the pure clipForSpeed
 * decision. Height-normalized so asset-space units never leak into gameplay
 * — same approach as src/spawn/CreatureModels.ts.
 */

import { AnimationMixer, Box3, Vector3, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { clipForSpeed, heightScale } from "./RemotePlayerMath";

const MODEL_FILE = "assets/models/characters/Knight.glb";
const TARGET_HEIGHT_M = 1.8;
const CROSSFADE_S = 0.2;

interface LoadedModel {
  readonly template: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly scale: number;
  /** Ground offset after scaling (model origin is at the feet). */
  readonly lift: number;
}

export class PlayerModelLibrary {
  private model: LoadedModel | null = null;

  /** Fire-and-forget: avatars without a loaded model fall back to capsules.
   *  `onLoaded()` lets RemotePlayers upgrade already-spawned capsules. */
  load(onLoaded?: () => void): void {
    new GLTFLoader().load(
      `${import.meta.env.BASE_URL}${MODEL_FILE}`,
      (gltf) => {
        const box = new Box3().setFromObject(gltf.scene);
        const size = box.getSize(new Vector3());
        const scale = heightScale(size.y, TARGET_HEIGHT_M);
        this.model = {
          template: gltf.scene,
          clips: gltf.animations,
          scale,
          lift: -box.min.y * scale,
        };
        onLoaded?.();
      },
      undefined,
      (err) => console.warn("[net] player model load failed", err),
    );
  }

  get loaded(): boolean {
    return this.model !== null;
  }

  /** New per-peer instance, or null when the model isn't loaded (yet). */
  instantiate(): PlayerAvatarInstance | null {
    const m = this.model;
    if (!m) return null;
    const root = SkeletonUtils.clone(m.template);
    root.scale.setScalar(m.scale);
    root.traverse((o) => {
      o.castShadow = true;
    });
    return new PlayerAvatarInstance(root, m.clips, m.lift);
  }
}

export class PlayerAvatarInstance {
  private readonly mixer: AnimationMixer;
  private current = "";

  constructor(
    readonly root: Object3D,
    private readonly clips: readonly AnimationClip[],
    readonly lift: number,
  ) {
    this.mixer = new AnimationMixer(root);
  }

  /** Crossfade to the clip matching this frame's horizontal speed. */
  setSpeed(speedMps: number): void {
    this.play(clipForSpeed(speedMps));
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  private play(name: string): void {
    if (this.current === name) return;
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return;
    const prev = this.current ? this.clips.find((c) => c.name === this.current) : undefined;
    if (prev) this.mixer.clipAction(prev).fadeOut(CROSSFADE_S);
    this.mixer.clipAction(clip).reset().fadeIn(CROSSFADE_S).play();
    this.current = name;
  }
}
