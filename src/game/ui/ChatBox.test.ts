// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../domain/social/Chat";
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

  it("submitting the form calls onSubmit with the typed text and selected channel, then closes", () => {
    const onSubmit = vi.fn();
    const box = mountChatBox({ loc: createLocalizer("en"), onSubmit });
    box.open();
    const input = document.querySelector<HTMLInputElement>(".lw-chat-input");
    const select = document.querySelector<HTMLSelectElement>(".lw-chat-channel");
    if (input) input.value = "hi there";
    if (select) select.value = "party";
    const form = document.querySelector<HTMLFormElement>(".lw-chat-form");

    form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("hi there", "party");
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
});
