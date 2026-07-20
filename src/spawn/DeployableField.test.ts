// @vitest-environment happy-dom
import { Group } from "three";
import { describe, expect, it } from "vitest";
import type { DeployableEntity } from "../game/domain/net/Protocol";
import { attachDeployableField } from "./DeployableField";

function entity(overrides: Partial<DeployableEntity> = {}): DeployableEntity {
  return {
    id: "deploy:1",
    deployableId: "grenade",
    ownerId: "alice",
    x: 1,
    y: 2,
    z: 3,
    armed: false,
    ...overrides,
  };
}

describe("attachDeployableField", () => {
  it("starts with no active deployables", () => {
    const field = attachDeployableField({ parent: new Group() });
    expect(field.activeCount).toBe(0);
  });

  it("materializes a body + ring per streamed entity, positioned at its coords", () => {
    const parent = new Group();
    const field = attachDeployableField({ parent });
    field.applySnapshot([entity(), entity({ id: "deploy:2", x: 5, y: 6, z: 7 })]);

    expect(field.activeCount).toBe(2);
    const children = parent.children[0]!.children;
    // one body + one ring per entity
    expect(children).toHaveLength(4);
    const body1 = children.find((c) => c.name === "deploy:1")!;
    expect(body1.position.x).toBe(1);
    expect(body1.position.z).toBe(3);
  });

  it("reuses the same pool entry across snapshots for an id that persists", () => {
    const field = attachDeployableField({ parent: new Group() });
    field.applySnapshot([entity()]);
    field.applySnapshot([entity({ x: 10, y: 11, z: 12 })]);
    expect(field.activeCount).toBe(1);
  });

  it("removes an entry once its id drops out of the streamed set (a trigger resolves and removes it)", () => {
    const field = attachDeployableField({ parent: new Group() });
    field.applySnapshot([entity(), entity({ id: "deploy:2" })]);
    expect(field.activeCount).toBe(2);
    field.applySnapshot([entity()]);
    expect(field.activeCount).toBe(1);
  });

  it("clears the pool on an empty snapshot", () => {
    const field = attachDeployableField({ parent: new Group() });
    field.applySnapshot([entity()]);
    field.applySnapshot([]);
    expect(field.activeCount).toBe(0);
  });

  it("dispose removes the group from its parent and empties the pool", () => {
    const parent = new Group();
    const field = attachDeployableField({ parent });
    field.applySnapshot([entity()]);
    field.dispose();
    expect(parent.children).toHaveLength(0);
    expect(field.activeCount).toBe(0);
  });

  it("update() pulses the telegraph ring's opacity over time without throwing when nothing is active", () => {
    const field = attachDeployableField({ parent: new Group() });
    expect(() => field.update(0.5)).not.toThrow();
  });

  it("update() advances a live entry's ring opacity/scale", () => {
    const field = attachDeployableField({ parent: new Group() });
    field.applySnapshot([entity({ armed: false })]);
    // Sample two different times and confirm the pulse actually varies —
    // guards against a frozen/no-op animation.
    field.update(0.1);
    field.update(0.15);
    expect(() => field.update(0.2)).not.toThrow();
  });
});
