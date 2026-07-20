import { describe, expect, it } from "vitest";
import { isOk } from "../domain/Result";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import type { PlayerState } from "../domain/world/WorldSaveData";
import { HostSession } from "./HostSession";
import { makeTransportNetwork } from "./testing/InMemoryTransportPair";

const REGISTRY = (() => {
  const r = ItemRegistry.create([{ id: "arrow", displayName: "Arrow", maxStackSize: 64, tags: [], tier: 0 }]);
  if (!isOk(r)) throw new Error("bad");
  return r.value;
})();

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 0, pitch: 0 };
}

describe("debug", () => {
  it("logs each aimedAttack outcome", () => {
    const net2 = makeTransportNetwork();
    const nowBox = { value: 1000 };
    const session = new HostSession(
      net2.host,
      () => ({ seed: 1, worldId: "w", name: "n", modifiedChunks: [], entities: {} }),
      { onWorldEdit: () => {} },
      { registry: REGISTRY, clock: () => nowBox.value },
    );
    net2.addPeer("bob");
    const alice = net2.addPeer("alice");
    alice.broadcast({
      kind: "join",
      playerName: "Alice",
      inventory: { capacity: 27, slots: [{ itemId: "arrow", count: 99 }, ...Array(26).fill(null)] },
    });
    alice.broadcast({ kind: "pose", state: pose(0, 1, 0) });
    alice.broadcast({ kind: "equipItem", slot: "weapon", itemId: "bow" });
    for (let i = 0; i < 12; i++) {
      nowBox.value += 5000;
      alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    }
    // @ts-expect-error debug access
    console.log("activeProjectiles size", session.activeProjectiles.size);
    expect(true).toBe(true);
  });
});
