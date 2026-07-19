import { describe, expect, it } from "vitest";
import { emptyExploration, revealAround } from "./Exploration";
import {
  computeFogGrid,
  computeMapIcons,
  mergeMarkers,
  playerArrowRotationDegrees,
  type MapMarker,
  type MinimapView,
} from "./MinimapModel";

const VIEW: MinimapView = {
  centerX: 0,
  centerZ: 0,
  viewRadiusMeters: 50,
  widthPx: 100,
  heightPx: 100,
};

describe("computeMapIcons", () => {
  it("places a marker at the view center in the middle of the widget", () => {
    const markers: MapMarker[] = [{ id: "p1", kind: "player", x: 0, z: 0 }];
    const [icon] = computeMapIcons(markers, VIEW);
    expect(icon.screenX).toBeCloseTo(50);
    expect(icon.screenY).toBeCloseTo(50);
    expect(icon.visible).toBe(true);
  });

  it("is north-aligned: -Z (north) maps to a smaller screenY (up)", () => {
    const markers: MapMarker[] = [
      { id: "north", kind: "poi", x: 0, z: -25 },
      { id: "south", kind: "poi", x: 0, z: 25 },
    ];
    const [north, south] = computeMapIcons(markers, VIEW);
    expect(north.screenY).toBeLessThan(50);
    expect(south.screenY).toBeGreaterThan(50);
  });

  it("east (+X) maps to a larger screenX", () => {
    const markers: MapMarker[] = [{ id: "e", kind: "poi", x: 25, z: 0 }];
    const [icon] = computeMapIcons(markers, VIEW);
    expect(icon.screenX).toBeGreaterThan(50);
  });

  it("culls markers beyond the view radius as not visible", () => {
    const markers: MapMarker[] = [{ id: "far", kind: "creature", x: 1000, z: 0 }];
    const [icon] = computeMapIcons(markers, VIEW);
    expect(icon.visible).toBe(false);
  });

  it("a marker exactly at the view radius is boundary-inclusive", () => {
    const markers: MapMarker[] = [{ id: "edge", kind: "creature", x: 50, z: 0 }];
    const [icon] = computeMapIcons(markers, VIEW);
    expect(icon.visible).toBe(true);
  });

  it("pans with a non-origin center (full-map pan)", () => {
    const panned: MinimapView = { ...VIEW, centerX: 100, centerZ: 100 };
    const markers: MapMarker[] = [{ id: "p1", kind: "player", x: 100, z: 100 }];
    const [icon] = computeMapIcons(markers, panned);
    expect(icon.screenX).toBeCloseTo(50);
    expect(icon.screenY).toBeCloseTo(50);
  });

  it("zooming out (larger viewRadiusMeters) shrinks screen offsets", () => {
    const zoomedOut: MinimapView = { ...VIEW, viewRadiusMeters: 500 };
    const markers: MapMarker[] = [{ id: "m", kind: "creature", x: 25, z: 0 }];
    const [close] = computeMapIcons(markers, VIEW);
    const [far] = computeMapIcons(markers, zoomedOut);
    expect(Math.abs(far.screenX - 50)).toBeLessThan(Math.abs(close.screenX - 50));
  });
});

describe("mergeMarkers", () => {
  it("combines multiple pluggable marker sources into one list", () => {
    const creatures = () => [{ id: "c1", kind: "creature", x: 1, z: 1 }] as MapMarker[];
    const nodes = () => [{ id: "n1", kind: "resourceNode", x: 2, z: 2 }] as MapMarker[];
    const merged = mergeMarkers([creatures, nodes]);
    expect(merged.map((m) => m.id)).toEqual(["c1", "n1"]);
  });

  it("is a no-op merge for zero sources", () => {
    expect(mergeMarkers([])).toEqual([]);
  });

  it("wiring a new source later is one array entry (e.g. future ground loot)", () => {
    const creatures = () => [{ id: "c1", kind: "creature", x: 0, z: 0 }] as MapMarker[];
    const groundLoot = () => [{ id: "g1", kind: "groundLoot", x: 5, z: 5 }] as MapMarker[];
    const merged = mergeMarkers([creatures, groundLoot]);
    expect(merged).toHaveLength(2);
    expect(merged.some((m) => m.kind === "groundLoot")).toBe(true);
  });
});

describe("playerArrowRotationDegrees", () => {
  it("maps 0 yaw (facing north) to 0 degrees", () => {
    expect(playerArrowRotationDegrees(0)).toBe(0);
  });

  it("maps a half turn to 180 degrees", () => {
    expect(playerArrowRotationDegrees(Math.PI)).toBeCloseTo(180);
  });
});

describe("computeFogGrid", () => {
  it("flags cells the player has revealed as discovered", () => {
    const exploration = revealAround(emptyExploration(10), 0, 0, 1);
    const grid = computeFogGrid(exploration, VIEW);
    const origin = grid.find((c) => c.cx === 0 && c.cz === 0);
    expect(origin?.discovered).toBe(true);
  });

  it("flags cells outside the revealed radius as undiscovered", () => {
    const exploration = revealAround(emptyExploration(10), 0, 0, 0);
    const grid = computeFogGrid(exploration, VIEW);
    const far = grid.find((c) => c.cx === 4 && c.cz === 4);
    expect(far?.discovered).toBe(false);
  });

  it("covers the whole view extent with no gaps at the requested cell size", () => {
    const exploration = emptyExploration(10);
    const grid = computeFogGrid(exploration, VIEW);
    // view radius 50 over 10m cells => at least an 11x11-ish coverage
    expect(grid.length).toBeGreaterThanOrEqual(11 * 11);
  });

  it("scales sizePx with zoom", () => {
    const exploration = emptyExploration(10);
    const zoomedIn = computeFogGrid(exploration, { ...VIEW, viewRadiusMeters: 25 });
    const zoomedOut = computeFogGrid(exploration, { ...VIEW, viewRadiusMeters: 500 });
    expect(zoomedIn[0]!.sizePx).toBeGreaterThan(zoomedOut[0]!.sizePx);
  });
});
