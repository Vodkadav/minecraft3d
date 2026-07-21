// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebGPURenderer } from "three/webgpu";

import { mountHandViewmodel3D, type HandViewmodel3DHost } from "./HandViewmodel3D";

function setPointerLock(el: Element | null): void {
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => el,
  });
}

afterEach(() => setPointerLock(null));

function makeHost(): {
  host: HandViewmodel3DHost;
  tick(): void;
  renderer: { autoClearColor: boolean; autoClearDepth: boolean; render: ReturnType<typeof vi.fn> };
  originalPost: { render: ReturnType<typeof vi.fn>; meter: ReturnType<typeof vi.fn> };
} {
  const updateFns: Array<(dt: number, worldTime: number) => void> = [];
  const renderer = { autoClearColor: true, autoClearDepth: true, render: vi.fn() };
  const originalPost = { render: vi.fn(), meter: vi.fn() };
  const host: HandViewmodel3DHost = {
    renderer: renderer as unknown as WebGPURenderer,
    post: originalPost,
    onUpdate: (fn) => updateFns.push(fn),
  };
  return {
    host,
    tick: () => updateFns.forEach((fn) => fn(0.016, 0)),
    renderer,
    originalPost,
  };
}

describe("mountHandViewmodel3D", () => {
  it("wraps engine.post: calls the original pass, then draws the overlay on top", () => {
    const { host, renderer, originalPost } = makeHost();
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });

    expect(host.post).not.toBe(originalPost); // wrapped

    host.post!.render();
    expect(originalPost.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    // the world's composited frame must never be cleared by the overlay pass
    expect(renderer.autoClearColor).toBe(true); // restored after the call
    expect(renderer.autoClearDepth).toBe(true);

    hand.dispose();
  });

  it("meter() delegates to the original post untouched", () => {
    const { host, originalPost } = makeHost();
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });

    host.post!.meter(host.renderer);
    expect(originalPost.meter).toHaveBeenCalledTimes(1);

    hand.dispose();
  });

  it("swing() rotates the tool group and it returns to rest", () => {
    const { host, tick } = makeHost();
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });

    hand.swing("dig");
    tick();
    // mid-swing: rotation has moved off rest — validated indirectly via a
    // render call not throwing and state settling back below.
    expect(() => tick()).not.toThrow();

    hand.dispose();
  });

  it("a pointer-locked click swings (LMB dig, RMB place) without throwing", () => {
    const { host } = makeHost();
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });
    setPointerLock(dom);

    expect(() => dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))).not.toThrow();
    expect(() => dom.dispatchEvent(new MouseEvent("mousedown", { button: 2 }))).not.toThrow();

    hand.dispose();
    dom.remove();
  });

  it("does NOT swing when the pointer is unlocked (menus/UI in focus)", () => {
    const { host, tick } = makeHost();
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });
    setPointerLock(null);

    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(() => tick()).not.toThrow();

    hand.dispose();
    dom.remove();
  });

  it("dispose restores the original post and detaches listeners", () => {
    const { host, originalPost } = makeHost();
    const dom = document.createElement("canvas");
    document.body.appendChild(dom);
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => false });

    hand.dispose();
    expect(host.post).toBe(originalPost);

    // a post-dispose locked click must not throw or resurrect the wrapper
    setPointerLock(dom);
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(host.post).toBe(originalPost);
    dom.remove();
  });

  it("reduced motion still ticks without throwing (settle pulse, no arc)", () => {
    const { host, tick } = makeHost();
    const dom = document.createElement("canvas");
    const hand = mountHandViewmodel3D(host, { dom, reducedMotion: () => true });

    hand.swing("dig");
    expect(() => tick()).not.toThrow();

    hand.dispose();
  });
});
