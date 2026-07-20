// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountHandViewmodel } from "./HandViewmodel";

function setPointerLock(el: Element | null): void {
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => el,
  });
}

afterEach(() => setPointerLock(null));

function swingClasses(): string {
  return document.querySelector(".lw-hand-swing")?.className ?? "";
}

describe("mountHandViewmodel", () => {
  it("mounts a decorative, non-interactive viewmodel", () => {
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel({ dom, reducedMotion: () => false });
    expect(document.querySelector(".lw-hand")).not.toBeNull();
    expect(hand.el.getAttribute("aria-hidden")).toBe("true");
    hand.dispose();
  });

  it("swing() applies the dig arc, place() the push, per kind", () => {
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel({ dom, reducedMotion: () => false });
    hand.swing("dig");
    expect(swingClasses()).toContain("lw-hand-swinging");
    expect(swingClasses()).not.toContain("lw-hand-swinging-place");
    hand.swing("place");
    expect(swingClasses()).toContain("lw-hand-swinging-place");
    hand.dispose();
  });

  it("reduced motion swaps the arc for the settle pulse", () => {
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel({ dom, reducedMotion: () => true });
    hand.swing("dig");
    expect(swingClasses()).toContain("lw-hand-pulse");
    expect(swingClasses()).not.toContain("lw-hand-swinging");
    hand.dispose();
  });

  it("a pointer-locked click swings (LMB dig, RMB place)", () => {
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel({ dom, reducedMotion: () => false });
    setPointerLock(dom);
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(swingClasses()).toContain("lw-hand-swinging");
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 2 }));
    expect(swingClasses()).toContain("lw-hand-swinging-place");
    hand.dispose();
    dom.remove();
  });

  it("does NOT swing when the pointer is unlocked (menus/UI in focus)", () => {
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel({ dom, reducedMotion: () => false });
    setPointerLock(null);
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(swingClasses()).toBe("lw-hand-swing");
    hand.dispose();
    dom.remove();
  });

  it("dispose removes the element and detaches the click listener", () => {
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel({ dom, reducedMotion: () => false });
    hand.dispose();
    expect(document.querySelector(".lw-hand")).toBeNull();
    // a post-dispose locked click must not throw or re-create anything
    setPointerLock(dom);
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(document.querySelector(".lw-hand")).toBeNull();
    dom.remove();
  });
});
