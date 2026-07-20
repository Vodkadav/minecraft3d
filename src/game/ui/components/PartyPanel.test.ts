// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mountPartyPanel, type PartyPanelState } from "./PartyPanel";
import { createLocalizer } from "../i18n/strings";

const loc = createLocalizer("en");

function callbacks() {
  return {
    onInvite: vi.fn(),
    onKick: vi.fn(),
    onLeave: vi.fn(),
    onShareToggle: vi.fn(),
    onViewInventory: vi.fn(),
  };
}

const SOLO_STATE: PartyPanelState = {
  selfPeerId: "alice",
  leaderId: null,
  members: [],
  invitable: [],
  shareEnabled: false,
};

const PARTY_STATE: PartyPanelState = {
  selfPeerId: "alice",
  leaderId: "alice",
  members: [
    {
      peerId: "alice",
      playerName: "Alice",
      health: 8,
      maxHealth: 10,
      energy: 5,
      maxEnergy: 10,
      level: 3,
      damageDealt: 0,
      dps: 0,
      healing: 0,
      kills: 0,
    },
    {
      peerId: "bob",
      playerName: "Bob",
      health: 10,
      maxHealth: 10,
      energy: 10,
      maxEnergy: 10,
      level: 2,
      damageDealt: 0,
      dps: 0,
      healing: 0,
      kills: 0,
    },
  ],
  invitable: [{ peerId: "carol", playerName: "Carol" }],
  shareEnabled: true,
};

describe("mountPartyPanel", () => {
  it("is mounted but hidden by default", () => {
    const panel = mountPartyPanel(loc, callbacks());
    expect(panel.visible).toBe(false);
    expect((panel.el as HTMLElement).style.display).toBe("none");
    panel.dispose();
  });

  it("P toggles visibility", () => {
    const panel = mountPartyPanel(loc, callbacks());
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(panel.visible).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(panel.visible).toBe(false);
    panel.dispose();
  });

  it("shows empty-state copy with no party", () => {
    const panel = mountPartyPanel(loc, callbacks());
    panel.render(SOLO_STATE);
    expect(panel.el.textContent).toContain(loc.t("party.empty"));
    panel.dispose();
  });

  it("renders a frame per member with name and level", () => {
    const panel = mountPartyPanel(loc, callbacks());
    panel.render(PARTY_STATE);
    const text = panel.el.textContent ?? "";
    expect(text).toContain("Alice");
    expect(text).toContain("Bob");
    expect(text).toContain(loc.t("party.frame.level", { n: 3 }));
    panel.dispose();
  });

  it("the leader sees a Kick button on other members but not on themself", () => {
    const panel = mountPartyPanel(loc, callbacks());
    panel.render(PARTY_STATE);
    const kickButtons = Array.from(panel.el.querySelectorAll("button")).filter(
      (b) => b.textContent === loc.t("party.kick"),
    );
    expect(kickButtons).toHaveLength(1); // only on Bob's row
    panel.dispose();
  });

  it("clicking Kick calls onKick with the target peer id", () => {
    const cbs = callbacks();
    const panel = mountPartyPanel(loc, cbs);
    panel.render(PARTY_STATE);
    const kickBtn = Array.from(panel.el.querySelectorAll("button")).find(
      (b) => b.textContent === loc.t("party.kick"),
    ) as HTMLButtonElement;
    kickBtn.click();
    expect(cbs.onKick).toHaveBeenCalledExactlyOnceWith("bob");
    panel.dispose();
  });

  it("a non-leader sees no Kick buttons at all", () => {
    const panel = mountPartyPanel(loc, callbacks());
    panel.render({ ...PARTY_STATE, selfPeerId: "bob", leaderId: "alice" });
    const kickButtons = Array.from(panel.el.querySelectorAll("button")).filter(
      (b) => b.textContent === loc.t("party.kick"),
    );
    expect(kickButtons).toHaveLength(0);
    panel.dispose();
  });

  it("clicking Leave calls onLeave", () => {
    const cbs = callbacks();
    const panel = mountPartyPanel(loc, cbs);
    panel.render(PARTY_STATE);
    const leaveBtn = Array.from(panel.el.querySelectorAll("button")).find(
      (b) => b.textContent === loc.t("party.leave"),
    ) as HTMLButtonElement;
    leaveBtn.click();
    expect(cbs.onLeave).toHaveBeenCalledOnce();
    panel.dispose();
  });

  it("renders an invite button per invitable peer; clicking calls onInvite", () => {
    const cbs = callbacks();
    const panel = mountPartyPanel(loc, cbs);
    panel.render(PARTY_STATE);
    const inviteBtn = Array.from(panel.el.querySelectorAll("button")).find(
      (b) => b.textContent === loc.t("party.invite.button", { name: "Carol" }),
    ) as HTMLButtonElement;
    expect(inviteBtn).toBeTruthy();
    inviteBtn.click();
    expect(cbs.onInvite).toHaveBeenCalledExactlyOnceWith("carol");
    panel.dispose();
  });

  it("toggling the share checkbox calls onShareToggle", () => {
    const cbs = callbacks();
    const panel = mountPartyPanel(loc, cbs);
    panel.render(PARTY_STATE);
    const checkbox = panel.el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    expect(cbs.onShareToggle).toHaveBeenCalledExactlyOnceWith(false);
    panel.dispose();
  });

  it("showInvite shows an accept/decline banner and fires the right callback", () => {
    const panel = mountPartyPanel(loc, callbacks());
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    panel.showInvite("bob", "Bob", onAccept, onDecline);

    expect(panel.visible).toBe(true);
    expect(panel.el.textContent).toContain(loc.t("party.invite.from", { name: "Bob" }));
    const acceptBtn = Array.from(panel.el.querySelectorAll("button")).find(
      (b) => b.textContent === loc.t("party.invite.accept"),
    ) as HTMLButtonElement;
    acceptBtn.click();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).not.toHaveBeenCalled();
    panel.dispose();
  });

  it("dispose removes the element and stops listening", () => {
    const panel = mountPartyPanel(loc, callbacks());
    panel.dispose();
    expect(document.querySelector(".lw-party-panel")).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
  });

  it("ships i18n copy for all three locales", () => {
    for (const locale of ["en", "es", "da"] as const) {
      const l = createLocalizer(locale);
      const panel = mountPartyPanel(l, callbacks());
      expect(panel.el.textContent).toContain(l.t("party.title"));
      panel.dispose();
    }
  });
});
