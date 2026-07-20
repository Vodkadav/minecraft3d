/**
 * Party/group domain (E5.1/E5.2) — pure membership state machine. A party is
 * identified purely by peer id (the host uses `HOST_PEER_ID` for itself,
 * everyone else their trystero peer id — see `application/HostSession.ts`).
 * Cozy size cap: 4, a comfortable couch-co-op/family group. All mutations are
 * `Result`-typed; nothing here talks to the network — `HostSession` is the
 * only caller, resolving wire intents against these pure transitions.
 */

import { err, ok, type Result } from "../Result";

/** A cozy family/friend-group cap — never a competitive raid size. */
export const PARTY_MAX_SIZE = 4;

export interface PartyState {
  readonly id: string;
  readonly leaderId: string;
  /** Includes the leader. Order is join order (oldest first) — leader
   *  succession promotes `memberIds[1]` (via `leave`/`kick`'s filter, the
   *  next-oldest survivor). */
  readonly memberIds: readonly string[];
  /** Peers invited but not yet accepted/declined. */
  readonly invitedIds: readonly string[];
}

export type PartyError =
  | { readonly kind: "NotLeader" }
  | { readonly kind: "PartyFull" }
  | { readonly kind: "AlreadyMember" }
  | { readonly kind: "AlreadyInvited" }
  | { readonly kind: "NotAMember" }
  | { readonly kind: "NotInvited" }
  | { readonly kind: "SelfAction" };

/** A brand-new party of one — the leader. Created by `HostSession` the first
 *  time a solo peer sends an invite (create-on-invite-accept: the party
 *  itself exists from the first invite, but has no SECOND member until that
 *  invite is accepted). */
export function createParty(id: string, leaderId: string): PartyState {
  return { id, leaderId, memberIds: [leaderId], invitedIds: [] };
}

export function invite(
  state: PartyState,
  byPeerId: string,
  targetPeerId: string,
): Result<PartyState, PartyError> {
  if (byPeerId !== state.leaderId) return err({ kind: "NotLeader" });
  if (targetPeerId === byPeerId) return err({ kind: "SelfAction" });
  if (state.memberIds.includes(targetPeerId)) return err({ kind: "AlreadyMember" });
  if (state.memberIds.length >= PARTY_MAX_SIZE) return err({ kind: "PartyFull" });
  if (state.invitedIds.includes(targetPeerId)) return err({ kind: "AlreadyInvited" });
  return ok({ ...state, invitedIds: [...state.invitedIds, targetPeerId] });
}

export function acceptInvite(state: PartyState, peerId: string): Result<PartyState, PartyError> {
  if (!state.invitedIds.includes(peerId)) return err({ kind: "NotInvited" });
  if (state.memberIds.length >= PARTY_MAX_SIZE) return err({ kind: "PartyFull" });
  return ok({
    ...state,
    memberIds: [...state.memberIds, peerId],
    invitedIds: state.invitedIds.filter((id) => id !== peerId),
  });
}

export function declineInvite(state: PartyState, peerId: string): Result<PartyState, PartyError> {
  if (!state.invitedIds.includes(peerId)) return err({ kind: "NotInvited" });
  return ok({ ...state, invitedIds: state.invitedIds.filter((id) => id !== peerId) });
}

/** `null` on success means the party disbanded (its last member left). Leader
 *  succession: if the leaving peer WAS the leader, the next-oldest surviving
 *  member (join order) becomes leader — no vote, no penalty (cozy). */
export function leave(
  state: PartyState,
  peerId: string,
): Result<PartyState | null, PartyError> {
  if (!state.memberIds.includes(peerId)) return err({ kind: "NotAMember" });
  const remaining = state.memberIds.filter((id) => id !== peerId);
  if (remaining.length === 0) return ok(null);
  const leaderId = state.leaderId === peerId ? remaining[0] : state.leaderId;
  return ok({ ...state, memberIds: remaining, leaderId });
}

/** Only the leader may kick, and never themselves (use `leave` instead) —
 *  reuses `leave`'s succession logic (irrelevant here since a kicked target
 *  is never the leader once `NotLeader`/`SelfAction` have already gated). */
export function kick(
  state: PartyState,
  byPeerId: string,
  targetPeerId: string,
): Result<PartyState | null, PartyError> {
  if (byPeerId !== state.leaderId) return err({ kind: "NotLeader" });
  if (targetPeerId === byPeerId) return err({ kind: "SelfAction" });
  if (!state.memberIds.includes(targetPeerId)) return err({ kind: "NotAMember" });
  return leave(state, targetPeerId);
}
