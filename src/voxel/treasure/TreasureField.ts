/**
 * Hidden-treasure engine adapter (plan 8.7, [F]) — the composition entry the
 * scenes wire in. Streams tier-colored octahedron markers around the player
 * over the pure domain field (HiddenTreasure) and claims them through the
 * pure state machine (TreasureDiscovery); all streaming/claim decisions live
 * in TreasureStreaming so this file is only mesh lifecycle. The scene owns
 * persistence and reactions via `onDiscovered` (the DiscoveryState it
 * receives serializes straight into the save's `entities` bag); this module
 * renders no user-facing text. Per-frame work is a marker walk with no
 * allocation — the window scan only runs on a treasure-cell crossing.
 */

import { Group, Mesh, MeshStandardMaterial, OctahedronGeometry, type Object3D } from "three";
import {
  worldToTreasureCell,
  type HiddenTreasure,
  type TreasureTier,
} from "../../game/domain/treasure/HiddenTreasure";
import {
  discover,
  emptyDiscovery,
  type DiscoveryState,
} from "../../game/domain/treasure/TreasureDiscovery";
import type { ItemStack } from "../../game/domain/inventory/Inventory";
import {
  crossedTreasureCell,
  DEFAULT_RADIUS_CELLS,
  desiredTreasures,
  diffVisible,
  markerY,
  TIER_COLOR,
  withinDiscoveryRange,
} from "./TreasureStreaming";

export interface TreasureFieldDeps {
  readonly seed: number;
  /** Heightfield or analytic ground — same port VoxelTerrain hangs off. */
  readonly surface: { heightAt(x: number, z: number): number };
  /** Marker group parent (typically the scene root). */
  readonly parent: Object3D;
  getPlayerXZ(): readonly [number, number];
  /** Claimed ids restored from the save; omitted = fresh world. */
  readonly discovery?: DiscoveryState;
  readonly radiusCells?: number;
  /** The scene persists `state` into the save and reacts to the reward. */
  onDiscovered(
    treasure: HiddenTreasure,
    reward: readonly ItemStack[],
    state: DiscoveryState,
  ): void;
}

export interface TreasureField {
  update(dt: number): void;
  dispose(): void;
  readonly markerCount: number;
}

const MARKER_RADIUS_M = 0.35;
const SPIN_RAD_S = 0.9;
const BOB_HZ_RAD = 1.6;
const BOB_AMPL_M = 0.12;

interface MarkerEntry {
  readonly treasure: HiddenTreasure;
  readonly mesh: Mesh;
  readonly baseY: number;
  readonly phase: number;
}

export function attachTreasureField(deps: TreasureFieldDeps): TreasureField {
  const radiusCells = deps.radiusCells ?? DEFAULT_RADIUS_CELLS;
  const group = new Group();
  deps.parent.add(group);

  const geometry = new OctahedronGeometry(MARKER_RADIUS_M);
  const materials: Readonly<Record<TreasureTier, MeshStandardMaterial>> = {
    common: tierMaterial("common"),
    rare: tierMaterial("rare"),
    legendary: tierMaterial("legendary"),
  };

  const markers = new Map<string, MarkerEntry>();
  let state: DiscoveryState = deps.discovery ?? emptyDiscovery();
  let lastCx: number | null = null;
  let lastCz: number | null = null;
  let clock = 0;

  function spawn(treasure: HiddenTreasure): void {
    const [x, , z] = treasure.position;
    const mesh = new Mesh(geometry, materials[treasure.tier]);
    mesh.name = treasure.id;
    const baseY = markerY(deps.surface.heightAt(x, z));
    mesh.position.set(x, baseY, z);
    group.add(mesh);
    // position-derived phase so a cluster of markers doesn't bob in lockstep
    markers.set(treasure.id, { treasure, mesh, baseY, phase: (x * 0.7 + z * 1.3) % (Math.PI * 2) });
  }

  function despawn(id: string): void {
    const entry = markers.get(id);
    if (!entry) return;
    group.remove(entry.mesh);
    markers.delete(id);
  }

  function claim(entry: MarkerEntry): void {
    despawn(entry.treasure.id);
    const result = discover(state, entry.treasure);
    if (!result.ok) return; // AlreadyClaimed — stale marker, already handled
    state = result.value.state;
    deps.onDiscovered(entry.treasure, result.value.reward, state);
  }

  return {
    update(dt: number): void {
      clock += dt;
      const [px, pz] = deps.getPlayerXZ();

      if (crossedTreasureCell(lastCx, lastCz, px, pz)) {
        lastCx = worldToTreasureCell(px);
        lastCz = worldToTreasureCell(pz);
        const diff = diffVisible(
          new Set(markers.keys()),
          desiredTreasures(deps.seed, px, pz, radiusCells, state),
        );
        for (const id of diff.leave) despawn(id);
        for (const t of diff.enter) spawn(t);
      }

      for (const entry of markers.values()) {
        entry.mesh.rotation.y = clock * SPIN_RAD_S + entry.phase;
        entry.mesh.position.y = entry.baseY + BOB_AMPL_M * Math.sin(clock * BOB_HZ_RAD + entry.phase);
        const [tx, , tz] = entry.treasure.position;
        if (withinDiscoveryRange(px, pz, tx, tz)) claim(entry);
      }
    },

    dispose(): void {
      for (const id of [...markers.keys()]) despawn(id);
      deps.parent.remove(group);
      geometry.dispose();
      for (const mat of Object.values(materials)) mat.dispose();
    },

    get markerCount(): number {
      return markers.size;
    },
  };
}

function tierMaterial(tier: TreasureTier): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: TIER_COLOR[tier],
    emissive: TIER_COLOR[tier],
    emissiveIntensity: 0.5,
    roughness: 0.35,
    metalness: 0.25,
  });
}
