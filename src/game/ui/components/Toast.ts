/**
 * Toast host — thin DOM renderer over the pure `domain/ui/ToastQueue`. Owns
 * no queueing rules (dedup/expiry/cap all live in the domain module, TDD'd
 * there); this just mounts a live region and re-renders whatever state it's
 * given. `push` is the one convenience the composition root calls.
 */

import {
  DEFAULT_MAX_VISIBLE,
  emptyToastQueue,
  enqueueToast,
  expireToasts,
  type ToastItem,
  type ToastQueueState,
} from "../../domain/ui/ToastQueue";
import type { Localizer } from "../../application/i18n/Localizer";
import { injectStyles } from "../styles";

const DEFAULT_TTL_MS = 4000;
const EXPIRE_POLL_MS = 250;

export interface ToastHost {
  readonly el: HTMLElement;
  /** Enqueue a localized toast; `messageKey` is translated via the Localizer. */
  push(messageKey: string, params?: Readonly<Record<string, string | number>>, ttlMs?: number): void;
  readonly state: ToastQueueState;
  dispose(): void;
}

let seq = 0;

export function createToastHost(
  loc: Localizer,
  opts: { ariaLabel: string; doc?: Document; now?: () => number; maxVisible?: number },
): ToastHost {
  const doc = opts.doc ?? document;
  const now = opts.now ?? (() => Date.now());
  const maxVisible = opts.maxVisible ?? DEFAULT_MAX_VISIBLE;
  injectStyles(doc);

  const el = doc.createElement("div");
  el.className = "lw-toast-region";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-label", opts.ariaLabel);

  let state = emptyToastQueue();

  function render(): void {
    el.replaceChildren();
    for (const item of state.visible) {
      const toast = doc.createElement("div");
      toast.className = "lw-toast";
      toast.textContent = loc.t(item.messageKey, item.params);
      el.appendChild(toast);
    }
  }

  const timer = doc.defaultView?.setInterval(() => {
    state = expireToasts(state, now(), maxVisible);
    render();
  }, EXPIRE_POLL_MS);

  return {
    el,
    get state() {
      return state;
    },
    push(messageKey, params, ttlMs = DEFAULT_TTL_MS): void {
      const item: ToastItem = {
        id: `toast-${++seq}`,
        messageKey,
        ...(params ? { params } : {}),
        createdAt: now(),
        ttlMs,
      };
      state = enqueueToast(state, item, maxVisible);
      render();
    },
    dispose(): void {
      if (timer !== undefined) doc.defaultView?.clearInterval(timer);
      el.remove();
    },
  };
}
