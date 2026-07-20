/**
 * Transport port for M7 multiplayer (ADR 0002). The application layer owns
 * this seam; the trystero/WebRTC adapter implements it in infrastructure, and
 * tests use the in-memory network fake. Messages are `unknown` at this level —
 * the sessions validate them through domain/net/Protocol at the trust boundary.
 */

export interface PeerHandle {
  readonly peerId: string;
}

export interface NetTransport {
  send(peerId: string, msg: unknown): void;
  broadcast(msg: unknown): void;
  onMessage(cb: (peerId: string, msg: unknown) => void): void;
  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  close(): void;
  /** This endpoint's own peer id, as every OTHER peer sees it (E5.1) — lets
   *  a joiner recognize itself in the host's party roster. Constant for the
   *  lifetime of the transport. */
  selfId(): string;
}
