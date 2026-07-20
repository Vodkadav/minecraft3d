/**
 * Field (Phase E8.5, ADR 0005 #3) — the one styled text-input primitive:
 * label + input + an optional hint and/or validation error, consolidating
 * the per-screen input CSS already duplicated across `styles.ts`
 * (`.laas-field`, `.lw-filter-field`, `.lw-chat-input`, …). Every screen
 * adopts this instead of hand-rolling another `<label>`+`<input>` pair.
 *
 * Accessible by construction: the visible/`labelVisuallyHidden` `<label>`
 * carries the input's accessible name via `for`/`id` (no separate aria-label
 * needed), a hint and a `role="alert"` error both wire into
 * `aria-describedby` when present, and `aria-invalid` tracks error state.
 * The 44x44px touch-target floor and focus ring come from the existing
 * global `.laas-ui` rules (`styles.ts`) for free.
 *
 * `doc`-pure like `WindowFrame.ts`/`RichTooltip.ts`: builds every node
 * through the passed document, so it renders identically under happy-dom and
 * live.
 */

import { injectStyles } from "../styles";

let fieldSeq = 0;

export type FieldInputType = "text" | "search" | "email" | "number" | "tel";

export interface FieldOptions {
  readonly doc?: Document;
  /** Always the accessible name; visually hidden when `labelVisuallyHidden`
   *  (compact rows like the chat composer keep the label for a11y only). */
  readonly label: string;
  readonly labelVisuallyHidden?: boolean;
  readonly type?: FieldInputType;
  /** Extra class appended to the `<input>` alongside `.lw-field-input` — lets
   *  a caller keep an existing stylesheet/test selector (e.g. chat's
   *  `.lw-chat-input`) while adopting the shared primitive. */
  readonly inputClassName?: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly hint?: string;
  /** Initial validation error, if any — same as calling `setError` after mount. */
  readonly error?: string;
  readonly maxLength?: number;
  readonly autocapitalize?: string;
  readonly spellcheck?: boolean;
  readonly required?: boolean;
  onInput?(value: string): void;
}

export interface FieldHandle {
  /** The `div.lw-field` wrapper — append this into the caller's layout. */
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
  /** Sets/clears the validation error (`role="alert"`) and `aria-invalid`. */
  setError(message: string | undefined): void;
  setValue(value: string): void;
}

export function Field(opts: FieldOptions): FieldHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const id = `lw-field-${++fieldSeq}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const root = doc.createElement("div");
  root.className = "laas-ui lw-field";

  const label = doc.createElement("label");
  label.className = "lw-field-label";
  if (opts.labelVisuallyHidden) label.classList.add("lw-sr-only");
  label.textContent = opts.label;
  label.htmlFor = id;

  const input = doc.createElement("input");
  input.id = id;
  input.className = opts.inputClassName ? `lw-field-input ${opts.inputClassName}` : "lw-field-input";
  input.type = opts.type ?? "text";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.value !== undefined) input.value = opts.value;
  if (opts.maxLength !== undefined) input.maxLength = opts.maxLength;
  if (opts.autocapitalize) input.autocapitalize = opts.autocapitalize;
  if (opts.spellcheck !== undefined) input.spellcheck = opts.spellcheck;
  if (opts.required) input.required = true;

  const hint = doc.createElement("p");
  hint.className = "lw-field-hint";
  hint.id = hintId;
  if (opts.hint) hint.textContent = opts.hint;
  hint.hidden = !opts.hint;

  const error = doc.createElement("p");
  error.className = "lw-field-error";
  error.id = errorId;
  error.setAttribute("role", "alert");
  error.hidden = true;

  function updateDescribedBy(): void {
    const ids = [!hint.hidden ? hintId : null, !error.hidden ? errorId : null].filter(
      (v): v is string => v !== null,
    );
    if (ids.length > 0) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }
  updateDescribedBy();

  if (opts.error) {
    error.textContent = opts.error;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    updateDescribedBy();
  }

  if (opts.onInput) {
    input.addEventListener("input", () => opts.onInput?.(input.value));
  }

  root.append(label, input, hint, error);

  return {
    root,
    input,
    setError(message: string | undefined): void {
      if (message) {
        error.textContent = message;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
      } else {
        error.textContent = "";
        error.hidden = true;
        input.removeAttribute("aria-invalid");
      }
      updateDescribedBy();
    },
    setValue(value: string): void {
      input.value = value;
    },
  };
}
