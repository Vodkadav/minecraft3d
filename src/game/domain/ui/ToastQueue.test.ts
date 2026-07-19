import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_VISIBLE,
  dismissToast,
  emptyToastQueue,
  enqueueToast,
  expireToasts,
  type ToastItem,
} from "./ToastQueue";

function toast(id: string, opts: Partial<ToastItem> = {}): ToastItem {
  return {
    id,
    messageKey: opts.messageKey ?? `msg.${id}`,
    createdAt: opts.createdAt ?? 0,
    ttlMs: opts.ttlMs ?? 1000,
    ...opts,
  };
}

describe("ToastQueue", () => {
  it("starts empty", () => {
    const s = emptyToastQueue();
    expect(s.visible).toEqual([]);
    expect(s.pending).toEqual([]);
  });

  it("enqueues into visible until the max-visible cap", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a"), 2);
    s = enqueueToast(s, toast("b"), 2);
    expect(s.visible.map((t) => t.id)).toEqual(["a", "b"]);
    expect(s.pending).toEqual([]);
  });

  it("queues overflow into pending, FIFO", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a"), 1);
    s = enqueueToast(s, toast("b"), 1);
    s = enqueueToast(s, toast("c"), 1);
    expect(s.visible.map((t) => t.id)).toEqual(["a"]);
    expect(s.pending.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("dedupes a repeat of the same messageKey while visible — refreshes instead of duplicating", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a", { messageKey: "loot.wood", createdAt: 0 }), 3);
    s = enqueueToast(s, toast("a2", { messageKey: "loot.wood", createdAt: 500 }), 3);
    expect(s.visible).toHaveLength(1);
    expect(s.visible[0]!.createdAt).toBe(500);
    // dedup preserves the original queue-slot id, not the new one
    expect(s.visible[0]!.id).toBe("a");
  });

  it("dedupes a repeat of the same messageKey while pending", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a", { messageKey: "x" }), 1);
    s = enqueueToast(s, toast("b", { messageKey: "y", createdAt: 1 }), 1);
    s = enqueueToast(s, toast("c", { messageKey: "y", createdAt: 2 }), 1);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]!.createdAt).toBe(2);
  });

  it("a distinct dedupeKey lets the same messageKey queue separately", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a", { messageKey: "loot", dedupeKey: "loot-wood" }), 3);
    s = enqueueToast(s, toast("b", { messageKey: "loot", dedupeKey: "loot-stone" }), 3);
    expect(s.visible).toHaveLength(2);
  });

  it("expireToasts drops expired visible toasts and promotes pending FIFO", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a", { createdAt: 0, ttlMs: 100 }), 1);
    s = enqueueToast(s, toast("b", { createdAt: 50, ttlMs: 100 }), 1);
    s = expireToasts(s, 150, 1);
    expect(s.visible.map((t) => t.id)).toEqual(["b"]);
    expect(s.pending).toEqual([]);
  });

  it("expireToasts keeps unexpired toasts and leaves pending untouched when no room frees up", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a", { createdAt: 0, ttlMs: 1000 }), 1);
    s = enqueueToast(s, toast("b", { createdAt: 0, ttlMs: 1000 }), 1);
    s = expireToasts(s, 10, 1);
    expect(s.visible.map((t) => t.id)).toEqual(["a"]);
    expect(s.pending.map((t) => t.id)).toEqual(["b"]);
  });

  it("dismissToast removes a visible toast immediately and promotes the oldest pending", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a"), 1);
    s = enqueueToast(s, toast("b"), 1);
    s = dismissToast(s, "a");
    expect(s.visible.map((t) => t.id)).toEqual(["b"]);
    expect(s.pending).toEqual([]);
  });

  it("dismissToast removes a pending toast without touching visible", () => {
    let s = emptyToastQueue();
    s = enqueueToast(s, toast("a"), 1);
    s = enqueueToast(s, toast("b"), 1);
    s = dismissToast(s, "b");
    expect(s.visible.map((t) => t.id)).toEqual(["a"]);
    expect(s.pending).toEqual([]);
  });

  it("uses DEFAULT_MAX_VISIBLE when no cap is given", () => {
    let s = emptyToastQueue();
    for (let i = 0; i < DEFAULT_MAX_VISIBLE + 1; i++) s = enqueueToast(s, toast(`t${i}`));
    expect(s.visible).toHaveLength(DEFAULT_MAX_VISIBLE);
    expect(s.pending).toHaveLength(1);
  });
});
