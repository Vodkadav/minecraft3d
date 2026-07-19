/**
 * Remote-player avatars (M7.4, humanoid upgrade M7.x) — engine adapter
 * mirroring SpawnFieldView's shape (update(dt)/dispose over a Group). Each
 * peer starts as a capsule primitive in a deterministic per-peer color,
 * eased toward its latest networked pose with frame-rate-independent
 * exponential smoothing so 10 Hz pose packets read as continuous motion.
 * The capsule upgrades in place to the rigged KayKit humanoid (CREDITS.md)
 * once its glb lands, same upgrade-in-place pattern as CreatureModels —
 * idle/walk/run clips driven by the avatar's own smoothed speed.
 */

import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { PlayerState } from "../game/domain/world/WorldSaveData";
import { colorForPeer, smoothingFactor, stepToward, stepYaw } from "./RemotePlayerMath";
import { PlayerAvatarInstance, PlayerModelLibrary } from "./PlayerModel";

/** Networked position is the eye; ground = eye - eye height (matches FlyCamera). */
const EYE_HEIGHT_M = 1.7;
const CAPSULE_EYE_TO_CENTER_M = 0.8;
const CAPSULE_RADIUS_M = 0.35;
const CAPSULE_LENGTH_M = 1.0;

interface Avatar {
  root: Object3D;
  /** Only set for the capsule fallback, so it can be disposed on upgrade/removal. */
  material: MeshStandardMaterial | null;
  instance: PlayerAvatarInstance | null;
  target: PlayerState;
}

export class RemotePlayers {
  private readonly group = new Group();
  private readonly geometry = new CapsuleGeometry(CAPSULE_RADIUS_M, CAPSULE_LENGTH_M, 4, 12);
  private readonly models = new PlayerModelLibrary();
  private readonly avatars = new Map<string, Avatar>();

  constructor(private readonly parent: Object3D) {
    this.group.name = "remote-players";
    parent.add(this.group);
    this.models.load(() => this.upgradeAll());
  }

  get count(): number {
    return this.avatars.size;
  }

  upsert(peerId: string, state: PlayerState): void {
    const existing = this.avatars.get(peerId);
    if (existing) {
      existing.target = state;
      return;
    }
    const instance = this.models.instantiate();
    const material = instance
      ? null
      : new MeshStandardMaterial({ color: colorForPeer(peerId), roughness: 0.7 });
    const root: Object3D = instance?.root ?? new Mesh(this.geometry, material!);
    if (root instanceof Mesh) root.castShadow = true;
    root.name = peerId;
    this.placeAt(root, state, instance);
    root.rotation.y = state.yaw;
    this.group.add(root);
    this.avatars.set(peerId, { root, material, instance, target: state });
  }

  remove(peerId: string): void {
    const avatar = this.avatars.get(peerId);
    if (!avatar) return;
    this.group.remove(avatar.root);
    avatar.material?.dispose();
    this.avatars.delete(peerId);
  }

  update(dt: number): void {
    const k = smoothingFactor(dt);
    for (const avatar of this.avatars.values()) {
      const { root, instance, target } = avatar;
      const oldX = root.position.x;
      const oldZ = root.position.z;
      const groundOffset = instance ? instance.lift - EYE_HEIGHT_M : -CAPSULE_EYE_TO_CENTER_M;
      const [x, y, z] = stepToward(
        [root.position.x, root.position.y, root.position.z],
        [target.position[0], target.position[1] + groundOffset, target.position[2]],
        k,
      );
      root.position.set(x, y, z);
      root.rotation.y = stepYaw(root.rotation.y, target.yaw, k);
      if (instance) {
        const speed = dt > 0 ? Math.hypot(x - oldX, z - oldZ) / dt : 0;
        instance.setSpeed(speed);
        instance.update(dt);
      }
    }
  }

  dispose(): void {
    for (const peerId of [...this.avatars.keys()]) this.remove(peerId);
    this.parent.remove(this.group);
    this.geometry.dispose();
  }

  /** Upgrade every still-capsule avatar to the rigged humanoid in place. */
  private upgradeAll(): void {
    for (const [peerId, avatar] of this.avatars) {
      if (avatar.instance) continue;
      const instance = this.models.instantiate();
      if (!instance) continue;
      this.group.remove(avatar.root);
      avatar.material?.dispose();
      instance.root.name = peerId;
      this.placeAt(instance.root, avatar.target, instance);
      instance.root.rotation.y = avatar.root.rotation.y;
      this.group.add(instance.root);
      this.avatars.set(peerId, { root: instance.root, material: null, instance, target: avatar.target });
    }
  }

  private placeAt(root: Object3D, state: PlayerState, instance: PlayerAvatarInstance | null): void {
    const groundOffset = instance ? instance.lift - EYE_HEIGHT_M : -CAPSULE_EYE_TO_CENTER_M;
    root.position.set(state.position[0], state.position[1] + groundOffset, state.position[2]);
  }
}
