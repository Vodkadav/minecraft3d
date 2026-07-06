import { describe, expect, it } from "vitest";
import { distance, rotateVec, type Vec3 } from "./vec";
import {
  commit,
  effectiveFootprint,
  hasSupport,
  isBelowFloor,
  matchSocket,
  occupiedCells,
  overlaps,
  quarterTurns,
  resolvePlacement,
  rotate,
  snapToGrid,
  snapToSurface,
  withinBoundary,
  worldSockets,
  yawDegrees,
  type Cell,
  type Footprint,
  type GridSpec,
  type PieceDef,
  type PlacementWorld,
  type RotationState,
  type WorldSocket,
} from "./Placement";

const cellKey = (c: Cell): string => c.join(",");

class FakeWorld implements PlacementWorld {
  private readonly occ = new Set<string>();
  private readonly sol = new Set<string>();
  occupy(c: Cell): this {
    this.occ.add(cellKey(c));
    return this;
  }
  addSolid(c: Cell): this {
    this.sol.add(cellKey(c));
    return this;
  }
  isOccupied(c: Cell): boolean {
    return this.occ.has(cellKey(c));
  }
  isSolid(c: Cell): boolean {
    return this.sol.has(cellKey(c));
  }
}

const GRID: GridSpec = { cellSize: 1, origin: [0, 0, 0] };
const UNIT: Footprint = { w: 1, d: 1, h: 1 };
const WIDE: Footprint = { w: 2, d: 1, h: 1 };
const R0: RotationState = { stepDeg: 90, index: 0 };
const UNIT_PIECE: PieceDef = { id: "block", footprint: UNIT, sockets: [], requiresSupport: false };

function close(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return distance(a, b) < eps;
}

describe("rotation", () => {
  it("rotate advances the index; yaw wraps at 360", () => {
    expect(rotate(R0, 1)).toEqual({ stepDeg: 90, index: 1 });
    expect(yawDegrees({ stepDeg: 90, index: 4 })).toBe(0);
    expect(yawDegrees({ stepDeg: 90, index: -1 })).toBe(270);
  });

  it("odd quarter-turns swap the footprint X/Z extents", () => {
    expect(quarterTurns({ stepDeg: 90, index: 1 })).toBe(1);
    expect(effectiveFootprint(WIDE, { stepDeg: 90, index: 1 })).toEqual({ w: 1, d: 2, h: 1 });
    expect(effectiveFootprint(WIDE, { stepDeg: 90, index: 2 })).toEqual(WIDE);
  });
});

describe("snapToGrid parity", () => {
  it("centers an odd footprint on a cell center", () => {
    expect(snapToGrid([0.2, 0.2, 0.2], GRID, UNIT, R0)).toEqual([0.5, 0.5, 0.5]);
    expect(snapToGrid([0.7, 1.2, 0.7], GRID, UNIT, R0)).toEqual([0.5, 1.5, 0.5]);
  });

  it("centers an even axis on a grid line, odd axes on centers", () => {
    // WIDE is even on X (w=2), odd on Y and Z.
    expect(snapToGrid([0.2, 0.2, 0.2], GRID, WIDE, R0)).toEqual([0, 0.5, 0.5]);
    expect(snapToGrid([0.7, 0.2, 0.2], GRID, WIDE, R0)).toEqual([1, 0.5, 0.5]);
  });
});

