/**
 * Plot + crop growth domain (Workstream 8.3) — plant a seed, it advances
 * through discrete growth stages over game-time, harvestable once the last
 * stage completes. `now`/`plantedAt` are ms (Date.now()-style), the same
 * convention as Taming/Campfire, so a host tick can drive it directly.
 */

import { err, ok, type Result } from "../Result";

export interface CropDef {
  readonly id: string;
  readonly seedItemId: string;
  readonly harvestItemId: string;
  /** Seconds per growth stage; length = stage count before harvestable. */
  readonly stageDurationsS: readonly number[];
  readonly harvestMin: number;
  readonly harvestMax: number;
}

export const CROPS: readonly CropDef[] = [
  {
    id: "wheat",
    seedItemId: "wheat-seed",
    harvestItemId: "wheat",
    stageDurationsS: [20, 20, 20],
    harvestMin: 2,
    harvestMax: 4,
  },
  {
    id: "carrot",
    seedItemId: "carrot-seed",
    harvestItemId: "carrot",
    stageDurationsS: [15, 15, 20],
    harvestMin: 1,
    harvestMax: 3,
  },
  {
    id: "potato",
    seedItemId: "potato-seed",
    harvestItemId: "potato",
    stageDurationsS: [18, 18, 18],
    harvestMin: 1,
    harvestMax: 3,
  },
];

export function cropFor(id: string): CropDef | null {
  return CROPS.find((c) => c.id === id) ?? null;
}

export function cropForSeed(seedItemId: string): CropDef | null {
  return CROPS.find((c) => c.seedItemId === seedItemId) ?? null;
}

export interface PlotState {
  readonly cropId: string | null;
  readonly plantedAt: number | null;
}

export type FarmingError =
  | { readonly kind: "Occupied" }
  | { readonly kind: "UnknownCrop"; readonly id: string }
  | { readonly kind: "Empty" }
  | { readonly kind: "NotReady" };

export function emptyPlot(): PlotState {
  return { cropId: null, plantedAt: null };
}

export function plant(plot: PlotState, cropId: string, now: number): Result<PlotState, FarmingError> {
  if (plot.cropId) return err({ kind: "Occupied" });
  if (!cropFor(cropId)) return err({ kind: "UnknownCrop", id: cropId });
  return ok({ cropId, plantedAt: now });
}

/** 0-based growth stage index; equals `stageDurationsS.length` once fully grown. */
export function growthStage(plot: PlotState, now: number): number {
  if (!plot.cropId || plot.plantedAt === null) return 0;
  const crop = cropFor(plot.cropId);
  if (!crop) return 0;
  const elapsedS = (now - plot.plantedAt) / 1000;
  let acc = 0;
  for (let i = 0; i < crop.stageDurationsS.length; i++) {
    acc += crop.stageDurationsS[i] as number;
    if (elapsedS < acc) return i;
  }
  return crop.stageDurationsS.length;
}

export function isHarvestable(plot: PlotState, now: number): boolean {
  if (!plot.cropId) return false;
  const crop = cropFor(plot.cropId);
  if (!crop) return false;
  return growthStage(plot, now) >= crop.stageDurationsS.length;
}

export interface HarvestOutput {
  readonly itemId: string;
  readonly count: number;
}

export interface HarvestResult {
  readonly plot: PlotState;
  readonly output: HarvestOutput;
}

/** `roll` in [0,1) — deterministic yield count within [harvestMin, harvestMax]. */
export function harvest(
  plot: PlotState,
  now: number,
  roll: number,
): Result<HarvestResult, FarmingError> {
  if (!plot.cropId) return err({ kind: "Empty" });
  const crop = cropFor(plot.cropId);
  if (!crop) return err({ kind: "UnknownCrop", id: plot.cropId });
  if (!isHarvestable(plot, now)) return err({ kind: "NotReady" });
  const span = crop.harvestMax - crop.harvestMin + 1;
  const count = crop.harvestMin + Math.min(span - 1, Math.floor(roll * span));
  return ok({ plot: emptyPlot(), output: { itemId: crop.harvestItemId, count } });
}
