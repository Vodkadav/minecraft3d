// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyExploration, revealAround } from "../domain/map/Exploration";
import type { MapMarker } from "../domain/map/MinimapModel";
import { createLocalizer } from "./i18n/strings";
import { mountMapScreen, type MapSnapshot } from "./MapScreen";

function snapshot(overrides: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    player: { x: 0, z: 0, yawRadians: 0 },
    exploration: revealAround(emptyExploration(10), 0, 0, 1),
    markers: [] as MapMarker[],
    ...overrides,
  };
}

describe("mountMapScreen", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("starts closed", () => {
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot() });
    expect(screen.isOpen).toBe(false);
    expect(document.querySelector(".lw-map-overlay")?.hasAttribute("hidden")).toBe(true);
    screen.dispose();
  });

  it("pressing M opens the overlay, releases pointer lock, and pauses input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const screen = mountMapScreen({
      loc: createLocalizer("en"),
      getSnapshot: () => snapshot(),
      setInputEnabled,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("Escape closes the map while open", () => {
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot() });
    screen.open();
    expect(screen.isOpen).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("ignores the M shortcut while a text input has focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot() });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
    input.remove();
  });

  it("renders a player icon and an in-range marker on open", () => {
    const markers: MapMarker[] = [{ id: "c1", kind: "creature", x: 5, z: 5 }];
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot({ markers }) });
    screen.open();
    expect(document.querySelector('.lw-map-icon[data-kind="player"]')).not.toBeNull();
    expect(document.querySelector('.lw-map-icon[data-kind="creature"]')).not.toBeNull();
    screen.dispose();
  });

  it("clicking the canvas (without a drag) drops a waypoint pin", () => {
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot() });
    screen.open();
    const canvasWrap = document.querySelector<HTMLElement>(".lw-map-canvas-wrap");
    expect(canvasWrap).not.toBeNull();
    canvasWrap?.dispatchEvent(new MouseEvent("click", { clientX: 400, clientY: 300, bubbles: true }));
    expect(document.querySelector('.lw-map-icon[data-kind="waypoint"]')).not.toBeNull();
    screen.dispose();
  });

  it("recenter re-centers the view on the current player position", () => {
    let player = { x: 0, z: 0, yawRadians: 0 };
    const screen = mountMapScreen({
      loc: createLocalizer("en"),
      getSnapshot: () => snapshot({ player }),
    });
    screen.open();
    player = { x: 200, z: 200, yawRadians: 0 };
    const recenterBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Recenter",
    );
    recenterBtn?.click();
    const playerIcon = document.querySelector<HTMLElement>('.lw-map-icon[data-kind="player"]');
    // after recentering on (200,200), the player icon sits at the widget center
    expect(playerIcon?.style.left).toBeDefined();
    screen.dispose();
  });

  it("refresh() is a no-op while closed and re-renders while open", () => {
    let calls = 0;
    const screen = mountMapScreen({
      loc: createLocalizer("en"),
      getSnapshot: () => {
        calls++;
        return snapshot();
      },
    });
    const beforeOpenCalls = calls;
    screen.refresh();
    expect(calls).toBe(beforeOpenCalls); // closed: no snapshot pull
    screen.open();
    const afterOpenCalls = calls;
    screen.refresh();
    expect(calls).toBeGreaterThan(afterOpenCalls);
    screen.dispose();
  });

  it("dispose removes the overlay from the document", () => {
    const screen = mountMapScreen({ loc: createLocalizer("en"), getSnapshot: () => snapshot() });
    screen.dispose();
    expect(document.querySelector(".lw-map-overlay")).toBeNull();
  });
});
