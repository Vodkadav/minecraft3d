/**
 * Spawn-field engine adapter (plan 5.4 [F]) — the composition entry the
 * scenes wire in. Drives the pure proximity step (SpawnProximity) around the
 * player and materializes placeholder primitives per species (SPECIES_VISUAL;
 * real models are M6). All spawn/despawn decisions live in the domain; this
 * file is only mesh lifecycle. Ground validity (above water, walkable slope)
 * is applied at materialize time through the SpawnGround port.
 *
 * The step scans a ~13-cell window of hashes — cheap, but not per-frame: it
 * runs on spawn-cell crossings and a coarse timer (the ring moves with the
 * player even within one cell).
 */

import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from "three";
import type { SpawnEntity } from "../game/domain/spawn/SpawnField";
import { worldToSpawnCell } from "../game/domain/spawn/SpawnField";
import { stepSpawns } from "../game/domain/spawn/SpawnProximity";
import { SPECIES_VISUAL, validGround, type SpawnGround } from "./SpawnPlacement";

/** Seconds between proximity re-steps when no cell is crossed. */
const STEP_INTERVAL_S = 1.0;

export interface SpawnFieldDeps {
  readonly seed: number;
  readonly ground: SpawnGround;
  readonly parent: Object3D;
  getPlayerXZ(): readonly [number, number];
  /** The M4 animal-density slider, 0..1. */
  readonly density: number;
  /** Harvested/killed ids (persisted by the scene); omitted = none. */
  readonly removed?: ReadonlySet<string>;
}

export interface SpawnFieldHandle {
  update(dt: number): void;
  dispose(): void;
  readonly activeCount: number;
}

export function attachSpawnField(deps: SpawnFieldDeps): SpawnFieldHandle {
  const group = new Group();
  deps.parent.add(group);

  const geometries = new Map<string, BufferGeometry>();
  const materials = new Map<string, MeshStandardMaterial>();
  for (const [species, v] of Object.entries(SPECIES_VISUAL)) {
    geometries.set(
      species,
      v.shape === "box"
        ? new BoxGeometry(v.size, v.size, v.size)
        : v.shape === "sphere"
          ? new SphereGeometry(v.size / 2, 12, 8)
          : new ConeGeometry(v.size / 2, v.size, 10),
    );
    materials.set(species, new MeshStandardMaterial({ color: v.color, roughness: 0.85 }));
  }

  const meshes = new Map<string, Mesh>();
  const removed = deps.removed ?? new Set<string>();
  let lastCx: number | null = null;
  let lastCz: number | null = null;
  let sinceStep = Infinity; // first update always steps

  function materialize(s: SpawnEntity): void {
    const [x, , z] = s.position;
    if (!validGround(deps.ground, x, z)) return;
    const v = SPECIES_VISUAL[s.species];
    if (!v) return;
    const mesh = new Mesh(geometries.get(s.species), materials.get(s.species));
    mesh.position.set(x, deps.ground.heightAt(x, z) + v.lift, z);
    mesh.castShadow = true;
    mesh.name = s.id;
    meshes.set(s.id, mesh);
    group.add(mesh);
  }

  function remove(id: string): void {
    const mesh = meshes.get(id);
    if (!mesh) return;
    group.remove(mesh);
    meshes.delete(id);
  }

  return {
    update(dt: number): void {
      sinceStep += dt;
      const [px, pz] = deps.getPlayerXZ();
      const cx = worldToSpawnCell(px);
      const cz = worldToSpawnCell(pz);
      if (cx === lastCx && cz === lastCz && sinceStep < STEP_INTERVAL_S) return;
      lastCx = cx;
      lastCz = cz;
      sinceStep = 0;
      const { enter, leave } = stepSpawns({
        seed: deps.seed,
        epoch: 0,
        density: deps.density,
        players: [[px, pz]],
        active: new Set(meshes.keys()),
        removed,
      });
      for (const id of leave) remove(id);
      for (const s of enter) materialize(s);
    },

    dispose(): void {
      for (const id of [...meshes.keys()]) remove(id);
      deps.parent.remove(group);
      for (const g of geometries.values()) g.dispose();
      for (const m of materials.values()) m.dispose();
    },

    get activeCount(): number {
      return meshes.size;
    },
  };
}
