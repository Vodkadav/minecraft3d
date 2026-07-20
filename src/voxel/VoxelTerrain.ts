/**
 * Hybrid voxel terrain subsystem (M8) — the engine-side owner of digging.
 *
 * Composition: the pure domain VoxelVolume (SDF chunks, delta persistence)
 * over a baseline adapter reading the heightfield's CPU mirror, meshed per
 * chunk by the pure SurfaceExtractor, rendered as vertex-colored chunk meshes.
 * Only cells with edited samples are meshed, so the pristine surface stays
 * owned by the CDLOD heightfield (the DigMask punches the holes).
 *
 * Persistence: modified chunks flow as ChunkDeltas through the M2
 * WorldSaveStore (OPFS + IndexedDB) under a per-seed demo world id, debounced
 * after each edit. Menu-driven world lifecycle (choose/host/save slots) is the
 * Opus integration milestone; this subsystem owns only its own delta blobs.
 */

import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { WorldEdit } from '../game/domain/net/Protocol';
import type { ChunkKey, PlayerState, WorldSaveData } from '../game/domain/world/WorldSaveData';
import {
  CHUNK_CELLS,
  gridToWorld,
  parseVoxelChunkKey,
  worldToGrid,
} from '../game/domain/voxel/VoxelGrid';
import { VoxelVolume } from '../game/domain/voxel/VoxelVolume';
import type { WorldSaveStore } from '../game/application/ports/WorldSaveStore';
import type { DigMask } from './DigMask';
import { extractChunkMesh, type GridSampler } from './SurfaceExtractor';
import { oreGemMaterialSampler } from '../game/domain/voxel/OreGemSeeding';
import { CAVES_WORLDGEN_VERSION, isCaveCarved, withCaveCarving } from '../game/domain/voxel/CaveSeeding';
import { VOXEL_MATERIAL_RGB } from './VoxelMaterials';

/** Port: the surface the voxel baseline hangs off (heightfield or analytic). */
export interface VoxelSurface {
  heightAt(x: number, z: number): number;
}

const SAVE_DEBOUNCE_MS = 2500;
const RAY_STEP_M = 0.25;

export interface VoxelTerrainOptions {
  /** Full explicit world id (menu-launched worlds) — overrides the
   *  `${worldIdPrefix}-${seed}` demo form so digs persist per-world. */
  readonly worldId?: string;
  /** Live player pose source (the camera rig). When present, saveNow writes
   *  the LIVE pose instead of the pose captured at load — the camera is the
   *  single source of truth; WorldLifecycle.savePlayerState covers exit. */
  readonly poseProvider?: () => PlayerState;
}

/** Save fields this subsystem does NOT own — captured at init, preserved on
 *  save so a voxel write never clobbers the world's name/pose/inventories. */
interface PreservedSaveFields {
  readonly name: string;
  readonly entities: Readonly<Record<string, unknown>>;
  readonly inventories: Readonly<Record<string, unknown>>;
  readonly progression: Readonly<Record<string, unknown>>;
  readonly playerState: PlayerState;
}

export class VoxelTerrain {
  readonly group = new Group();

  /** M7 net seam: every locally-applied edit is reported here so the session
   *  wiring can broadcast it (host) or send it as an intent (joiner). */
  onLocalEdit: ((edit: WorldEdit) => void) | null = null;

  private readonly volume: VoxelVolume;
  private readonly sampler: GridSampler;
  private readonly meshes = new Map<ChunkKey, Mesh>();
  private readonly material: MeshStandardNodeMaterial;
  /** xz chunk columns carrying edits — fast path for the ground probe. */
  private readonly editedColumns = new Set<string>();
  private readonly worldId: string;
  private readonly poseProvider: (() => PlayerState) | null;
  private preserved: PreservedSaveFields | null = null;
  /** Entities written by sibling subsystems (placement, treasures) this
   *  session — spread over the loaded bag on save so both survive. */
  private readonly extraEntities: Record<string, unknown> = {};
  private createdAt: number | null = null;
  private saveTimer: number | undefined;
  /**
   * Cave carving (E6.1) opt-in, resolved once `init()` knows the loaded
   * save's `worldgenVersion` — false (off) until then, so any materialize
   * that could conceivably happen before `init()` resolves stays exactly the
   * pre-caves baseline. A brand-new world (no prior save under this id) is
   * always safe to opt in, since there is no pre-existing content to change.
   */
  private caveGenEnabled = false;
  private worldgenVersion: number | undefined;

