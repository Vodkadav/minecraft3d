/**
 * Localization service the UI consumes. Holds the catalog + active locale and
 * exposes `t()`; swapping locale is app state, translation itself is the pure
 * domain `translate`. All user-facing strings flow through here — no hardcoded
 * UI strings (global rule: i18n EN + ES + DA).
 */

import {
  type Catalog,
  type Locale,
  translate,
  type TranslateParams,
} from "../../domain/i18n/translate";

export class Localizer {
  private locale: Locale;

  constructor(
    private readonly catalog: Catalog,
    initialLocale: Locale = "en",
    private readonly defaultLocale: Locale = "en",
  ) {
    this.locale = initialLocale;
  }

  get activeLocale(): Locale {
    return this.locale;
  }

  availableLocales(): Locale[] {
    return Object.keys(this.catalog);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  t(key: string, params?: TranslateParams): string {
    return translate(this.catalog, this.locale, key, params, this.defaultLocale);
  }
}
