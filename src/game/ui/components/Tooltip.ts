/**
 * Tooltip — attaches a `role="tooltip"` popup to an anchor element, shown on
 * hover AND keyboard focus (so it's reachable without a mouse), linked via
 * `aria-describedby`. Positioned above the anchor; the caller disposes it
 * when the anchor is removed.
 */

import { injectStyles } from "../styles";

let seq = 0;

export interface TooltipHandle {
  dispose(): void;
}

export function attachTooltip(anchor: HTMLElement, text: string): TooltipHandle {
  const doc = anchor.ownerDocument;
  injectStyles(doc);

  const id = `lw-tooltip-${++seq}`;
  const el = doc.createElement("div");
  el.id = id;
  el.className = "lw-tooltip";
  el.setAttribute("role", "tooltip");
  el.textContent = text;
  el.hidden = true;

  const show = (): void => {
    el.hidden = false;
    const parent = anchor.offsetParent instanceof HTMLElement ? anchor.offsetParent : doc.body;
    if (el.parentElement !== parent) parent.appendChild(el);
    el.style.left = `${anchor.offsetLeft}px`;
    el.style.top = `${anchor.offsetTop - el.offsetHeight - 6}px`;
  };
  const hide = (): void => {
    el.hidden = true;
  };

  anchor.setAttribute("aria-describedby", id);
  anchor.addEventListener("mouseenter", show);
  anchor.addEventListener("mouseleave", hide);
  anchor.addEventListener("focus", show);
  anchor.addEventListener("blur", hide);

  (anchor.offsetParent instanceof HTMLElement ? anchor.offsetParent : doc.body).appendChild(el);

  return {
    dispose(): void {
      anchor.removeAttribute("aria-describedby");
      anchor.removeEventListener("mouseenter", show);
      anchor.removeEventListener("mouseleave", hide);
      anchor.removeEventListener("focus", show);
      anchor.removeEventListener("blur", hide);
      el.remove();
    },
  };
}
