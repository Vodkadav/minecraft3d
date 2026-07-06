/**
 * Dig/build input (M8.3): while pointer-locked, left click carves an air
 * pocket at the aimed surface, right click packs stone back in. A minimal
 * crosshair dot marks the aim point (no text — nothing to localize).
 *
 * The full placement system — ghost preview, rotation, smart snapping — is
 * plan 8.5 [O, after the 8.6 research pass]; this tool only owns the dig loop.
 */

import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { VoxelTerrain } from './VoxelTerrain';

const REACH_M = 9;
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
      } else {
        // build back toward the player so the fill doesn't swallow the camera
        terrain.fillAt(
          hit[0] - DIR.x * BITE_M,
          hit[1] - DIR.y * BITE_M,
          hit[2] - DIR.z * BITE_M,
          FILL_RADIUS_M,
        );
      }
    });
    dom.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement === dom) e.preventDefault();
    });
    installCrosshair();
  }
}

function installCrosshair(): void {
  const dot = document.createElement('div');
  dot.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'width:4px',
    'height:4px',
    'margin:-2px 0 0 -2px',
    'border-radius:50%',
    'background:rgba(255,255,255,0.8)',
    'box-shadow:0 0 2px rgba(0,0,0,0.9)',
    'pointer-events:none',
    'z-index:10',
  ].join(';');
  document.body.appendChild(dot);
}
