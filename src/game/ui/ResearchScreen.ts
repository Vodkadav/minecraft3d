/**
 * ResearchScreen — a togglable overlay (Phase E6.4), structurally the twin of
 * `CharacterScreen.ts`: same overlay/dialog/pointer-lock-release/focus
 * pattern, `J` opens/closes it (ignored while a text input has focus),
 * Escape always closes. One view, grouped by branch, each node rendered
 * locked/affordable/unlocked (`researchNodeStatus`) with an Unlock button.
 * All state changes go through the pure `domain/research/ResearchTree.ts`
 * reducer — this module is composition + DOM only. No respec button by
 * design: research is permanent, additive-only progression (cozy).
 */

import {
  availableResearchPoints,
  researchNodeStatus,
  unlockResearchNode,
  type ResearchBranch,
  type ResearchNode,
  type ResearchState,
} from "../domain/research/ResearchTree";
import { RESEARCH_NODES } from "../domain/research/starterResearchTree";
import type { ProgressionState } from "../domain/progression/ProgressionState";
import { isOk } from "../domain/Result";
import type { Localizer } from "../application/i18n/Localizer";
import { WindowFrame } from "./components/WindowFrame";
import { injectStyles } from "./styles";

export interface ResearchScreenOptions {
  readonly loc: Localizer;
  readonly research: ResearchState;
  readonly progression: ProgressionState;
  readonly nodes?: readonly ResearchNode[];
  /** Pauses/resumes camera-look input; called on open(false)/close(true). */
  setInputEnabled?(enabled: boolean): void;
  onResearchChange?(next: ResearchState): void;
  readonly doc?: Document;
}

export interface ResearchScreenHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  setResearch(next: ResearchState): void;
  setProgression(next: ProgressionState): void;
  readonly research: ResearchState;
  dispose(): void;
}

const BRANCH_NAME_KEY: Readonly<Record<ResearchBranch, string>> = {
  gathering: "research.branch.gathering",
  crafting: "research.branch.crafting",
  vitality: "research.branch.vitality",
};

const BRANCH_ORDER: readonly ResearchBranch[] = ["gathering", "crafting", "vitality"];

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountResearchScreen(opts: ResearchScreenOptions): ResearchScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const nodes = opts.nodes ?? RESEARCH_NODES;
  let research = opts.research;
  let progression = opts.progression;
  let open = false;

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("research.title"));

  const pointsLine = doc.createElement("div");
  pointsLine.className = "lw-research-points";

  const body = doc.createElement("div");
  body.className = "lw-research-body";

  const frame = WindowFrame({
    doc,
    title: opts.loc.t("research.title"),
    headerExtra: pointsLine,
    close: {
      label: opts.loc.t("research.close"),
      ariaLabel: opts.loc.t("research.close.aria"),
      onClose: () => close(),
    },
    body: [body],
    panelClassName: "lw-inv-overlay-panel",
  });
  overlay.appendChild(frame.panel);
  doc.body.appendChild(overlay);

  function setResearchInternal(next: ResearchState): void {
    research = next;
    opts.onResearchChange?.(next);
    render();
  }

  function renderBranch(branch: ResearchBranch): HTMLElement {
    const section = doc.createElement("div");
    section.className = "lw-research-branch";
    section.dataset.branch = branch;

    const title = doc.createElement("h3");
    title.className = "lw-research-branch-title";
    title.textContent = opts.loc.t(BRANCH_NAME_KEY[branch]);
    section.appendChild(title);

    const list = doc.createElement("div");
    list.className = "lw-research-node-list";
    list.setAttribute("role", "list");

    for (const node of nodes.filter((n) => n.branch === branch)) {
      const status = researchNodeStatus(nodes, research, progression, node.id);

      const row = doc.createElement("div");
      row.className = "lw-research-node";
      row.setAttribute("role", "listitem");
      row.dataset.nodeId = node.id;
      row.dataset.status = status;

      const info = doc.createElement("div");
      const titleEl = doc.createElement("div");
      titleEl.className = "lw-research-node-title";
      titleEl.textContent = `${opts.loc.t(node.nameKey)} (${node.cost})`;
      const desc = doc.createElement("div");
      desc.className = "lw-research-node-desc";
      desc.textContent = opts.loc.t(node.descKey);
      info.append(titleEl, desc);

      if (status === "locked" && node.prereqs.length > 0) {
        const notMet = node.prereqs.some((id) => !research.unlockedNodeIds.includes(id));
        if (notMet) {
          const lock = doc.createElement("div");
          lock.className = "lw-research-node-lock";
          lock.textContent = opts.loc.t("research.locked.prereqs");
          info.appendChild(lock);
        }
      }

      const actionBtn = doc.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "laas-ui lw-button";
      if (status === "unlocked") {
        actionBtn.dataset.variant = "quiet";
        actionBtn.textContent = opts.loc.t("research.node.unlocked");
        actionBtn.disabled = true;
      } else {
        actionBtn.textContent = opts.loc.t("research.node.unlock");
        actionBtn.disabled = status !== "affordable";
      }
      actionBtn.setAttribute(
        "aria-label",
        opts.loc.t("research.node.unlock.aria", { name: opts.loc.t(node.nameKey) }),
      );
      actionBtn.addEventListener("click", () => {
        const r = unlockResearchNode(nodes, research, progression, node.id);
        if (isOk(r)) setResearchInternal(r.value);
      });

      row.append(info, actionBtn);
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }

  function render(): void {
    pointsLine.textContent = opts.loc.t("research.points.available", {
      n: availableResearchPoints(progression, research),
    });
    body.replaceChildren(...BRANCH_ORDER.map((b) => renderBranch(b)));
  }
  render();

  function open_(): void {
    if (open) return;
    open = true;
    overlay.hidden = false;
    render();
    doc.exitPointerLock?.();
    opts.setInputEnabled?.(false);
    body.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }
  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    opts.setInputEnabled?.(true);
  }
  function toggle(): void {
    if (open) close();
    else open_();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    if ((e.key === "j" || e.key === "J") && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      toggle();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open: open_,
    close,
    toggle,
    setResearch(next: ResearchState): void {
      research = next;
      if (open) render();
    },
    setProgression(next: ProgressionState): void {
      progression = next;
      if (open) render();
    },
    get research() {
      return research;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
