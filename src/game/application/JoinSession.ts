/**
 * Joiner side of M7 multiplayer (ADR 0002 §6): sends intents to the host and
 * treats validated host messages as world truth, surfaced through hooks the
 * composition root wires into the engine. The joiner's transport has exactly
 * one peer (the host), so intents go out via broadcast. Anything malformed off
 * the wire is dropped with a warning — the host is trusted, the wire is not.
 */

import { isErr } from "../domain/Result";
import type { WelcomeMsg, WorldEdit } from "../domain/net/Protocol";
import { parseMessage } from "../domain/net/Protocol";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { NetTransport } from "./ports/NetTransport";

export interface JoinSessionHooks {
  onWelcome?(snapshot: WelcomeMsg): void;
  onPeerPose?(peerId: string, state: PlayerState): void;
  onWorldEdit?(edit: WorldEdit): void;
  onEntityRemoved?(id: string): void;
  onPeerJoined?(peerId: string, playerName: string): void;
  onPeerLeft?(peerId: string): void;
  onHostClosing?(): void;
}

export class JoinSession {
  constructor(
    private readonly transport: NetTransport,
    playerName: string,
    hooks: JoinSessionHooks,
  ) {
    transport.onMessage((peerId, raw) => {
      const parsed = parseMessage(raw);
      if (isErr(parsed)) {
        console.warn("net: dropped malformed message", { peerId, reason: parsed.error.reason });
        return;
      }
      const msg = parsed.value;
      switch (msg.kind) {
        case "welcome":
          hooks.onWelcome?.(msg);
          return;
        case "peerPose":
          hooks.onPeerPose?.(msg.peerId, msg.state);
          return;
        case "worldEdit":
          hooks.onWorldEdit?.(msg.edit);
          return;
        case "entityRemoved":
          hooks.onEntityRemoved?.(msg.id);
          return;
        case "peerJoined":
          hooks.onPeerJoined?.(msg.peerId, msg.playerName);
          return;
        case "peerLeft":
          hooks.onPeerLeft?.(msg.peerId);
          return;
        case "hostClosing":
          hooks.onHostClosing?.();
          return;
        default:
          // Joiner-intent kinds arriving at a joiner: not ours to handle.
          return;
      }
    });
    transport.broadcast({ kind: "join", playerName });
  }

  sendPose(state: PlayerState): void {
    this.transport.broadcast({ kind: "pose", state });
  }

  sendDig(x: number, y: number, z: number, radius: number): void {
    this.transport.broadcast({ kind: "dig", x, y, z, radius });
  }

  sendFill(x: number, y: number, z: number, radius: number, materialId: number): void {
    this.transport.broadcast({ kind: "fill", x, y, z, radius, materialId });
  }
}
