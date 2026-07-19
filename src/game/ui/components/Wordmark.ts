/**
 * Wordmark (Workstream 10.1) — the game's procedural logo: "Diggy World" set
 * in the system font stack with a theme-accent gradient fill and a small
 * chevron/pickaxe-notch mark, built entirely from SVG `<text>` + `<path>`
 * primitives authored here (zero image/font-file assets, per the
 * free-only/procedural-only invariant). `size` picks a type-scale variant —
 * "hero" for the main menu, "compact" for anywhere else it needs to appear
 * (e.g. a future loading surface).
 */

import { injectStyles } from "../styles";

export interface WordmarkOptions {
  readonly size?: "hero" | "compact";
  readonly doc?: Document;
}

export function Wordmark(title: string, opts: WordmarkOptions = {}): HTMLElement {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const wrap = doc.createElement("div");
  wrap.className = "laas-ui lw-wordmark";
  wrap.dataset.size = opts.size ?? "hero";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", title);

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 340 64");
  svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  const defs = doc.createElementNS(svgNs, "defs");
  const gradient = doc.createElementNS(svgNs, "linearGradient");
  gradient.id = "lw-wordmark-gradient";
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("x2", "1");
  gradient.setAttribute("y2", "1");
  const stop1 = doc.createElementNS(svgNs, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "var(--lw-accent)");
  const stop2 = doc.createElementNS(svgNs, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "var(--lw-focus)");
  gradient.append(stop1, stop2);
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // a small dig-notch mark: a triangular "shovel tip" ahead of the wordmark
  const mark = doc.createElementNS(svgNs, "path");
  mark.setAttribute("d", "M4 44 L20 20 L28 44 L20 34 Z");
  mark.setAttribute("fill", "var(--lw-fg)");
  svg.appendChild(mark);

  const text = doc.createElementNS(svgNs, "text");
  text.setAttribute("x", "38");
  text.setAttribute("y", "44");
  text.setAttribute("fill", "url(#lw-wordmark-gradient)");
  text.setAttribute("font-family", "system-ui, -apple-system, 'Segoe UI', sans-serif");
  text.setAttribute("font-weight", "800");
  text.setAttribute("font-size", "40");
  text.setAttribute("letter-spacing", "0.5");
  text.textContent = title;
  svg.appendChild(text);

  wrap.appendChild(svg);
  return wrap;
}
