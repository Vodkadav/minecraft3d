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
];

export function cyclePieceIndex(index: number, delta: number, count: number): number {
  return ((index + delta) % count + count) % count;
}
