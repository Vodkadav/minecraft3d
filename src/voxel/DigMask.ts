/**
 * Dig-hole mask for the heightfield surface (M8.3 break-ground seam).
 *
 * Every carve records a sphere; the terrain material discards fragments
 * inside any sphere (via opacity + alphaTest), punching a visible hole where
 * the voxel cavern takes over. The sphere list is persisted with the world
 * save (entities["voxel.digSpheres"]) so holes survive a reload.
 *
 * A uniform vec4 array keeps this cheap and re-uploadable without shader
 * rebuilds; deriving the mask from the voxel field on GPU is a later
 * refinement once digs outgrow MAX_DIG_SPHERES.
 */

import { Vector4 } from 'three';
import {
  Break,
  Fn,
  If,
  Loop,
  float,
  int,
  positionWorld,
  uniform,
  uniformArray,
} from 'three/tsl';
import type { NF, NV4 } from '../gpu/TSLTypes';

export const MAX_DIG_SPHERES = 128;

export class DigMask {
  private readonly spheres = Array.from({ length: MAX_DIG_SPHERES }, () => new Vector4());
  private readonly spheresU = uniformArray(this.spheres);
  private readonly countU = uniform(0);
  private count = 0;

  /** Record a carved sphere. Beyond capacity the oldest survives visually — logged, not silent. */
  add(x: number, y: number, z: number, radius: number): void {
    if (this.count >= MAX_DIG_SPHERES) {
       
      console.warn(
        `[voxel] dig mask full (${MAX_DIG_SPHERES}) — new surface holes will not render until the mask goes field-derived`,
      );
      return;
    }
    this.spheres[this.count].set(x, y, z, radius);
    this.count += 1;
    this.countU.value = this.count;
  }

  /** Flat [x,y,z,r, ...] for the world save. */
  toFlatArray(): number[] {
    const flat: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const s = this.spheres[i];
      flat.push(s.x, s.y, s.z, s.w);
    }
    return flat;
  }

  loadFlatArray(flat: readonly number[]): void {
    this.count = Math.min(Math.floor(flat.length / 4), MAX_DIG_SPHERES);
    for (let i = 0; i < this.count; i++) {
      this.spheres[i].set(flat[i * 4], flat[i * 4 + 1], flat[i * 4 + 2], flat[i * 4 + 3]);
    }
    this.countU.value = this.count;
  }

  /** 1 inside any dig sphere, else 0 — evaluated at the fragment's world position. */
  holeNode(): NF {
    const spheres = this.spheresU;
    const countU = this.countU;
    return Fn(() => {
      const inside = float(0).toVar();
      Loop({ start: int(0), end: countU.toInt(), type: 'int', condition: '<' }, ({ i }) => {
        const s = spheres.element(i as never) as unknown as NV4;
        If(positionWorld.sub(s.xyz).length().lessThan(s.w), () => {
          inside.assign(1);
          Break();
        });
      });
      return inside;
    })() as unknown as NF;
  }
}
