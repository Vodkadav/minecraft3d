/**
 * Slider — a label-associated `<input type="range">`, the same
 * label+control pairing SettingsView already uses, packaged as a reusable
 * component so new HUD/settings surfaces don't re-hand-roll it.
 */

import { injectStyles } from "../styles";

export interface SliderOptions {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  onChange(value: number): void;
}

export interface SliderHandle {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
}

export function Slider(opts: SliderOptions): SliderHandle {
  const doc = document;
  injectStyles(doc);

  const wrapper = doc.createElement("div");
  wrapper.className = "laas-ui lw-slider";

  const label = doc.createElement("label");
  label.htmlFor = opts.id;
  label.textContent = opts.label;

  const input = doc.createElement("input");
  input.type = "range";
  input.id = opts.id;
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  input.addEventListener("input", () => opts.onChange(Number(input.value)));

  wrapper.append(label, input);
  return { el: wrapper, input };
}
