// @vitest-environment happy-dom
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { Localizer } from "../game/application/i18n/Localizer";
import type { NameplatePolicy } from "../game/domain/hud/Nameplate";
import { mountNameplateView, type NameplateViewDeps } from "./NameplateView";
import type { NameplateTargetEntity } from "./SpawnFieldView";

function stubCanvasRect(canvas: HTMLElement): void {
  canvas.getBoundingClientRect = (): DOMRect =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

const ALWAYS_ALL: NameplatePolicy = {
  mode: "always",
  friendly: true,
  neutral: true,
  hostile: true,
  tamed: true,
  player: true,
};

function target(overrides: Partial<NameplateTargetEntity> = {}): NameplateTargetEntity {
  return {
    id: "deer-1",
    species: "deer",
    worldPos: [0, 0, -5],
    health: 20,
    maxHealth: 20,
    tamed: false,
    ...overrides,
  };
}

function makeLoc(): Localizer {
  return new Localizer(
    {
      en: {
        "creature.deer.name": "Deer",
        "creature.wolf.name": "Wolf",
      },
    },
    "en",
  );
}

function baseDeps(overrides: Partial<NameplateViewDeps> = {}): NameplateViewDeps {
  const doc = document;
  const camera = makeCamera();
  const canvas = doc.createElement("div");
  stubCanvasRect(canvas);
  return {
    doc,
    camera,
    canvas,
    loc: makeLoc(),
    getPolicy: () => ALWAYS_ALL,
    isHovered: () => false,
    isInCombat: () => false,
    ...overrides,
  };
}

describe("mountNameplateView", () => {
  let rafSpy: MockInstance;

  beforeEach(() => {
    document.body.innerHTML = "";
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it("touches no DOM until sync() is called with a live target", () => {
    mountNameplateView(baseDeps());
    expect(document.querySelector("[data-billboard-overlay]")).toBeNull();
  });

  it("registers a marker with the translated name and faction color on sync", () => {
    const view = mountNameplateView(baseDeps());
    view.sync([target()]);

    const overlayRoot = document.querySelector("[data-billboard-overlay]");
    expect(overlayRoot).not.toBeNull();
    const label = overlayRoot?.querySelector("div > div"); // marker el > wrapper > label
    expect(label?.textContent).toBe("Deer");
  });

  it("hides the marker entirely when the faction toggle is off", () => {
    const view = mountNameplateView(
      baseDeps({ getPolicy: () => ({ ...ALWAYS_ALL, friendly: false }) }),
    );
    view.sync([target()]); // deer = friendly disposition

    const overlayRoot = document.querySelector("[data-billboard-overlay]");
    // overlay itself never mounts because register() is never called
    expect(overlayRoot).toBeNull();
  });

  it("shows the lifebar only while the creature is damaged", () => {
    const view = mountNameplateView(baseDeps());
    view.sync([target({ health: 20, maxHealth: 20 })]);
    let barTrack = document.querySelectorAll("[data-billboard-overlay] div > div > div")[1] as HTMLElement;
    expect(barTrack.style.display).toBe("none");

    view.sync([target({ health: 10, maxHealth: 20 })]);
    barTrack = document.querySelectorAll("[data-billboard-overlay] div > div > div")[1] as HTMLElement;
    expect(barTrack.style.display).toBe("block");
  });

  it("removes a marker once its id drops out of the synced target list", () => {
    const view = mountNameplateView(baseDeps());
    view.sync([target()]);
    expect(document.querySelectorAll("[data-billboard-overlay] > div").length).toBe(1);

    view.sync([]);
    const el = document.querySelector("[data-billboard-overlay] > div") as HTMLElement | null;
    expect(el?.style.display).toBe("none");
  });

  it("respects onHover mode: hidden until isHovered() returns true for that id", () => {
    let hovered = false;
    const view = mountNameplateView(
      baseDeps({
        getPolicy: () => ({ ...ALWAYS_ALL, mode: "onHover" }),
        isHovered: (id) => hovered && id === "deer-1",
      }),
    );
    view.sync([target()]);
    expect(document.querySelector("[data-billboard-overlay]")).toBeNull();

    hovered = true;
    view.sync([target()]);
    expect(document.querySelector("[data-billboard-overlay]")).not.toBeNull();
  });

  it("caps markers at the given pool size", () => {
    const view = mountNameplateView(baseDeps({ poolSize: 1 }));
    view.sync([
      target({ id: "a" }),
      target({ id: "b", worldPos: [1, 0, -5] }),
    ]);
    expect(document.querySelectorAll("[data-billboard-overlay] > div").length).toBe(1);
  });

  it("dispose removes the overlay entirely", () => {
    const view = mountNameplateView(baseDeps());
    view.sync([target()]);
    expect(document.querySelector("[data-billboard-overlay]")).not.toBeNull();

    view.dispose();
    expect(document.querySelector("[data-billboard-overlay]")).toBeNull();
  });
});