  constructor(
    private readonly surface: VoxelSurface,
    private readonly digMask: DigMask,
    private readonly seed: number,
    private readonly store: WorldSaveStore | null,
    worldIdPrefix = 'voxel-demo',
    opts: VoxelTerrainOptions = {},
  ) {
    this.worldId = opts.worldId ?? `${worldIdPrefix}-${seed}`;
    this.poseProvider = opts.poseProvider ?? null;
    const terrainSdfAt = (x: number, y: number, z: number) => y - surface.heightAt(x, z);
    this.volume = new VoxelVolume(
      {
        sdfAt: (x, y, z) =>
          this.caveGenEnabled
            ? withCaveCarving(seed, surface, terrainSdfAt)(x, y, z)
            : terrainSdfAt(x, y, z),
      },
      oreGemMaterialSampler(seed, surface),
    );
    this.sampler = {
      sdf: (ix, iy, iz) => this.volume.sdfAtGrid(ix, iy, iz),
      material: (ix, iy, iz) => this.volume.materialAtGrid(ix, iy, iz),
      // Player edits mesh as before; a naturally cave-carved corner also
      // meshes even though nobody dug it — the seam that turns a dig
      // breaking into a cave wall into a fully-visible cavern rather than an
      // invisible void (natural samples are never stored/persisted as
      // edits, only evaluated live here).
      edited: (ix, iy, iz) =>
        this.volume.isSampleEdited(ix, iy, iz) ||
        (this.caveGenEnabled &&
          isCaveCarved(
            seed,
            gridToWorld(ix),
            gridToWorld(iy),
            gridToWorld(iz),
            surface.heightAt(gridToWorld(ix), gridToWorld(iz)),
          )),
    };
    this.material = new MeshStandardNodeMaterial();
    this.material.vertexColors = true;
    this.material.roughness = 0.95;
    this.material.metalness = 0;
  }

  /** Restore a previous session's digs (if any), then build their meshes. */
  async init(): Promise<void> {
    if (!this.store) return;
    const loaded = await this.store.load(this.worldId);
    if (!loaded.ok) {
      if (loaded.error.kind !== 'NotFound') {

        console.warn('[voxel] save load failed — starting fresh', loaded.error);
      } else {
        // genuinely fresh world under this id — nothing to regress, so cave
        // carving is safe from the start; stamp the version for future loads.
        this.caveGenEnabled = true;
        this.worldgenVersion = CAVES_WORLDGEN_VERSION;
      }
      return;
    }
    // capture the fields other systems own BEFORE the delta restore, so even
    // a corrupt-delta "fresh start" never clobbers name/pose/inventories
    this.createdAt = loaded.value.createdAt;
    this.preserved = {
      name: loaded.value.name,
      entities: loaded.value.entities,
      inventories: loaded.value.inventories,
      progression: loaded.value.progression,
      playerState: loaded.value.playerState,
    };
    // prime directive: a save written before caves existed (no stamp, or an
    // older stamp) must regenerate its never-before-touched terrain exactly
    // as it always has — caves only turn on for worlds stamped at creation.
    this.worldgenVersion = loaded.value.worldgenVersion;
    this.caveGenEnabled =
      this.worldgenVersion !== undefined && this.worldgenVersion >= CAVES_WORLDGEN_VERSION;
    const restored = this.volume.loadFromDeltas(loaded.value.modifiedChunks);
    if (!restored.ok) {

      console.warn('[voxel] corrupt chunk delta — starting fresh', restored.error);
      return;
    }
    const spheres = loaded.value.entities['voxel.digSpheres'];
    if (Array.isArray(spheres)) this.digMask.loadFlatArray(spheres as number[]);
    this.remeshDirtyChunks();
  }