describe("occupiedCells", () => {
  it("an odd unit piece occupies one cell", () => {
    expect(occupiedCells([0.5, 0.5, 0.5], GRID, UNIT, R0)).toEqual([[0, 0, 0]]);
  });

  it("an even-width piece straddles the grid line", () => {
    const cells = occupiedCells([0, 0.5, 0.5], GRID, WIDE, R0);
    expect(cells).toEqual([
      [-1, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("rotation swaps which axis the extent runs along", () => {
    const cells = occupiedCells([0.5, 0.5, 0], GRID, WIDE, { stepDeg: 90, index: 1 });
    // effective d=2 now runs along Z
    expect(cells).toEqual([
      [0, 0, -1],
      [0, 0, 0],
    ]);
  });
});

describe("snapToSurface", () => {
  it("places at the hit and keeps up when the surface is flat", () => {
    const { position, orientation } = snapToSurface({ point: [3, 2, 1], normal: [0, 1, 0] });
    expect(position).toEqual([3, 2, 1]);
    expect(close(rotateVec(orientation, [0, 1, 0]), [0, 1, 0])).toBe(true);
  });

  it("aligns the up-vector to a tilted normal", () => {
    const n: Vec3 = [1, 1, 0];
    const { orientation } = snapToSurface({ point: [0, 0, 0], normal: n });
    const expected: Vec3 = [n[0] / Math.SQRT2, n[1] / Math.SQRT2, 0];
    expect(close(rotateVec(orientation, [0, 1, 0]), expected)).toBe(true);
  });
});

describe("worldSockets", () => {
  it("transforms local sockets by the piece pose", () => {
    const piece: PieceDef = {
      id: "wall",
      footprint: UNIT,
      sockets: [{ localOffset: [0.5, 0, 0], outwardDir: [1, 0, 0], type: "edge", polarity: "+" }],
      requiresSupport: false,
    };
    const [s] = worldSockets(piece, [10, 0, 0], [0, 0, 0, 1]); // identity orientation
    expect(close(s.position, [10.5, 0, 0])).toBe(true);
    expect(close(s.outwardDir, [1, 0, 0])).toBe(true);
    expect(s.type).toBe("edge");
  });
});

describe("matchSocket", () => {
  const inc: WorldSocket = { position: [0, 0, 0], outwardDir: [1, 0, 0], type: "wall", polarity: "+" };

  it("mates opposite polarities that are anti-parallel and in range", () => {
    const tgt: WorldSocket = { position: [0.5, 0, 0], outwardDir: [-1, 0, 0], type: "wall", polarity: "-" };
    const m = matchSocket([inc], [tgt], 1, 75);
    expect(m).not.toBeNull();
    expect(close(m!.translation, [0.5, 0, 0])).toBe(true);
  });

  it("rejects a type mismatch", () => {
    const tgt: WorldSocket = { position: [0.5, 0, 0], outwardDir: [-1, 0, 0], type: "roof", polarity: "-" };
    expect(matchSocket([inc], [tgt], 1, 75)).toBeNull();
  });

  it("rejects like polarities (+/+)", () => {
    const tgt: WorldSocket = { position: [0.5, 0, 0], outwardDir: [-1, 0, 0], type: "wall", polarity: "+" };
    expect(matchSocket([inc], [tgt], 1, 75)).toBeNull();
  });

  it("rejects candidates outside the search radius", () => {
    const tgt: WorldSocket = { position: [2, 0, 0], outwardDir: [-1, 0, 0], type: "wall", polarity: "-" };
    expect(matchSocket([inc], [tgt], 1, 75)).toBeNull();
  });

  it("rejects sockets that are not anti-parallel", () => {
    const tgt: WorldSocket = { position: [0.5, 0, 0], outwardDir: [1, 0, 0], type: "wall", polarity: "-" };
    expect(matchSocket([inc], [tgt], 1, 75)).toBeNull();
  });

  it("picks the nearest passing candidate", () => {
    const near: WorldSocket = { position: [0.4, 0, 0], outwardDir: [-1, 0, 0], type: "wall", polarity: "-" };
    const far: WorldSocket = { position: [0.9, 0, 0], outwardDir: [-1, 0, 0], type: "wall", polarity: "-" };
    const m = matchSocket([inc], [far, near], 1.5, 75);
    expect(m!.target.position).toEqual([0.4, 0, 0]);
  });
});

describe("validity predicates", () => {
  it("overlaps an already-occupied cell", () => {
    const w = new FakeWorld().occupy([0, 0, 0]);
    expect(overlaps([[0, 0, 0]], w)).toBe(true);
    expect(overlaps([[1, 0, 0]], w)).toBe(false);
  });

  it("has support only with solid or a placed piece directly below", () => {
    const solidBelow = new FakeWorld().addSolid([0, 4, 0]);
    expect(hasSupport([[0, 5, 0]], solidBelow)).toBe(true);
    expect(hasSupport([[0, 5, 0]], new FakeWorld())).toBe(false);
  });

  it("bounds cells to a radius from the boundary center", () => {
    const boundary = { centerXZ: [0, 0] as const, radius: 2 };
    expect(withinBoundary([[0, 0, 0]], GRID, boundary)).toBe(true);
    expect(withinBoundary([[10, 0, 0]], GRID, boundary)).toBe(false);
  });

  it("flags cells at or below the floor", () => {
    expect(isBelowFloor([[0, -1, 0]], GRID, 0)).toBe(true);
    expect(isBelowFloor([[0, 0, 0]], GRID, 0)).toBe(false);
  });
});

describe("resolvePlacement", () => {
  it("grid mode over empty ground is valid and snapped", () => {
    const state = resolvePlacement({
      hit: { point: [0.7, 0.5, 0.7], normal: [0, 1, 0] },
      mode: "grid",
      pieceDef: UNIT_PIECE,
      rotation: R0,
      grid: GRID,
      world: new FakeWorld(),
    });
    expect(state.center).toEqual([0.5, 0.5, 0.5]);
    expect(state.cells).toEqual([[0, 0, 0]]);
    expect(state.validity).toEqual({ kind: "Valid" });
    expect(commit(state)).toEqual({
      pieceId: "block",
      center: [0.5, 0.5, 0.5],
      orientation: state.orientation,
      cells: [[0, 0, 0]],
    });
  });

  it("blocks and reports every violated reason", () => {
    const supported: PieceDef = { ...UNIT_PIECE, requiresSupport: true };
    const world = new FakeWorld().occupy([0, 5, 0]).addSolid([0, 5, 0]);
    const state = resolvePlacement({
      hit: { point: [0.5, 5.5, 0.5], normal: [0, 1, 0] },
      mode: "grid",
      pieceDef: supported,
      rotation: R0,
      grid: GRID,
      world,
      rules: { floorY: 100 },
    });
    expect(state.validity.kind).toBe("Blocked");
    if (state.validity.kind === "Blocked") {
      expect(state.validity.reasons).toContain("Overlap");
      expect(state.validity.reasons).toContain("TerrainClip");
      expect(state.validity.reasons).toContain("NoSupport");
      expect(state.validity.reasons).toContain("BelowFloor");
    }
    expect(commit(state)).toBeNull();
  });

  it("socket mode is blocked with NoSocket when nothing connects", () => {
    const wallPiece: PieceDef = {
      id: "wall",
      footprint: UNIT,
      sockets: [{ localOffset: [0.5, 0, 0], outwardDir: [1, 0, 0], type: "wall", polarity: "+" }],
      requiresSupport: false,
    };
    const state = resolvePlacement({
      hit: { point: [0.5, 0.5, 0.5], normal: [0, 1, 0] },
      mode: "socket",
      pieceDef: wallPiece,
      rotation: R0,
      grid: GRID,
      world: new FakeWorld(),
      candidateSockets: [],
    });
    expect(state.socketMatch).toBeNull();
    if (state.validity.kind === "Blocked") {
      expect(state.validity.reasons).toContain("NoSocket");
    } else {
      throw new Error("expected Blocked");
    }
  });

  it("socket mode pulls the piece onto a mating socket", () => {
    const wallPiece: PieceDef = {
      id: "wall",
      footprint: UNIT,
      sockets: [{ localOffset: [0.5, 0, 0], outwardDir: [1, 0, 0], type: "wall", polarity: "+" }],
      requiresSupport: false,
    };
    const candidate: WorldSocket = {
      position: [1.2, 0.5, 0.5],
      outwardDir: [-1, 0, 0],
      type: "wall",
      polarity: "-",
    };
    const state = resolvePlacement({
      hit: { point: [0.5, 0.5, 0.5], normal: [0, 1, 0] },
      mode: "socket",
      pieceDef: wallPiece,
      rotation: R0,
      grid: GRID,
      world: new FakeWorld(),
      candidateSockets: [candidate],
    });
    expect(state.socketMatch).not.toBeNull();
    // incoming socket sat at x=1.0; target at 1.2 -> piece center pulled +0.2.
    expect(close(state.center, [0.7, 0.5, 0.5])).toBe(true);
    expect(state.validity).toEqual({ kind: "Valid" });
  });
});
