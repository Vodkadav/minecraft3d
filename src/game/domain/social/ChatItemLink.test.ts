import { describe, expect, it } from "vitest";
import { ItemRegistry } from "../items/ItemRegistry";
import { formatItemLinkToken, parseChatLine } from "./ChatItemLink";

function registry(): ItemRegistry {
  const result = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: ["natural"], tier: 0 },
    { id: "iron_sword", displayName: "Iron Sword", maxStackSize: 1, tags: ["weapon"], tier: 3 },
  ]);
  if (!result.ok) throw new Error("bad fixture registry");
  return result.value;
}

describe("parseChatLine", () => {
  it("returns a single text segment when the line has no tokens", () => {
    expect(parseChatLine("hello there!", registry())).toEqual([
      { kind: "text", value: "hello there!" },
    ]);
  });

  it("resolves a well-formed token for a real registered item into an itemLink segment", () => {
    expect(parseChatLine("check out my [[item:iron_sword]] !", registry())).toEqual([
      { kind: "text", value: "check out my " },
      { kind: "itemLink", itemId: "iron_sword", displayName: "Iron Sword", tier: 3 },
      { kind: "text", value: " !" },
    ]);
  });

  it("degrades an unknown/stale item id to literal text, never a link", () => {
    expect(parseChatLine("got a [[item:does_not_exist]] today", registry())).toEqual([
      { kind: "text", value: "got a " },
      { kind: "text", value: "[[item:does_not_exist]]" },
      { kind: "text", value: " today" },
    ]);
  });

  it("never matches a token containing characters outside the safe id charset (injection attempt)", () => {
    const text = "nice [[item:<script>alert(1)</script>]] right";
    const result = parseChatLine(text, registry());
    // No valid token shape inside the brackets means the whole string is
    // just ordinary text — nothing is parsed out or specially rendered.
    expect(result).toEqual([{ kind: "text", value: text }]);
  });

  it("handles back-to-back tokens with no text segment in between", () => {
    expect(parseChatLine("[[item:wood]][[item:iron_sword]]", registry())).toEqual([
      { kind: "itemLink", itemId: "wood", displayName: "Wood", tier: 0 },
      { kind: "itemLink", itemId: "iron_sword", displayName: "Iron Sword", tier: 3 },
    ]);
  });

  it("leaves an unterminated/malformed token as plain text", () => {
    const text = "no closing [[item:wood brackets here";
    expect(parseChatLine(text, registry())).toEqual([{ kind: "text", value: text }]);
  });
});

describe("formatItemLinkToken", () => {
  it("builds a bracket token for a safe-charset id", () => {
    expect(formatItemLinkToken("iron_sword")).toBe("[[item:iron_sword]]");
  });

  it("rejects an id containing characters outside the safe charset", () => {
    expect(formatItemLinkToken("bad id; drop")).toBeUndefined();
    expect(formatItemLinkToken("")).toBeUndefined();
    expect(formatItemLinkToken("a".repeat(65))).toBeUndefined();
  });
});
