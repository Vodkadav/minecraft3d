/**
 * WindowFrame (Phase E8.1) — the one shared overlay-window shell every screen's
 * chrome is built from, encoding `WINDOW_CHROME_SPEC` (theme/tokens.ts): a
 * header (optional decorative emblem + title + optional extra slot such as a
 * tab strip + a close button) over a body, with an optional footer of keyhint
 * chips. Consolidates the hand-rolled `lw-inv-header` (`<h2>` + quiet close
 * button) that every overlay repeated, so the E8 chrome/background restyle
 * lands in one place instead of ~9 screens.
 *
 * Scope: the panel *content* shell only. The `role="dialog"` overlay wrapper,
 * Escape handling, and pointer-lock release stay with each caller — those vary
 * per screen (overlay class, aria-label, modal vs. docked) and aren't chrome.
 *
 * `doc`-pure: builds every node through the passed document (the close button
 * is a raw themed `<button>` rather than the document-bound `Button()` helper),
 * so the same overlay renders under happy-dom in tests and a real DOM live.
 */

import { createPanelEmblemEl, type PanelEmblemKind } from "../icons/PanelEmblem";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface WindowFrameOptions {
  readonly doc?: Document;
  /** Window title — always the accessible heading; also the visible title
   *  unless `titleVisuallyHidden` (tab-dominant windows keep it for a11y). */
  readonly title: string;
  readonly titleVisuallyHidden?: boolean;
  /** Optional decorative header emblem (aria-hidden, procedural SVG). */
  readonly emblem?: PanelEmblemKind;
  /** Optional element after the title in the header lead — e.g. a tab strip.
   *  The caller owns its state (aria-selected, click handlers); WindowFrame
   *  only lays it out. */
  readonly headerExtra?: HTMLElement;
  /** Optional header action buttons placed just before the close button
   *  (e.g. Map's "recenter"). The caller builds and owns them. */
  readonly headerActions?: readonly HTMLElement[];
  readonly close: {
    readonly label: string;
    readonly ariaLabel: string;
    onClose(): void;
  };
  readonly body: readonly HTMLElement[];
  /** Optional footer keyhint chips (from `Keyhint`), e.g. "[Esc] Close". */
  readonly keyhints?: readonly HTMLElement[];
  /** Extra class on the outer panel section (e.g. `lw-inv-overlay-panel`). */
  readonly panelClassName?: string;
}

export interface WindowFrameHandle {
  /** The `section.lw-panel` — append this into the caller's overlay wrapper. */
  readonly panel: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly titleEl: HTMLHeadingElement;
  /** Live title update without a remount. */
  setTitle(text: string): void;
}

export function WindowFrame(opts: WindowFrameOptions): WindowFrameHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const header = doc.createElement("div");
  header.className = "lw-window-header";

  const lead = doc.createElement("div");
  lead.className = "lw-window-header-lead";
  if (opts.emblem) lead.append(createPanelEmblemEl(doc, opts.emblem));

  const titleEl = doc.createElement("h2");
  titleEl.className = "lw-window-title";
  if (opts.titleVisuallyHidden) titleEl.classList.add("lw-sr-only");
  titleEl.textContent = opts.title;
  lead.append(titleEl);

  if (opts.headerExtra) lead.append(opts.headerExtra);

  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "laas-ui lw-button";
  closeButton.dataset.variant = "quiet";
  closeButton.textContent = opts.close.label;
  closeButton.setAttribute("aria-label", opts.close.ariaLabel);
  closeButton.addEventListener("click", () => opts.close.onClose());

  const trailing = doc.createElement("div");
  trailing.className = "lw-window-header-actions";
  if (opts.headerActions) trailing.append(...opts.headerActions);
  trailing.append(closeButton);

  header.append(lead, trailing);

  const children: HTMLElement[] = [header, ...opts.body];

  if (opts.keyhints && opts.keyhints.length > 0) {
    const footer = doc.createElement("div");
    footer.className = "lw-window-footer";
    footer.append(...opts.keyhints);
    children.push(footer);
  }

  const panel = Panel(children, {
    ariaLabel: undefined, // the caller's overlay owns the dialog name
    className: opts.panelClassName,
  });

  return {
    panel,
    closeButton,
    titleEl,
    setTitle(text: string): void {
      titleEl.textContent = text;
    },
  };
}
