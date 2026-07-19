/** Scene registry — `?scene=` selects the boot scene (world | sanity | terrain | gallery …). */

import type { Engine } from '../core/Engine';
import type { LaasHooks } from '../core/Hooks';
import type { LaasParams } from '../core/Params';
import type { WorldSeed } from '../core/Seed';
import type { AudioPort } from '../game/application/ports/AudioPort';
import type { WorldSaveStore } from '../game/application/ports/WorldSaveStore';
import type { ItemRegistry } from '../game/domain/items/ItemRegistry';
import type { SerializedInventoryWire } from '../game/domain/net/Protocol';
import type { PlayerState } from '../game/domain/world/WorldSaveData';
import type { SpawnFieldHandle } from '../spawn/SpawnFieldView';
import type { PlaceableInteractionHandle } from '../voxel/placement/PlaceableInteractionTool';
import type { VoxelTerrain } from '../voxel/VoxelTerrain';

/** Present when the boot came from the menu (world lifecycle) — binds the
 *  scene to the chosen world: its real id, the SAME persistent store the menu
 *  uses, and the live camera pose for saves. Absent on tooling/dev URL boots. */
export interface WorldLaunchBinding {
  worldId: string;
  store: WorldSaveStore;
  poseProvider: () => PlayerState;
  /** Set by the scene once the M8 voxel subsystem boots — the M7 net glue
   *  applies remote dig/fill through it. */
  voxels?: VoxelTerrain;
  /** Set by the scene once the spawn field attaches — the M7.x net glue streams
   *  creatures (host) or puppets them (joiner) through it (ADR 0003). */
  spawns?: SpawnFieldHandle;
  /** Set by the scene once functional placeables attach (Workstream 8.1,
   *  S7b) — the net glue resolves joiner intents through it (host) or
   *  reconciles broadcast state through it (joiner). */
  placeables?: PlaceableInteractionHandle;
  /** Set by the scene once the item catalogue loads — the M7 net glue's
   *  HostSession needs it to be inventory-authoritative (E0.4). */
  registry?: ItemRegistry;
  /** Set by the scene once its HUD exists — the M7 net glue calls this with
   *  the host's echoed `inventoryState` after any joiner inventoryOp/chest
   *  transfer (E0.4 wave-3). A joiner's inventory UI updates ONLY here, never
   *  from a local mutation. */
  applyInventoryState?(wire: SerializedInventoryWire): void;
}

export interface WorldContext {
  engine: Engine;
  params: LaasParams;
  seed: WorldSeed;
  hooks: LaasHooks;
  /** report build progress 0..1 */
  progress: (p: number, msg: string) => void;
  world?: WorldLaunchBinding;
  /** Workstream 1: present only on a real menu-launched game boot (never on
   *  a tooling/dev URL scene) — the WebAudioAdapter behind this port stays
   *  silent until the browser's first user-gesture resume. */
  audio?: AudioPort;
}

export type SceneBuilder = (ctx: WorldContext) => Promise<void>;

const registry = new Map<string, SceneBuilder>();

export function registerScene(name: string, builder: SceneBuilder): void {
  registry.set(name, builder);
}

export async function buildScene(name: string, ctx: WorldContext): Promise<void> {
  const builder = registry.get(name);
  if (!builder) {
    const known = [...registry.keys()].join(', ');
    throw new Error(`Unknown scene "${name}". Known scenes: ${known}`);
  }
  await builder(ctx);
}

export function sceneNames(): string[] {
  return [...registry.keys()];
}
