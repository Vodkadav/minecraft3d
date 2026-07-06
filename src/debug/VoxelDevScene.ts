/**
 * ?scene=voxeldev — lightweight M8 voxel-terrain proving ground.
 *
 * An analytic rolling ground (no Heightfield generation, no atmosphere) with
 * the full voxel stack on top: dig-mask hole punch on the ground material
 * (the same TSL graph TerrainTiles uses), chunk meshing, dig input, cavern-
 * aware walk probe, and OPFS/IndexedDB delta persistence. Exists because the
 * full LAAS world gen is too heavy for some local GPU/driver combos (Windows
 * TDR device-loss) while the voxel subsystem itself is light.
 */

import { DirectionalLight, HemisphereLight, Mesh, PlaneGeometry, Vector3 } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { float, mix, positionWorld, vec3 } from 'three/tsl';
import { IndexedDbKeyValueStore } from '../game/infrastructure/persistence/IndexedDbKeyValueStore';
import { OpfsBlobStore } from '../game/infrastructure/persistence/OpfsBlobStore';
import { PersistentWorldSaveStore } from '../game/infrastructure/persistence/PersistentWorldSaveStore';
import { DigMask } from '../voxel/DigMask';
import { DigTool } from '../voxel/DigTool';
import { VoxelTerrain, type VoxelSurface } from '../voxel/VoxelTerrain';
import type { WorldContext } from './Scenes';

const GROUND_SIZE = 320;
const GROUND_SEGS = 200;

/** Analytic rolling meadow around y=20 — CPU-exact for probe/raycast/mesh alike. */
function makeSurface(seed: number): VoxelSurface {
  const ph = (seed % 1000) * 0.7;
  return {
    heightAt: (x, z) =>
      20 +
      2.6 * Math.sin(x * 0.045 + ph) * Math.cos(z * 0.038 + ph * 0.6) +
      1.1 * Math.sin(x * 0.11 - z * 0.07 + ph * 1.7),
  };
}

export async function buildVoxelDevScene(ctx: WorldContext): Promise<void> {
  const { engine, params } = ctx;
  const { scene } = engine;
  const surface = makeSurface(params.seed);

  ctx.progress(0.3, 'voxeldev: ground');

  // CPU-displaced ground so the rendered surface IS the voxel baseline
  const groundGeo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes['position'];
  if (!pos) throw new Error('ground geometry missing position attribute');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setY(i, surface.heightAt(v.x, v.z));
  }
  groundGeo.computeVertexNormals();

  const digMask = new DigMask();
  const groundMat = new MeshPhysicalNodeMaterial();
  groundMat.colorNode = mix(
    vec3(0.05, 0.12, 0.03),
    vec3(0.13, 0.11, 0.05),
    positionWorld.y.sub(18).mul(0.12).clamp(0, 1),
  );
  groundMat.roughnessNode = float(0.95);
  groundMat.metalnessNode = float(0);
  // the exact hole-punch wiring TerrainTiles uses under ?voxel=1
  groundMat.opacityNode = digMask.holeNode().oneMinus();
  groundMat.alphaTest = 0.5;
  const ground = new Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  ctx.progress(0.55, 'voxeldev: voxel stack');

  const store =
    'storage' in navigator && 'getDirectory' in navigator.storage
      ? new PersistentWorldSaveStore(new OpfsBlobStore(), new IndexedDbKeyValueStore())
      : null;
  const voxels = new VoxelTerrain(surface, digMask, params.seed, store, 'voxel-dev');
  await voxels.init();
  scene.add(voxels.group);
  new DigTool(voxels, engine.camera, engine.renderer.domElement);
  window.addEventListener('pagehide', () => voxels.flushSave());
  (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg = {
    engine,
    voxels,
    surface,
  };

  // cavern-aware walk probe (no water in this scene)
  ctx.hooks.groundProbe = (x, z) => ({
    ground: voxels.groundBelow(x, z, engine.camera.position.y, surface.heightAt(x, z)),
    water: -1000,
  });

  ctx.progress(0.8, 'voxeldev: lights');

  const sun = new DirectionalLight(0xfff2dd, 3.0);
  sun.position.set(120, 160, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new HemisphereLight(0xa8c8e8, 0x4a4438, 0.6));

  // walk spawn at the center, facing -z
  if (params.cam === null) {
    const eye = surface.heightAt(0, 12) + 1.7;
    ctx.hooks.initialPose = { p: [0, eye, 12], yaw: 0, pitch: -0.12 };
    ctx.hooks.initialPoseMode = 'walk';
    engine.camera.position.set(0, eye, 12);
  }

  ctx.progress(0.95, 'voxeldev: ready');
}
