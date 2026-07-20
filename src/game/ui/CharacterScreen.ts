/**
 * CharacterScreen — a togglable overlay (Phase E1.5), structurally the twin
 * of `InventoryScreen.ts`: same overlay/dialog/pointer-lock-release/focus
 * pattern, `C` opens/closes it (ignored while a text input has focus),
 * Escape always closes. Two tabs: Attributes (level/XP bar, spend/refund
 * points, one-click free Respec) and Talents (the tree, spend on an
 * available node, one-click free Respec). All state changes go through the
 * pure `domain/character/Character.ts` reducers — this module is composition
 * + DOM only.
 */

import { isOk } from "../domain/Result";
import {
  allocateCharacterTalent,
  allocateStatPoint,
  type CharacterState,
  refundStatPoint,
  respecCharacterStats,
  respecCharacterTalents,
} from "../domain/character/Character";
import { ATTRIBUTE_KEYS, type AttributeKey } from "../domain/character/CharacterStats";
import { xpForLevel } from "../domain/character/Leveling";
import { canAllocateTalent, TALENT_NODES } from "../domain/character/TalentTree";
import type { Localizer } from "../application/i18n/Localizer";
import { Button } from "./components/Button";
import { Panel } from "./components/Panel";
import { createPanelEmblemEl } from "./icons/PanelEmblem";
import { injectStyles } from "./styles";

export interface CharacterScreenOptions {
  readonly loc: Localizer;
  readonly character: CharacterState;
  /** Pauses/resumes camera-look input; called on open(false)/close(true). */
  setInputEnabled?(enabled: boolean): void;
  onCharacterChange?(next: CharacterState): void;
  readonly doc?: Document;
}

export interface CharacterScreenHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  setCharacter(next: CharacterState): void;
  readonly character: CharacterState;
  dispose(): void;
}

type Tab = "attributes" | "talents";

