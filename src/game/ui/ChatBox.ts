/**
 * ChatBox — the kid-safe chat surface (E5.5, polished E8.5). A docked,
 * non-modal panel (never blocks gameplay like the Map/Inventory overlays): a
 * bounded scrollback is always visible, and `Enter` opens the input row to
 * type (ignored while another text input already has focus, same guard
 * every other screen uses); `Enter` again submits, `Escape` closes without
 * sending. Mirrors every other overlay's `setInputEnabled` contract while
 * the input is focused, so typing "w" doesn't also walk the player forward.
 *
 * Displays whatever `ChatMessage.text` the host already filtered — this
 * component never re-filters or trusts anything beyond what it's handed.
 *
 * E8.5 additions:
 *  - the composer's text input is the shared `components/Field.ts` primitive.
 *  - `say`/`party` channel switcher is an accessible pill `radiogroup`
 *    (replaces the old `<select>`).
 *  - a small kid-safe canned-emote palette inserts a localized preset phrase
 *    into the draft (never free text) — same send path as anything typed.
 *  - an unread badge appears while the composer is collapsed and a message
 *    arrives; clears when the player opens the composer.
 *  - item-link chips (WIRE-TOUCHING, see `domain/social/ChatItemLink.ts`):
 *    `[[item:<id>]]` tokens in already-filtered chat text are resolved
 *    against an injected `ItemRegistry` and rendered as a rarity-colored,
 *    focusable chip with a `RichTooltip` info card — ONLY when the id
 *    resolves to a real registered item; anything else stays plain text.
 *    `insertItemLink` is the hook a future inventory shift-click wires to
 *    (deferred — see UX_PLAN.md, matching the E8.2/E8.4 slot-wiring
 *    precedent of avoiding a cross-component edit during a parallel slice).
 */

import { isChatChannel, type ChatChannel, type ChatMessage } from "../domain/social/Chat";
import { formatItemLinkToken, parseChatLine } from "../domain/social/ChatItemLink";
import { buildTooltipModel } from "../domain/ui/TooltipModel";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import type { Localizer } from "../application/i18n/Localizer";
import { Field } from "./components/Field";
import { RichTooltip, type RichTooltipHandle } from "./components/RichTooltip";
import { createItemIconEl } from "./icons/ItemIconElement";
import { rarityTierForItemTier } from "./icons/ItemRarity";
import { itemDisplayName } from "./i18n/itemNames";
import { injectStyles } from "./styles";

export interface ChatBoxOptions {
  readonly loc: Localizer;
  /** Pauses/resumes camera-look input while the chat input is focused
   *  (mirrors MapScreen/InventoryScreen's contract) — called false on open,
   *  true on close. */
  setInputEnabled?(enabled: boolean): void;
  /** A validated submission ready to send — text may still be empty/too long
   *  from the UI's point of view; the composition root's net layer applies
   *  the real cap/filter host-side. This is just "the player pressed send". */
  onSubmit(text: string, channel: ChatChannel): void;
  readonly doc?: Document;
  readonly maxScrollback?: number;
  /** Enables item-link chip rendering when present (optional — chat renders
   *  every `[[item:id]]` token as plain text if this isn't wired). The one
   *  wire-touching capability of E8.5: every candidate id is validated
   *  against this registry before it's ever shown as a link. */
  readonly itemRegistry?: ItemRegistry;
}

export interface ChatBoxHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Append a resolved message to the scrollback (bounded, oldest dropped). */
  receiveMessage(msg: ChatMessage): void;
  /** Inserts a `[[item:<id>]]` link token into the draft (opening the
   *  composer if needed) — the hook an inventory shift-click calls. Returns
   *  false and does nothing for an id outside the safe token charset. */
  insertItemLink(itemId: string): boolean;
  dispose(): void;
}

const DEFAULT_MAX_SCROLLBACK = 50;
const UNREAD_DISPLAY_CAP = 9;

const CHAT_CHANNEL_ORDER: readonly ChatChannel[] = ["say", "party"];

