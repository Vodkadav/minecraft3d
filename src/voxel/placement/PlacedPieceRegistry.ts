/**
 * Committed building pieces (plan 8.5 [F]) — the isOccupied half of the
 * domain's PlacementWorld port, plus the serializable record the world save
 * carries under entities['placement.pieces']. Pure TS, no three.js: the tool
 * keeps meshes beside it keyed by the returned id.
 */

import type { Cell, PlacePieceCommand } from "../../game/domain/placement/Placement";
import type { Quat, Vec3 } from "../../game/domain/placement/vec";

export interface PlacedPiece {
  readonly id: number;
  readonly pieceId: string;
  readonly center: Vec3;
  readonly orientation: Quat;
  readonly cells: readonly Cell[];
}

const cellKey = (c: Cell): string => `${c[0]},${c[1]},${c[2]}`;

export class PlacedPieceRegistry {
  private nextId = 1;
  private readonly byId = new Map<number, PlacedPiece>();
  private readonly occupied = new Map<string, number>();

  add(cmd: PlacePieceCommand): PlacedPiece {
    const piece: PlacedPiece = { id: this.nextId++, ...cmd };
    this.byId.set(piece.id, piece);
    for (const cell of piece.cells) this.occupied.set(cellKey(cell), piece.id);
    return piece;
  }

  get(id: number): PlacedPiece | null {
    return this.byId.get(id) ?? null;
  }

  remove(id: number): PlacedPiece | null {
    const piece = this.byId.get(id);
    if (!piece) return null;
    this.byId.delete(id);
    for (const cell of piece.cells) this.occupied.delete(cellKey(cell));
    return piece;
  }

  isOccupied(cell: Cell): boolean {
    return this.occupied.has(cellKey(cell));
  }

  all(): readonly PlacedPiece[] {
    return [...this.byId.values()];
  }

  /** Plain-JSON structure for the save's entities record (ids are session-local). */
  serialize(): unknown {
    return this.all().map((p) => ({
      pieceId: p.pieceId,
      center: p.center,
      orientation: p.orientation,
      cells: p.cells,
    }));
  }

  /** Untrusted save data in — malformed entries are skipped, never thrown on. */
  static deserialize(data: unknown): PlacedPieceRegistry {
    const registry = new PlacedPieceRegistry();
    if (!Array.isArray(data)) return registry;
    for (const entry of data) {
      const piece = parsePiece(entry);
      if (piece) registry.add(piece);
    }
    return registry;
  }
}

function isFiniteTuple(v: unknown, len: number): boolean {
  return Array.isArray(v) && v.length === len && v.every((n) => Number.isFinite(n));
}

function parsePiece(entry: unknown): PlacePieceCommand | null {
  if (typeof entry !== "object" || entry === null) return null;
  const e = entry as Record<string, unknown>;
  if (typeof e["pieceId"] !== "string") return null;
  if (!isFiniteTuple(e["center"], 3) || !isFiniteTuple(e["orientation"], 4)) return null;
  const cells = e["cells"];
  if (!Array.isArray(cells) || cells.length === 0) return null;
  if (!cells.every((c) => isFiniteTuple(c, 3) && (c as number[]).every(Number.isInteger))) {
    return null;
  }
  return {
    pieceId: e["pieceId"],
    center: e["center"] as unknown as Vec3,
    orientation: e["orientation"] as unknown as Quat,
    cells: cells as unknown as readonly Cell[],
  };
}