  carveAt(x: number, y: number, z: number, radius: number): void {
    this.volume.carveSphere(x, y, z, radius);
    // mask slots are scarce (MAX_DIG_SPHERES) — only carves that can cut the
    // surface sheet punch a visible hole, so deep tunnel carves record nothing
    if (this.intersectsSurface(x, y, z, radius)) this.digMask.add(x, y, z, radius);
    this.remeshDirtyChunks();
    this.scheduleSave();
    this.onLocalEdit?.({ op: 'dig', x, y, z, radius });
  }

  /** Sphere vs heightfield sheet: center + 4 rim samples to cover slopes. */
  private intersectsSurface(x: number, y: number, z: number, r: number): boolean {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      const h = this.surface.heightAt(x + dx, z + dz);
      if (Math.abs(h - y) <= r) return true;
    }
    return false;
  }

  fillAt(x: number, y: number, z: number, radius: number, materialId = 0): void {
    this.volume.fillSphere(x, y, z, radius, materialId);
    this.remeshDirtyChunks();
    this.scheduleSave();
    this.onLocalEdit?.({ op: 'fill', x, y, z, radius, materialId });
  }

  /** Continuous SDF (meters, negative = solid) — trilinear over the lattice. */
  sdfAtWorld(x: number, y: number, z: number): number {
    const gx = worldToGrid(x);
    const gy = worldToGrid(y);
    const gz = worldToGrid(z);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fy = gy - y0;
    const fz = gz - z0;
    let value = 0;
    for (let i = 0; i < 8; i++) {
      const wx = i & 1 ? fx : 1 - fx;
      const wy = i & 2 ? fy : 1 - fy;
      const wz = i & 4 ? fz : 1 - fz;
      const weight = wx * wy * wz;
      if (weight === 0) continue;
      value +=
        weight *
        this.volume.sdfAtGrid(x0 + (i & 1), y0 + ((i >> 1) & 1), z0 + ((i >> 2) & 1));
    }
    return value;
  }

  /**
   * First solid hit marching from `origin` along `dir` (normalized), or null.
   * Starts past the near clip so the player never digs inside their own head.
   */
  raycastSolid(
    origin: readonly [number, number, number],
    dir: readonly [number, number, number],
    maxDist: number,
  ): [number, number, number] | null {
    let prev = 0.3;
    for (let t = prev; t <= maxDist; t += RAY_STEP_M) {
      const x = origin[0] + dir[0] * t;
      const y = origin[1] + dir[1] * t;
      const z = origin[2] + dir[2] * t;
      if (this.sdfAtWorld(x, y, z) < 0) {
        // bisect [prev, t] for a tighter surface point
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 4; i++) {
          const mid = (lo + hi) / 2;
          const solid =
            this.sdfAtWorld(
              origin[0] + dir[0] * mid,
              origin[1] + dir[1] * mid,
              origin[2] + dir[2] * mid,
            ) < 0;
          if (solid) hi = mid;
          else lo = mid;
        }
        return [origin[0] + dir[0] * hi, origin[1] + dir[1] * hi, origin[2] + dir[2] * hi];
      }
      prev = t;
    }
    return null;
  }

  /**
   * Walkable ground under (x, z) for a player whose eye is at `eyeY`:
   * inside an edited column, march down through carved space to the first
   * solid crossing (cavern floor); elsewhere the heightfield ground stands.
   */
  groundBelow(x: number, z: number, eyeY: number, baseGround: number): number {
    const cx = Math.floor(worldToGrid(x) / CHUNK_CELLS);
    const cz = Math.floor(worldToGrid(z) / CHUNK_CELLS);
    let touched = false;
    for (let dx = -1; dx <= 1 && !touched; dx++) {
      for (let dz = -1; dz <= 1 && !touched; dz++) {
        touched = this.editedColumns.has(`${cx + dx},${cz + dz}`);
      }
    }
    if (!touched) return baseGround;

    const start = eyeY - 0.9; // mid-body: allows normal uphill steps
    if (this.sdfAtWorld(x, start, z) < 0) return baseGround; // inside solid — rim/wall
    for (let y = start; y > start - 40; y -= 0.25) {
      if (this.sdfAtWorld(x, y, z) < 0) return y + 0.125;
    }
    return baseGround;
  }

  /** Read a key from the world save's entities bag (session writes win). */
  entity(key: string): unknown {
    return this.extraEntities[key] ?? this.preserved?.entities[key];
  }

  /** Write a sibling subsystem's entities key; persisted with the next save. */
  setEntity(key: string, value: unknown): void {
    this.extraEntities[key] = value;
    this.scheduleSave();
  }

  /** Persist now (also called on page hide so a pending debounce isn't lost). */
  flushSave(): Promise<void> {
    if (this.saveTimer !== undefined) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    return this.saveNow();
  }

  // ---------------------------------------------------------------- internals

  private remeshDirtyChunks(): void {
    for (const key of this.volume.consumeDirtyChunkKeys()) {
      const coords = parseVoxelChunkKey(key);
      if (!coords) continue;
      const [cx, cy, cz] = coords;
      this.editedColumns.add(`${cx},${cz}`);
      const data = extractChunkMesh(this.sampler, cx, cy, cz, { onlyEditedCells: true });

      const existing = this.meshes.get(key);
      if (data.indices.length === 0) {
        if (existing) {
          this.group.remove(existing);
          existing.geometry.dispose();
          this.meshes.delete(key);
        }
        continue;
      }

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(paletteColors(data.materials), 3));
      geometry.setIndex(new BufferAttribute(data.indices, 1));

      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geometry;
      } else {
        const mesh = new Mesh(geometry, this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.meshes.set(key, mesh);
        this.group.add(mesh);
      }
    }
  }

  private scheduleSave(): void {
    if (!this.store) return;
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveNow(): Promise<void> {
    if (!this.store) return;
    const now = Date.now();
    const save: WorldSaveData = {
      worldId: this.worldId,
      seed: this.seed,
      // dev-scene label only — a menu world's real name is preserved above
      name: this.preserved?.name ?? `Voxel dig demo (seed ${this.seed})`,
      createdAt: this.createdAt ?? now,
      modifiedAt: now,
      modifiedChunks: this.volume.toChunkDeltas(),
      entities: {
        ...this.preserved?.entities,
        ...this.extraEntities,
        'voxel.digSpheres': this.digMask.toFlatArray(),
      },
      inventories: this.preserved?.inventories ?? {},
      progression: this.preserved?.progression ?? {},
      playerState:
        this.poseProvider?.() ??
        this.preserved?.playerState ?? { position: [0, 0, 0], yaw: 0, pitch: 0 },
      // preserve whatever this world was stamped with (undefined for a
      // pre-caves world stays undefined — never upgraded silently on save).
      ...(this.worldgenVersion !== undefined ? { worldgenVersion: this.worldgenVersion } : {}),
    };
    this.createdAt = save.createdAt;
    const result = await this.store.save(save);
    if (!result.ok) {
       
      console.warn('[voxel] save failed — digs may not survive reload', result.error);
    }
  }
}

function paletteColors(materials: Uint8Array): Float32Array {
  const colors = new Float32Array(materials.length * 3);
  for (let i = 0; i < materials.length; i++) {
    const rgb = VOXEL_MATERIAL_RGB[materials[i]] ?? VOXEL_MATERIAL_RGB[0];
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  return colors;
}
