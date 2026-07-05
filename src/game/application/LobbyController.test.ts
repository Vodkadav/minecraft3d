import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../domain/Result";
import type { SeedEntry } from "../domain/seedvault/SeedVault";
import { InMemorySeedVaultStore } from "../infrastructure/persistence/InMemorySeedVaultStore";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { LobbyController } from "./LobbyController";

function seed(overrides: Partial<SeedEntry> = {}): SeedEntry {
  return { id: "s1", seed: 42, name: "Home", createdAt: 100, ...overrides };
}

function build() {
  const worlds = new InMemoryWorldSaveStore();
  const seeds = new InMemorySeedVaultStore();
  let n = 0;
  const controller = new LobbyController(worlds, seeds, {
    clock: () => 1000,
    idFactory: () => `w${++n}`,
  });
  return { worlds, seeds, controller };
}

describe("LobbyController", () => {
  it("lists no worlds initially", async () => {
    const { controller } = build();
    const r = await controller.listWorlds();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual([]);
  });

  it("hosts a world from a saved seed and makes it joinable", async () => {
    const { controller, seeds } = build();
    await seeds.add(seed());

    const hosted = await controller.host("s1");

    expect(isOk(hosted)).toBe(true);
    if (isOk(hosted)) {
      expect(hosted.value.mode).toBe("loopback");
      const worlds = await controller.listWorlds();
      if (isOk(worlds)) {
        expect(worlds.value).toHaveLength(1);
        expect(worlds.value[0].seed).toBe(42);
        expect(worlds.value[0].worldId).toBe(hosted.value.worldId);
      }
    }
  });

  it("rejects hosting from an unknown seed", async () => {
    const { controller } = build();
    const r = await controller.host("nope");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownSeed");
  });

  it("joins an existing world as a loopback session", async () => {
    const { controller, seeds } = build();
    await seeds.add(seed());
    const hosted = await controller.host("s1");
    if (!isOk(hosted)) throw new Error("host failed");

    const joined = await controller.join(hosted.value.worldId);

    expect(isOk(joined)).toBe(true);
    if (isOk(joined)) {
      expect(joined.value.worldId).toBe(hosted.value.worldId);
      expect(joined.value.mode).toBe("loopback");
    }
  });

  it("rejects joining an unknown world", async () => {
    const { controller } = build();
    const r = await controller.join("ghost");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });

  it("lists saved seeds for the host picker", async () => {
    const { controller, seeds } = build();
    await seeds.add(seed({ id: "a", createdAt: 1 }));
    await seeds.add(seed({ id: "b", createdAt: 2 }));

    const r = await controller.listSeeds();

    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
