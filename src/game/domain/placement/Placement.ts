/**
 * Kinematic placement domain (plan 8.5, [O]) — pure snap-and-stay building,
 * per the 8.6 research pass (docs/research/PLACEMENT_SNAPPING_RESEARCH.md).
 *
 * The domain resolves a raycast hit + piece + rotation into a snapped transform
 * and a validity verdict, using only declarative piece metadata and a world
 * occupancy port. No physics solver (deterministic for M7 P2P host-authority),
 * no THREE, no raycasting — the [F] render adapter produces the {point, normal}
 * hit and paints the translucent ghost; the domain never sees a mesh.
 */

import {
  distance,
  dot,
  normalize,
  quatFromUnitVectors,
  quatFromYaw,
  rotateVec,
  scale,
  sub,
  type Quat,
  type Vec3,
} from "./vec";

export type PlacementMode = "grid" | "surface" | "socket";

/** The world build grid. Uniform cell for simplicity (voxel layer = 1). */
export interface GridSpec {
  readonly cellSize: number;
  readonly origin: Vec3;
}

/** Cell extents of a piece: w along X, d along Z, h along Y. */
export interface Footprint {
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

/** Discrete yaw about world-up Y (pitch/roll locked for building pieces). */
export interface RotationState {
  readonly stepDeg: number;
  readonly index: number;
}

export type Polarity = "+" | "-" | "0";

/** A typed local anchor on a piece; connects to an anti-parallel mate. */
export interface SnapPoint {
  readonly localOffset: Vec3;
  readonly outwardDir: Vec3;
  readonly type: string;
  readonly polarity: Polarity;
}

/** Declarative piece metadata — the swappable-asset seam (mesh-independent). */
export interface PieceDef {
  readonly id: string;
  readonly footprint: Footprint;
  readonly sockets: readonly SnapPoint[];
  readonly requiresSupport: boolean;
}

export type Cell = readonly [number, number, number];

export interface RaycastHit {
  readonly point: Vec3;
  readonly normal: Vec3;
}

export type BlockReason =
  | "Overlap"
  | "NoSupport"
  | "OutOfBounds"
  | "TerrainClip"
  | "BelowFloor"
  | "NoSocket";

export type PlacementValidity =
  | { readonly kind: "Valid" }
  | { readonly kind: "Blocked"; readonly reasons: readonly BlockReason[] };

/**
 * The world the domain queries — an honest in-memory fake in tests, the M8.1
 * voxel chunk store in production (test-honest-fakes-over-mocks).
 */
export interface PlacementWorld {
  /** A player-placed piece already occupies this cell. */
  isOccupied(cell: Cell): boolean;
  /** Non-editable terrain / solid matter fills this cell. */
  isSolid(cell: Cell): boolean;
}

/** Optional world constraints; omitted checks are simply not run. */
export interface PlacementRules {
  readonly boundary?: { readonly centerXZ: readonly [number, number]; readonly radius: number };
  readonly floorY?: number;
}

/** A socket resolved into world space (from a piece at a known pose). */
export interface WorldSocket {
  readonly position: Vec3;
  readonly outwardDir: Vec3;
  readonly type: string;
  readonly polarity: Polarity;
}

export interface SocketMatch {
  readonly incoming: WorldSocket;
  readonly target: WorldSocket;
  /** Add to the incoming piece so its socket coincides with the target's. */
  readonly translation: Vec3;
  /** Rotates the incoming outward dir onto the target's anti-parallel. */
  readonly alignment: Quat;
  readonly distance: number;
}

export interface PlacementState {
  readonly pieceDef: PieceDef;
  readonly mode: PlacementMode;
  readonly rotation: RotationState;
  readonly center: Vec3;
  readonly orientation: Quat;
  readonly cells: readonly Cell[];
  readonly validity: PlacementValidity;
  readonly socketMatch: SocketMatch | null;
}

/** Immutable command a valid placement commits into the chunk store. */
export interface PlacePieceCommand {
  readonly pieceId: string;
  readonly center: Vec3;
  readonly orientation: Quat;
  readonly cells: readonly Cell[];
}

// ------------------------------------------------------------- rotation + grid

export function rotate(rot: RotationState, delta: number): RotationState {
  return { stepDeg: rot.stepDeg, index: rot.index + delta };
}

export function yawDegrees(rot: RotationState): number {
  return (((rot.index * rot.stepDeg) % 360) + 360) % 360;
}

export function yawRadians(rot: RotationState): number {
  return (yawDegrees(rot) * Math.PI) / 180;
}

/** Quarter-turns (0..3) nearest the current yaw — drives footprint cell swap. */
export function quarterTurns(rot: RotationState): number {
  return ((Math.round(yawDegrees(rot) / 90) % 4) + 4) % 4;
}

/** Footprint after rotation: odd quarter-turns swap the X/Z extents. */
export function effectiveFootprint(fp: Footprint, rot: RotationState): Footprint {
  return quarterTurns(rot) % 2 === 1 ? { w: fp.d, d: fp.w, h: fp.h } : fp;
}

function snapAxis(p: number, origin: number, cell: number, even: boolean): number {
  const n = (p - origin) / cell;
  // Even extents center on a grid line; odd extents on a cell center (§3a parity).
  return even ? Math.round(n) * cell + origin : (Math.floor(n) + 0.5) * cell + origin;
}

/** Snap a piece CENTER to the grid, honouring even/odd footprint parity. */
export function snapToGrid(
  pos: Vec3,
  grid: GridSpec,
  fp: Footprint,
  rot: RotationState,
): Vec3 {
  const ef = effectiveFootprint(fp, rot);
  return [
    snapAxis(pos[0], grid.origin[0], grid.cellSize, ef.w % 2 === 0),
    snapAxis(pos[1], grid.origin[1], grid.cellSize, ef.h % 2 === 0),
    snapAxis(pos[2], grid.origin[2], grid.cellSize, ef.d % 2 === 0),
  ];
}

/** Integer cells a piece centered at `center` occupies. */
export function occupiedCells(
  center: Vec3,
  grid: GridSpec,
  fp: Footprint,
  rot: RotationState,
): readonly Cell[] {
  const ef = effectiveFootprint(fp, rot);
  const min = (c: number, o: number, ext: number): number =>
    Math.round((c - o) / grid.cellSize - ext / 2);
  const minX = min(center[0], grid.origin[0], ef.w);
  const minY = min(center[1], grid.origin[1], ef.h);
  const minZ = min(center[2], grid.origin[2], ef.d);
  const cells: Cell[] = [];
  for (let dx = 0; dx < ef.w; dx++) {
    for (let dy = 0; dy < ef.h; dy++) {
      for (let dz = 0; dz < ef.d; dz++) cells.push([minX + dx, minY + dy, minZ + dz]);
    }
  }
  return cells;
}

// ------------------------------------------------------------- surface + socket

/** Place at the hit point, aligning the piece up-vector to the surface normal. */
export function snapToSurface(
  hit: RaycastHit,
  up: Vec3 = [0, 1, 0],
): { position: Vec3; orientation: Quat } {
  return { position: hit.point, orientation: quatFromUnitVectors(up, normalize(hit.normal)) };
}

/** Resolve a piece's local sockets into world space at a given pose. */
export function worldSockets(
  piece: PieceDef,
  center: Vec3,
  orientation: Quat,
): readonly WorldSocket[] {
  return piece.sockets.map((s) => ({
    position: [
      center[0] + rotateVec(orientation, s.localOffset)[0],
      center[1] + rotateVec(orientation, s.localOffset)[1],
      center[2] + rotateVec(orientation, s.localOffset)[2],
    ],
    outwardDir: normalize(rotateVec(orientation, s.outwardDir)),
    type: s.type,
    polarity: s.polarity,
  }));
}

function polarityMates(a: Polarity, b: Polarity): boolean {
  if (a === "0" || b === "0") return true;
  return a !== b; // '+' mates '-', never '+'/'+'
}

/**
 * Best socket connection: same type (case-insensitive) + mating polarity,
 * within `searchRadius`, outward dirs anti-parallel within `maxAngleDeg`,
 * nearest wins (§3c). Null when nothing connects.
 */
export function matchSocket(
  incoming: readonly WorldSocket[],
  candidates: readonly WorldSocket[],
  searchRadius: number,
  maxAngleDeg: number,
): SocketMatch | null {
  const cosTol = Math.cos((maxAngleDeg * Math.PI) / 180);
  let best: SocketMatch | null = null;
  for (const inc of incoming) {
    for (const tgt of candidates) {
      if (inc.type.toLowerCase() !== tgt.type.toLowerCase()) continue;
      if (!polarityMates(inc.polarity, tgt.polarity)) continue;
      const dist = distance(inc.position, tgt.position);
      if (dist > searchRadius) continue;
      // Anti-parallel: angle between outward dirs within maxAngle of 180°.
      if (dot(normalize(inc.outwardDir), normalize(tgt.outwardDir)) > -cosTol) continue;
      if (best === null || dist < best.distance) {
        best = {
          incoming: inc,
          target: tgt,
          translation: sub(tgt.position, inc.position),
          alignment: quatFromUnitVectors(
            normalize(inc.outwardDir),
            scale(normalize(tgt.outwardDir), -1),
          ),
          distance: dist,
        };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------- validity

export function overlaps(cells: readonly Cell[], world: PlacementWorld): boolean {
  return cells.some((c) => world.isOccupied(c));
}

export function clipsTerrain(cells: readonly Cell[], world: PlacementWorld): boolean {
  return cells.some((c) => world.isSolid(c));
}

/** Supported when any footprint cell has solid terrain or a placed piece below. */
export function hasSupport(cells: readonly Cell[], world: PlacementWorld): boolean {
  return cells.some((c) => {
    const below: Cell = [c[0], c[1] - 1, c[2]];
    return world.isSolid(below) || world.isOccupied(below);
  });
}

function cellCenter(cell: Cell, grid: GridSpec): Vec3 {
  return [
    grid.origin[0] + (cell[0] + 0.5) * grid.cellSize,
    grid.origin[1] + (cell[1] + 0.5) * grid.cellSize,
    grid.origin[2] + (cell[2] + 0.5) * grid.cellSize,
  ];
}

export function withinBoundary(
  cells: readonly Cell[],
  grid: GridSpec,
  boundary: { readonly centerXZ: readonly [number, number]; readonly radius: number },
): boolean {
  return cells.every((c) => {
    const w = cellCenter(c, grid);
    return Math.hypot(w[0] - boundary.centerXZ[0], w[2] - boundary.centerXZ[1]) <= boundary.radius;
  });
}

/** Below-floor when any cell center sits at or under the subterranean floor. */
export function isBelowFloor(cells: readonly Cell[], grid: GridSpec, floorY: number): boolean {
  return cells.some((c) => cellCenter(c, grid)[1] <= floorY);
}

function evaluateValidity(
  cells: readonly Cell[],
  grid: GridSpec,
  piece: PieceDef,
  world: PlacementWorld,
  rules: PlacementRules,
  socketMatched: boolean,
  mode: PlacementMode,
): PlacementValidity {
  const reasons: BlockReason[] = [];
  if (clipsTerrain(cells, world)) reasons.push("TerrainClip");
  if (overlaps(cells, world)) reasons.push("Overlap");
  if (piece.requiresSupport && !hasSupport(cells, world)) reasons.push("NoSupport");
  if (rules.boundary && !withinBoundary(cells, grid, rules.boundary)) reasons.push("OutOfBounds");
  if (rules.floorY !== undefined && isBelowFloor(cells, grid, rules.floorY)) {
    reasons.push("BelowFloor");
  }
  if (mode === "socket" && !socketMatched) reasons.push("NoSocket");
  return reasons.length === 0 ? { kind: "Valid" } : { kind: "Blocked", reasons };
}

// ------------------------------------------------------------- orchestrator

export interface ResolveInput {
  readonly hit: RaycastHit;
  readonly mode: PlacementMode;
  readonly pieceDef: PieceDef;
  readonly rotation: RotationState;
  readonly grid: GridSpec;
  readonly world: PlacementWorld;
  readonly rules?: PlacementRules;
  /** Candidate world sockets from nearby placed pieces (socket mode). */
  readonly candidateSockets?: readonly WorldSocket[];
  readonly socketSearchRadius?: number;
  readonly socketMaxAngleDeg?: number;
}

export const DEFAULT_SOCKET_RADIUS = 1.5;
export const DEFAULT_SOCKET_MAX_ANGLE_DEG = 75;

/** Resolve a hit into a snapped, validity-checked placement (all pure). */
export function resolvePlacement(input: ResolveInput): PlacementState {
  const { hit, mode, pieceDef, rotation, grid, world } = input;
  const rules = input.rules ?? {};
  let center: Vec3;
  let orientation: Quat;
  let socketMatch: SocketMatch | null = null;

  if (mode === "surface") {
    const snapped = snapToSurface(hit);
    center = snapped.position;
    orientation = snapped.orientation;
  } else if (mode === "socket") {
    // Provisional grid pose, then pull onto the nearest mating socket.
    orientation = quatFromYaw(yawRadians(rotation));
    const provisional = snapToGrid(hit.point, grid, pieceDef.footprint, rotation);
    const incoming = worldSockets(pieceDef, provisional, orientation);
    socketMatch = matchSocket(
      incoming,
      input.candidateSockets ?? [],
      input.socketSearchRadius ?? DEFAULT_SOCKET_RADIUS,
      input.socketMaxAngleDeg ?? DEFAULT_SOCKET_MAX_ANGLE_DEG,
    );
    center = socketMatch
      ? [
          provisional[0] + socketMatch.translation[0],
          provisional[1] + socketMatch.translation[1],
          provisional[2] + socketMatch.translation[2],
        ]
      : provisional;
  } else {
    center = snapToGrid(hit.point, grid, pieceDef.footprint, rotation);
    orientation = quatFromYaw(yawRadians(rotation));
  }

  const cells = occupiedCells(center, grid, pieceDef.footprint, rotation);
  const validity = evaluateValidity(
    cells,
    grid,
    pieceDef,
    world,
    rules,
    socketMatch !== null,
    mode,
  );
  return { pieceDef, mode, rotation, center, orientation, cells, validity, socketMatch };
}

/** A valid state's commit command; null when the placement is blocked. */
export function commit(state: PlacementState): PlacePieceCommand | null {
  if (state.validity.kind !== "Valid") return null;
  return {
    pieceId: state.pieceDef.id,
    center: state.center,
    orientation: state.orientation,
    cells: state.cells,
  };
}
