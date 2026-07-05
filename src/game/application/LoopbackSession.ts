/**
 * A joinable session handle. Netcode transport is a later milestone (M7); for
 * now Host/Join resolve to a local loopback session — same shape a real
 * networked session will carry, so the UI wiring doesn't change when transport
 * lands.
 */

import type { WorldId } from "../domain/world/WorldSaveData";

export interface LoopbackSession {
  readonly worldId: WorldId;
  readonly mode: "loopback";
}
