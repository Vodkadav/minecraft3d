/**
 * In-memory NetTransport network — a contract-obeying honest fake for the M7
 * session tests, in the star topology the real thing has: one host endpoint,
 * N joiner endpoints, each joiner linked only to the host. Delivery is
 * synchronous and structured-cloned, mirroring the copy a real data channel
 * makes (so a sender can't mutate a message after the fact, and
 * non-cloneable payloads fail here like they would on the wire).
 */

import type { NetTransport } from "../ports/NetTransport";

export const HOST_PEER_ID = "host";

interface Link {
  readonly remote: InMemoryTransport;
  /** Our peerId as the remote sees it (the `peerId` its onMessage receives). */
  readonly myIdAtRemote: string;
}

class InMemoryTransport implements NetTransport {
  private readonly links = new Map<string, Link>();
  private readonly messageCbs: Array<(peerId: string, msg: unknown) => void> = [];
  private readonly joinCbs: Array<(peerId: string) => void> = [];
  private readonly leaveCbs: Array<(peerId: string) => void> = [];
  private closed = false;

  send(peerId: string, msg: unknown): void {
    if (this.closed) return;
    const link = this.links.get(peerId);
    if (!link) return;
    link.remote.deliver(link.myIdAtRemote, structuredClone(msg));
  }

  broadcast(msg: unknown): void {
    for (const peerId of this.links.keys()) this.send(peerId, msg);
  }

  onMessage(cb: (peerId: string, msg: unknown) => void): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (peerId: string) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (peerId: string) => void): void {
    this.leaveCbs.push(cb);
  }

  close(): void {
    this.closed = true;
    for (const [peerId, link] of this.links) {
      link.remote.unlink(link.myIdAtRemote);
      this.links.delete(peerId);
    }
  }

  // -- wiring used by the network factory / linked endpoints --

  link(peerId: string, remote: InMemoryTransport, myIdAtRemote: string): void {
    this.links.set(peerId, { remote, myIdAtRemote });
    for (const cb of this.joinCbs) cb(peerId);
  }

  unlink(peerId: string): void {
    if (!this.links.delete(peerId) || this.closed) return;
    for (const cb of this.leaveCbs) cb(peerId);
  }

  private deliver(fromPeerId: string, msg: unknown): void {
    if (this.closed) return;
    for (const cb of this.messageCbs) cb(fromPeerId, msg);
  }
}

export interface TransportNetwork {
  readonly host: NetTransport;
  /** Create a joiner transport wired to the host (fires the host's onPeerJoin). */
  addPeer(peerId: string): NetTransport;
  /** Simulate the peer dropping (fires the host's onPeerLeave). */
  removePeer(peerId: string): void;
}

export function makeTransportNetwork(): TransportNetwork {
  const host = new InMemoryTransport();
  const joiners = new Map<string, InMemoryTransport>();
  return {
    host,
    addPeer(peerId: string): NetTransport {
      const joiner = new InMemoryTransport();
      joiners.set(peerId, joiner);
      joiner.link(HOST_PEER_ID, host, peerId);
      host.link(peerId, joiner, HOST_PEER_ID);
      return joiner;
    },
    removePeer(peerId: string): void {
      joiners.get(peerId)?.close();
      joiners.delete(peerId);
    },
  };
}
