/**
 * Cosmetic deployable body + telegraph ring + object pool (E7.5 deployables,
 * ADR 0004 §3). The HOST owns the whole arm/trigger simulation
 * (`HostSession.tick` -> `tickDeployables`, pure domain math in
 * `domain/combat/Deployable.ts`) — this module never decides when something
 * arms or triggers. It only mirrors whatever the host streams
 * (`DeployableEntity[]`, the same `deployables` message both a host's own
 * client and every joiner consume — see `HostSessionHooks.onDeployablesSnapshot`
 * / `JoinSessionHooks.onDeployables`), same reconcile-a-pool shape as
 * `ProjectileField.ts`.
 *
 * Cozy telegraph read (plan §2 decision 2 / ADR 0004 §4): a small placeholder
 * body plus a pulsing ground ring underneath it — amber/slow while still
 * "arming" (the safety window), a brighter/faster minty pulse once "armed"
 * (trigger-ready). Never a menacing red-alert flash — bright and readable,
 * matching the bumble-trap's "friendly gotcha" tone. A triggered deployable
 * simply drops out of the next snapshot (the boom itself is `AoeField`'s
 * `effect`-driven `spawnBoom`, not this module's job).
 */

import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Object3D,
} from "three";
import type { DeployableEntity } from "../game/domain/net/Protocol";

const BODY_RADIUS = 0.22;
const BODY_HEIGHT = 0.32;
const RING_INNER_RADIUS = 0.35;
const RING_OUTER_RADIUS = 0.5;

/** Pulses per second — armed reads faster/livelier than the calmer arming
 *  telegraph, without ever feeling alarming. */
const ARMING_PULSE_HZ = 1.2;
const ARMED_PULSE_HZ = 2.4;

const ARMING_RING_COLOR = 0xf2c94c; // amber telegraph
const ARMED_RING_COLOR = 0x6fe3a0; // minty "ready" — cozy, not danger-red

export interface DeployableFieldDeps {
  readonly parent: Object3D;
}

export interface DeployableFieldHandle {
  /** Reconcile the pool against the host's full active set (add/move/remove
   *  — same full-set-stream contract as `SpawnFieldView.applySnapshot`). */
  applySnapshot(entities: readonly DeployableEntity[]): void;
  /** Advance the telegraph ring's pulse animation — call once per frame. */
  update(dt: number): void;
  dispose(): void;
  readonly activeCount: number;
}

interface PoolEntry {
  readonly body: Mesh;
  readonly ring: Mesh;
  readonly ringMaterial: MeshBasicMaterial;
  armed: boolean;
}

export function attachDeployableField(deps: DeployableFieldDeps): DeployableFieldHandle {
  const group = new Group();
  deps.parent.add(group);

  const bodyGeometry = new ConeGeometry(BODY_RADIUS, BODY_HEIGHT, 6);
  const bodyMaterial = new MeshStandardMaterial({ color: 0x4a5568, roughness: 0.55, metalness: 0.15 });
  const ringGeometry = new RingGeometry(RING_INNER_RADIUS, RING_OUTER_RADIUS, 24);

  const pool = new Map<string, PoolEntry>();
  let ageS = 0;

  function makeEntry(id: string): PoolEntry {
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.name = id;
    group.add(body);
    const ringMaterial = new MeshBasicMaterial({
      color: ARMING_RING_COLOR,
      transparent: true,
      opacity: 0.8,
      side: DoubleSide,
      depthWrite: false,
    });
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    return { body, ring, ringMaterial, armed: false };
  }

  return {
    applySnapshot(entities: readonly DeployableEntity[]): void {
      const live = new Set(entities.map((e) => e.id));
      for (const id of [...pool.keys()]) {
        if (live.has(id)) continue;
        const entry = pool.get(id);
        if (entry) {
          group.remove(entry.body);
          group.remove(entry.ring);
          entry.ringMaterial.dispose();
        }
        pool.delete(id);
      }
      for (const e of entities) {
        let entry = pool.get(e.id);
        if (!entry) {
          entry = makeEntry(e.id);
          pool.set(e.id, entry);
        }
        entry.body.position.set(e.x, e.y + BODY_HEIGHT / 2, e.z);
        entry.ring.position.set(e.x, e.y + 0.02, e.z);
        entry.armed = e.armed;
        entry.ringMaterial.color.setHex(e.armed ? ARMED_RING_COLOR : ARMING_RING_COLOR);
      }
    },

    update(dt: number): void {
      ageS += dt;
      for (const entry of pool.values()) {
        const hz = entry.armed ? ARMED_PULSE_HZ : ARMING_PULSE_HZ;
        const pulse = 0.5 + 0.5 * Math.sin(ageS * hz * Math.PI * 2);
        entry.ringMaterial.opacity = 0.35 + 0.45 * pulse;
        entry.ring.scale.setScalar(0.9 + 0.15 * pulse);
      }
    },

    dispose(): void {
      for (const entry of pool.values()) {
        group.remove(entry.body);
        group.remove(entry.ring);
        entry.ringMaterial.dispose();
      }
      pool.clear();
      deps.parent.remove(group);
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      ringGeometry.dispose();
    },

    get activeCount(): number {
      return pool.size;
    },
  };
}
