import { describe, expect, it } from "vitest";
import type { InventoryOp, PlaceableInteractMsg } from "./Protocol";
import type { PlayerState } from "../world/WorldSaveData";
import {
  remoteAllowedPlaceableAction,
  tryConsumeToken,
  validateAimedAttack,
  validateCastSpell,
  validateDeployItem,
  validateDig,
  validateInventoryOp,
  validatePlaceableInteract,
  validatePose,
  validateTradePropose,
} from "./IntentRules";

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 0, pitch: 0 };
}

describe("validatePose", () => {
  it("accepts the first pose (no previous)", () => {
    expect(validatePose(null, pose(100, 20, -50), 0)).toBe(true);
  });

  it("rejects a first pose with non-finite numbers", () => {
    expect(validatePose(null, pose(NaN, 0, 0), 0)).toBe(false);
    expect(validatePose(null, pose(0, Infinity, 0), 0)).toBe(false);
    expect(validatePose(null, { position: [0, 0, 0], yaw: NaN, pitch: 0 }, 0)).toBe(false);
  });

  it("accepts normal walking speed", () => {
    // 0.5 m in 100 ms = 5 m/s
    expect(validatePose(pose(0, 0, 0), pose(0.5, 0, 0), 100)).toBe(true);
  });

  it("accepts up to the ~20 m/s horizontal cap", () => {
    expect(validatePose(pose(0, 0, 0), pose(1.9, 0, 0), 100)).toBe(true);
  });

  it("rejects a horizontal teleport", () => {
    // 100 m in 100 ms = 1000 m/s
    expect(validatePose(pose(0, 0, 0), pose(100, 0, 0), 100)).toBe(false);
  });

  it("is generous vertically (falling) but still rejects vertical teleports", () => {
    expect(validatePose(pose(0, 100, 0), pose(0, 95, 0), 100)).toBe(true); // 50 m/s fall
    expect(validatePose(pose(0, 0, 0), pose(0, 500, 0), 100)).toBe(false);
  });

  it("accepts standing still even with zero elapsed time", () => {
    expect(validatePose(pose(1, 2, 3), pose(1, 2, 3), 0)).toBe(true);
  });

  it("rejects movement with zero or negative elapsed time", () => {
    expect(validatePose(pose(0, 0, 0), pose(1, 0, 0), 0)).toBe(false);
    expect(validatePose(pose(0, 0, 0), pose(1, 0, 0), -5)).toBe(false);
  });
});

describe("validateDig", () => {
  it("accepts a sane dig", () => {
    expect(validateDig(10, -3, 42, 1.5)).toBe(true);
  });

  it("accepts radius up to 4", () => {
    expect(validateDig(0, 0, 0, 4)).toBe(true);
  });

  it("rejects radius of 0, negative, or over 4", () => {
    expect(validateDig(0, 0, 0, 0)).toBe(false);
    expect(validateDig(0, 0, 0, -1)).toBe(false);
    expect(validateDig(0, 0, 0, 4.01)).toBe(false);
  });

  it("rejects non-finite coordinates or radius", () => {
    expect(validateDig(NaN, 0, 0, 1)).toBe(false);
    expect(validateDig(0, Infinity, 0, 1)).toBe(false);
    expect(validateDig(0, 0, 0, NaN)).toBe(false);
  });
});

function placeableMsg(overrides: Partial<PlaceableInteractMsg> = {}): PlaceableInteractMsg {
  return { kind: "placeableInteract", action: "toggleDoor", placeableId: "piece:1", ...overrides };
}

describe("validatePlaceableInteract", () => {
  it("accepts a bare action + placeableId", () => {
    expect(validatePlaceableInteract(placeableMsg())).toBe(true);
  });

  it("accepts a valid itemId + count", () => {
    expect(
      validatePlaceableInteract(placeableMsg({ action: "depositChest", itemId: "wood", count: 4 })),
    ).toBe(true);
  });

  it("rejects an empty placeableId", () => {
    expect(validatePlaceableInteract(placeableMsg({ placeableId: "" }))).toBe(false);
  });

  it("rejects an empty itemId", () => {
    expect(validatePlaceableInteract(placeableMsg({ itemId: "" }))).toBe(false);
  });

  it("rejects a non-positive, non-integer, or oversized count", () => {
    expect(validatePlaceableInteract(placeableMsg({ count: 0 }))).toBe(false);
    expect(validatePlaceableInteract(placeableMsg({ count: -1 }))).toBe(false);
    expect(validatePlaceableInteract(placeableMsg({ count: 1.5 }))).toBe(false);
    expect(validatePlaceableInteract(placeableMsg({ count: 1000 }))).toBe(false);
    expect(validatePlaceableInteract(placeableMsg({ count: 999 }))).toBe(true);
  });
});

