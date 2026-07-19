import { describe, expect, it } from "vitest";
import {
  deserializePlaceableStore,
  emptyPlaceableStore,
  getPlaceable,
  removePlaceable,
  setPlaceableState,
  upsertPlaceable,
} from "./PlaceableStore";

describe("PlaceableStore", () => {
  it("starts empty", () => {
    expect(getPlaceable(emptyPlaceableStore(), "1")).toBeNull();
  });

  it("upserts and retrieves a record", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "door", { open: false });
    expect(getPlaceable(store, "1")).toEqual({ pieceId: "door", state: { open: false } });
  });

  it("replaces state without touching the pieceId", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "door", { open: false });
    const next = setPlaceableState(store, "1", { open: true });
    expect(getPlaceable(next, "1")).toEqual({ pieceId: "door", state: { open: true } });
  });

  it("setPlaceableState is a no-op (same ref) for an unknown id", () => {
    const store = emptyPlaceableStore();
    expect(setPlaceableState(store, "ghost", { x: 1 })).toBe(store);
  });

  it("removes a record", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "door", { open: false });
    const next = removePlaceable(store, "1");
    expect(getPlaceable(next, "1")).toBeNull();
  });

  it("removePlaceable is a no-op (same ref) for an unknown id", () => {
    const store = emptyPlaceableStore();
    expect(removePlaceable(store, "ghost")).toBe(store);
  });

  it("round-trips through serialize/deserialize", () => {
    let store = emptyPlaceableStore();
    store = upsertPlaceable(store, "1", "door", { open: true, ownerId: null, locked: false });
    store = upsertPlaceable(store, "2", "chest", { capacity: 20, slots: [] });
    const revived = deserializePlaceableStore(JSON.parse(JSON.stringify(store)));
    expect(revived).toEqual(store);
  });

  it("deserialize degrades gracefully on garbage", () => {
    expect(deserializePlaceableStore(undefined)).toEqual({});
    expect(deserializePlaceableStore(null)).toEqual({});
    expect(deserializePlaceableStore("nope")).toEqual({});
    expect(deserializePlaceableStore([1, 2, 3])).toEqual({});
  });

  it("deserialize skips malformed individual entries", () => {
    const revived = deserializePlaceableStore({
      good: { pieceId: "door", state: { open: false } },
      bad1: { state: { open: false } },
      bad2: { pieceId: "door" },
      bad3: "nope",
    });
    expect(revived).toEqual({ good: { pieceId: "door", state: { open: false } } });
  });
});
