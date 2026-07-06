/**
 * Remote-player avatars (M7.4) — engine adapter mirroring SpawnFieldView's
 * shape (update(dt)/dispose over a Group). Each peer gets a capsule primitive
 * in a deterministic per-peer color (KayKit humanoids are a later art pass),
 * eased toward its latest networked pose with frame-rate-independent
 * exponential smoothing so 10 Hz pose packets read as continuous motion.
 */

import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { PlayerState } from "../game/domain/world/WorldSaveData";
import { colorForPeer, smoothingFactor, stepToward, stepYaw } from "./RemotePlayerMath";

/** Networked position is the eye; the capsule center sits below it. */
const EYE_TO_CENTER_M = 0.8;
const CAPSULE_RADIUS_M = 0.35;
const CAPSULE_LENGTH_M = 1.0;

interface Avatar {
  readonly mesh: Mesh;
  target: PlayerState;
}

export class RemotePlayers {
  private readonly group = new Group();
  private readonly geometry = new CapsuleGeometry(CAPSULE_RADIUS_M, CAPSULE_LENGTH_M, 4, 12);
  private readonly avatars = new Map<string, Avatar>();

  constructor(private readonly parent: Object3D) {
    this.group.name = "remote-players";
    parent.add(this.group);
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
    const mesh = new Mesh(
      this.geometry,
      new MeshStandardMaterial({ color: colorForPeer(peerId), roughness: 0.7 }),
    );
    mesh.castShadow = true;
    mesh.name = peerId;
    mesh.position.set(state.position[0], state.position[1] - EYE_TO_CENTER_M, state.position[2]);
    mesh.rotation.y = state.yaw;
    this.group.add(mesh);
    this.avatars.set(peerId, { mesh, target: state });
  }

  remove(peerId: string): void {
    const avatar = this.avatars.get(peerId);
    if (!avatar) return;
    this.group.remove(avatar.mesh);
    (avatar.mesh.material as MeshStandardMaterial).dispose();
    this.avatars.delete(peerId);
  }

  update(dt: number): void {
    const k = smoothingFactor(dt);
    for (const { mesh, target } of this.avatars.values()) {
      const [x, y, z] = stepToward(
        [mesh.position.x, mesh.position.y, mesh.position.z],
        [target.position[0], target.position[1] - EYE_TO_CENTER_M, target.position[2]],
        k,
      );
      mesh.position.set(x, y, z);
      mesh.rotation.y = stepYaw(mesh.rotation.y, target.yaw, k);
    }
  }

  dispose(): void {
    for (const peerId of [...this.avatars.keys()]) this.remove(peerId);
    this.parent.remove(this.group);
    this.geometry.dispose();
  }
}
