// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../domain/social/Chat";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import { createLocalizer } from "./i18n/strings";
import { mountChatBox } from "./ChatBox";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    senderPeerId: "alice",
    senderName: "Alice",
    text: "hello!",
    channel: "say",
    timestamp: 1000,
    ...overrides,
  };
}

function testRegistry(): ItemRegistry {
  const result = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: ["natural"], tier: 0 },
    { id: "iron_sword", displayName: "Iron Sword", maxStackSize: 1, tags: ["weapon"], tier: 3 },
  ]);
  if (!result.ok) throw new Error("bad fixture registry");
  return result.value;
}

function clickChannelPill(channel: "say" | "party"): void {
  const btn = document.querySelector<HTMLButtonElement>(`.lw-chat-channel-pill[data-channel="${channel}"]`);
  btn?.click();
}

describe("mountChatBox", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("starts closed with the input form hidden", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
    expect(box.isOpen).toBe(false);
    expect(document.querySelector(".lw-chat")?.getAttribute("data-open")).toBe("false");
    box.dispose();
  });

  it("pressing Enter opens the input and pauses camera input", () => {
    const setInputEnabled = vi.fn();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), setInputEnabled });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(box.isOpen).toBe(true);
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    box.dispose();
  });

  it("ignores the Enter shortcut while a text input has focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(box.isOpen).toBe(false);
    box.dispose();
    input.remove();
  });

  it("Escape closes without submitting", () => {
    const onSubmit = vi.fn();
    const setInputEnabled = vi.fn();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit, setInputEnabled });
    box.open();
    const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
    if (input) input.value = "never sent";

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(box.isOpen).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    box.dispose();
  });

  it("submitting the form calls onSubmit with the typed text and default (say) channel, then closes", () => {
    const onSubmit = vi.fn();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit });
    box.open();
    const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
    if (input) input.value = "hi there";
    const form = document.querySelector<HTMLFormElement>(".lw-chat-form");

    form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("hi there", "say");
    expect(box.isOpen).toBe(false);
    box.dispose();
  });

  it("submitting an empty/whitespace-only draft does not call onSubmit", () => {
    const onSubmit = vi.fn();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit });
    box.open();
    const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
    if (input) input.value = "   ";
    const form = document.querySelector<HTMLFormElement>(".lw-chat-form");

    form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box.isOpen).toBe(false);
  });

  it("clears the draft on close (submitted or escaped)", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
    box.open();
    const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
    if (input) input.value = "draft text";
    box.close();
    expect(input?.value).toBe("");
    box.dispose();
  });

  it("receiveMessage appends a rendered line showing sender name + already-filtered text", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
    box.receiveMessage(message({ senderName: "Robin", text: "hi ****" }));

    const line = document.querySelector(".lw-chat-line");
    expect(line?.textContent).toBe("Robin: hi ****");
    box.dispose();
  });

  it("bounds scrollback to the configured max, dropping the oldest first", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), maxScrollback: 3 });
    for (let i = 0; i < 5; i++) box.receiveMessage(message({ text: `msg ${i}` }));

    const lines = Array.from(document.querySelectorAll(".lw-chat-line")).map((l) => l.textContent);
    expect(lines).toEqual(["Alice: msg 2", "Alice: msg 3", "Alice: msg 4"]);
    box.dispose();
  });

  it("tags a party message with data-channel=party for styling", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
    box.receiveMessage(message({ channel: "party" }));

    expect(document.querySelector(".lw-chat-line")?.getAttribute("data-channel")).toBe("party");
    box.dispose();
  });

  it("dispose removes the panel from the document", () => {
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
    box.dispose();
    expect(document.querySelector(".lw-chat")).toBeNull();
  });

  // ---- E8.5: channel pills ----
  describe("channel pills", () => {
    it("renders a say/party radiogroup with say active by default", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      const group = document.querySelector('[role="radiogroup"]');
      expect(group).not.toBeNull();
      const say = document.querySelector('.lw-chat-channel-pill[data-channel="say"]');
      const party = document.querySelector('.lw-chat-channel-pill[data-channel="party"]');
      expect(say?.getAttribute("aria-checked")).toBe("true");
      expect(party?.getAttribute("aria-checked")).toBe("false");
      box.dispose();
    });

    it("clicking the party pill switches the active channel used on submit", () => {
      const onSubmit = vi.fn();
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit });
      box.open();
      clickChannelPill("party");
      const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
      if (input) input.value = "for the group";
      document.querySelector<HTMLFormElement>(".lw-chat-form")?.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true }),
      );

      expect(onSubmit).toHaveBeenCalledExactlyOnceWith("for the group", "party");
      box.dispose();
    });

    it("ArrowRight/ArrowLeft toggles between the two channels", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      const group = document.querySelector<HTMLElement>(".lw-chat-channels");
      group?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

      const party = document.querySelector('.lw-chat-channel-pill[data-channel="party"]');
      expect(party?.getAttribute("aria-checked")).toBe("true");
      box.dispose();
    });
  });

  // ---- E8.5: unread badge ----
  describe("unread badge", () => {
    it("stays hidden while no messages have arrived", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      const badge = document.querySelector<HTMLElement>(".lw-chat-unread-badge");
      expect(badge?.hidden).toBe(true);
      box.dispose();
    });

    it("shows a count when a message arrives while the composer is collapsed", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      box.receiveMessage(message());
      box.receiveMessage(message());

      const badge = document.querySelector<HTMLElement>(".lw-chat-unread-badge");
      expect(badge?.hidden).toBe(false);
      expect(badge?.textContent).toBe("2");
      box.dispose();
    });

    it("does not accumulate unread while the composer is already open", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      box.open();
      box.receiveMessage(message());

      const badge = document.querySelector<HTMLElement>(".lw-chat-unread-badge");
      expect(badge?.hidden).toBe(true);
      box.dispose();
    });

    it("clears when the composer is opened", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      box.receiveMessage(message());
      box.open();

      const badge = document.querySelector<HTMLElement>(".lw-chat-unread-badge");
      expect(badge?.hidden).toBe(true);
      box.dispose();
    });
  });

  // ---- E8.5: kid-safe canned emote palette ----
  describe("emote palette", () => {
    it("renders a fixed set of localized emote buttons in a labelled group", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      const group = document.querySelector('[role="group"].lw-chat-emotes');
      const buttons = document.querySelectorAll(".lw-chat-emote-btn");
      expect(group).not.toBeNull();
      expect(buttons.length).toBeGreaterThanOrEqual(4);
      box.dispose();
    });

    it("clicking an emote inserts its canned phrase into the draft and opens the composer", () => {
      const setInputEnabled = vi.fn();
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), setInputEnabled });
      const btn = document.querySelector<HTMLButtonElement>(".lw-chat-emote-btn");
      const phrase = btn?.textContent ?? "";
      btn?.click();

      expect(box.isOpen).toBe(true);
      const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
      expect(input?.value).toBe(phrase);
      box.dispose();
    });
  });

  // ---- E8.5: item-link chips (the one wire-touching surface) ----
  describe("item-link chips", () => {
    it("renders a resolved [[item:id]] token as a rarity-colored chip when itemRegistry is wired", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), itemRegistry: testRegistry() });
      box.receiveMessage(message({ text: "check out my [[item:iron_sword]] !" }));

      const chip = document.querySelector<HTMLButtonElement>(".lw-chat-item-link");
      expect(chip).not.toBeNull();
      expect(chip?.dataset.rarity).toBe("epic"); // tier 3 -> epic on the E8.0 scale
      expect(chip?.textContent).toContain("Iron Sword");
      box.dispose();
    });

    it("never renders a chip for an id that doesn't resolve in the registry", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), itemRegistry: testRegistry() });
      box.receiveMessage(message({ text: "got a [[item:does_not_exist]] today" }));

      expect(document.querySelector(".lw-chat-item-link")).toBeNull();
      const line = document.querySelector(".lw-chat-line");
      expect(line?.textContent).toBe("Alice: got a [[item:does_not_exist]] today");
      box.dispose();
    });

    it("never renders a chip when no itemRegistry is wired, even for a well-formed token", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      box.receiveMessage(message({ text: "[[item:iron_sword]]" }));

      expect(document.querySelector(".lw-chat-item-link")).toBeNull();
      expect(document.querySelector(".lw-chat-line")?.textContent).toBe("Alice: [[item:iron_sword]]");
      box.dispose();
    });

    it("insertItemLink opens the composer and inserts a formatted token for a real id", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn(), itemRegistry: testRegistry() });
      const inserted = box.insertItemLink("iron_sword");

      expect(inserted).toBe(true);
      expect(box.isOpen).toBe(true);
      const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
      expect(input?.value).toBe("[[item:iron_sword]]");
      box.dispose();
    });

    it("insertItemLink rejects an id outside the safe token charset and does nothing", () => {
      const box = mountChatBox({ loc: createLocalizer("en"), onSubmit: vi.fn() });
      const inserted = box.insertItemLink("bad id; drop");

      expect(inserted).toBe(false);
      expect(box.isOpen).toBe(false);
      box.dispose();
    });
  });
});
