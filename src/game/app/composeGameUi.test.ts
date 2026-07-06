// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { PersistentStorage } from "../application/ports/PersistentStorage";
import type { WorldLaunch } from "../application/WorldLifecycle";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { InMemorySettingsStore } from "../infrastructure/persistence/InMemorySettingsStore";
import {
  camPoseToPlayerState,
  isDefaultPlayerState,
  mountGameUi,
  playerStateToCamPose,
  shouldMountMenu,
} from "./composeGameUi";

describe("shouldMountMenu", () => {
  it("mounts the menu on a bare boot (no engine URL params)", () => {
    expect(shouldMountMenu("")).toBe(true);
    expect(shouldMountMenu("?")).toBe(true);
  });

  it.each(["?scene=voxeldev", "?seed=7", "?cam=1,2,3,0,0", "?shot=3"])(
    "boots the engine directly when %s is present",
    (search) => {
      expect(shouldMountMenu(search)).toBe(false);
    },
  );

  it("boots directly under ?menu=0 even without engine params", () => {
    expect(shouldMountMenu("?menu=0")).toBe(false);
  });

  it("ignores non-engine params (walk, hud, preset)", () => {
    expect(shouldMountMenu("?walk=0&hud=1&preset=low")).toBe(true);
  });
});

describe("pose mapping", () => {
  const state: PlayerState = { position: [12, 34, 56], yaw: 1.2, pitch: -0.3 };

  it("maps a PlayerState to a camera pose", () => {
    expect(playerStateToCamPose(state)).toEqual({
      p: [12, 34, 56],
      yaw: 1.2,
      pitch: -0.3,
    });
  });

  it("maps a camera pose back to a PlayerState", () => {
    expect(camPoseToPlayerState({ p: [12, 34, 56], yaw: 1.2, pitch: -0.3 })).toEqual(
      state,
    );
  });

  it("round-trips", () => {
    expect(camPoseToPlayerState(playerStateToCamPose(state))).toEqual(state);
  });

  it("treats an all-zero position as the default (unsaved) pose", () => {
    expect(isDefaultPlayerState({ position: [0, 0, 0], yaw: 0, pitch: 0 })).toBe(true);
    expect(isDefaultPlayerState({ position: [0, 0, 0], yaw: 1.5, pitch: 0 })).toBe(true);
    expect(isDefaultPlayerState(state)).toBe(false);
    expect(isDefaultPlayerState({ position: [0, 2, 0], yaw: 0, pitch: 0 })).toBe(false);
  });
});

describe("mountGameUi world store injection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const storage: PersistentStorage = {
    isPersisted: () => Promise.resolve(true),
    requestPersist: () => Promise.resolve(true),
  };

  const flush = () => new Promise((r) => setTimeout(r, 0));

  function soloButton(container: HTMLElement): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Solo"),
    );
    if (!found) throw new Error("no Solo button");
    return found as HTMLButtonElement;
  }

  it("persists a Solo world into the injected WorldSaveStore", async () => {
    const worlds = new InMemoryWorldSaveStore();
    const launches: WorldLaunch[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountGameUi(container, {
      worlds,
      persistentStorage: storage,
      settingsStore: new InMemorySettingsStore(),
      onLaunch: (l) => launches.push(l),
    });

    soloButton(container).click();
    await flush();
    await flush();

    expect(launches).toHaveLength(1);
    const listed = await worlds.list();
    if (!listed.ok) throw new Error("list failed");
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].worldId).toBe(launches[0].worldId);
    expect(listed.value[0].seed).toBe(launches[0].seed);
  });

  it("threads onJoinByCode through to the lobby's code input", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountGameUi(container, {
      persistentStorage: storage,
      settingsStore: new InMemorySettingsStore(),
      onJoinByCode: () => Promise.resolve(true),
    });

    const online = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Online"),
    );
    online?.click();
    await flush();
    container.click(); // reconcile runs on container click microtask
    await flush();

    expect(container.querySelector(".laas-code-input")).toBeTruthy();
  });

  it("defaults to an in-memory store when none is injected (existing behavior)", async () => {
    const launches: WorldLaunch[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountGameUi(container, {
      persistentStorage: storage,
      settingsStore: new InMemorySettingsStore(),
      onLaunch: (l) => launches.push(l),
    });

    soloButton(container).click();
    await flush();
    await flush();

    expect(launches).toHaveLength(1);
    expect(launches[0].playerState).toEqual({ position: [0, 0, 0], yaw: 0, pitch: 0 });
  });
});