const ATTRIBUTE_NAME_KEY: Readonly<Record<AttributeKey, string>> = {
  vigor: "character.attribute.vigor.name",
  endurance: "character.attribute.endurance.name",
  might: "character.attribute.might.name",
  fortune: "character.attribute.fortune.name",
};
const ATTRIBUTE_DESC_KEY: Readonly<Record<AttributeKey, string>> = {
  vigor: "character.attribute.vigor.desc",
  endurance: "character.attribute.endurance.desc",
  might: "character.attribute.might.desc",
  fortune: "character.attribute.fortune.desc",
};

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountCharacterScreen(opts: CharacterScreenOptions): CharacterScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let character = opts.character;
  let open = false;
  let tab: Tab = "attributes";

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("character.title"));

  const tabs = doc.createElement("div");
  tabs.className = "lw-inv-tabs";
  const attributesTabBtn = doc.createElement("button");
  attributesTabBtn.type = "button";
  attributesTabBtn.className = "laas-ui lw-button";
  attributesTabBtn.textContent = opts.loc.t("character.tab.attributes");
  const talentsTabBtn = doc.createElement("button");
  talentsTabBtn.type = "button";
  talentsTabBtn.className = "laas-ui lw-button";
  talentsTabBtn.dataset.variant = "quiet";
  talentsTabBtn.textContent = opts.loc.t("character.tab.talents");
  tabs.append(attributesTabBtn, talentsTabBtn);

  const closeBtn = Button({
    label: opts.loc.t("character.close"),
    ariaLabel: opts.loc.t("character.close.aria"),
    variant: "quiet",
    onClick: () => close(),
  });

  const header = doc.createElement("div");
  header.className = "lw-inv-header";
  const headerLead = doc.createElement("div");
  headerLead.className = "lw-panel-title-wrap";
  headerLead.append(createPanelEmblemEl(doc, "character"), tabs);
  header.append(headerLead, closeBtn);

  const body = doc.createElement("div");
  body.className = "lw-character-body";

  const panel = Panel([header, body], { className: "lw-inv-overlay-panel" });
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  function setCharacterInternal(next: CharacterState): void {
    character = next;
    opts.onCharacterChange?.(next);
    render();
  }

  function renderAttributes(): HTMLElement {
    const el = doc.createElement("div");
    el.className = "lw-character-attributes";

    const levelLine = doc.createElement("div");
    levelLine.className = "lw-character-level";
    levelLine.textContent = opts.loc.t("character.level.label", { n: character.level.level });
    el.appendChild(levelLine);

    const xpLine = doc.createElement("div");
    xpLine.className = "lw-character-xp";
    xpLine.textContent = opts.loc.t("character.xp.label", {
      current: character.level.xp,
      target: xpForLevel(character.level.level),
    });
    el.appendChild(xpLine);

    const pointsLine = doc.createElement("div");
    pointsLine.className = "lw-character-points";
    pointsLine.textContent = opts.loc.t("character.points.available", {
      n: character.stats.unspentPoints,
    });
    el.appendChild(pointsLine);

    const list = doc.createElement("div");
    list.className = "lw-character-attribute-list";
    list.setAttribute("role", "list");
    for (const attr of ATTRIBUTE_KEYS) {
      const row = doc.createElement("div");
      row.className = "lw-character-attribute";
      row.setAttribute("role", "listitem");
      row.dataset.attribute = attr;

      const info = doc.createElement("div");
      const title = doc.createElement("div");
      title.className = "lw-character-attribute-title";
      title.textContent = `${opts.loc.t(ATTRIBUTE_NAME_KEY[attr])}: ${character.stats.attributes[attr]}`;
      const desc = doc.createElement("div");
      desc.className = "lw-character-attribute-desc";
      desc.textContent = opts.loc.t(ATTRIBUTE_DESC_KEY[attr]);
      info.append(title, desc);

      const actions = doc.createElement("div");
      actions.className = "lw-character-attribute-actions";

      const addBtn = doc.createElement("button");
      addBtn.type = "button";
      addBtn.className = "laas-ui lw-button";
      addBtn.textContent = opts.loc.t("character.attribute.add");
      addBtn.setAttribute(
        "aria-label",
        opts.loc.t("character.attribute.add.aria", { name: opts.loc.t(ATTRIBUTE_NAME_KEY[attr]) }),
      );
      addBtn.disabled = character.stats.unspentPoints <= 0;
      addBtn.addEventListener("click", () => {
        const r = allocateStatPoint(character, attr);
        if (isOk(r)) setCharacterInternal(r.value);
      });

      const removeBtn = doc.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "laas-ui lw-button";
      removeBtn.dataset.variant = "quiet";
      removeBtn.textContent = opts.loc.t("character.attribute.remove");
      removeBtn.setAttribute(
        "aria-label",
        opts.loc.t("character.attribute.remove.aria", { name: opts.loc.t(ATTRIBUTE_NAME_KEY[attr]) }),
      );
      removeBtn.disabled = character.stats.attributes[attr] <= 0;
      removeBtn.addEventListener("click", () => {
        const r = refundStatPoint(character, attr);
        if (isOk(r)) setCharacterInternal(r.value);
      });

      actions.append(addBtn, removeBtn);
      row.append(info, actions);
      list.appendChild(row);
    }
    el.appendChild(list);

    const respecBtn = doc.createElement("button");
    respecBtn.type = "button";
    respecBtn.className = "laas-ui lw-button";
    respecBtn.dataset.variant = "quiet";
    respecBtn.textContent = opts.loc.t("character.respec");
    respecBtn.setAttribute("aria-label", opts.loc.t("character.respec.aria"));
    respecBtn.addEventListener("click", () => setCharacterInternal(respecCharacterStats(character)));
    el.appendChild(respecBtn);

    return el;
  }

  function renderTalents(): HTMLElement {
    const el = doc.createElement("div");
    el.className = "lw-character-talents";

    const pointsLine = doc.createElement("div");
    pointsLine.className = "lw-character-points";
    pointsLine.textContent = opts.loc.t("character.talent.points.available", {
      n: character.talents.unspentPoints,
    });
    el.appendChild(pointsLine);

    const list = doc.createElement("div");
    list.className = "lw-character-talent-list";
    list.setAttribute("role", "list");
    for (const node of TALENT_NODES) {
      const row = doc.createElement("div");
      row.className = "lw-character-talent";
      row.setAttribute("role", "listitem");
      row.dataset.talentId = node.id;
      const allocated = (character.talents.ranks[node.id] ?? 0) > 0;
      row.dataset.allocated = String(allocated);

      const info = doc.createElement("div");
      const title = doc.createElement("div");
      title.className = "lw-character-talent-title";
      title.textContent = opts.loc.t(node.nameKey);
      const desc = doc.createElement("div");
      desc.className = "lw-character-talent-desc";
      desc.textContent = opts.loc.t(node.descKey);
      info.append(title, desc);

      if (!allocated && character.level.level < node.requiredLevel) {
        const lock = doc.createElement("div");
        lock.className = "lw-character-talent-lock";
        lock.textContent = opts.loc.t("character.talent.locked.level", { n: node.requiredLevel });
        info.appendChild(lock);
      } else if (!allocated && node.prereqs.length > 0 && !node.prereqs.every((id) => (character.talents.ranks[id] ?? 0) > 0)) {
        const lock = doc.createElement("div");
        lock.className = "lw-character-talent-lock";
        lock.textContent = opts.loc.t("character.talent.locked.prereqs");
        info.appendChild(lock);
      }

      const learnBtn = doc.createElement("button");
      learnBtn.type = "button";
      learnBtn.className = "laas-ui lw-button";
      learnBtn.textContent = opts.loc.t("character.talent.allocate");
      learnBtn.setAttribute(
        "aria-label",
        opts.loc.t("character.talent.allocate.aria", { name: opts.loc.t(node.nameKey) }),
      );
      learnBtn.disabled =
        allocated || !canAllocateTalent(TALENT_NODES, character.talents, node.id, character.level.level);
      learnBtn.addEventListener("click", () => {
        const r = allocateCharacterTalent(character, node.id);
        if (isOk(r)) setCharacterInternal(r.value);
      });

      row.append(info, learnBtn);
      list.appendChild(row);
    }
    el.appendChild(list);

    const respecBtn = doc.createElement("button");
    respecBtn.type = "button";
    respecBtn.className = "laas-ui lw-button";
    respecBtn.dataset.variant = "quiet";
    respecBtn.textContent = opts.loc.t("character.respec.talents");
    respecBtn.setAttribute("aria-label", opts.loc.t("character.respec.talents.aria"));
    respecBtn.addEventListener("click", () => setCharacterInternal(respecCharacterTalents(character)));
    el.appendChild(respecBtn);

    return el;
  }

  function applyTab(): void {
    attributesTabBtn.dataset.variant = tab === "attributes" ? "" : "quiet";
    attributesTabBtn.setAttribute("aria-selected", String(tab === "attributes"));
    talentsTabBtn.dataset.variant = tab === "talents" ? "" : "quiet";
    talentsTabBtn.setAttribute("aria-selected", String(tab === "talents"));
  }

  function render(): void {
    applyTab();
    body.replaceChildren(tab === "attributes" ? renderAttributes() : renderTalents());
  }

  attributesTabBtn.addEventListener("click", () => {
    tab = "attributes";
    render();
  });
  talentsTabBtn.addEventListener("click", () => {
    tab = "talents";
    render();
  });
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
    if ((e.key === "c" || e.key === "C") && !isTextInput(doc.activeElement)) {
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
    setCharacter(next: CharacterState): void {
      character = next;
      if (open) render();
    },
    get character() {
      return character;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
