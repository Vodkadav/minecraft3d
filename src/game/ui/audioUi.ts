/**
 * Shared UI-sound wiring (Workstream 1.6): every interactive control in the
 * menu/lobby/settings screens gets a click sound and a hover/focus sound
 * when an AudioPort is supplied. A no-op when `audio` is absent, so views
 * stay usable (and their existing tests keep passing) without one.
 */

import type { AudioPort } from "../application/ports/AudioPort";

export function wireButtonSound(el: HTMLElement, audio: AudioPort | undefined): void {
  if (!audio) return;
  el.addEventListener("click", () => audio.play("uiClick"));
  el.addEventListener("mouseenter", () => audio.play("uiHover"));
  el.addEventListener("focus", () => audio.play("uiHover"));
}
