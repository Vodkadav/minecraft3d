import { describe, expect, it } from "vitest";
import { Group, Mesh, MeshStandardMaterial } from "three";
import {
  treasuresNear,
  TREASURE_CELL_M,
  type HiddenTreasure,
} from "../../game/domain/treasure/HiddenTreasure";
import type { DiscoveryState } from "../../game/domain/treasure/TreasureDiscovery";
import type { ItemStack } from "../../game/domain/inventory/Inventory";
import { markerY, TIER_COLOR } from "./TreasureStreaming";
import { attachTreasureField } from "./TreasureField";

const SEED = 42;
const SURFACE_Y = 20;

interface Harness {
  readonly parent: Group;
  readonly player: [number, number];
  readonly discoveries: {
    treasure: HiddenTreasure;
    reward: readonly ItemStack[];
    state: DiscoveryState;
  }[];
  heightCalls(): number;
  field: ReturnType<typeof attachTreasureField>;
}

function makeHarness(discovery?: DiscoveryState, at: readonly [number, number] = [0, 0]): Harness {
  const parent = new Group();
  const player: [number, number] = [at[0], at[1]];
  const discoveries: Harness["discoveries"] = [];
  let calls = 0;
  const field = attachTreasureField({
    seed: SEED,
    surface: {
      heightAt: () => {
        calls++;
        return SURFACE_Y;
      },
    },
    parent,
    getPlayerXZ: () => player,
    ...(discovery ? { discovery } : {}),
    onDiscovered: (treasure, reward, state) => discoveries.push({ treasure, reward, state }),
  });
  return { parent, player, discoveries, heightCalls: () => calls, field };
}

function markerMeshes(parent: Group): Mesh[] {
  const group = parent.children[0] as Group;
  return group.children as Mesh[];
}

describe("attachTreasureField — streaming", () => {
  it("spawns one marker per undiscovered treasure in radius on first update", () => {
    const h = makeHarness();
    h.field.update(0);
    const expected = treasuresNear(SEED, 0, 0, 4).length;
    expect(expected).toBeGreaterThan(0);
    expect(h.field.markerCount).toBe(expected);
    expect(markerMeshes(h.parent)).toHaveLength(expected);
  });

  it("resolves marker height from the surface plus the hover offset", () => {
    const h = makeHarness();
    h.field.update(0);
    for (const mesh of markerMeshes(h.parent)) {
      expect(Math.abs(mesh.position.y - markerY(SURFACE_Y))).toBeLessThan(0.2); // within bob
    }
  });

  it("never spawns a marker for a treasure restored as discovered", () => {
    const all = treasuresNear(SEED, 0, 0, 4);
    const h = makeHarness([all[0].id]);
    h.field.update(0);
    expect(h.field.markerCount).toBe(all.length - 1);
  });

  it("despawns markers that leave the radius and spawns the new window", () => {
    const h = makeHarness();
    h.field.update(0);
    h.player[0] = 40 * TREASURE_CELL_M;
    h.field.update(0);
    const expected = treasuresNear(SEED, h.player[0], 0, 4).length;
    expect(h.field.markerCount).toBe(expected);
    expect(markerMeshes(h.parent)).toHaveLength(expected);
  });

  it("skips the window scan while the player stays inside one cell", () => {
    const h = makeHarness();
    h.field.update(0);
    const calls = h.heightCalls();
    h.player[0] += TREASURE_CELL_M / 4;
    h.field.update(0.016);
    h.field.update(0.016);
    expect(h.heightCalls()).toBe(calls);
  });

  it("colors markers by tier", () => {
    const h = makeHarness();
    h.field.update(0);
    const near = new Map(treasuresNear(SEED, 0, 0, 4).map((t) => [t.id, t]));
    for (const mesh of markerMeshes(h.parent)) {
      const tier = near.get(mesh.name)?.tier;
      expect(tier).toBeDefined();
      const mat = mesh.material as MeshStandardMaterial;
      expect(mat.color.getHex()).toBe(TIER_COLOR[tier as keyof typeof TIER_COLOR]);
    }
  });

  it("idles markers with a slow spin", () => {
    const h = makeHarness();
    h.field.update(0);
    const mesh = markerMeshes(h.parent)[0];
    const before = mesh.rotation.y;
    h.field.update(0.5);
    expect(mesh.rotation.y).not.toBe(before);
  });
});

describe("attachTreasureField — discovery", () => {
  it("claims a treasure the player walks onto, exactly once", () => {
    const target = treasuresNear(SEED, 0, 0, 4)[0];
    const h = makeHarness(undefined, [target.position[0], target.position[2]]);
    h.field.update(0);
    expect(h.discoveries).toHaveLength(1);
    expect(h.discoveries[0].treasure.id).toBe(target.id);
    expect(h.discoveries[0].reward).toEqual(target.reward);
    expect(h.discoveries[0].state).toContain(target.id);

    h.field.update(0.016);
    h.field.update(0.016);
    expect(h.discoveries).toHaveLength(1);
  });

  it("removes the claimed marker and never respawns it", () => {
    const target = treasuresNear(SEED, 0, 0, 4)[0];
    const h = makeHarness(undefined, [target.position[0], target.position[2]]);
    h.field.update(0);
    const after = h.field.markerCount;
    expect(markerMeshes(h.parent).map((m) => m.name)).not.toContain(target.id);

    // leave the window entirely, then come back — still claimed
    h.player[0] = target.position[0] + 40 * TREASURE_CELL_M;
    h.field.update(0);
    h.player[0] = target.position[0];
    h.field.update(0);
    expect(h.field.markerCount).toBe(after);
    expect(markerMeshes(h.parent).map((m) => m.name)).not.toContain(target.id);
    expect(h.discoveries).toHaveLength(1);
  });

  it("does not claim a treasure just outside the discovery range", () => {
    const target = treasuresNear(SEED, 0, 0, 4)[0];
    const h = makeHarness(undefined, [target.position[0] + 2.5, target.position[2]]);
    h.field.update(0);
    expect(h.discoveries).toHaveLength(0);
  });
});

describe("attachTreasureField — dispose", () => {
  it("removes the marker group from the parent", () => {
    const h = makeHarness();
    h.field.update(0);
    expect(h.parent.children).toHaveLength(1);
    h.field.dispose();
    expect(h.parent.children).toHaveLength(0);
    expect(h.field.markerCount).toBe(0);
  });
});
