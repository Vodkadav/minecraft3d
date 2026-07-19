/**
 * Settings DOM shell. Every control is a real, label-associated form element;
 * changes flow through the SettingsController (validate → persist via the
 * SettingsStore port). Graphics preset (incl. mobile), animal density, boundary
 * radius, locale, and the a11y controls (high contrast, text scale, reduced
 * motion) are all here. Labels come through the Localizer; accessibility
 * settings reflect onto the DOM after each successful change.
 */

import type { Localizer } from "../application/i18n/Localizer";
import type { SettingsController } from "../application/SettingsController";
import type { AudioPort } from "../application/ports/AudioPort";
import {
  GRAPHICS_PRESETS,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  type GraphicsPreset,
  type SettingsInput,
} from "../domain/settings/Settings";
import { wireButtonSound } from "./audioUi";
import { applyAccessibility, injectStyles } from "./styles";

function field(
  doc: Document,
  root: HTMLElement,
  id: string,
  labelText: string,
  control: HTMLElement,
): void {
  const wrapper = doc.createElement("div");
  wrapper.className = "laas-field";
  const label = doc.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  wrapper.append(label, control);
  root.appendChild(wrapper);
}

export function SettingsView(
  controller: SettingsController,
  loc: Localizer,
  onBack?: () => void,
  audio?: AudioPort,
): HTMLElement {
  const doc = document;
  injectStyles(doc);
  const s = controller.settings;

  const root = doc.createElement("section");
  root.className = "laas-ui laas-settings";
  root.setAttribute("aria-label", loc.t("settings.title"));

  const heading = doc.createElement("h1");
  heading.textContent = loc.t("settings.title");
  root.appendChild(heading);

  const apply = (patch: Partial<SettingsInput>) => {
    void controller.apply(patch).then((r) => {
      if (!r.ok) return;
      applyAccessibility(root, controller.settings);
      if (!audio) return;
      if (patch.masterVolume !== undefined) audio.setBusVolume("master", patch.masterVolume);
      if (patch.musicVolume !== undefined) audio.setBusVolume("music", patch.musicVolume);
      if (patch.sfxVolume !== undefined) audio.setBusVolume("sfx", patch.sfxVolume);
      if (patch.ambientVolume !== undefined) audio.setBusVolume("ambient", patch.ambientVolume);
    });
  };

  // Graphics preset
  const graphics = doc.createElement("select");
  for (const preset of GRAPHICS_PRESETS) {
    const opt = doc.createElement("option");
    opt.value = preset;
    opt.textContent = loc.t(`settings.graphics.${preset}`);
    if (preset === s.graphicsPreset) opt.selected = true;
    graphics.appendChild(opt);
  }
  graphics.addEventListener("change", () =>
    apply({ graphicsPreset: graphics.value as GraphicsPreset }),
  );
  field(doc, root, "laas-graphics", loc.t("settings.graphics"), graphics);

  // Animal density
  const density = doc.createElement("input");
  density.type = "range";
  density.min = "0";
  density.max = "1";
  density.step = "0.05";
  density.value = String(s.animalDensity);
  density.addEventListener("change", () =>
    apply({ animalDensity: Number(density.value) }),
  );
  field(doc, root, "laas-density", loc.t("settings.animalDensity"), density);

  // Boundary radius
  const radius = doc.createElement("input");
  radius.type = "number";
  radius.min = "1";
  radius.step = "1";
  radius.value = String(s.boundaryRadius);
  radius.addEventListener("change", () =>
    apply({ boundaryRadius: Number(radius.value) }),
  );
  field(doc, root, "laas-radius", loc.t("settings.boundaryRadius"), radius);

  // Locale
  const locale = doc.createElement("select");
  for (const code of loc.availableLocales()) {
    const opt = doc.createElement("option");
    opt.value = code;
    opt.textContent = loc.t(`settings.locale.${code}`);
    if (code === s.locale) opt.selected = true;
    locale.appendChild(opt);
  }
  locale.addEventListener("change", () => apply({ locale: locale.value }));
  field(doc, root, "laas-locale", loc.t("settings.locale"), locale);

  // High contrast
  const contrast = doc.createElement("input");
  contrast.type = "checkbox";
  contrast.checked = s.highContrast;
  contrast.addEventListener("change", () =>
    apply({ highContrast: contrast.checked }),
  );
  field(doc, root, "laas-contrast", loc.t("settings.highContrast"), contrast);

  // Text scale
  const textScale = doc.createElement("input");
  textScale.type = "range";
  textScale.min = String(TEXT_SCALE_MIN);
  textScale.max = String(TEXT_SCALE_MAX);
  textScale.step = "0.1";
  textScale.value = String(s.textScale);
  textScale.addEventListener("change", () =>
    apply({ textScale: Number(textScale.value) }),
  );
  field(doc, root, "laas-textscale", loc.t("settings.textScale"), textScale);

  // Reduced motion
  const motion = doc.createElement("input");
  motion.type = "checkbox";
  motion.checked = s.reducedMotion;
  motion.addEventListener("change", () =>
    apply({ reducedMotion: motion.checked }),
  );
  field(doc, root, "laas-motion", loc.t("settings.reducedMotion"), motion);

  // Audio buses (Workstream 1.4)
  const volumeField = (
    id: string,
    labelKey: string,
    value: number,
    onChange: (v: number) => void,
  ): void => {
    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.05";
    slider.value = String(value);
    slider.addEventListener("change", () => onChange(Number(slider.value)));
    field(doc, root, id, loc.t(labelKey), slider);
  };
  volumeField("laas-vol-master", "settings.audio.master", s.masterVolume, (v) =>
    apply({ masterVolume: v }),
  );
  volumeField("laas-vol-music", "settings.audio.music", s.musicVolume, (v) =>
    apply({ musicVolume: v }),
  );
  volumeField("laas-vol-sfx", "settings.audio.sfx", s.sfxVolume, (v) =>
    apply({ sfxVolume: v }),
  );
  volumeField("laas-vol-ambient", "settings.audio.ambient", s.ambientVolume, (v) =>
    apply({ ambientVolume: v }),
  );

  // Back
  const back = doc.createElement("button");
  back.type = "button";
  back.textContent = loc.t("settings.back");
  back.addEventListener("click", () => onBack?.());
  root.appendChild(back);
  wireButtonSound(back, audio);

  applyAccessibility(root, s);
  return root;
}
