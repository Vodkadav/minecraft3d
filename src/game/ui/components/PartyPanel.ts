/**
 * Party panel (E5.1/E5.2/E5.4) — a collapsible, keyboard-toggled ("P") HUD
 * panel: member frames (name/health/energy/level, reusing `Bar`), an invite
 * list of known nearby peers, leader-only kick buttons, a leave button, a
 * per-member inventory-share opt-in toggle, and read-only "View Inventory"
 * buttons for opted-in members. All mutations here are just callbacks — the
 * composition root threads them to the real host-authoritative intents
 * (`JoinNetHandle.sendPartyAction`/`HostNetHandle.applyPartyAction`); this
 * component never mutates anything itself, matching `CombatMeterPanel`'s
 * presentation-only posture.
 */

import type { PartyMemberInfo } from "../../domain/net/Protocol";
import type { Localizer } from "../../application/i18n/Localizer";
import { Bar, type BarHandle } from "./Bar";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface PartyPanelState {
  readonly selfPeerId: string;
  readonly leaderId: string | null;
  readonly members: readonly PartyMemberInfo[];
  /** Known peers NOT currently in this party — the invite candidate list. */
  readonly invitable: readonly { readonly peerId: string; readonly playerName: string }[];
  /** This player's own current inventory-share opt-in (E5.4). */
  readonly shareEnabled: boolean;
}

export interface PartyPanelCallbacks {
  onInvite(targetPeerId: string): void;
  onKick(targetPeerId: string): void;
  onLeave(): void;
  onShareToggle(shared: boolean): void;
  onViewInventory(targetPeerId: string): void;
}

export interface PartyPanelHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  setVisible(v: boolean): void;
  render(state: PartyPanelState): void;
  /** Show an incoming invite banner; `onAccept`/`onDecline` fire at most once. */
  showInvite(fromPeerId: string, fromPlayerName: string, onAccept: () => void, onDecline: () => void): void;
  dispose(): void;
}

function isTextInputFocused(doc: Document): boolean {
  const el = doc.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}

interface FrameRow {
  readonly el: HTMLElement;
  readonly healthBar: BarHandle;
  readonly energyBar: BarHandle;
}

