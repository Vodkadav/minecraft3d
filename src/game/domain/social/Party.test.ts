import { describe, expect, it } from "vitest";
import { isErr, isOk, type Result } from "../Result";
import {
  PARTY_MAX_SIZE,
  acceptInvite,
  createParty,
  declineInvite,
  invite,
  kick,
  leave,
  type PartyError,
  type PartyState,
} from "./Party";

function expectErr(kind: string, result: Result<unknown, PartyError>): void {
  expect(isErr(result)).toBe(true);
  if (isErr(result)) expect(result.error.kind).toBe(kind);
}

describe("Party", () => {
  it("createParty starts as a party of one, the leader", () => {
    const p = createParty("party-1", "alice");
    expect(p).toEqual({ id: "party-1", leaderId: "alice", memberIds: ["alice"], invitedIds: [] });
  });

  describe("invite", () => {
    it("the leader can invite a non-member", () => {
      const p = createParty("p1", "alice");
      const r = invite(p, "alice", "bob");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value.invitedIds).toEqual(["bob"]);
    });

    it("rejects an invite from a non-leader member", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      expectErr("NotLeader", invite(p, "bob", "carol"));
    });

    it("rejects self-invite", () => {
      const p = createParty("p1", "alice");
      expectErr("SelfAction", invite(p, "alice", "alice"));
    });

    it("rejects inviting an existing member", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      expectErr("AlreadyMember", invite(p, "alice", "bob"));
    });

    it("rejects a duplicate pending invite", () => {
      const p0 = createParty("p1", "alice");
      const p = (invite(p0, "alice", "bob") as { ok: true; value: PartyState }).value;
      expectErr("AlreadyInvited", invite(p, "alice", "bob"));
    });

    it("rejects inviting past the size cap", () => {
      let p = createParty("p1", "alice");
      // fill to PARTY_MAX_SIZE (alice + 3 more)
      for (let i = 0; i < PARTY_MAX_SIZE - 1; i++) {
        const target = `member-${i}`;
        p = (invite(p, "alice", target) as { ok: true; value: PartyState }).value;
        p = (acceptInvite(p, target) as { ok: true; value: PartyState }).value;
      }
      expect(p.memberIds).toHaveLength(PARTY_MAX_SIZE);
      expectErr("PartyFull", invite(p, "alice", "one-too-many"));
    });
  });

  describe("acceptInvite / declineInvite", () => {
    it("accept adds the invited peer as a member and clears the invite", () => {
      const p0 = createParty("p1", "alice");
      const p1 = (invite(p0, "alice", "bob") as { ok: true; value: PartyState }).value;
      const r = acceptInvite(p1, "bob");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.value.memberIds).toEqual(["alice", "bob"]);
        expect(r.value.invitedIds).toEqual([]);
      }
    });

    it("rejects accepting without a pending invite", () => {
      const p = createParty("p1", "alice");
      expectErr("NotInvited", acceptInvite(p, "bob"));
    });

    it("decline clears the invite without adding a member", () => {
      const p0 = createParty("p1", "alice");
      const p1 = (invite(p0, "alice", "bob") as { ok: true; value: PartyState }).value;
      const r = declineInvite(p1, "bob");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.value.memberIds).toEqual(["alice"]);
        expect(r.value.invitedIds).toEqual([]);
      }
    });

    it("rejects declining without a pending invite", () => {
      const p = createParty("p1", "alice");
      expectErr("NotInvited", declineInvite(p, "bob"));
    });
  });

  describe("leave", () => {
    it("a regular member leaving keeps the leader, drops the member", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      const r = leave(p, "bob");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toEqual({ ...p, memberIds: ["alice"] });
    });

    it("the leader leaving hands leadership to the next-oldest member (succession)", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      p = (invite(p, "alice", "carol") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "carol") as { ok: true; value: PartyState }).value;

      const r = leave(p, "alice");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.value).not.toBeNull();
        expect(r.value?.leaderId).toBe("bob");
        expect(r.value?.memberIds).toEqual(["bob", "carol"]);
      }
    });

    it("the last member leaving disbands the party (null)", () => {
      const p = createParty("p1", "alice");
      const r = leave(p, "alice");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBeNull();
    });

    it("rejects leave from a non-member", () => {
      const p = createParty("p1", "alice");
      expectErr("NotAMember", leave(p, "ghost"));
    });
  });

  describe("kick", () => {
    it("the leader can kick a member", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      const r = kick(p, "alice", "bob");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value?.memberIds).toEqual(["alice"]);
    });

    it("rejects a kick from a non-leader", () => {
      let p = createParty("p1", "alice");
      p = (invite(p, "alice", "bob") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "bob") as { ok: true; value: PartyState }).value;
      p = (invite(p, "alice", "carol") as { ok: true; value: PartyState }).value;
      p = (acceptInvite(p, "carol") as { ok: true; value: PartyState }).value;
      expectErr("NotLeader", kick(p, "bob", "carol"));
    });

    it("rejects self-kick (use leave instead)", () => {
      const p = createParty("p1", "alice");
      expectErr("SelfAction", kick(p, "alice", "alice"));
    });

    it("rejects kicking a non-member", () => {
      const p = createParty("p1", "alice");
      expectErr("NotAMember", kick(p, "alice", "ghost"));
    });
  });
});