/** Fixed, localized, kid-safe canned phrases — never free text. */
const EMOTE_KEYS = [
  "chat.emote.wave",
  "chat.emote.thanks",
  "chat.emote.help",
  "chat.emote.follow",
  "chat.emote.nice",
  "chat.emote.laugh",
] as const;

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountChatBox(opts: ChatBoxOptions): ChatBoxHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);
  const maxScrollback = opts.maxScrollback ?? DEFAULT_MAX_SCROLLBACK;

  let isOpen = false;
  let unreadCount = 0;
  let activeChannel: ChatChannel = "say";
  const scrollback: ChatMessage[] = [];
  let activeTooltips: RichTooltipHandle[] = [];

  const root = doc.createElement("div");
  root.className = "laas-ui lw-chat";
  root.dataset.open = "false";

  const log = doc.createElement("div");
  log.className = "lw-chat-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", opts.loc.t("chat.log.aria"));

  // Unread badge (E8.5) — shown only while the composer is collapsed and a
  // message has arrived unseen; `role="status"` so its count is announced
  // politely without stealing focus. Sits outside `.lw-chat-hint` (which the
  // open-state CSS hides) so its own visibility is fully JS-driven.
  const unreadBadge = doc.createElement("span");
  unreadBadge.className = "lw-chat-unread-badge";
  unreadBadge.setAttribute("role", "status");
  unreadBadge.hidden = true;

  const hint = doc.createElement("p");
  hint.className = "lw-chat-hint";
  hint.textContent = opts.loc.t("chat.hint");

  const form = doc.createElement("form");
  form.className = "lw-chat-form";

  // ---- Channel pills (E8.5) — an accessible radiogroup replacing the
  // plain <select>, active channel highlighted via aria-checked. ----
  const channelGroup = doc.createElement("div");
  channelGroup.className = "lw-chat-channels";
  channelGroup.setAttribute("role", "radiogroup");
  channelGroup.setAttribute("aria-label", opts.loc.t("chat.channel.aria"));

  const channelButtons = new Map<ChatChannel, HTMLButtonElement>();
  const CHANNEL_LABEL_KEY: Record<ChatChannel, string> = {
    say: "chat.channel.say",
    party: "chat.channel.party",
  };
  for (const channel of CHAT_CHANNEL_ORDER) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "lw-chat-channel-pill";
    btn.dataset.channel = channel;
    btn.setAttribute("role", "radio");
    btn.textContent = opts.loc.t(CHANNEL_LABEL_KEY[channel]);
    btn.addEventListener("click", () => selectChannel(channel));
    channelButtons.set(channel, btn);
    channelGroup.append(btn);
  }

  function updateChannelUi(): void {
    for (const [channel, btn] of channelButtons) {
      const active = channel === activeChannel;
      btn.setAttribute("aria-checked", String(active));
      btn.tabIndex = active ? 0 : -1;
    }
  }
  function selectChannel(channel: ChatChannel, focusButton = false): void {
    activeChannel = channel;
    updateChannelUi();
    if (focusButton) channelButtons.get(channel)?.focus();
  }
  channelGroup.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown") return;
    e.preventDefault();
    const idx = CHAT_CHANNEL_ORDER.indexOf(activeChannel);
    const nextIdx = (idx + 1) % CHAT_CHANNEL_ORDER.length;
    selectChannel(CHAT_CHANNEL_ORDER[nextIdx]!, true);
  });
  updateChannelUi();

  // ---- Shared Field primitive for the message composer (E8.5) ----
  const messageField = Field({
    doc,
    label: opts.loc.t("chat.input.aria"),
    labelVisuallyHidden: true,
    placeholder: opts.loc.t("chat.input.placeholder"),
    maxLength: 160,
    inputClassName: "lw-chat-input",
  });
  const input = messageField.input;
  input.autocapitalize = "sentences";

  const composeRow = doc.createElement("div");
  composeRow.className = "lw-chat-compose-row";
  composeRow.append(channelGroup, messageField.root);

  // ---- Kid-safe canned emote palette (E8.5) — fixed, localized phrases
  // only; never free text. Clicking inserts the phrase into the draft. ----
  const emotesGroup = doc.createElement("div");
  emotesGroup.className = "lw-chat-emotes";
  emotesGroup.setAttribute("role", "group");
  emotesGroup.setAttribute("aria-label", opts.loc.t("chat.emotes.aria"));
  for (const key of EMOTE_KEYS) {
    const phrase = opts.loc.t(key);
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "lw-chat-emote-btn";
    btn.textContent = phrase;
    btn.addEventListener("click", () => insertIntoDraft(phrase));
    emotesGroup.append(btn);
  }

  form.append(composeRow, emotesGroup);
  root.append(log, unreadBadge, hint, form);
  doc.body.appendChild(root);

  function disposeActiveTooltips(): void {
    for (const tooltip of activeTooltips) tooltip.dispose();
    activeTooltips = [];
  }

  /** Turns one message's text into DOM nodes, promoting resolved
   *  `[[item:id]]` tokens (see `ChatItemLink.parseChatLine`) into rarity-
   *  colored, tooltip-backed link chips. Falls back to plain text whenever
   *  no `itemRegistry` was wired in. */
  function buildLineNodes(msg: ChatMessage): { nodes: Node[]; tooltips: RichTooltipHandle[] } {
    const nodes: Node[] = [];
    const tooltips: RichTooltipHandle[] = [];
    const registry = opts.itemRegistry;
    const segments = registry
      ? parseChatLine(msg.text, registry)
      : ([{ kind: "text", value: msg.text }] as const);

    for (const seg of segments) {
      if (seg.kind === "text") {
        if (seg.value.length > 0) nodes.push(doc.createTextNode(seg.value));
        continue;
      }
      const rarityTier = rarityTierForItemTier(seg.tier);
      const name = registry ? itemDisplayName(opts.loc, registry, seg.itemId) : seg.displayName;

      const chip = doc.createElement("button");
      chip.type = "button";
      chip.className = "laas-ui lw-chat-item-link";
      chip.dataset.rarity = rarityTier;
      chip.append(createItemIconEl(doc, seg.itemId, name, []), doc.createTextNode(name));
      nodes.push(chip);

      if (registry) {
        const model = buildTooltipModel({
          itemId: seg.itemId,
          registry,
          t: (key, params) => opts.loc.t(key, params),
          rarityTier,
        });
        if (model.ok) tooltips.push(RichTooltip({ doc, anchor: chip, model: model.value }));
      }
    }
    return { nodes, tooltips };
  }

  function renderLog(): void {
    disposeActiveTooltips();
    log.replaceChildren(
      ...scrollback.map((msg) => {
        const line = doc.createElement("div");
        line.className = "lw-chat-line";
        line.dataset.channel = msg.channel;
        const name = doc.createElement("span");
        name.className = "lw-chat-line-name";
        name.textContent = `${msg.senderName}: `;
        const { nodes, tooltips } = buildLineNodes(msg);
        activeTooltips.push(...tooltips);
        line.append(name, ...nodes);
        return line;
      }),
    );
    log.scrollTop = log.scrollHeight;
  }

  function renderUnreadBadge(): void {
    const show = !isOpen && unreadCount > 0;
    unreadBadge.hidden = !show;
    if (!show) return;
    unreadBadge.textContent =
      unreadCount > UNREAD_DISPLAY_CAP ? `${UNREAD_DISPLAY_CAP}+` : String(unreadCount);
    unreadBadge.setAttribute("aria-label", opts.loc.t("chat.unread.aria", { count: unreadCount }));
  }

  function open_(): void {
    if (isOpen) return;
    isOpen = true;
    root.dataset.open = "true";
    unreadCount = 0;
    renderUnreadBadge();
    opts.setInputEnabled?.(false);
    input.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    root.dataset.open = "false";
    input.value = "";
    input.blur();
    opts.setInputEnabled?.(true);
  }

  function submit(): void {
    const text = input.value;
    const channel = isChatChannel(activeChannel) ? activeChannel : "say";
    close();
    if (text.trim().length === 0) return;
    opts.onSubmit(text, channel);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });

  /** Shared by item-link insertion and the emote palette: opens the composer
   *  if needed, appends the given text (space-separated from any existing
   *  draft), and clamps to the input's maxLength. */
  function insertIntoDraft(text: string): void {
    if (!isOpen) open_();
    const current = input.value;
    const separator = current.length > 0 && !current.endsWith(" ") ? " " : "";
    const combined = current + separator + text;
    const cap = input.maxLength > 0 ? input.maxLength : combined.length;
    input.value = combined.slice(0, cap);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      // Enter is handled by the form's native submit — nothing else to do,
      // and every OTHER key types into the focused input normally, never
      // reaching the game (setInputEnabled(false) already paused it).
      return;
    }
    if (e.key !== "Enter") return;
    if (isTextInput(doc.activeElement)) return; // another input already owns Enter
    e.preventDefault();
    open_();
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return isOpen;
    },
    open: open_,
    close,
    receiveMessage(msg: ChatMessage): void {
      scrollback.push(msg);
      while (scrollback.length > maxScrollback) scrollback.shift();
      if (!isOpen) {
        unreadCount++;
        renderUnreadBadge();
      }
      renderLog();
    },
    insertItemLink(itemId: string): boolean {
      const token = formatItemLinkToken(itemId);
      if (!token) return false;
      insertIntoDraft(token);
      return true;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      disposeActiveTooltips();
      root.remove();
    },
  };
}
