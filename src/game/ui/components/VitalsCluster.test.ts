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

  // E2.1: bars/orbs layout
  it("defaults to bars layout with every bar shaped 'bar'", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA]);
    expect(cluster.el.dataset.layout).toBe("bars");
    for (const bar of cluster.el.querySelectorAll<HTMLElement>(".lw-bar")) {
      expect(bar.dataset.shape).toBe("bar");
    }
  });

  it("layout: orbs shapes every spec without its own override as 'orb'", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA], { layout: "orbs" });
    expect(cluster.el.dataset.layout).toBe("orbs");
    const health = cluster.el.querySelector<HTMLElement>("#lw-vital-health");
    const stamina = cluster.el.querySelector<HTMLElement>("#lw-vital-stamina");
    expect(health?.dataset.shape).toBe("orb");
    expect(stamina?.dataset.shape).toBe("orb");
  });

  it("a spec's own shape overrides the cluster's orbs default (e.g. hunger stays a bar)", () => {
    const HUNGER = { ...STAMINA, id: "hunger", shape: "bar" as const };
    const cluster = VitalsCluster([HEALTH, HUNGER], { layout: "orbs" });
    expect(cluster.el.querySelector<HTMLElement>("#lw-vital-health")?.dataset.shape).toBe("orb");
    expect(cluster.el.querySelector<HTMLElement>("#lw-vital-hunger")?.dataset.shape).toBe("bar");
  });

  it("without a portrait option, no portrait badge is rendered", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA], { layout: "orbs" });
    expect(cluster.el.querySelector(".lw-orb-portrait")).toBeNull();
  });

  it("renders and updates the level-portrait badge", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA], {
      layout: "orbs",
      portrait: { level: 3, ariaLabel: "Level 3" },
    });
    const badge = cluster.el.querySelector<HTMLElement>(".lw-orb-portrait");
    expect(badge?.textContent).toBe("3");
    expect(badge?.getAttribute("aria-label")).toBe("Level 3");
    cluster.setLevel(4);
    expect(badge?.textContent).toBe("4");
  });

  it("setLevel is a safe no-op with no portrait configured", () => {
    const cluster = VitalsCluster([HEALTH, STAMINA]);
    expect(() => cluster.setLevel(5)).not.toThrow();
  });
});
