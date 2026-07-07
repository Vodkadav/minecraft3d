import { describe, expect, it } from "vitest";
import type { CreatureEntity } from "../net/Protocol";
import { reconcileEntities } from "./CreatureStream";

function ent(id: string, x = 0): CreatureEntity {
  return { id, species: "deer", kind: "creature", x, y: 0, z: 0, yaw: 0 };
}

describe("reconcileEntities", () => {
  it("classifies new ids as adds", () => {
    const r = reconcileEntities([], [ent("a"), ent("b")]);
    expect(r.add.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.update).toEqual([]);
    expect(r.remove).toEqual([]);
  });

  it("classifies known ids as updates carrying the fresh transform", () => {
    const r = reconcileEntities(["a"], [ent("a", 9)]);
    expect(r.add).toEqual([]);
    expect(r.update).toEqual([ent("a", 9)]);
    expect(r.remove).toEqual([]);
  });

  it("classifies absent prior ids as removes", () => {
    const r = reconcileEntities(["a", "b"], [ent("a")]);
    expect(r.add).toEqual([]);
    expect(r.update.map((e) => e.id)).toEqual(["a"]);
    expect(r.remove).toEqual(["b"]);
  });

  it("handles a full swap: all new, all old removed", () => {
    const r = reconcileEntities(["a"], [ent("b")]);
    expect(r.add.map((e) => e.id)).toEqual(["b"]);
    expect(r.remove).toEqual(["a"]);
    expect(r.update).toEqual([]);
  });

  it("an empty snapshot removes everything", () => {
    const r = reconcileEntities(["a", "b"], []);
    expect(r.remove).toEqual(["a", "b"]);
    expect(r.add).toEqual([]);
    expect(r.update).toEqual([]);
  });

  it("accepts a Set for prevIds", () => {
    const r = reconcileEntities(new Set(["a"]), [ent("a"), ent("c")]);
    expect(r.add.map((e) => e.id)).toEqual(["c"]);
    expect(r.update.map((e) => e.id)).toEqual(["a"]);
  });
});
