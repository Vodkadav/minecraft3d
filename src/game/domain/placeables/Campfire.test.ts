import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { Recipe } from "../crafting/Crafting";
import { collectCook, cookProgress, isCookDone, spawnCampfire, startCook } from "./Campfire";

const COOK_MEAT: Recipe = {
  id: "cook-meat",
  ingredients: [{ itemId: "meat", count: 1 }],
  output: { itemId: "cooked-meat", count: 1 },
  unlockTier: 0,
  station: "campfire",
  cookDurationS: 10,
};

const NON_COOK: Recipe = {
  id: "planks",
  ingredients: [{ itemId: "wood", count: 1 }],
  output: { itemId: "plank", count: 4 },
  unlockTier: 0,
};

const RECIPES = [COOK_MEAT, NON_COOK];
const NOW = 1_000_000;

describe("Campfire cooking", () => {
  it("starts a job for a known raw item", () => {
    const r = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.job?.recipe.id).toBe("cook-meat");
  });

  it("rejects an item with no campfire recipe", () => {
    const r = startCook(spawnCampfire(), RECIPES, "wood", NOW);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "NoRecipe", itemId: "wood" });
  });

  it("ignores a non-campfire recipe even if the ingredient id matches", () => {
    const onlyNonCook = [NON_COOK];
    const r = startCook(spawnCampfire(), onlyNonCook, "wood", NOW);
    expect(isErr(r)).toBe(true);
  });

  it("rejects starting a second job while one is in flight", () => {
    const started = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    if (!isOk(started)) throw new Error("setup failed");
    const r = startCook(started.value, RECIPES, "meat", NOW);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "Busy" });
  });

  it("progress is 0 at start and 1 once the duration elapses", () => {
    const started = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    if (!isOk(started)) throw new Error("setup failed");
    const job = started.value.job;
    if (!job) throw new Error("no job");
    expect(cookProgress(job, NOW)).toBe(0);
    expect(cookProgress(job, NOW + 5000)).toBeCloseTo(0.5);
    expect(cookProgress(job, NOW + 10000)).toBe(1);
    expect(cookProgress(job, NOW + 99999)).toBe(1); // clamped
  });

  it("isCookDone flips true once the duration elapses", () => {
    const started = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    if (!isOk(started)) throw new Error("setup failed");
    const job = started.value.job;
    if (!job) throw new Error("no job");
    expect(isCookDone(job, NOW + 5000)).toBe(false);
    expect(isCookDone(job, NOW + 10000)).toBe(true);
  });

  it("collectCook rejects before done and rejects with no job", () => {
    expect(isErr(collectCook(spawnCampfire(), NOW))).toBe(true);
    const started = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    if (!isOk(started)) throw new Error("setup failed");
    expect(isErr(collectCook(started.value, NOW + 1000))).toBe(true);
  });

  it("collectCook yields the output and clears the job once done", () => {
    const started = startCook(spawnCampfire(), RECIPES, "meat", NOW);
    if (!isOk(started)) throw new Error("setup failed");
    const r = collectCook(started.value, NOW + 10000);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.output).toEqual({ itemId: "cooked-meat", count: 1 });
      expect(r.value.state.job).toBeNull();
    }
  });
});
