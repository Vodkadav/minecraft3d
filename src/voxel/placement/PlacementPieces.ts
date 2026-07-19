/**
 * Starter piece catalogue for the 8.5 build tool — declarative PieceDefs the
 * domain validates against (the swappable-asset seam: meshes never appear
 * here). Sockets arrive with a later socket-mode slice; grid mode needs none.
 */

import type { PieceDef } from "../../game/domain/placement/Placement";

export const PLACEMENT_PIECES: readonly PieceDef[] = [
  { id: "block", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "platform", footprint: { w: 2, d: 2, h: 1 }, sockets: [], requiresSupport: true },
  { id: "pillar", footprint: { w: 1, d: 1, h: 2 }, sockets: [], requiresSupport: true },

  // ---- Workstream 8.5 building-part catalogue (>= 15 gate) ----
  { id: "wall", footprint: { w: 1, d: 1, h: 2 }, sockets: [], requiresSupport: true },
  { id: "floor", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "roof", footprint: { w: 2, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "stairs", footprint: { w: 1, d: 2, h: 1 }, sockets: [], requiresSupport: true },
  { id: "window", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "fence", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "gate", footprint: { w: 2, d: 1, h: 2 }, sockets: [], requiresSupport: true },
  { id: "bed", footprint: { w: 1, d: 2, h: 1 }, sockets: [], requiresSupport: true },

  // ---- Workstream 8.1 functional placeables (same ghost/snap tool) ----
  { id: "door", footprint: { w: 1, d: 1, h: 2 }, sockets: [], requiresSupport: true },
  { id: "chest", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "workbench", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "campfire", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
  { id: "torch", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: false },
  { id: "lantern", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: false },

  // ---- Workstream 8.3 farming (S7b) ----
  { id: "plot", footprint: { w: 1, d: 1, h: 1 }, sockets: [], requiresSupport: true },
];

/** Piece ids that carry Workstream 8.1 domain state (door/chest/campfire/
 *  workbench/torch) rather than being purely structural geometry. The scene
 *  composition root uses this to decide which placed pieces need a domain
 *  state object alongside their PlacedPiece record. */
export const PLACEABLE_PIECE_IDS: ReadonlySet<string> = new Set([
  "door",
  "gate",
  "chest",
  "workbench",
  "campfire",
  "torch",
  "lantern",
  "bed",
  "plot",
]);

export function cyclePieceIndex(index: number, delta: number, count: number): number {
  return ((index + delta) % count + count) % count;
}