describe("remoteAllowedPlaceableAction", () => {
  it("allows every known placeable action over the wire (E0.4: host is inventory-authoritative)", () => {
    for (const action of [
      "toggleDoor",
      "depositChest",
      "withdrawChest",
      "startCook",
      "collectCook",
      "plantCrop",
      "harvestCrop",
    ] as const) {
      expect(remoteAllowedPlaceableAction(action)).toBe(true);
    }
  });
});

describe("validateInventoryOp", () => {
  const CAPACITY = 27;

  it("accepts a move within capacity, distinct slots", () => {
    expect(validateInventoryOp({ op: "move", from: 0, to: 1 }, CAPACITY)).toBe(true);
  });

  it("rejects a move to the same slot or out of range", () => {
    expect(validateInventoryOp({ op: "move", from: 0, to: 0 }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "move", from: 0, to: CAPACITY }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "move", from: -1, to: 1 }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "move", from: CAPACITY, to: 1 }, CAPACITY)).toBe(false);
  });

  it("accepts a split with a positive count under the cap", () => {
    expect(validateInventoryOp({ op: "split", from: 0, count: 5 }, CAPACITY)).toBe(true);
    expect(validateInventoryOp({ op: "split", from: 0, count: 999 }, CAPACITY)).toBe(true);
  });

  it("rejects a split out of range or with a non-positive/oversized count", () => {
    expect(validateInventoryOp({ op: "split", from: CAPACITY, count: 1 }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "split", from: 0, count: 0 }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "split", from: 0, count: 1000 }, CAPACITY)).toBe(false);
  });

  it("accepts use within capacity, rejects out of range", () => {
    expect(validateInventoryOp({ op: "use", index: 0 }, CAPACITY)).toBe(true);
    expect(validateInventoryOp({ op: "use", index: CAPACITY }, CAPACITY)).toBe(false);
    expect(validateInventoryOp({ op: "use", index: -1 }, CAPACITY)).toBe(false);
  });

  it("accepts a well-formed deposit/withdraw", () => {
    const deposit: InventoryOp = { op: "deposit", placeableId: "p:1", itemId: "wood", count: 4 };
    const withdraw: InventoryOp = { op: "withdraw", placeableId: "p:1", itemId: "wood", count: 4 };
    expect(validateInventoryOp(deposit, CAPACITY)).toBe(true);
    expect(validateInventoryOp(withdraw, CAPACITY)).toBe(true);
  });

  it("rejects deposit/withdraw with an empty id or a non-positive/oversized count", () => {
    expect(
      validateInventoryOp({ op: "deposit", placeableId: "", itemId: "wood", count: 1 }, CAPACITY),
    ).toBe(false);
    expect(
      validateInventoryOp({ op: "deposit", placeableId: "p:1", itemId: "", count: 1 }, CAPACITY),
    ).toBe(false);
    expect(
      validateInventoryOp({ op: "withdraw", placeableId: "p:1", itemId: "wood", count: 0 }, CAPACITY),
    ).toBe(false);
    expect(
      validateInventoryOp(
        { op: "withdraw", placeableId: "p:1", itemId: "wood", count: 1000 },
        CAPACITY,
      ),
    ).toBe(false);
  });
});

describe("validateTradePropose", () => {
  it("accepts a target other than yourself", () => {
    expect(validateTradePropose("alice", "bob")).toBe(true);
  });

  it("rejects proposing a trade with yourself", () => {
    expect(validateTradePropose("alice", "alice")).toBe(false);
  });

  it("rejects an empty target", () => {
    expect(validateTradePropose("alice", "")).toBe(false);
  });
});

