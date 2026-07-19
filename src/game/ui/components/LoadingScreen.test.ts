// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalizer } from "../i18n/strings";
import { mountLoadingScreen } from "./LoadingScreen";

describe("mountLoadingScreen", () => {
  let boot: HTMLDivElement;

  beforeEach(() => {
    boot = document.createElement("div");
    boot.id = "boot";
    document.body.appendChild(boot);
  });

  afterEach(() => {
    boot.remove();
  });

  it("mounts a labelled, live-region tip line under #boot with a real translated tip", () => {
    const screen = mountLoadingScreen(createLocalizer("en"), { reducedMotion: () => true });
    const tip = boot.querySelector("#boot-tip");
    expect(tip?.getAttribute("aria-live")).toBe("polite");
    expect(tip?.textContent?.length ?? 0).toBeGreaterThan(0);
    screen.dispose();
  });

  it("rotates through tips over time when motion is not reduced", () => {
    vi.useFakeTimers();
    const screen = mountLoadingScreen(createLocalizer("en"), {
      reducedMotion: () => false,
      intervalMs: 1000,
    });
    const first = boot.querySelector("#boot-tip")?.textContent;
    vi.advanceTimersByTime(1000);
    const second = boot.querySelector("#boot-tip")?.textContent;
    expect(second).not.toBe(first);
    screen.dispose();
    vi.useRealTimers();
  });

  it("respects reduced motion — never advances past the first tip", () => {
    vi.useFakeTimers();
    const screen = mountLoadingScreen(createLocalizer("en"), {
      reducedMotion: () => true,
      intervalMs: 1000,
    });
    const first = boot.querySelector("#boot-tip")?.textContent;
    vi.advanceTimersByTime(10000);
    const second = boot.querySelector("#boot-tip")?.textContent;
    expect(second).toBe(first);
    screen.dispose();
    vi.useRealTimers();
  });

  it("localizes through the given Localizer (ES)", () => {
    const screen = mountLoadingScreen(createLocalizer("es"), { reducedMotion: () => true });
    const tip = boot.querySelector("#boot-tip");
    expect(tip?.textContent).toBe("Pulsa E para recolectar un nodo o una planta.");
    screen.dispose();
  });

  it("dispose removes the tip element and stops the timer", () => {
    vi.useFakeTimers();
    const screen = mountLoadingScreen(createLocalizer("en"), {
      reducedMotion: () => false,
      intervalMs: 1000,
    });
    screen.dispose();
    expect(boot.querySelector("#boot-tip")).toBeNull();
    // advancing timers after dispose must not throw or touch a removed element
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();
  });

  it("is a no-op when the root element is missing (no throw)", () => {
    const screen = mountLoadingScreen(createLocalizer("en"), { root: null });
    expect(() => screen.dispose()).not.toThrow();
  });
});
