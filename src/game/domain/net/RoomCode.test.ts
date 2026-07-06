import { describe, expect, it } from "vitest";
import { isValidRoomCode, makeRoomCode, ROOM_CODE_ALPHABET } from "./RoomCode";

describe("makeRoomCode", () => {
  it("is deterministic for the same worldId + nonce", () => {
    expect(makeRoomCode("world-abc", 42)).toBe(makeRoomCode("world-abc", 42));
  });

  it("differs for different nonces and different worldIds", () => {
    const base = makeRoomCode("world-abc", 42);
    expect(makeRoomCode("world-abc", 43)).not.toBe(base);
    expect(makeRoomCode("world-xyz", 42)).not.toBe(base);
  });

  it("is 8 chars from the unambiguous uppercase alphabet", () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      const code = makeRoomCode("world-abc", nonce);
      expect(code).toHaveLength(8);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it("never contains ambiguous characters 0/O/1/I", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });
});

describe("isValidRoomCode", () => {
  it("accepts a generated code", () => {
    expect(isValidRoomCode(makeRoomCode("w", 7))).toBe(true);
  });

  it("normalizes lowercase input", () => {
    expect(isValidRoomCode(makeRoomCode("w", 7).toLowerCase())).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidRoomCode("ABCDEFG")).toBe(false);
    expect(isValidRoomCode("ABCDEFGHJ")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isValidRoomCode("ABCDEFG0")).toBe(false);
    expect(isValidRoomCode("ABCDEFGO")).toBe(false);
    expect(isValidRoomCode("ABCDEFG!")).toBe(false);
  });
});
