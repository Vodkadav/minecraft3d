/**
 * Pure translation lookup — content-agnostic. Given a catalog, resolve a key in
 * the active locale, falling back to the default locale, then to the key itself
 * (so a missing string is visible in-UI, never a crash). `{name}` placeholders
 * are interpolated from `params`.
 *
 * The catalogs themselves are UI content (src/game/ui/i18n); this engine is pure
 * domain and knows nothing about which strings exist.
 */

export type Locale = string;

export type LocaleStrings = Readonly<Record<string, string>>;

export type Catalog = Readonly<Record<Locale, LocaleStrings>>;

export type TranslateParams = Readonly<Record<string, string | number>>;

function interpolate(template: string, params: TranslateParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export function translate(
  catalog: Catalog,
  locale: Locale,
  key: string,
  params?: TranslateParams,
  defaultLocale: Locale = "en",
): string {
  const template =
    catalog[locale]?.[key] ?? catalog[defaultLocale]?.[key] ?? key;
  return interpolate(template, params);
}