export function mountPartyPanel(
  loc: Localizer,
  callbacks: PartyPanelCallbacks,
  opts: { doc?: Document } = {},
): PartyPanelHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const title = doc.createElement("div");
  title.className = "lw-party-title";
  title.textContent = loc.t("party.title");

  const closeBtn = Button({
    label: loc.t("party.close"),
    ariaLabel: loc.t("party.close.aria"),
    variant: "quiet",
    onClick: () => setVisible(false),
  });

  const header = doc.createElement("div");
  header.className = "lw-party-header";
  header.append(title, closeBtn);

  const inviteBanner = doc.createElement("div");
  inviteBanner.className = "lw-party-invite-banner";
  inviteBanner.hidden = true;

  const empty = doc.createElement("div");
  empty.className = "lw-party-empty";
  empty.textContent = loc.t("party.empty");

  const frames = doc.createElement("div");
  frames.className = "lw-party-frames";

  const controls = doc.createElement("div");
  controls.className = "lw-party-controls";

  const inviteSection = doc.createElement("div");
  inviteSection.className = "lw-party-invite-section";

  const panel = Panel([header, inviteBanner, empty, frames, controls, inviteSection], {
    className: "lw-party-panel",
    ariaLabel: loc.t("party.title"),
  });
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-live", "polite");
  panel.style.display = "none";
  doc.body.appendChild(panel);

  let visible = false;
  const frameRows = new Map<string, FrameRow>();

  function setVisible(v: boolean): void {
    visible = v;
    panel.style.display = v ? "block" : "none";
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isTextInputFocused(doc)) return;
    if (e.code === "KeyP") {
      setVisible(!visible);
    } else if (e.code === "Escape" && visible) {
      setVisible(false);
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  function buildFrame(m: PartyMemberInfo, isSelf: boolean, isLeader: boolean, canKick: boolean, shareEnabled: boolean): FrameRow {
    const row = doc.createElement("div");
    row.className = "lw-party-frame";

    const name = doc.createElement("div");
    name.className = "lw-party-frame-name";
    name.textContent = `${m.playerName || m.peerId}${isSelf ? ` (${loc.t("party.you")})` : ""}`;
    if (isLeader) {
      const badge = doc.createElement("span");
      badge.className = "lw-party-leader-badge";
      badge.textContent = loc.t("party.leaderBadge");
      name.appendChild(badge);
    }

    const level = doc.createElement("span");
    level.className = "lw-party-frame-level";
    level.textContent = loc.t("party.frame.level", { n: m.level });
    name.appendChild(level);

    const healthBar = Bar({
      id: `lw-party-health-${m.peerId}`,
      ariaLabel: loc.t("party.frame.health.aria", { name: m.playerName || m.peerId }),
      labelText: "{n}/{max}",
      max: Math.max(1, m.maxHealth),
      initial: m.health,
    });
    const energyBar = Bar({
      id: `lw-party-energy-${m.peerId}`,
      ariaLabel: loc.t("party.frame.energy.aria", { name: m.playerName || m.peerId }),
      labelText: "{n}/{max}",
      max: Math.max(1, m.maxEnergy),
      initial: m.energy,
    });

    row.append(name, healthBar.el, energyBar.el);

    if (canKick && !isSelf) {
      const kickBtn = Button({
        label: loc.t("party.kick"),
        ariaLabel: loc.t("party.kick.aria", { name: m.playerName || m.peerId }),
        variant: "quiet",
        onClick: () => callbacks.onKick(m.peerId),
      });
      row.appendChild(kickBtn);
    }
    if (!isSelf && shareEnabled) {
      const viewBtn = Button({
        label: loc.t("party.viewInventory"),
        ariaLabel: loc.t("party.viewInventory.aria", { name: m.playerName || m.peerId }),
        variant: "quiet",
        onClick: () => callbacks.onViewInventory(m.peerId),
      });
      row.appendChild(viewBtn);
    }

    frames.appendChild(row);
    return { el: row, healthBar, energyBar };
  }

  return {
    el: panel,
    get visible() {
      return visible;
    },
    setVisible,
    render(state: PartyPanelState): void {
      const inParty = state.members.length > 0;
      empty.hidden = inParty;
      frames.hidden = !inParty;
      controls.hidden = !inParty;

      for (const row of frameRows.values()) {
        row.healthBar.dispose();
        row.energyBar.dispose();
      }
      frameRows.clear();
      frames.replaceChildren();

      const isLeaderSelf = state.leaderId === state.selfPeerId;
      for (const m of state.members) {
        const isSelf = m.peerId === state.selfPeerId;
        const memberShares = isSelf ? state.shareEnabled : true; // others' opt-in isn't visible until a lookup succeeds/fails; show the button, host gates it
        const row = buildFrame(m, isSelf, m.peerId === state.leaderId, isLeaderSelf, memberShares);
        frameRows.set(m.peerId, row);
      }

      controls.replaceChildren();
      if (inParty) {
        const leaveBtn = Button({
          label: loc.t("party.leave"),
          ariaLabel: loc.t("party.leave.aria"),
          onClick: callbacks.onLeave,
        });
        const shareLabel = doc.createElement("label");
        shareLabel.className = "lw-party-share";
        const shareCheckbox = doc.createElement("input");
        shareCheckbox.type = "checkbox";
        shareCheckbox.checked = state.shareEnabled;
        shareCheckbox.setAttribute("aria-label", loc.t("party.share.aria"));
        shareCheckbox.addEventListener("change", () => callbacks.onShareToggle(shareCheckbox.checked));
        const shareText = doc.createElement("span");
        shareText.textContent = loc.t("party.share.label");
        shareLabel.append(shareCheckbox, shareText);
        controls.append(leaveBtn, shareLabel);
      }

      inviteSection.replaceChildren();
      if (state.invitable.length > 0) {
        const heading = doc.createElement("div");
        heading.className = "lw-party-invite-heading";
        heading.textContent = loc.t("party.invite.section");
        inviteSection.appendChild(heading);
        for (const candidate of state.invitable) {
          const btn = Button({
            label: loc.t("party.invite.button", { name: candidate.playerName || candidate.peerId }),
            onClick: () => callbacks.onInvite(candidate.peerId),
          });
          inviteSection.appendChild(btn);
        }
      }
    },
    showInvite(fromPeerId, fromPlayerName, onAccept, onDecline): void {
      inviteBanner.hidden = false;
      inviteBanner.replaceChildren();
      const text = doc.createElement("span");
      text.textContent = loc.t("party.invite.from", { name: fromPlayerName || fromPeerId });
      const acceptBtn = Button({
        label: loc.t("party.invite.accept"),
        onClick: () => {
          inviteBanner.hidden = true;
          onAccept();
        },
      });
      const declineBtn = Button({
        label: loc.t("party.invite.decline"),
        variant: "quiet",
        onClick: () => {
          inviteBanner.hidden = true;
          onDecline();
        },
      });
      inviteBanner.append(text, acceptBtn, declineBtn);
      setVisible(true);
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      for (const row of frameRows.values()) {
        row.healthBar.dispose();
        row.energyBar.dispose();
      }
      panel.remove();
    },
  };
}
