import { describe, expect, it } from "vitest";
import { isFirstRun, markLaunched, readFirstRunFlag } from "./firstRun";

describe("isFirstRun", () => {
  it("is true when nothing is stored yet", () => {
    expect(isFirstRun(null)).toBe(true);
  });

  it("is false once the flag was written", () => {
    expect(isFirstRun("1")).toBe(false);
  });
});

describe("markLaunched / readFirstRunFlag", () => {
  it("round-trips through a storage-like object", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readFirstRunFlag(storage)).toBeNull();
    markLaunched(storage);
    expect(readFirstRunFlag(storage)).toBe("1");
  });

  it("degrades to a no-op (never throws) when storage is unavailable", () => {
    const boom = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => markLaunched(boom)).not.toThrow();
    expect(readFirstRunFlag(boom)).toBeNull();
  });
});
