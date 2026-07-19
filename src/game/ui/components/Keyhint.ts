/**
 * Keyhint — a small "[E] Harvest"-style chip pairing a keycap with its
 * action label. Purely presentational; callers decide when to show/hide it
 * (e.g. only while a target is in reach).
 */

import { injectStyles } from "../styles";

export function Keyhint(key: string, labelText: string, doc: Document = document): HTMLElement {
  injectStyles(doc);
  const el = doc.createElement("span");
  el.className = "laas-ui lw-keyhint";

  const keyEl = doc.createElement("kbd");
  keyEl.className = "lw-keyhint-key";
  keyEl.textContent = key;

  const label = doc.createElement("span");
  label.textContent = labelText;

  el.append(keyEl, label);
  return el;
}
