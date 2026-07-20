/**
 * Pure toast/notification queue (Workstream 3, HUD). A toast is a declarative
 * intent ("item acquired", "recipe unlocked") the UI layer renders; this
 * module owns only the queueing rules — enqueue, dedup, expiry, and the
 * max-visible cap — so they're testable without touching the DOM.
 *
 * Dedup: re-enqueuing the same `dedupeKey` while it's already queued (visible
 * or pending) refreshes its timer in place instead of growing the queue —
 * e.g. picking up the same item repeatedly shows one toast, not a flood.
 */

export interface ToastItem {
  readonly id: string;
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** Defaults to `messageKey` — pass a distinct key when the same message
   *  text should still queue separately (e.g. per-item toasts). */
  readonly dedupeKey?: string;
  readonly createdAt: number;
  readonly ttlMs: number;
  /** Present iff this toast is about a specific item (loot/eat) — the UI
   *  layer renders a small procedural item icon beside the text (Phase E6.7). */
  readonly iconItemId?: string;
}

export interface ToastQueueState {
  readonly visible: readonly ToastItem[];
  readonly pending: readonly ToastItem[];
}

export const DEFAULT_MAX_VISIBLE = 3;

export function emptyToastQueue(): ToastQueueState {
  return { visible: [], pending: [] };
}

function keyOf(item: ToastItem): string {
  return item.dedupeKey ?? item.messageKey;
}

export function enqueueToast(
  state: ToastQueueState,
  item: ToastItem,
  maxVisible = DEFAULT_MAX_VISIBLE,
): ToastQueueState {
  const key = keyOf(item);

  const visibleIdx = state.visible.findIndex((t) => keyOf(t) === key);
  if (visibleIdx !== -1) {
    const visible = [...state.visible];
    visible[visibleIdx] = { ...item, id: state.visible[visibleIdx]!.id };
    return { visible, pending: state.pending };
  }

  const pendingIdx = state.pending.findIndex((t) => keyOf(t) === key);
  if (pendingIdx !== -1) {
    const pending = [...state.pending];
    pending[pendingIdx] = { ...item, id: state.pending[pendingIdx]!.id };
    return { visible: state.visible, pending };
  }

  if (state.visible.length < maxVisible) {
    return { visible: [...state.visible, item], pending: state.pending };
  }
  return { visible: state.visible, pending: [...state.pending, item] };
}

export function dismissToast(state: ToastQueueState, id: string): ToastQueueState {
  const wasVisible = state.visible.some((t) => t.id === id);
  if (!wasVisible) {
    return { visible: state.visible, pending: state.pending.filter((t) => t.id !== id) };
  }
  const visible = state.visible.filter((t) => t.id !== id);
  const [promoted, ...pending] = state.pending;
  return { visible: promoted ? [...visible, promoted] : visible, pending };
}

/** Drop visible toasts whose ttl has elapsed as of `now`, promoting the
 *  oldest pending toasts (FIFO) into the vacated slots. */
export function expireToasts(
  state: ToastQueueState,
  now: number,
  maxVisible = DEFAULT_MAX_VISIBLE,
): ToastQueueState {
  const visible = state.visible.filter((t) => t.createdAt + t.ttlMs > now);
  const freed = maxVisible - visible.length;
  if (freed <= 0) return { visible, pending: state.pending };
  const promoted = state.pending.slice(0, freed);
  const pending = state.pending.slice(freed);
  return { visible: [...visible, ...promoted], pending };
}
