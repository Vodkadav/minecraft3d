/**
 * UI string catalog (EN + ES + DA) for the menu, settings, and lobby screens.
 * This is UI content; the pure translate engine (domain/i18n) knows nothing
 * about these keys. No UI module hardcodes a user-facing string — every one
 * flows through Localizer.t against this catalog (global rule: i18n EN+ES+DA).
 */

import type { Catalog, Locale } from "../../domain/i18n/translate";
import { Localizer } from "../../application/i18n/Localizer";

export const UI_STRINGS: Catalog = {
  en: {
    "app.title": "Survival Sandbox",

    "menu.solo": "Solo (offline)",
    "menu.online": "Online",
    "menu.settings": "Settings",
    "menu.solo.aria": "Start a single-player offline world",
    "world.defaultName": "New World",

    "settings.title": "Settings",
    "settings.graphics": "Graphics quality",
    "settings.graphics.low": "Low",
    "settings.graphics.mobile": "Mobile",
    "settings.graphics.high": "High",
    "settings.graphics.ultra": "Ultra",
    "settings.animalDensity": "Animal density",
    "settings.boundaryRadius": "World boundary radius (m)",
    "settings.locale": "Language",
    "settings.locale.en": "English",
    "settings.locale.es": "Spanish",
    "settings.locale.da": "Danish",
    "settings.highContrast": "High contrast",
    "settings.textScale": "Text size",
    "settings.reducedMotion": "Reduce motion",
    "settings.back": "Back",

    "lobby.title": "Online worlds",
    "lobby.worlds": "Available worlds",
    "lobby.empty": "No worlds yet — host one below.",
    "lobby.join": "Join",
    "lobby.join.aria": "Join world {name}",
    "lobby.host": "Host",
    "lobby.back": "Back",
    "lobby.pickSeed": "Pick a saved seed to host",
    "lobby.seed.none": "No saved seeds yet.",
    "lobby.seed.use": "Host with {name}",

    "storage.persisted": "Storage is protected — your worlds won't be evicted.",
    "storage.notPersisted": "Storage is best-effort — worlds may be evicted under pressure.",
  },
  es: {
    "app.title": "Caja de Arena de Supervivencia",

    "menu.solo": "Individual (sin conexión)",
    "menu.online": "En línea",
    "menu.settings": "Ajustes",
    "menu.solo.aria": "Iniciar un mundo individual sin conexión",
    "world.defaultName": "Mundo nuevo",

    "settings.title": "Ajustes",
    "settings.graphics": "Calidad gráfica",
    "settings.graphics.low": "Baja",
    "settings.graphics.mobile": "Móvil",
    "settings.graphics.high": "Alta",
    "settings.graphics.ultra": "Ultra",
    "settings.animalDensity": "Densidad de animales",
    "settings.boundaryRadius": "Radio del límite del mundo (m)",
    "settings.locale": "Idioma",
    "settings.locale.en": "Inglés",
    "settings.locale.es": "Español",
    "settings.locale.da": "Danés",
    "settings.highContrast": "Alto contraste",
    "settings.textScale": "Tamaño del texto",
    "settings.reducedMotion": "Reducir movimiento",
    "settings.back": "Atrás",

    "lobby.title": "Mundos en línea",
    "lobby.worlds": "Mundos disponibles",
    "lobby.empty": "Aún no hay mundos: crea uno abajo.",
    "lobby.join": "Unirse",
    "lobby.join.aria": "Unirse al mundo {name}",
    "lobby.host": "Crear",
    "lobby.back": "Atrás",
    "lobby.pickSeed": "Elige una semilla guardada para crear",
    "lobby.seed.none": "Aún no hay semillas guardadas.",
    "lobby.seed.use": "Crear con {name}",

    "storage.persisted": "El almacenamiento está protegido: tus mundos no se eliminarán.",
    "storage.notPersisted": "Almacenamiento de mejor esfuerzo: los mundos podrían eliminarse.",
  },
  da: {
    "app.title": "Overlevelses-Sandkasse",

    "menu.solo": "Solo (offline)",
    "menu.online": "Online",
    "menu.settings": "Indstillinger",
    "menu.solo.aria": "Start en offline-verden for én spiller",
    "world.defaultName": "Ny verden",

    "settings.title": "Indstillinger",
    "settings.graphics": "Grafikkvalitet",
    "settings.graphics.low": "Lav",
    "settings.graphics.mobile": "Mobil",
    "settings.graphics.high": "Høj",
    "settings.graphics.ultra": "Ultra",
    "settings.animalDensity": "Dyretæthed",
    "settings.boundaryRadius": "Verdensgrænse-radius (m)",
    "settings.locale": "Sprog",
    "settings.locale.en": "Engelsk",
    "settings.locale.es": "Spansk",
    "settings.locale.da": "Dansk",
    "settings.highContrast": "Høj kontrast",
    "settings.textScale": "Tekststørrelse",
    "settings.reducedMotion": "Reducér bevægelse",
    "settings.back": "Tilbage",

    "lobby.title": "Online-verdener",
    "lobby.worlds": "Tilgængelige verdener",
    "lobby.empty": "Ingen verdener endnu — vær vært for en nedenfor.",
    "lobby.join": "Deltag",
    "lobby.join.aria": "Deltag i verden {name}",
    "lobby.host": "Vær vært",
    "lobby.back": "Tilbage",
    "lobby.pickSeed": "Vælg et gemt frø at være vært for",
    "lobby.seed.none": "Ingen gemte frø endnu.",
    "lobby.seed.use": "Vær vært med {name}",

    "storage.persisted": "Lageret er beskyttet — dine verdener bliver ikke slettet.",
    "storage.notPersisted": "Bedste forsøg-lager — verdener kan blive slettet ved pladsmangel.",
  },
};

/** Composition helper: a Localizer over the UI catalog for the given locale. */
export function createLocalizer(locale: Locale = "en"): Localizer {
  return new Localizer(UI_STRINGS, locale);
}