describe("E7.0 combat contracts: origin-near-pose bound", () => {
  const lastPose = pose(0, 0, 0);

  // E7.2 security follow-up #3 (E7.0-sec review): a combat origin is never
  // trusted without a validated recent pose to compare it against — a peer
  // with no pose on record yet is rejected, not waved through.
  it("rejects when no pose is on record yet (null-pose gate)", () => {
    expect(validateAimedAttack(null, { kind: "aimedAttack", origin: [500, 0, 0], dir: [1, 0, 0], weaponSlot: "weapon" })).toBe(false);
  });

  it("rejects castSpell/deployItem the same way with no pose on record", () => {
    expect(
      validateCastSpell(null, { kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 0, 0], dir: [1, 0, 0] }),
    ).toBe(false);
    expect(
      validateDeployItem(null, { kind: "deployItem", deployableId: "bumble-trap", position: [0, 0, 0] }),
    ).toBe(false);
  });

  it("validateAimedAttack accepts an origin near the sender's last pose", () => {
    expect(
      validateAimedAttack(lastPose, {
        kind: "aimedAttack",
        origin: [1, 0, 0],
        dir: [1, 0, 0],
        weaponSlot: "weapon",
      }),
    ).toBe(true);
  });

  it("validateAimedAttack rejects an origin far from the sender's last pose", () => {
    expect(
      validateAimedAttack(lastPose, {
        kind: "aimedAttack",
        origin: [500, 0, 0],
        dir: [1, 0, 0],
        weaponSlot: "weapon",
      }),
    ).toBe(false);
  });

  it("validateCastSpell accepts an origin near the sender's last pose", () => {
    expect(
      validateCastSpell(lastPose, {
        kind: "castSpell",
        abilityId: "sparkle-bolt",
        origin: [2, 0, 0],
        dir: [1, 0, 0],
      }),
    ).toBe(true);
  });

  it("validateCastSpell rejects an origin far from the sender's last pose", () => {
    expect(
      validateCastSpell(lastPose, {
        kind: "castSpell",
        abilityId: "sparkle-bolt",
        origin: [200, 0, 0],
        dir: [1, 0, 0],
      }),
    ).toBe(false);
  });

  it("validateCastSpell rejects a groundTarget spell whose groundPoint is far from the caster (sec finding A)", () => {
    // origin is valid (near the pose) but the client-chosen blast center is not:
    // a damaging groundTarget spell must never be centerable anywhere on the map.
    expect(
      validateCastSpell(lastPose, {
        kind: "castSpell",
        abilityId: "vine-snare",
        origin: [2, 0, 0],
        groundPoint: [500, 0, 0],
      }),
    ).toBe(false);
  });

  it("validateCastSpell accepts a groundTarget spell whose groundPoint is within cast range", () => {
    expect(
      validateCastSpell(lastPose, {
        kind: "castSpell",
        abilityId: "vine-snare",
        origin: [2, 0, 0],
        groundPoint: [10, 0, 0],
      }),
    ).toBe(true);
  });

  it("validateDeployItem accepts a position near the sender's last pose", () => {
    expect(
      validateDeployItem(lastPose, { kind: "deployItem", deployableId: "bumble-trap", position: [3, 0, 0] }),
    ).toBe(true);
  });

  it("validateDeployItem rejects a position far from the sender's last pose", () => {
    expect(
      validateDeployItem(lastPose, {
        kind: "deployItem",
        deployableId: "bumble-trap",
        position: [300, 0, 0],
      }),
    ).toBe(false);
  });
});

describe("E7.0 combat contracts: tryConsumeToken (rate-limit seam)", () => {
  const config = { capacity: 3, refillPerSecond: 1 };

  it("consumes a token when the bucket has capacity", () => {
    const state = { tokens: 3, lastRefillMs: 0 };
    const outcome = tryConsumeToken(state, config, 0);
    expect(outcome.allowed).toBe(true);
    expect(outcome.next.tokens).toBeCloseTo(2);
  });

  it("rejects when the bucket is empty and not enough time has elapsed to refill", () => {
    const state = { tokens: 0, lastRefillMs: 0 };
    const outcome = tryConsumeToken(state, config, 100);
    expect(outcome.allowed).toBe(false);
  });

  it("refills over elapsed time, capped at capacity", () => {
    const state = { tokens: 0, lastRefillMs: 0 };
    const outcome = tryConsumeToken(state, config, 10_000); // 10s elapsed, refill 1/s
    expect(outcome.allowed).toBe(true);
    expect(outcome.next.tokens).toBeCloseTo(config.capacity - 1);
  });
});
