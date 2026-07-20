/**
 * ChatBox — the kid-safe chat surface (E5.5). A docked, non-modal panel
 * (never blocks gameplay like the Map/Inventory overlays): a bounded
 * scrollback is always visible, and `Enter` opens the input row to type
 * (ignored while another text input already has focus, same guard every
 * other screen uses); `Enter` again submits, `Escape` closes without
 * sending. Mirrors every other overlay's `setInputEnabled` contract while
 * the input is focused, so typing "w" doesn't also walk the player forward.
 *
 * Displays whatever `ChatMessage.text` the host already filtered — this
 * component never re-filters or trusts anything beyond what it's handed.
 */

import { isChatChannel, type ChatChannel, type ChatMessage } from "../domain/social/Chat";
import type { Localizer } from "../application/i18n/Localizer";
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
}

export interface ChatBoxHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Append a resolved message to the scrollback (bounded, oldest dropped). */
  receiveMessage(msg: ChatMessage): void;
  dispose(): void;
}

const DEFAULT_MAX_SCROLLBACK = 50;

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountChatBox(opts: ChatBoxOptions): ChatBoxHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);
  const maxScrollback = opts.maxScrollback ?? DEFAULT_MAX_SCROLLBACK;

  let open = false;
  const scrollback: ChatMessage[] = [];

  const root = doc.createElement("div");
  root.className = "laas-ui lw-chat";
  root.dataset.open = "false";

  const log = doc.createElement("div");
  log.className = "lw-chat-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", opts.loc.t("chat.log.aria"));

  const hint = doc.createElement("p");
  hint.className = "lw-chat-hint";
  hint.textContent = opts.loc.t("chat.hint");

  const form = doc.createElement("form");
  form.className = "lw-chat-form";

  const channelSelect = doc.createElement("select");
  channelSelect.className = "lw-chat-channel";
  channelSelect.setAttribute("aria-label", opts.loc.t("chat.channel.aria"));
  const sayOption = doc.createElement("option");
  sayOption.value = "say";
  sayOption.textContent = opts.loc.t("chat.channel.say");
  const partyOption = doc.createElement("option");
  partyOption.value = "party";
  partyOption.textContent = opts.loc.t("chat.channel.party");
  channelSelect.append(sayOption, partyOption);

  const input = doc.createElement("input");
  input.type = "text";
  input.className = "lw-chat-input";
  input.maxLength = 160;
  input.setAttribute("aria-label", opts.loc.t("chat.input.aria"));
  input.placeholder = opts.loc.t("chat.input.placeholder");

  form.append(channelSelect, input);
  root.append(log, hint, form);
  doc.body.appendChild(root);

  function renderLog(): void {
    log.replaceChildren(
      ...scrollback.map((msg) => {
        const line = doc.createElement("div");
        line.className = "lw-chat-line";
        line.dataset.channel = msg.channel;
        const name = doc.createElement("span");
        name.className = "lw-chat-line-name";
        name.textContent = `${msg.senderName}: `;
        line.append(name, doc.createTextNode(msg.text));
        return line;
      }),
    );
    log.scrollTop = log.scrollHeight;
  }

  function open_(): void {
    if (open) return;
    open = true;
    root.dataset.open = "true";
    opts.setInputEnabled?.(false);
    input.focus();
  }

  function close(): void {
    if (!open) return;
    open = false;
    root.dataset.open = "false";
    input.value = "";
    input.blur();
    opts.setInputEnabled?.(true);
  }

  function submit(): void {
    const text = input.value;
    const channel = isChatChannel(channelSelect.value) ? channelSelect.value : "say";
    close();
    if (text.trim().length === 0) return;
    opts.onSubmit(text, channel);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });

  function onKeyDown(e: KeyboardEvent): void {
    if (open) {
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
      return open;
    },
    open: open_,
    close,
    receiveMessage(msg: ChatMessage): void {
      scrollback.push(msg);
      while (scrollback.length > maxScrollback) scrollback.shift();
      renderLog();
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
