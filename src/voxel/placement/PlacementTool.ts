/**
 * Build-mode input + ghost render adapter (plan 8.5 [F]) — the engine half of
 * the pure placement domain. While pointer-locked, `B` toggles build mode: a
 * translucent box ghost tracks the aimed terrain point (SDF march + gradient
 * normal → resolvePlacement each frame), green when Valid / red when Blocked;
 * left click commits a solid piece, right click removes an aimed one. `R`
 * rotates 90°, `[`/`]` cycle the piece catalogue.
 *
 * Click arbitration with DigTool (which listens on the canvas and cannot be
 * edited here): our mousedown listener sits on `window` with capture=true, so
 * it runs during the capture phase BEFORE the canvas target listeners; in
 * build mode it stopImmediatePropagation()s, and the dig never fires. The
 * scene needs no shared mode flag — just construct both tools.
 *
 * Committed pieces flow through the save seam (`deps.save`) as the registry's
 * plain-JSON structure — meant for the world save's
 * entities['placement.pieces']; the scene owns the actual store wiring.
 */

import type { Object3D, PerspectiveCamera } from 'three';
import { BoxGeometry, Color, Group, Mesh, Raycaster, Vector2, Vector3 } from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import type { AudioPort } from '../../game/application/ports/AudioPort';
import type { FeelPort } from '../../game/application/ports/FeelPort';
import {
  commit,
  resolvePlacement,
  rotate,
  type GridSpec,
  type PlacementState,
  type RotationState,
} from '../../game/domain/placement/Placement';
import { SUBTERRANEAN_FLOOR_Y_M, VOXEL_SIZE_M } from '../../game/domain/voxel/VoxelGrid';
import type { VoxelTerrain } from '../VoxelTerrain';
import { VOXEL_MATERIAL_RGB } from '../VoxelMaterials';
import { cellsBox, footprintBoxSize, ghostColorHex } from './GhostVisual';
import { PlacedPieceRegistry, type PlacedPiece } from './PlacedPieceRegistry';
import { cyclePieceIndex, PLACEMENT_PIECES } from './PlacementPieces';
import { makePlacementWorld } from './PlacementWorldAdapter';
import { sdfNormal } from './SdfNormal';

const REACH_M = 9;
const GHOST_OPACITY = 0.4;
/** Face-adjacency nudge: resolve half a cell out along the normal so the
 *  piece snaps into the air cell touching the hit face (Minecraft §3c). */
const NUDGE_M = VOXEL_SIZE_M / 2;

const GRID: GridSpec = { cellSize: VOXEL_SIZE_M, origin: [0, 0, 0] };
const RULES = { floorY: SUBTERRANEAN_FLOOR_Y_M };
const STONE = VOXEL_MATERIAL_RGB[0];

const DIR = new Vector3();
const CENTER_NDC = new Vector2(0, 0);

export interface PlacementSave {
  load(): unknown | undefined;
  persist(data: unknown): void;
}

export interface PlacementToolDeps {
  terrain: VoxelTerrain;
  camera: PerspectiveCamera;
  /** The pointer-lock target (renderer.domElement) — lock identity only. */
  dom: HTMLElement;
  /** Where the ghost + committed-piece meshes are added (the scene). */
  parent: Object3D;
  save?: PlacementSave;
  audio?: AudioPort;
  feel?: FeelPort;
}

export interface PlacementToolHandle {
  /** Call once per frame (engine.onUpdate) — re-aims and repaints the ghost. */
  update(): void;
  isBuildMode(): boolean;
  dispose(): void;
}

