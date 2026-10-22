/**
 * Addresses that carry a language: `/ja/pricing` is the pricing page in
 * Japanese, `/pricing` the same page in the default language.
 *
 * Pure functions on paths, with no window access, so they run in a browser,
 * a Worker or a test alike. A product says which languages get a prefix and
 * whether the default language has one, through `configureLanguageRouting`
 * (or `configureI18n({ routing })`), or per call.
 */
import { DEFAULT_LANGUAGE, LANGUAGES } from "./languages";

export type LanguageRoutingOptions = {
  /** The languages that get a prefix. Defaults to every language in the list. */
  languages?: readonly string[];
  /** The language of an address without a prefix. Defaults to `en`. */
  defaultLanguage?: string;
  /**
   * Whether the default language has a prefix too (`/en/pricing`). Off by
   * default: the default language's addresses carry none.
   */
  prefixDefaultLanguage?: boolean;
};

export type LanguagePath = {
  /** The language the address names, as configured (`pt-BR`), or null */
  language: string | null;
  /** The address without the prefix, always starting with `/` */
  restPath: string;
};

let routing: LanguageRoutingOptions = {};

/** Set which languages get a prefix, and whether the default language has one. */
export function configureLanguageRouting(options: LanguageRoutingOptions): void {
  routing = { ...routing, ...options };
}

/** The routing options in force, with the defaults filled in. */
export function getLanguageRoutingOptions(): Required<LanguageRoutingOptions> {
  return resolve();
}

function resolve(options?: LanguageRoutingOptions): Required<LanguageRoutingOptions> {
  const merged = { ...routing, ...options };
  return {
    languages: merged.languages?.length ? merged.languages : LANGUAGES,
    defaultLanguage: merged.defaultLanguage || DEFAULT_LANGUAGE,
    prefixDefaultLanguage: merged.prefixDefaultLanguage ?? false,
  };
}

/** A language's segment in an address: its code in lower case (`pt-br`). */
export function languageSlug(language: string): string {
  return String(language ?? "").toLowerCase().replace(/_/g, "-");
}

/**
 * The configured language a path segment names (`pt-br` gives `pt-BR`), or
 * null. Matching ignores case.
 */
export function languageFromSlug(
  segment: string,
  languages: readonly string[] = resolve().languages
): string | null {
  const slug = languageSlug(segment);
  if (!slug) {
    return null;
  }
  return languages.find((code) => languageSlug(code) === slug) ?? null;
}

/** Whether a path segment names one of the languages that get a prefix. */
export function isLanguageSlug(segment: string, languages?: readonly string[]): boolean {
  return languageFromSlug(segment, languages) !== null;
}

/** Split an address into its path and what follows (`?query#hash`). */
function splitSuffix(path: string): [string, string] {
  const index = path.search(/[?#]/);
  return index === -1 ? [path, ""] : [path.slice(0, index), path.slice(index)];
}

/**
 * The language an address names in its first segment, and the address
 * without it: `/ja/pricing` gives `{ language: "ja", restPath: "/pricing" }`,
 * `/pricing` gives `{ language: null, restPath: "/pricing" }`. A query and
 * hash stay on the rest.
 */
export function parseLanguagePath(
  pathname: string,
  options?: LanguageRoutingOptions
): LanguagePath {
  const { languages } = resolve(options);
  const [path, suffix] = splitSuffix(pathname || "/");
  const absolute = path.startsWith("/") ? path : `/${path}`;
  const first = absolute.split("/")[1] ?? "";
  const language = languageFromSlug(first, languages);

  if (!language) {
    return { language: null, restPath: `${absolute}${suffix}` };
  }

  const rest = absolute.slice(first.length + 1) || "/";
  return { language, restPath: `${rest}${suffix}` };
}

/** The address without a language prefix: `/ja/pricing` gives `/pricing`. */
export function stripLanguagePrefix(path: string, options?: LanguageRoutingOptions): string {
  return parseLanguagePath(path, options).restPath;
}

/**
 * The address in `language`: `withLanguagePrefix("/pricing", "ja")` gives
 * `/ja/pricing`. A prefix already there is replaced, never doubled. The
 * default language, and languages without a prefix, give the bare address
 * (unless `prefixDefaultLanguage` is on).
 */
export function withLanguagePrefix(
  path: string,
  language: string,
  options?: LanguageRoutingOptions
): string {
  const resolved = resolve(options);
  const rest = stripLanguagePrefix(path, options);
  const configured = languageFromSlug(language, resolved.languages);
  const isDefault = languageSlug(language) === languageSlug(resolved.defaultLanguage);

  if (!configured || (isDefault && !resolved.prefixDefaultLanguage)) {
    return rest;
  }

  const [restPath, suffix] = splitSuffix(rest);
  const tail = restPath === "/" ? "" : restPath;
  return `/${languageSlug(configured)}${tail}${suffix}`;
}
