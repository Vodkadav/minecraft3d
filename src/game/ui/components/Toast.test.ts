// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { createLocalizer } from "../i18n/strings";
import { createToastHost } from "./Toast";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("createToastHost", () => {
  it("mounts a labelled, live-region host", () => {
    const host = createToastHost(createLocalizer("en"), { ariaLabel: "Notifications" });
    expect(host.el.getAttribute("role")).toBe("status");
    expect(host.el.getAttribute("aria-live")).toBe("polite");
    expect(host.el.getAttribute("aria-label")).toBe("Notifications");
    host.dispose();
  });

  it("push renders a localized toast", () => {
    const host = createToastHost(createLocalizer("en"), { ariaLabel: "Notifications" });
    host.push("menu.solo");
    expect(host.el.textContent).toContain("Solo (offline)");
    expect(host.state.visible).toHaveLength(1);
    host.dispose();
  });

  it("caps visible toasts and queues overflow", () => {
    const now = 0;
    const host = createToastHost(createLocalizer("en"), {
      ariaLabel: "Notifications",
      now: () => now,
      maxVisible: 1,
    });
    host.push("menu.solo");
    host.push("menu.online");
    expect(host.state.visible).toHaveLength(1);
    expect(host.state.pending).toHaveLength(1);
    host.dispose();
  });

  it("expires a toast after its ttl and promotes the pending one", () => {
    vi.useFakeTimers();
    let now = 0;
    const host = createToastHost(createLocalizer("en"), {
      ariaLabel: "Notifications",
      now: () => now,
      maxVisible: 1,
    });
    host.push("menu.solo", undefined, 100);
    host.push("menu.online");
    expect(host.state.visible.map((t) => t.messageKey)).toEqual(["menu.solo"]);

    now = 200;
    vi.advanceTimersByTime(300);
    expect(host.state.visible.map((t) => t.messageKey)).toEqual(["menu.online"]);

    host.dispose();
    vi.useRealTimers();
  });

  it("renders an item icon when pushed with an iconItemId and a registry", () => {
    const host = createToastHost(createLocalizer("en"), {
      ariaLabel: "Notifications",
      registry: registry(),
    });
    host.push("hud.toast.loot", { name: "Wood", count: 1 }, undefined, "wood");
    expect(host.el.querySelector(".lw-item-icon")).not.toBeNull();
    expect(host.el.querySelector(".lw-toast-text")?.textContent).toContain("Wood");
    host.dispose();
  });

  it("omits the icon when no registry is configured, without breaking the text", () => {
    const host = createToastHost(createLocalizer("en"), { ariaLabel: "Notifications" });
    host.push("hud.toast.loot", { name: "Wood", count: 1 }, undefined, "wood");
    expect(host.el.querySelector(".lw-item-icon")).toBeNull();
    expect(host.el.querySelector(".lw-toast-text")?.textContent).toContain("Wood");
    host.dispose();
  });
});
