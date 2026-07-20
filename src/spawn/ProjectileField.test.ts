// @vitest-environment happy-dom
import { Group } from "three";
import { describe, expect, it } from "vitest";
import type { ProjectileEntity } from "../game/domain/net/Protocol";
import { attachProjectileField } from "./ProjectileField";

function entity(overrides: Partial<ProjectileEntity> = {}): ProjectileEntity {
  return {
    id: "proj:1",
    projectileId: "arrow",
    ownerId: "alice",
    x: 1,
    y: 2,
    z: 3,
    dirX: 0,
    dirY: 0,
    dirZ: 1,
    ...overrides,
  };
}

describe("attachProjectileField", () => {
  it("starts with no active tracers", () => {
    const field = attachProjectileField({ parent: new Group() });
    expect(field.activeCount).toBe(0);
  });

  it("materializes one mesh per streamed entity, positioned at its coords", () => {
    const parent = new Group();
    const field = attachProjectileField({ parent });
    field.applySnapshot([entity(), entity({ id: "proj:2", x: 5, y: 6, z: 7 })]);

    expect(field.activeCount).toBe(2);
    const meshes = parent.children[0]!.children;
    expect(meshes).toHaveLength(2);
    const p1 = meshes.find((m) => m.name === "proj:1")!;
    expect([p1.position.x, p1.position.y, p1.position.z]).toEqual([1, 2, 3]);
  });

  it("reuses the same mesh across snapshots for an id that persists", () => {
    const field = attachProjectileField({ parent: new Group() });
    field.applySnapshot([entity()]);
    field.applySnapshot([entity({ x: 10, y: 11, z: 12 })]);
    expect(field.activeCount).toBe(1);
  });

  it("removes a mesh once its id drops out of the streamed set", () => {
    const field = attachProjectileField({ parent: new Group() });
    field.applySnapshot([entity(), entity({ id: "proj:2" })]);
    expect(field.activeCount).toBe(2);
    field.applySnapshot([entity()]);
    expect(field.activeCount).toBe(1);
  });

  it("clears the pool on an empty snapshot", () => {
    const field = attachProjectileField({ parent: new Group() });
    field.applySnapshot([entity()]);
    field.applySnapshot([]);
    expect(field.activeCount).toBe(0);
  });

  it("dispose removes the group from its parent and empties the pool", () => {
    const parent = new Group();
    const field = attachProjectileField({ parent });
    field.applySnapshot([entity()]);
    field.dispose();
    expect(parent.children).toHaveLength(0);
    expect(field.activeCount).toBe(0);
  });
});