export function attachPlacementTool(deps: PlacementToolDeps): PlacementToolHandle {
  const { terrain, camera, dom, parent, save, audio, feel } = deps;
  const sdf = (x: number, y: number, z: number): number => terrain.sdfAtWorld(x, y, z);

  const registry = PlacedPieceRegistry.deserialize(save?.load());
  const world = makePlacementWorld(sdf, GRID, registry);

  let buildMode = false;
  let pieceIndex = 0;
  let rotation: RotationState = { stepDeg: 90, index: 0 };
  let lastState: PlacementState | null = null;

  const piecesGroup = new Group();
  const solidMaterial = new MeshStandardNodeMaterial();
  solidMaterial.color = new Color(STONE[0], STONE[1], STONE[2]);
  solidMaterial.roughness = 0.95;
  solidMaterial.metalness = 0;
  const meshesById = new Map<number, Mesh>();

  const addSolidMesh = (piece: PlacedPiece): void => {
    const { center, size } = cellsBox(piece.cells, GRID);
    const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), solidMaterial);
    mesh.position.set(center[0], center[1], center[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['placedId'] = piece.id;
    meshesById.set(piece.id, mesh);
    piecesGroup.add(mesh);
  };
  for (const piece of registry.all()) addSolidMesh(piece);
  parent.add(piecesGroup);

  const ghostMaterial = new MeshBasicNodeMaterial();
  ghostMaterial.transparent = true;
  ghostMaterial.opacity = GHOST_OPACITY;
  ghostMaterial.depthWrite = false;
  const ghost = new Mesh(ghostGeometry(pieceIndex), ghostMaterial);
  ghost.visible = false;
  parent.add(ghost);

  const persist = (): void => save?.persist(registry.serialize());
  const locked = (): boolean => document.pointerLockElement === dom;

  const setPiece = (delta: number): void => {
    pieceIndex = cyclePieceIndex(pieceIndex, delta, PLACEMENT_PIECES.length);
    ghost.geometry.dispose();
    ghost.geometry = ghostGeometry(pieceIndex);
  };

  const commitAim = (): void => {
    if (!lastState) return;
    const cmd = commit(lastState);
    if (!cmd) return;
    addSolidMesh(registry.add(cmd));
    persist();
    audio?.play('place', { position: cmd.center });
    feel?.trigger('place', { worldPos: cmd.center });
  };

  const raycaster = new Raycaster(undefined, undefined, 0, REACH_M);
  const removeAim = (): void => {
    raycaster.setFromCamera(CENTER_NDC, camera);
    const hit = raycaster.intersectObjects(piecesGroup.children, false)[0];
    if (!hit) return;
    const id = hit.object.userData['placedId'];
    if (typeof id !== 'number' || !registry.remove(id)) return;
    const mesh = meshesById.get(id);
    if (mesh) {
      piecesGroup.remove(mesh);
      mesh.geometry.dispose();
      meshesById.delete(id);
    }
    persist();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!locked()) return;
    if (e.code === 'KeyB') {
      buildMode = !buildMode;
      if (!buildMode) {
        ghost.visible = false;
        lastState = null;
      }
    } else if (!buildMode) {
      return;
    } else if (e.code === 'KeyR') {
      rotation = rotate(rotation, 1);
    } else if (e.code === 'BracketLeft') {
      setPiece(-1);
    } else if (e.code === 'BracketRight') {
      setPiece(1);
    }
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (!buildMode || !locked()) return;
    if (e.button !== 0 && e.button !== 2) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.button === 0) commitAim();
    else removeAim();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mousedown', onMouseDown, true);

  const update = (): void => {
    if (!buildMode) return;
    DIR.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin: [number, number, number] = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    const hit = terrain.raycastSolid(origin, [DIR.x, DIR.y, DIR.z], REACH_M);
    if (!hit) {
      ghost.visible = false;
      lastState = null;
      return;
    }
    const normal = sdfNormal(sdf, hit);
    lastState = resolvePlacement({
      hit: {
        point: [
          hit[0] + normal[0] * NUDGE_M,
          hit[1] + normal[1] * NUDGE_M,
          hit[2] + normal[2] * NUDGE_M,
        ],
        normal,
      },
      mode: 'grid',
      pieceDef: PLACEMENT_PIECES[pieceIndex],
      rotation,
      grid: GRID,
      world,
      rules: RULES,
    });
    ghost.position.set(lastState.center[0], lastState.center[1], lastState.center[2]);
    const q = lastState.orientation;
    ghost.quaternion.set(q[0], q[1], q[2], q[3]);
    ghostMaterial.color.setHex(ghostColorHex(lastState.validity));
    ghost.visible = true;
  };

  return {
    update,
    isBuildMode: () => buildMode,
    dispose: (): void => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown, true);
      parent.remove(ghost);
      parent.remove(piecesGroup);
      ghost.geometry.dispose();
      ghostMaterial.dispose();
      for (const mesh of meshesById.values()) mesh.geometry.dispose();
      solidMaterial.dispose();
    },
  };
}

function ghostGeometry(pieceIndex: number): BoxGeometry {
  const size = footprintBoxSize(PLACEMENT_PIECES[pieceIndex].footprint, VOXEL_SIZE_M);
  return new BoxGeometry(size[0], size[1], size[2]);
}
