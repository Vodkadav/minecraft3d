/**
 * Dig/build input (M8.3): while pointer-locked, left click carves an air
 * pocket at the aimed surface, right click packs stone back in. The themed
 * `Crosshair` component (Workstream 3) is owned by the scene, not here — the
 * scene combines this tool's mine-target read with the spawn field's
 * attack/interact targets and the placement tool's build mode into one
 * reticle state each frame.
 *
 * The full placement system — ghost preview, rotation, smart snapping — is
 * plan 8.5 [O, after the 8.6 research pass]; this tool only owns the dig loop.
 */

import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { AudioPort } from '../game/application/ports/AudioPort';
import type { FeelPort } from '../game/application/ports/FeelPort';
import type { ProgressionEventId } from '../game/domain/progression/ProgressionEvents';
import type { VoxelTerrain } from './VoxelTerrain';

/** Exported: the scene reuses this reach to probe a per-frame mine-target for the crosshair. */
export const REACH_M = 9;
const CARVE_RADIUS_M = 1.6;
const FILL_RADIUS_M = 1.2;
/** Push the carve center into the surface so a hit takes a real bite. */
const BITE_M = 0.6;

const DIR = new Vector3();

export class DigTool {
  constructor(
    terrain: VoxelTerrain,
    camera: PerspectiveCamera,
    dom: HTMLElement,
    audio?: AudioPort,
    feel?: FeelPort,
    onProgress?: (event: ProgressionEventId) => void,
  ) {
    dom.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== dom) return;
      if (e.button !== 0 && e.button !== 2) return;
      DIR.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const origin: [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      const hit = terrain.raycastSolid(origin, [DIR.x, DIR.y, DIR.z], REACH_M);
      if (!hit) return;
      if (e.button === 0) {
        terrain.carveAt(
          hit[0] + DIR.x * BITE_M,
          hit[1] + DIR.y * BITE_M,
          hit[2] + DIR.z * BITE_M,
          CARVE_RADIUS_M,
        );
        audio?.play('dig', { position: hit });
        feel?.trigger('dig', { worldPos: hit });
        onProgress?.('dig');
      } else {
        // build back toward the player so the fill doesn't swallow the camera
        terrain.fillAt(
          hit[0] - DIR.x * BITE_M,
          hit[1] - DIR.y * BITE_M,
          hit[2] - DIR.z * BITE_M,
          FILL_RADIUS_M,
        );
        audio?.play('place', { position: hit });
        feel?.trigger('place', { worldPos: hit });
        onProgress?.('place');
      }
    });
    dom.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement === dom) e.preventDefault();
    });
  }
}
