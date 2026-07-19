// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MapMarker } from "../game/domain/map/MinimapModel";
import { mountMinimapView } from "./MinimapView";

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountMinimapView", () => {
  it("mounts a fixed-size widget into the document", () => {
    const handle = mountMinimapView({ heightAt: () => 0 });
    expect(document.querySelector(".lw-minimap")).not.toBeNull();
    const canvas = document.querySelector<HTMLCanvasElement>(".lw-minimap-canvas");
    expect(canvas?.width).toBe(160);
    expect(canvas?.height).toBe(160);
    handle.dispose();
  });

  it("shrinks the widget and drops mobile marker attribute on the mobile preset", () => {
    const handle = mountMinimapView({ heightAt: () => 0, mobile: true });
    const el = document.querySelector<HTMLElement>(".lw-minimap");
    expect(el?.dataset.mobile).toBe("true");
    const canvas = document.querySelector<HTMLCanvasElement>(".lw-minimap-canvas");
    expect(canvas?.width).toBe(96);
    handle.dispose();
  });

  it("places the player arrow icon at the widget center", () => {
    const handle = mountMinimapView({ heightAt: () => 0 });
    handle.update({ x: 100, z: 100, yawRadians: 0 }, []);
    const arrow = document.querySelector<HTMLElement>('.lw-map-icon[data-kind="player"]');
    expect(arrow?.style.left).toBe("80px");
    expect(arrow?.style.top).toBe("80px");
    handle.dispose();
  });

  it("renders a marker within range and culls one outside the view radius", () => {
    const handle = mountMinimapView({ heightAt: () => 0, viewRadiusMeters: 50 });
    const markers: MapMarker[] = [
      { id: "near", kind: "creature", x: 5, z: 0 },
      { id: "far", kind: "creature", x: 5000, z: 0 },
    ];
    handle.update({ x: 0, z: 0, yawRadians: 0 }, markers);
    expect(document.querySelector('.lw-map-icon[data-kind="creature"]')).not.toBeNull();
    expect(document.querySelectorAll(".lw-map-icon").length).toBe(2); // player + the one in-range marker
    handle.dispose();
  });

  it("re-rendering replaces the previous icon set instead of accumulating", () => {
    const handle = mountMinimapView({ heightAt: () => 0 });
    handle.update({ x: 0, z: 0, yawRadians: 0 }, [{ id: "c1", kind: "creature", x: 1, z: 1 }]);
    handle.update({ x: 0, z: 0, yawRadians: 0 }, [{ id: "c1", kind: "creature", x: 1, z: 1 }]);
    expect(document.querySelectorAll(".lw-map-icon").length).toBe(2);
    handle.dispose();
  });

  it("dispose removes the widget from the document", () => {
    const handle = mountMinimapView({ heightAt: () => 0 });
    handle.dispose();
    expect(document.querySelector(".lw-minimap")).toBeNull();
  });
});
