/**
 * Campfire/cooking-station placeable (Workstream 8.1 + 8.4) — raw food cooks
 * into its cooked counterpart over game-time. One job at a time; starting a
 * new job while one is in-flight is rejected until the current one is
 * collected. Reuses the crafting `Recipe` graph (station === "campfire")
 * rather than a second hardcoded raw→cooked table — one source of truth for
 * "what cooks into what" (also gates the instant-craft campfire recipes,
 * Crafting.stationSatisfied). `now` is ms, same convention as Taming.
 */

import { err, ok, type Result } from "../Result";
import { DEFAULT_COOK_DURATION_S, type Recipe } from "../crafting/Crafting";

export interface CookJob {
  readonly recipe: Recipe;
  readonly startedAt: number;
}

export interface CampfireState {
  readonly job: CookJob | null;
}

export type CampfireError =
  | { readonly kind: "Busy" }
  | { readonly kind: "NoRecipe"; readonly itemId: string }
  | { readonly kind: "NotDone" };

export function spawnCampfire(): CampfireState {
  return { job: null };
}

function cookRecipeFor(recipes: readonly Recipe[], rawItemId: string): Recipe | null {
  return (
    recipes.find(
      (r) =>
        r.station === "campfire" &&
        r.ingredients.length === 1 &&
        r.ingredients[0]?.itemId === rawItemId,
    ) ?? null
  );
}

export function startCook(
  state: CampfireState,
  recipes: readonly Recipe[],
  rawItemId: string,
  now: number,
): Result<CampfireState, CampfireError> {
  if (state.job) return err({ kind: "Busy" });
  const recipe = cookRecipeFor(recipes, rawItemId);
  if (!recipe) return err({ kind: "NoRecipe", itemId: rawItemId });
  return ok({ job: { recipe, startedAt: now } });
}

export function cookProgress(job: CookJob, now: number): number {
  const durationMs = (job.recipe.cookDurationS ?? DEFAULT_COOK_DURATION_S) * 1000;
  return Math.max(0, Math.min(1, (now - job.startedAt) / durationMs));
}

export function isCookDone(job: CookJob, now: number): boolean {
  return cookProgress(job, now) >= 1;
}

export interface CookOutput {
  readonly itemId: string;
  readonly count: number;
}

export interface CollectResult {
  readonly state: CampfireState;
  readonly output: CookOutput;
}

export function collectCook(state: CampfireState, now: number): Result<CollectResult, CampfireError> {
  if (!state.job) return err({ kind: "NotDone" });
  if (!isCookDone(state.job, now)) return err({ kind: "NotDone" });
  const { itemId, count } = state.job.recipe.output;
  return ok({ state: { job: null }, output: { itemId, count } });
}
