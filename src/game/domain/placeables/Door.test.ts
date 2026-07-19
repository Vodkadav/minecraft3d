import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { setLocked, spawnDoor, toggleDoor } from "./Door";

describe("Door", () => {
  it("spawns closed and unlocked", () => {
    const d = spawnDoor();
    expect(d).toEqual({ open: false, ownerId: null, locked: false });
  });

  it("toggles open then closed", () => {
    let d = spawnDoor();
    const r1 = toggleDoor(d, "alice");
    expect(isOk(r1)).toBe(true);
    if (isOk(r1)) d = r1.value;
    expect(d.open).toBe(true);

    const r2 = toggleDoor(d, "alice");
    if (isOk(r2)) d = r2.value;
    expect(d.open).toBe(false);
  });

  it("an unlocked ownerless door opens for anyone", () => {
    const r = toggleDoor(spawnDoor(), "bob");
    expect(isOk(r)).toBe(true);
  });

  it("a locked door rejects a non-owner and stays closed", () => {
    let d = spawnDoor("alice");
    const locked = setLocked(d, true, "alice");
    expect(isOk(locked)).toBe(true);
    if (isOk(locked)) d = locked.value;

    const r = toggleDoor(d, "bob");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "Locked" });
  });

  it("a locked door still opens for its owner", () => {
    let d = spawnDoor("alice");
    const locked = setLocked(d, true, "alice");
    if (isOk(locked)) d = locked.value;

    const r = toggleDoor(d, "alice");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.open).toBe(true);
  });

  it("only the owner can change the lock", () => {
    const d = spawnDoor("alice");
    const r = setLocked(d, true, "bob");
    expect(isErr(r)).toBe(true);
  });

  it("an ownerless door can never be locked", () => {
    const d = spawnDoor(null);
    const r = setLocked(d, true, "alice");
    expect(isErr(r)).toBe(true);
  });
});
