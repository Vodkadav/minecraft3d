/**
 * trystero adapter for the NetTransport port (plan 7.3 [F], ADR 0002).
 * Signaling rides the Nostr rail (trystero's default — rail switch is a
 * one-line import change if relays degrade); game traffic is direct P2P
 * WebRTC, E2E-encrypted. Metered Open Relay TURN covers symmetric-NAT pairs.
 *
 * One trystero "message" action carries every message: the sessions already
 * speak a discriminated union (domain/net/Protocol) and validate at the trust
 * boundary, so the transport stays a dumb pipe. Position traffic is light
 * enough at family scale to share the reliable channel — split into an
 * unreliable action if profiling ever says otherwise (ADR 0002 §3).
 */

import { joinRoom } from "trystero";
import type { NetTransport } from "../../application/ports/NetTransport";

/** Shared app id — rooms only meet inside the same namespace. */
const APP_ID = "vodkadav-minecraft3d";

/** Free TURN fallback (ADR 0002 §2): Metered Open Relay, ports 80/443. */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443"],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export function makeTrysteroTransport(roomCode: string): NetTransport {
  const room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, roomCode);
  const action = room.makeAction("msg");

  let messageCb: ((peerId: string, msg: unknown) => void) | null = null;

  action.onMessage = (data, ctx) => {
    messageCb?.(ctx.peerId, data);
  };

  return {
    send(peerId, msg) {
      void action.send(msg as never, { target: peerId });
    },
    broadcast(msg) {
      void action.send(msg as never);
    },
    onMessage(cb) {
      messageCb = cb;
    },
    onPeerJoin(cb) {
      room.onPeerJoin = cb;
    },
    onPeerLeave(cb) {
      room.onPeerLeave = cb;
    },
    close() {
      void room.leave();
    },
  };
}
