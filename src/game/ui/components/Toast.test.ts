// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createLocalizer } from "../i18n/strings";
import { createToastHost } from "./Toast";

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
});
