import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  CHAT_MAX_LENGTH,
  buildChatMessage,
  filterChatText,
  isChatChannel,
} from "./Chat";

describe("isChatChannel", () => {
  it("accepts say and party", () => {
    expect(isChatChannel("say")).toBe(true);
    expect(isChatChannel("party")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isChatChannel("guild")).toBe(false);
    expect(isChatChannel(1)).toBe(false);
    expect(isChatChannel(undefined)).toBe(false);
  });
});

describe("filterChatText — profanity masking", () => {
  it("masks a whole-word profanity match with same-length asterisks", () => {
    expect(filterChatText("that is shit")).toBe("that is ****");
  });

  it("masks multiple matches in one message", () => {
    expect(filterChatText("fuck this shit")).toBe("**** this ****");
  });

  it("preserves surrounding punctuation/casing around the match", () => {
    expect(filterChatText("what the hell!")).toBe("what the ****!");
  });

  it("catches simple leet evasion (digit substitution)", () => {
    expect(filterChatText("sh1t happens")).toBe("**** happens");
  });

  it("catches simple leet evasion ($ and @ substitution)", () => {
    expect(filterChatText("you're an a$$")).toBe("you're an ***");
  });

  it("is case-insensitive", () => {
    expect(filterChatText("SHIT happens")).toBe("**** happens");
  });

  it("masks a short profanity word (ass) only as a whole word", () => {
    expect(filterChatText("kick his ass")).toBe("kick his ***");
  });
});

describe("filterChatText — false-positive guards (a11y: don't mangle innocent words)", () => {
  it("does not mangle 'class'", () => {
    expect(filterChatText("let's go to class")).toBe("let's go to class");
  });
  it("does not mangle 'assist'", () => {
    expect(filterChatText("can you assist me")).toBe("can you assist me");
  });
  it("does not mangle 'grass' or 'brass'", () => {
    expect(filterChatText("the grass and the brass bell")).toBe(
      "the grass and the brass bell",
    );
  });
  it("does not mangle 'assassin' (a real creature/enemy word in-game)", () => {
    expect(filterChatText("watch out for the assassin")).toBe(
      "watch out for the assassin",
    );
  });
  it("leaves ordinary friendly chat untouched", () => {
    const text = "hi! want to build a house together?";
    expect(filterChatText(text)).toBe(text);
  });
});

describe("filterChatText — PII redaction", () => {
  it("redacts an email address", () => {
    expect(filterChatText("reach me at kid@example.com ok")).toBe(
      "reach me at [email] ok",
    );
  });

  it("redacts a phone-number-like digit run", () => {
    expect(filterChatText("call me at 555-123-4567")).toBe("call me at [number]");
  });

  it("redacts a phone number without separators", () => {
    expect(filterChatText("my number is 5551234567")).toBe("my number is [number]");
  });

  it("redacts an http(s) URL", () => {
    expect(filterChatText("check out https://example.com/page now")).toBe(
      "check out [link] now",
    );
  });

  it("redacts a www.-prefixed URL", () => {
    expect(filterChatText("go to www.example.com")).toBe("go to [link]");
  });

  it("redacts a bare domain with a known TLD", () => {
    expect(filterChatText("visit example.com today")).toBe("visit [link] today");
  });

  it("does not redact short in-game numbers (item counts, levels)", () => {
    expect(filterChatText("I have 100 gold and I'm level 42")).toBe(
      "I have 100 gold and I'm level 42",
    );
  });

  it("does not redact a 4-digit year-like number", () => {
    expect(filterChatText("born in 2026")).toBe("born in 2026");
  });

  it("does not redact a decimal-looking word without a real TLD", () => {
    expect(filterChatText("version 1.2 is out")).toBe("version 1.2 is out");
  });

  it("redacts PII and masks profanity together", () => {
    expect(filterChatText("email me at kid@example.com you shit")).toBe(
      "email me at [email] you ****",
    );
  });
});

describe("buildChatMessage", () => {
  const base = {
    senderPeerId: "peer-1",
    senderName: "Robin",
    channel: "say" as const,
    timestamp: 1000,
  };

  it("builds a valid message with filtered text", () => {
    const r = buildChatMessage({ ...base, text: "hello there!" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toEqual({
        senderPeerId: "peer-1",
        senderName: "Robin",
        text: "hello there!",
        channel: "say",
        timestamp: 1000,
      });
    }
  });

  it("trims whitespace", () => {
    const r = buildChatMessage({ ...base, text: "  hi  " });
    expect(isOk(r) && r.value.text).toBe("hi");
  });

  it("filters profanity/PII before returning", () => {
    const r = buildChatMessage({ ...base, text: "damn it, email me kid@example.com" });
    expect(isOk(r) && r.value.text).toBe("**** it, email me [email]");
  });

  it("rejects empty text", () => {
    const r = buildChatMessage({ ...base, text: "" });
    expect(isErr(r) && r.error.kind).toBe("Empty");
  });

  it("rejects whitespace-only text", () => {
    const r = buildChatMessage({ ...base, text: "   " });
    expect(isErr(r) && r.error.kind).toBe("Empty");
  });

  it("rejects text over the hard cap", () => {
    const tooLong = "a".repeat(CHAT_MAX_LENGTH + 1);
    const r = buildChatMessage({ ...base, text: tooLong });
    expect(isErr(r) && r.error.kind).toBe("TooLong");
  });

  it("accepts text exactly at the cap", () => {
    const exact = "a".repeat(CHAT_MAX_LENGTH);
    const r = buildChatMessage({ ...base, text: exact });
    expect(isOk(r)).toBe(true);
  });

  it("preserves the channel", () => {
    const r = buildChatMessage({ ...base, channel: "party", text: "hi team" });
    expect(isOk(r) && r.value.channel).toBe("party");
  });
});
