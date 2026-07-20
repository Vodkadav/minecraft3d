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
  AUTOLOOT_RADIUS_MAX_M,
  AUTOLOOT_RADIUS_MIN_M,
  GRAPHICS_PRESETS,
  HUD_STYLES,
  SPAWN_RATE_MAX,
  SPAWN_RATE_MIN,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  type GraphicsPreset,
  type HudStyle,
  type SettingsInput,
} from "../domain/settings/Settings";
import { NAMEPLATE_MODES, type NameplateMode } from "../domain/hud/Nameplate";
import { DAY_LENGTH_MAX_SECONDS, DAY_LENGTH_MIN_SECONDS } from "../domain/time/WorldClock";
import { DIFFICULTIES, type Difficulty } from "../domain/settings/Difficulty";
import { wireButtonSound } from "./audioUi";
import { createPanelEmblemEl } from "./icons/PanelEmblem";
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

  const headingWrap = doc.createElement("div");
  headingWrap.className = "lw-panel-title-wrap";
  const heading = doc.createElement("h1");
  heading.textContent = loc.t("settings.title");
  headingWrap.append(createPanelEmblemEl(doc, "settings"), heading);
  root.appendChild(headingWrap);

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

  // Difficulty (Workstream 5.6)
  const difficulty = doc.createElement("select");
  for (const d of DIFFICULTIES) {
    const opt = doc.createElement("option");
    opt.value = d;
    opt.textContent = loc.t(`settings.difficulty.${d}`);
    if (d === s.difficulty) opt.selected = true;
    difficulty.appendChild(opt);
  }
  difficulty.addEventListener("change", () =>
    apply({ difficulty: difficulty.value as Difficulty }),
  );
  field(doc, root, "laas-difficulty", loc.t("settings.difficulty"), difficulty);

  // Day/night length (Workstream E0.3) — shown in whole minutes, stored in seconds
  const dayLength = doc.createElement("input");
  dayLength.type = "number";
  dayLength.min = String(Math.ceil(DAY_LENGTH_MIN_SECONDS / 60));
  dayLength.max = String(Math.floor(DAY_LENGTH_MAX_SECONDS / 60));
  dayLength.step = "1";
  dayLength.value = String(Math.round(s.dayLengthSeconds / 60));
  dayLength.addEventListener("change", () =>
    apply({ dayLengthSeconds: Number(dayLength.value) * 60 }),
  );
  field(doc, root, "laas-daylength", loc.t("settings.dayLength"), dayLength);

  // HUD style (E2.1) — classic bars or Diablo-style corner orbs
  const hudStyle = doc.createElement("select");
  for (const style of HUD_STYLES) {
    const opt = doc.createElement("option");
    opt.value = style;
    opt.textContent = loc.t(`settings.hudStyle.${style}`);
    if (style === s.hudStyle) opt.selected = true;
    hudStyle.appendChild(opt);
  }
  hudStyle.addEventListener("change", () =>
    apply({ hudStyle: hudStyle.value as HudStyle }),
  );
  field(doc, root, "laas-hudstyle", loc.t("settings.hudStyle"), hudStyle);

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

  // Nameplate show/hide policy (E2.2) — a self-contained block: one mode
  // select + five faction checkboxes, each its own field/patch.
  const nameplateMode = doc.createElement("select");
  for (const mode of NAMEPLATE_MODES) {
    const opt = doc.createElement("option");
    opt.value = mode;
    opt.textContent = loc.t(`settings.nameplate.mode.${mode}`);
    if (mode === s.nameplateMode) opt.selected = true;
    nameplateMode.appendChild(opt);
  }
  nameplateMode.addEventListener("change", () =>
    apply({ nameplateMode: nameplateMode.value as NameplateMode }),
  );
  field(doc, root, "laas-nameplate-mode", loc.t("settings.nameplate.mode"), nameplateMode);

  const nameplateToggle = (
    id: string,
    labelKey: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ): void => {
    const box = doc.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.addEventListener("change", () => onChange(box.checked));
    field(doc, root, id, loc.t(labelKey), box);
  };
  nameplateToggle(
    "laas-nameplate-friendly",
    "settings.nameplate.friendly",
    s.nameplateFriendly,
    (v) => apply({ nameplateFriendly: v }),
  );
  nameplateToggle(
    "laas-nameplate-neutral",
    "settings.nameplate.neutral",
    s.nameplateNeutral,
    (v) => apply({ nameplateNeutral: v }),
  );
  nameplateToggle(
    "laas-nameplate-hostile",
    "settings.nameplate.hostile",
    s.nameplateHostile,
    (v) => apply({ nameplateHostile: v }),
  );
  nameplateToggle("laas-nameplate-tamed", "settings.nameplate.tamed", s.nameplateTamed, (v) =>
    apply({ nameplateTamed: v }),
  );
  nameplateToggle(
    "laas-nameplate-players",
    "settings.nameplate.players",
    s.nameplatePlayers,
    (v) => apply({ nameplatePlayers: v }),
  );

  // ---- E4.3: autoloot (self-contained block — keep additions here scoped
  // to avoid merge friction with concurrent settings work) ----
  const autoloot = doc.createElement("input");
  autoloot.type = "checkbox";
  autoloot.checked = s.autolootEnabled;
  autoloot.addEventListener("change", () => apply({ autolootEnabled: autoloot.checked }));
  field(doc, root, "laas-autoloot", loc.t("settings.autoloot"), autoloot);

  const autolootRadius = doc.createElement("input");
  autolootRadius.type = "number";
  autolootRadius.min = String(AUTOLOOT_RADIUS_MIN_M);
  autolootRadius.max = String(AUTOLOOT_RADIUS_MAX_M);
  autolootRadius.step = "1";
  autolootRadius.value = String(s.autolootRadiusM);
  autolootRadius.addEventListener("change", () =>
    apply({ autolootRadiusM: Number(autolootRadius.value) }),
  );
  field(doc, root, "laas-autoloot-radius", loc.t("settings.autolootRadius"), autolootRadius);

  // ---- E6.6: spawn-rate multipliers (self-contained block, additive) ----
  const creatureRate = doc.createElement("input");
  creatureRate.type = "range";
  creatureRate.min = String(SPAWN_RATE_MIN);
  creatureRate.max = String(SPAWN_RATE_MAX);
  creatureRate.step = "0.05";
  creatureRate.value = String(s.creatureSpawnRate);
  creatureRate.addEventListener("change", () =>
    apply({ creatureSpawnRate: Number(creatureRate.value) }),
  );
  field(doc, root, "laas-creature-spawn-rate", loc.t("settings.creatureSpawnRate"), creatureRate);

  const resourceRate = doc.createElement("input");
  resourceRate.type = "range";
  resourceRate.min = String(SPAWN_RATE_MIN);
  resourceRate.max = String(SPAWN_RATE_MAX);
  resourceRate.step = "0.05";
  resourceRate.value = String(s.resourceSpawnRate);
  resourceRate.addEventListener("change", () =>
    apply({ resourceSpawnRate: Number(resourceRate.value) }),
  );
  field(doc, root, "laas-resource-spawn-rate", loc.t("settings.resourceSpawnRate"), resourceRate);

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
