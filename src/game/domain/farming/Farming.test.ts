import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { cropFor, emptyPlot, growthStage, harvest, isHarvestable, plant } from "./Farming";

const NOW = 1_000_000;

describe("plant", () => {
  it("plants a known crop into an empty plot", () => {
    const r = plant(emptyPlot(), "wheat", NOW);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual({ cropId: "wheat", plantedAt: NOW });
  });

  it("rejects an unknown crop id", () => {
    const r = plant(emptyPlot(), "dragonfruit", NOW);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "UnknownCrop", id: "dragonfruit" });
  });

  it("rejects planting into an occupied plot", () => {
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    const r = plant(planted.value, "carrot", NOW);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "Occupied" });
  });
});

describe("growthStage / isHarvestable", () => {
  const wheat = cropFor("wheat");
  if (!wheat) throw new Error("wheat missing from CROPS");
  const stageS = wheat.stageDurationsS;

  it("starts at stage 0 right after planting", () => {
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    expect(growthStage(planted.value, NOW)).toBe(0);
    expect(isHarvestable(planted.value, NOW)).toBe(false);
  });

  it("advances a stage once its duration elapses", () => {
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    expect(growthStage(planted.value, NOW + stageS[0]! * 1000)).toBe(1);
  });

  it("is harvestable once every stage has elapsed", () => {
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    const totalMs = stageS.reduce((a, b) => a + b, 0) * 1000;
    expect(isHarvestable(planted.value, NOW + totalMs - 1)).toBe(false);
    expect(isHarvestable(planted.value, NOW + totalMs)).toBe(true);
  });

  it("an empty plot is never harvestable", () => {
    expect(isHarvestable(emptyPlot(), NOW)).toBe(false);
  });
});

describe("harvest", () => {
  it("rejects an empty plot", () => {
    const r = harvest(emptyPlot(), NOW, 0.5);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "Empty" });
  });

  it("rejects harvesting before the crop is ready", () => {
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    const r = harvest(planted.value, NOW + 1000, 0.5);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "NotReady" });
  });

  it("yields the crop's harvest item within [min,max] and resets the plot", () => {
    const wheat = cropFor("wheat");
    if (!wheat) throw new Error("wheat missing");
    const planted = plant(emptyPlot(), "wheat", NOW);
    if (!isOk(planted)) throw new Error("setup failed");
    const readyAt = NOW + wheat.stageDurationsS.reduce((a, b) => a + b, 0) * 1000;

    const rMin = harvest(planted.value, readyAt, 0);
    expect(isOk(rMin)).toBe(true);
    if (isOk(rMin)) {
      expect(rMin.value.output.itemId).toBe("wheat");
      expect(rMin.value.output.count).toBe(wheat.harvestMin);
      expect(rMin.value.plot).toEqual(emptyPlot());
    }

    const rMax = harvest(planted.value, readyAt, 0.999999);
    if (isOk(rMax)) expect(rMax.value.output.count).toBe(wheat.harvestMax);
  });
});
