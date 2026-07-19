import { describe, expect, it } from "vitest";
import { createNewWorldSave } from "./NewWorldSave";

describe("createNewWorldSave", () => {
  it("builds an empty, freshly-stamped world save from a seed", () => {
    const save = createNewWorldSave({ worldId: "w1", seed: 42, name: "Home", now: 1000 });
    expect(save).toEqual({
      worldId: "w1",
      seed: 42,
      name: "Home",
      createdAt: 1000,
      modifiedAt: 1000,
      modifiedChunks: [],
      entities: {},
      inventories: {},
      progression: {},
      playerState: { position: [0, 0, 0], yaw: 0, pitch: 0 },
    });
  });
});
