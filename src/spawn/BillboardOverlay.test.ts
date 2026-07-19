// @vitest-environment happy-dom
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { mountBillboardOverlay } from "./BillboardOverlay";

function stubCanvasRect(canvas: HTMLElement): void {
  canvas.getBoundingClientRect = (): DOMRect =>
    ({ left: 10, top: 20, width: 800, height: 600, right: 810, bottom: 620, x: 10, y: 20, toJSON() {} }) as DOMRect;
}

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

describe("mountBillboardOverlay", () => {
  let rafSpy: MockInstance;
  let queue: FrameRequestCallback[];

  beforeEach(() => {
    document.body.innerHTML = "";
    queue = [];
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  function flushOneFrame(): void {
    const cb = queue.shift();
    cb?.(0);
  }

  it("touches neither the DOM nor requestAnimationFrame until a marker registers", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    mountBillboardOverlay(document, camera, canvas);

    expect(document.querySelector("[data-billboard-overlay]")).toBeNull();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("mounts the overlay root and schedules a frame on first register", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);

    const marker = overlay.register([0, 0, -5]);

    expect(marker).not.toBeNull();
    expect(document.querySelector("[data-billboard-overlay]")).not.toBeNull();
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("projects a tracked marker to screen pixels every frame it re-schedules", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);
    const marker = overlay.register([0, 0, -5]);

    flushOneFrame();

    // canvas rect offset (10,20) + centered projection (400,300) for a
    // straight-ahead point, matching the Billboard.test.ts math.
    expect(marker?.el.style.left).toBe("410px");
    expect(marker?.el.style.top).toBe("320px");
    expect(marker?.el.style.display).toBe("");
  });

  it("re-projects a moving marker on the next frame", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);
    const marker = overlay.register([0, 0, -5]);
    flushOneFrame();
    expect(marker?.el.style.left).toBe("410px");

    marker?.setWorldPos([1, 0, -5]);
    flushOneFrame();

    expect(marker?.el.style.left).not.toBe("410px");
  });

  it("hides a marker beyond maxDistance", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas, { maxDistance: 3 });
    const marker = overlay.register([0, 0, -5]);

    flushOneFrame();

    expect(marker?.el.style.display).toBe("none");
  });

  it("hides a marker behind the camera", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);
    const marker = overlay.register([0, 0, 5]);

    flushOneFrame();

    expect(marker?.el.style.display).toBe("none");
  });

  it("caps the pool and returns null once exhausted", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas, { poolSize: 2 });

    expect(overlay.register([0, 0, -1])).not.toBeNull();
    expect(overlay.register([0, 0, -2])).not.toBeNull();
    expect(overlay.register([0, 0, -3])).toBeNull();
  });

  it("unregister hides the marker and the loop self-stops once nothing is tracked", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);
    const marker = overlay.register([0, 0, -5]);
    flushOneFrame();
    expect(marker?.el.style.display).toBe("");

    marker?.unregister();
    expect(marker?.el.style.display).toBe("none");

    // The last scheduled frame (before unregister) still runs once, sees
    // zero active markers, and does not reschedule another.
    expect(queue.length).toBe(1);
    flushOneFrame();
    expect(queue.length).toBe(0);
  });

  it("a freed slot is reused by the next register call", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas, { poolSize: 1 });
    const first = overlay.register([0, 0, -1]);
    expect(overlay.register([0, 0, -2])).toBeNull();

    first?.unregister();
    expect(overlay.register([0, 0, -2])).not.toBeNull();
  });

  it("dispose stops the frame loop and removes the overlay root", () => {
    const camera = makeCamera();
    const canvas = document.createElement("div");
    stubCanvasRect(canvas);
    const overlay = mountBillboardOverlay(document, camera, canvas);
    overlay.register([0, 0, -5]);
    expect(document.querySelector("[data-billboard-overlay]")).not.toBeNull();

    overlay.dispose();

    expect(document.querySelector("[data-billboard-overlay]")).toBeNull();
  });
});
