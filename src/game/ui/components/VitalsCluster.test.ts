// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { VitalsCluster } from "./VitalsCluster";

const HEALTH = { id: "health", ariaLabel: "Health", labelText: "HP {n}/{max}", max: 100, initial: 100 };
const STAMINA = { id: "stamina", ariaLabel: "Stamina", labelText: "STA {n}/{max}", max: 100, initial: 100 };

describe("VitalsCluster", () => {
  it("renders one bar per vital spec (extensible beyond health)", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA]);
    expect(cluster.el.querySelectorAll(".lw-bar")).toHaveLength(2);
  });

  it("setTarget + tick updates only the named vital", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA]);
    cluster.setTarget("health", 10);
    for (let i = 0; i < 180; i++) cluster.tick(1 / 60);
    const health = cluster.el.querySelector("#lw-vital-health");
    const stamina = cluster.el.querySelector("#lw-vital-stamina");
    expect(health?.getAttribute("aria-valuenow")).toBe("10");
    expect(stamina?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("isAnyCritical reflects any vital at/below the threshold", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA]);
    expect(cluster.isAnyCritical()).toBe(false);
    cluster.setTarget("health", 10);
    cluster.snap("health");
    expect(cluster.isAnyCritical()).toBe(true);
  });
});
