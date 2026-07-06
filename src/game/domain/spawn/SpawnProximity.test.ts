/**
 * M5.3 proximity gate: nothing spawns within MIN_SPAWN_DIST_M of any player,
 * spawning happens only inside ACTIVE_RANGE_M, and an active entity survives
 * out to DESPAWN_RANGE_M (hysteresis) before leaving. Multi-player: the
 * NEAREST player decides.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVE_RANGE_M,
  DESPAWN_RANGE_M,
  MIN_SPAWN_DIST_M,
  stepSpawns,
} from "./SpawnProximity";
import { spawnsNear } from "./SpawnField";

const SEED = 42;
const EPOCH = 0;
const DENSITY = 1;

function step(
  active: ReadonlySet<string>,
  players: readonly (readonly [number, number])[],
  removed: ReadonlySet<string> = new Set(),
) {
  return stepSpawns({ seed: SEED, epoch: EPOCH, density: DENSITY, players, active, removed });
}

describe("stepSpawns spawn ring", () => {
  it("spawns nothing within MIN_SPAWN_DIST_M of the player", () => {
    const { enter } = step(new Set(), [[0, 0]]);
    for (const s of enter) {
      const d = Math.hypot(s.position[0], s.position[2]);
      expect(d).toBeGreaterThanOrEqual(MIN_SPAWN_DIST_M);
    }
  });

  it("spawns nothing beyond ACTIVE_RANGE_M", () => {
    const { enter } = step(new Set(), [[0, 0]]);
    for (const s of enter) {
      expect(Math.hypot(s.position[0], s.position[2])).toBeLessThanOrEqual(ACTIVE_RANGE_M);
    }
  });

  it("does spawn in the eligible ring", () => {
    expect(step(new Set(), [[0, 0]]).enter.length).toBeGreaterThan(0);
  });

  it("is deterministic: two clients at the same position agree exactly", () => {
    const a = step(new Set(), [[500, -300]]);
    const b = step(new Set(), [[500, -300]]);
    expect(a.enter.map((s) => s.id)).toEqual(b.enter.map((s) => s.id));
  });
});

describe("stepSpawns hysteresis + despawn", () => {
  it("keeps an active entity the player walks right up to (no pop-out)", () => {
    const first = step(new Set(), [[0, 0]]);
    const target = first.enter[0]!;
    const active = new Set(first.enter.map((s) => s.id));
    const next = step(active, [[target.position[0], target.position[2]]]);
    expect(next.leave).not.toContain(target.id);
  });

  it("keeps an active entity between ACTIVE and DESPAWN range", () => {
    const first = step(new Set(), [[0, 0]]);
    const target = first.enter[0]!;
    const active = new Set([target.id]);
    // stand so the entity is just beyond ACTIVE but inside DESPAWN
    const d = (ACTIVE_RANGE_M + DESPAWN_RANGE_M) / 2;
    const next = step(active, [[target.position[0] + d, target.position[2]]]);
    expect(next.leave).not.toContain(target.id);
    // and it is NOT re-entered (already active)
    expect(next.enter.map((s) => s.id)).not.toContain(target.id);
  });

  it("despawns an active entity beyond DESPAWN_RANGE_M of every player", () => {
    const first = step(new Set(), [[0, 0]]);
    const target = first.enter[0]!;
    const active = new Set([target.id]);
    const next = step(active, [[target.position[0] + DESPAWN_RANGE_M + 50, target.position[2]]]);
    expect(next.leave).toContain(target.id);
  });

  it("multi-player: any near player keeps an entity alive", () => {
    const first = step(new Set(), [[0, 0]]);
    const target = first.enter[0]!;
    const active = new Set([target.id]);
    const far: readonly [number, number] = [target.position[0] + 900, target.position[2]];
    const near: readonly [number, number] = [target.position[0] + 10, target.position[2]];
    expect(step(active, [far]).leave).toContain(target.id);
    expect(step(active, [far, near]).leave).not.toContain(target.id);
  });
});

describe("stepSpawns removed entities", () => {
  it("never re-enters a harvested/killed id and leaves it if active", () => {
    const first = step(new Set(), [[0, 0]]);
    const target = first.enter[0]!;
    const removed = new Set([target.id]);
    const again = step(new Set(), [[0, 0]], removed);
    expect(again.enter.map((s) => s.id)).not.toContain(target.id);
    const withActive = step(new Set([target.id]), [[0, 0]], removed);
    expect(withActive.leave).toContain(target.id);
  });
});

describe("consistency with SpawnField", () => {
  it("every entered entity comes from the deterministic field", () => {
    const { enter } = step(new Set(), [[0, 0]]);
    const fieldIds = new Set(
      spawnsNear(SEED, EPOCH, 0, 0, Math.ceil(DESPAWN_RANGE_M / 32) + 1, DENSITY).map((s) => s.id),
    );
    for (const s of enter) expect(fieldIds.has(s.id)).toBe(true);
  });
});
