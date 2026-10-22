import {
  LANGUAGES,
  LANGUAGE_METADATA,
  fallbackLanguages,
  isLanguage,
  languageOrder,
  normalizeLanguage,
} from "./languages";
import type { Language } from "./languages";
import { configureLanguageRouting, parseLanguagePath } from "./language-routing";
import type { LanguageRoutingOptions } from "./language-routing";
import { readLanguageFile, resolveText } from "./translations-format";
import type {
  TranslationParams,
  TranslationTable,
  TranslationsFile,
} from "./translations-format";

// Define the supported languages using ISO codes (extensible)
export type LanguageCode = string;

// One language's words, key to text
export type TranslationData = {
  [key: string]: string;
};

// Every language's words, keyed by language code
export type TranslationMap = Record<string, TranslationData>;

/**
 * How a product sets up the language module. Every field is optional: without
 * any, the module behaves as it always has (the whole table from
 * `./translations.json`, the languages offered are the ones in the words).
 *
 * Pass it to `configureI18n()` straight after importing the module, or put it
 * on `window.DS_ONE_I18N` before the module loads.
 */
export type I18nOptions = {
  /** Fetch external words at startup. Disable when the product supplies them in code. */
  autoLoad?: boolean;
  /** Ignore saved choices and avoid writes on browser-managed surfaces. */
  persist?: boolean;
  /**
   * Every language the product speaks. When set, the picker offers these
   * whether or not their words have arrived yet, which matters when a page
   * loads only its own language (`languageFile`). Without it, the languages
   * offered are the ones found in the loaded words.
   */
  languages?: readonly LanguageCode[];
  /**
   * Where one language's words are published, so a page loads its own
   * language rather than the whole table: a pattern with `{language}` in it
   * (`"/translations/{language}.json"`) or a function. Each file holds
   * `{ "<language>": { …words } }`. When a language's file is missing, the
   * whole table is the fallback. Without it, only the whole table is loaded.
   */
  languageFile?: string | ((language: LanguageCode) => string) | null;
  /**
   * Where the whole table is published. Defaults to `./translations.json`.
   * `window.DS_ONE_TRANSLATIONS_FILE` and the `data-ds-one-translations`,
   * `ds-one:translations` and `ds-one-translations` markers in the page win
   * over it.
   */
  translationsFile?: string;
  /** The localStorage key that keeps the chosen language. Defaults to `language`. */
  storageKey?: string;
  /**
   * Report keys with no translation on the console, each once. Off by
   * default, since components also show what people write themselves, and
   * that is not a key anyone forgot. `window.DS_ONE_I18N_DEBUG = true` or
   * localStorage `ds-one:i18n-debug` set to `on` turn it on as well.
   */
  reportMissingKeys?: boolean | (() => boolean);
  /**
   * Load Design system 1's shared interface words (buttons, sign-in, empty
   * states, dates, language names) beneath the product's own words, so the
   * product's text wins where both have a key. Off by default.
   */
  sharedWords?: boolean;
  /**
   * Which languages get an address prefix (`/ja/…`) and whether the default
   * language has one; see `configureLanguageRouting`. Without `languages`
   * here, the product's `languages` get a prefix.
   */
  routing?: LanguageRoutingOptions;
  /**
   * Take the language from the address: on a page whose path starts with a
   * language prefix (`/ja/…`, by `routing`), that language is the current one
   * from the start, and it is not stored, so following a link to `/ja/…`
   * never overwrites the choice a person made. `setLanguage` still stores
   * what a person chooses. The theme bootstrap reads it too, so `lang` is
   * right before the first paint. Off by default.
   */
  languageFromAddress?: boolean;
  /**
   * Where the language is written as `lang`: the document's root element by
   * default; an element (an embedded surface, such as a prototype in another
   * language than the page around it) to keep it there; `false` to write it
   * nowhere. The theme bootstrap writes the root's `lang` only by default.
   */
  langTarget?: HTMLElement | false;
};

/** What `setLanguage` does besides changing the language. */
export type SetLanguageOptions = {
  /**
   * Store the choice, so the next visit opens in it. On by default; `false`
   * keeps it to this page (a language an address names, a preview).
   */
  remember?: boolean;
};

// Bundled translations (keys.json may not exist - will use external translations if not available)
// This is a fallback for when external translations aren't loaded
let translationKeys: TranslationMap = {};

/**
 * Every language Design system 1 orders, names and maps browser languages to:
 * the list in `./languages` (`LANGUAGES`). A product turns on the ones it
 * translates with `configureI18n({ languages })`.
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = LANGUAGES;

const DISPLAY_NAME_CACHE = new Map<string, Intl.DisplayNames>();
let displayNameFallbackWarningShown = false;

// Declare window property for external translations
declare global {
  interface Window {
    DS_ONE_TRANSLATIONS?: Record<string, TranslationData>;
    DS_ONE_TRANSLATIONS_FILE?: string;
    DS_ONE_I18N?: I18nOptions;
    DS_ONE_I18N_DEBUG?: boolean;
  }
}

const DEFAULT_TRANSLATION_FILE = "./translations.json";
const DEFAULT_STORAGE_KEY = "language";
const DEBUG_STORAGE_KEY = "ds-one:i18n-debug";

const defaultLanguage: LanguageCode = "en";

let i18nOptions: I18nOptions =
  typeof window !== "undefined" && window.DS_ONE_I18N
    ? { ...window.DS_ONE_I18N }
    : {};

// Design system 1's shared words, kept apart from the product's so a product's
// file arriving never wipes them, and looked up beneath the product's words.
let sharedWords: TranslationsFile | undefined;

// ============================================================================
// Storage
// ============================================================================

function storage(): Storage | undefined {
  try {
    return typeof window !== "undefined"
      ? (window.localStorage ?? undefined)
      : undefined;
  } catch {
    // Storage can be blocked (private windows, cleared site data)
    return undefined;
  }
}

function storageKey(): string {
  return i18nOptions.storageKey || DEFAULT_STORAGE_KEY;
}

function readStoredLanguage(): LanguageCode | null {
  if (i18nOptions.persist === false) return null;
  try {
    return (storage()?.getItem(storageKey()) as LanguageCode | null) || null;
  } catch {
    return null;
  }
}

function storeLanguage(language: LanguageCode): void {
  if (i18nOptions.persist === false) return;
  try {
    storage()?.setItem(storageKey(), language);
  } catch {
    // The choice still holds for this page
  }
}

// ============================================================================
// Language codes
// ============================================================================

function extractPrimarySubtag(code: LanguageCode): string {
  if (!code) {
    return "";
  }
  return code.toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * The language whose file a page loads for `language`: one of the configured
 * languages when a list is set (null when it speaks none of them), otherwise
 * the primary subtag.
 */
function fileLanguage(language: LanguageCode): LanguageCode | null {
  const configured = i18nOptions.languages;
  if (!configured || configured.length === 0) {
    return extractPrimarySubtag(language) || null;
  }

  const normalized = (language || "").toLowerCase().replace("_", "-");
  const exact = configured.find((code) => code.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }

  const primary = extractPrimarySubtag(language);
  return configured.find((code) => code.toLowerCase() === primary) ?? null;
}

function languageFileFor(language: LanguageCode): string | null {
  const pattern = i18nOptions.languageFile;
  if (!pattern) {
    return null;
  }
  const path =
    typeof pattern === "function"
      ? pattern(language)
      : pattern.split("{language}").join(language);
  return normalizeCandidate(path);
}

// ============================================================================
// Loading translations
// ============================================================================

// CDN Loader: Automatically detects and loads translation JSON files
// for CDN users who want to use external translations

let loadAttempted = false;

function normalizeCandidate(path: string): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  return `./${trimmed}`;
}

function findAttributeCandidate(): string | null {
  if (typeof document === "undefined" || !document.querySelector) {
    return null;
  }

  const scriptWithAttribute = document.querySelector(
    "script[data-ds-one-translations]"
  );
  const scriptCandidate = scriptWithAttribute?.getAttribute(
    "data-ds-one-translations"
  );
  if (scriptCandidate) {
    return scriptCandidate;
  }

  const metaCandidate = document
    .querySelector('meta[name="ds-one:translations"]')
    ?.getAttribute("content");
  if (metaCandidate) {
    return metaCandidate;
  }

  const linkCandidate = document
    .querySelector('link[rel="ds-one-translations"]')
    ?.getAttribute("href");
  if (linkCandidate) {
    return linkCandidate;
  }

  return null;
}

/** Where the whole table is: what the page names, else the option, else the default. */
function resolveTableSources(): string[] {
  const candidates: string[] = [];

  const windowCandidate =
    typeof window !== "undefined" ? window.DS_ONE_TRANSLATIONS_FILE : null;
  const attributeCandidate = findAttributeCandidate();

  // Only use explicitly configured paths, or the single default
  const windowNormalized = normalizeCandidate(windowCandidate ?? "");
  if (windowNormalized) {
    candidates.push(windowNormalized);
  }

  const attrNormalized = normalizeCandidate(attributeCandidate ?? "");
  if (attrNormalized && !candidates.includes(attrNormalized)) {
    candidates.push(attrNormalized);
  }

  // Only try the default if no explicit path was configured
  if (candidates.length === 0) {
    candidates.push(
      normalizeCandidate(i18nOptions.translationsFile ?? "") ??
        DEFAULT_TRANSLATION_FILE
    );
  }

  return candidates;
}

function resolveTranslationSources(): string[] {
  const tables = resolveTableSources();
  // With one file per language, the page's own language first, then the
  // whole table.
  const startLanguage =
    fileLanguage(currentLanguage.value) ?? defaultLanguage;
  const own = languageFileFor(startLanguage);
  return own ? [own, ...tables.filter((source) => source !== own)] : tables;
}

/** The language whose own file `source` is, when it is one. */
function languageOfSource(source: string): LanguageCode | undefined {
  const start = fileLanguage(currentLanguage.value) ?? defaultLanguage;
  return languageFileFor(start) === source ? start : undefined;
}

function validateTranslationMap(
  candidate: unknown
): candidate is TranslationMap {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  return Object.values(candidate).every(
    (entry) => entry && typeof entry === "object"
  );
}

// One request per file, shared by startup and a language switch alike. A file
// that failed is forgotten, so a later attempt asks again.
const translationFiles = new Map<string, Promise<TranslationMap | null>>();

function fetchTranslationFile(
  source: string,
  language?: LanguageCode
): Promise<TranslationMap | null> {
  let pending = translationFiles.get(source);
  if (!pending) {
    pending = readTranslationFile(source, language).then((translations) => {
      if (!translations) {
        translationFiles.delete(source);
      }
      return translations;
    });
    translationFiles.set(source, pending);
  }
  return pending;
}

async function readTranslationFile(
  source: string,
  language?: LanguageCode
): Promise<TranslationMap | null> {
  try {
    const response = await fetch(source);

    if (!response.ok) {
      // 404 is expected if no translations file exists - don't log as error
      return null;
    }

    const json: unknown = await response.json();
    // A language's own file may hold its table bare ({ "Save": "Gem" })
    const translations = language
      ? (readLanguageFile(language, json) ?? json)
      : json;

    if (!validateTranslationMap(translations)) {
      console.warn(
        `[Design system 1] Invalid translation format in ${source}. Expected object with language codes as keys.`
      );
      return null;
    }

    const languages = Object.keys(translations);
    if (languages.length === 0) {
      console.warn(`[Design system 1] No languages found in ${source}`);
      return null;
    }

    return translations;
  } catch {
    // Silently fail - file likely doesn't exist or isn't valid JSON
    return null;
  }
}

/** Add words to what is loaded, keeping the languages already there. */
function mergeTranslations(translations: TranslationMap): void {
  if (typeof window === "undefined") {
    translationKeys = { ...translationKeys, ...translations };
    return;
  }
  window.DS_ONE_TRANSLATIONS = {
    ...window.DS_ONE_TRANSLATIONS,
    ...translations,
  };
}

/**
 * Attempts to load translations from a JSON file in the same directory
 */
async function loadExternalTranslations(): Promise<boolean> {
  // Only attempt once
  if (loadAttempted) {
    return false;
  }
  loadAttempted = true;

  if (typeof window === "undefined") {
    return false;
  }

  // Check if translations are already loaded (e.g., by the application)
  if (
    window.DS_ONE_TRANSLATIONS &&
    Object.keys(window.DS_ONE_TRANSLATIONS).length > 0
  ) {
    debugLog(
      `Translations already loaded (${Object.keys(window.DS_ONE_TRANSLATIONS).length} languages), skipping auto-load`
    );
    return true;
  }

  const sources = resolveTranslationSources();

  for (const source of sources) {
    const translations = await fetchTranslationFile(
      source,
      languageOfSource(source)
    );
    if (!translations) {
      continue;
    }

    mergeTranslations(translations);

    const languages = Object.keys(translations);
    debugLog(
      `External translations loaded from ${source}: ${languages.length} language(s) – ${languages.join(", ")}`
    );

    window.dispatchEvent(new CustomEvent("translations-ready"));
    return true;
  }

  debugLog(
    `No external translations found at ${sources[0] ?? DEFAULT_TRANSLATION_FILE}. Using bundled translations.`
  );

  return false;
}

const languageLoads = new Map<string, Promise<void>>();

/**
 * Fetch a language's words when the page needs one it has not got: its own
 * file, or the whole table when that file is missing. Does nothing unless
 * `languageFile` is configured, since otherwise the whole table, with every
 * language in it, is what the page loads at startup.
 */
export function loadLanguage(language: LanguageCode): Promise<void> {
  if (typeof window === "undefined" || !i18nOptions.languageFile) {
    return Promise.resolve();
  }

  const code = fileLanguage(language) ?? defaultLanguage;
  if (getTranslationData()[code]) {
    return Promise.resolve();
  }

  let pending = languageLoads.get(code);
  if (!pending) {
    pending = (async () => {
      const own = languageFileFor(code);
      let translations = own ? await fetchTranslationFile(own, code) : null;
      for (const source of resolveTableSources()) {
        if (translations) {
          break;
        }
        translations = await fetchTranslationFile(source);
      }
      if (!translations) {
        return;
      }
      mergeTranslations(translations);
      window.dispatchEvent(new CustomEvent("translations-ready"));
    })();
    languageLoads.set(code, pending);
  }
  return pending;
}

// Get translation data - prioritize external, fall back to bundled
function getTranslationData(): TranslationMap {
  // Check for externally loaded translations first (CDN usage)
  if (typeof window !== "undefined" && window.DS_ONE_TRANSLATIONS) {
    return window.DS_ONE_TRANSLATIONS;
  }

  // Fall back to bundled translations
  return translationKeys;
}

// ============================================================================
// Language names and ordering
// ============================================================================

function sortLanguageCodes(codes: LanguageCode[]): LanguageCode[] {
  return [...codes].sort((a, b) => {
    const priorityA = languageOrder(a);
    const priorityB = languageOrder(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.localeCompare(b);
  });
}

function getDisplayNameForLocale(
  locale: string,
  code: LanguageCode
): string | undefined {
  const normalizedLocale = locale?.replace("_", "-");
  if (!normalizedLocale) {
    return undefined;
  }

  try {
    let displayNames = DISPLAY_NAME_CACHE.get(normalizedLocale);

    if (!displayNames) {
      displayNames = new Intl.DisplayNames([normalizedLocale], {
        type: "language",
      });
      DISPLAY_NAME_CACHE.set(normalizedLocale, displayNames);
    }

    const cleanedCode = code.replace("_", "-");

    // Try full tag first
    const fullMatch = displayNames.of(cleanedCode);
    if (fullMatch && fullMatch !== cleanedCode) {
      return fullMatch;
    }

    // Then the primary subtag
    const baseMatch = displayNames.of(extractPrimarySubtag(cleanedCode));
    if (baseMatch) {
      return baseMatch;
    }
  } catch {
    // Intl.DisplayNames may not be supported; fall back gracefully
    if (!displayNameFallbackWarningShown) {
      console.info(
        "[Design system 1] Intl.DisplayNames is not available, using fallback language names."
      );
      displayNameFallbackWarningShown = true;
    }
  }

  return undefined;
}

// English names from the language list, for when Intl.DisplayNames is missing
function getFallbackDisplayName(code: LanguageCode): string | undefined {
  const language = normalizeLanguage(code, null);
  return language ? LANGUAGE_METADATA[language].label : undefined;
}

export function getLanguageDisplayName(
  code: LanguageCode,
  options: { locale?: string } = {}
): string {
  if (!code) {
    return "";
  }

  const localesToTry: string[] = [];

  if (options.locale) {
    localesToTry.push(options.locale);
  }

  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      localesToTry.push(...navigator.languages);
    }
    if (navigator.language) {
      localesToTry.push(navigator.language);
    }
  }

  localesToTry.push(defaultLanguage);
  localesToTry.push("en");

  const tried = new Set<string>();

  for (const locale of localesToTry) {
    if (!locale || tried.has(locale)) {
      continue;
    }
    tried.add(locale);

    const displayName = getDisplayNameForLocale(locale, code);
    if (displayName) {
      return displayName;
    }
  }

  const fallback = getFallbackDisplayName(code);
  if (fallback) {
    return fallback;
  }

  // Fall back to the primary subtag in uppercase
  const primary = extractPrimarySubtag(code);
  return primary ? primary.toUpperCase() : code;
}

// ============================================================================
// Browser language
// ============================================================================

/** The languages a browser's language may become: the product's, else the list. */
function configuredLanguages(): readonly LanguageCode[] | null {
  return i18nOptions.languages?.length ? i18nOptions.languages : null;
}

/**
 * A browser language tag as one the product speaks: within the configured
 * languages when they are set (a relative standing in, so `no` reads `nb` for
 * a product that speaks `nb`), else within the whole list. Null when none fits.
 */
function resolvePreferredLanguage(languageTag: string): LanguageCode | null {
  if (!languageTag) {
    return null;
  }

  const configured = configuredLanguages();
  const members = configured
    ? configured.filter(isLanguage)
    : (LANGUAGES as readonly Language[]);

  const match = members.length
    ? normalizeLanguage(languageTag, null, members)
    : null;
  if (match) {
    return match;
  }

  // A configured language outside the list (`nl`), by its primary subtag
  return configured ? fileLanguage(languageTag) : null;
}

/**
 * The browser's language, as one the product speaks: the first of the
 * browser's languages that fits. When none does, a product that configured
 * its languages gets English; one that configured nothing gets the browser's
 * own tag, since its words may still be loaded under it.
 */
export function getBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined" || !navigator) {
    return defaultLanguage;
  }

  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ].filter((tag): tag is string => Boolean(tag));

  for (const candidate of candidates) {
    const resolved = resolvePreferredLanguage(candidate);
    if (resolved) {
      return resolved;
    }
  }

  if (!configuredLanguages() && candidates[0]) {
    return candidates[0];
  }
  return defaultLanguage;
}

// ============================================================================
// Current language
// ============================================================================

function dispatchLanguageChanged(language: LanguageCode): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent("language-changed", {
      detail: { language },
      bubbles: true,
      composed: true,
    })
  );
}

/** The language the address names (`/ja/…`), when the product takes it from there. */
function addressLanguage(): LanguageCode | null {
  if (!i18nOptions.languageFromAddress || typeof window === "undefined") {
    return null;
  }
  const path = window.location?.pathname;
  // The product's routing, also before configureI18n has passed it on.
  return path ? parseLanguagePath(path, routingOptions()).language : null;
}

/** The element whose `lang` follows the language, or null when none does. */
function langElement(): HTMLElement | null {
  const target = i18nOptions.langTarget;
  if (target === false) {
    return null;
  }
  if (target) {
    return target;
  }
  return typeof document !== "undefined" ? (document.documentElement ?? null) : null;
}

// Create a reactive signal for the current language (Portfolio pattern)
export const currentLanguage = {
  value: addressLanguage() || readStoredLanguage() || getBrowserLanguage(),
  set: function (lang: LanguageCode, options: SetLanguageOptions = {}) {
    this.value = lang;
    if (options.remember !== false) {
      storeLanguage(lang);
    }
    void loadLanguage(lang);
    // What reads the document's language (dates, screen readers, hyphenation)
    // follows too, rather than keeping the language the page was opened in.
    const element = langElement();
    if (element) {
      element.lang = lang;
    }
    dispatchLanguageChanged(lang);
  },
};

/**
 * Set the language module up for a product (see `I18nOptions`). Call it
 * straight after importing the module: the first translations are fetched
 * once the code that imported it has run. Called later, it fetches the current
 * language's file if one is now configured.
 */
export function configureI18n(next: I18nOptions): void {
  const previousPersist = i18nOptions.persist;
  const previousKey = storageKey();
  const previousLanguages = i18nOptions.languages;
  const previousAddress = i18nOptions.languageFromAddress;
  const previousRouting = i18nOptions.routing;
  i18nOptions = { ...i18nOptions, ...next };

  applyRouting();

  if (
    i18nOptions.persist !== previousPersist ||
    storageKey() !== previousKey ||
    i18nOptions.languages !== previousLanguages ||
    i18nOptions.languageFromAddress !== previousAddress ||
    (i18nOptions.languageFromAddress && i18nOptions.routing !== previousRouting)
  ) {
    // The language the address names, else the stored choice under the new
    // key, or the browser's language, as one the product speaks
    const stored = readStoredLanguage();
    let language: LanguageCode = stored || getBrowserLanguage();
    if (stored && configuredLanguages()) {
      language = resolvePreferredLanguage(stored) ?? defaultLanguage;
    }
    language = addressLanguage() ?? language;
    if (language !== currentLanguage.value) {
      currentLanguage.value = language;
      dispatchLanguageChanged(language);
    }
  }

  if (next.sharedWords) {
    void loadSharedWords();
  }

  if (loadAttempted && i18nOptions.languageFile) {
    void loadLanguage(currentLanguage.value);
  }
}

/** Address prefixes follow the product's languages unless routing names its own. */
function applyRouting(): void {
  if (!i18nOptions.routing && !i18nOptions.languages) {
    return;
  }
  configureLanguageRouting(routingOptions());
}

function routingOptions(): LanguageRoutingOptions {
  return {
    ...(i18nOptions.languages ? { languages: i18nOptions.languages } : {}),
    ...i18nOptions.routing,
  };
}

let sharedWordsLoad: Promise<void> | null = null;

/**
 * Load Design system 1's shared interface words beneath the product's own
 * (what `configureI18n({ sharedWords: true })` does). They arrive in a chunk
 * of their own, so products that do not use them do not carry them.
 */
export function loadSharedWords(): Promise<void> {
  if (!sharedWordsLoad) {
    sharedWordsLoad = import("./shared-words").then(({ SHARED_WORDS }) => {
      sharedWords = SHARED_WORDS;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("translations-ready"));
      }
    });
  }
  return sharedWordsLoad;
}

/**
 * The words a page loads as it starts (the shared words, the translations file), announced once
 * between them: each announcement redraws every translated word on the page, so three arrivals in
 * the first half second used to redraw it three times. A load that never ends holds the
 * announcement back no longer than `STARTUP_WAIT`.
 */
const startupLoads: Promise<unknown>[] = [];
const STARTUP_WAIT = 1000;
let announcement: Promise<void> | null = null;
let announced = false;
/** The window this module loaded into, which hears its announcements. */
const page: Window | undefined = typeof window !== "undefined" ? window : undefined;

function announceTranslations(): void {
  if (announcement) return;
  const wait = new Promise<void>((resolve) => setTimeout(resolve, STARTUP_WAIT));
  announcement = Promise.race([Promise.allSettled(startupLoads.splice(0)), wait]).then(() => {
    announcement = null;
    announced = true;
    if (!eventful() || !page) return;
    page.dispatchEvent(new CustomEvent("translations-loaded"));
    // Dispatch language-changed to update all components
    dispatchLanguageChanged(currentLanguage.value);
  });
}

applyRouting();
if (i18nOptions.sharedWords) {
  startupLoads.push(loadSharedWords());
}

// Auto-load translations when this module is imported (for CDN bundle).
// Waits a task, so a product can configure the module first, even after a
// dynamic import.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  let started: () => void = () => {};
  startupLoads.push(new Promise<void>((resolve) => (started = resolve)));
  const start = () => {
    if (i18nOptions.autoLoad !== false) void loadExternalTranslations().finally(started);
    else started();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    // DOM is already ready
    setTimeout(start, 0);
  }
}

// Listen for external translations being loaded. Only where window takes events:
// a server or worker runtime may define a window without them, and the timer
// below would otherwise throw after the code that imported this has finished.
const eventful = () => typeof window !== "undefined" && typeof window.addEventListener === "function" && typeof window.dispatchEvent === "function";
if (eventful()) {
  // New words: translations-loaded and language-changed, once for everything still arriving.
  window.addEventListener("translations-ready", announceTranslations);

  // A page whose words were all there at once still hears translations-loaded once, after its
  // listeners have had a moment to attach; one already announced or on its way is enough.
  setTimeout(() => {
    if (eventful() && !announced && window === page) announceTranslations();
  }, 100);
}

// ============================================================================
// Looking words up
// ============================================================================

// Missing keys are ordinary: the same components carry what people write
// themselves, and a list called "Iroco.com" is not a key anyone forgot. So the
// console stays quiet unless someone is hunting for a missing key, and then
// each key is only reported once.
const REPORTED_MISSING_KEYS = new Set<string>();

// Loading is quiet too: what loaded, and from where, is only said when
// someone has turned the debug switch on.
function debugLog(message: string): void {
  if (!debugSwitchOn()) {
    return;
  }
  console.info(`[Design system 1] ${message}`);
}

function debugSwitchOn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.DS_ONE_I18N_DEBUG === true) {
    return true;
  }
  try {
    return storage()?.getItem(DEBUG_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function missingKeyReportingOn(): boolean {
  const option = i18nOptions.reportMissingKeys;
  try {
    if (typeof option === "function" ? option() : option) {
      return true;
    }
  } catch {
    // A failing check reports nothing
  }

  return debugSwitchOn();
}

function reportMissingKey(key: string, language: LanguageCode): void {
  if (!missingKeyReportingOn()) {
    return;
  }
  const seen = `${language}:${key}`;
  if (REPORTED_MISSING_KEYS.has(seen)) {
    return;
  }
  REPORTED_MISSING_KEYS.add(seen);
  console.warn(
    `[Design system 1 (Internationalization)] No translation found for key "${key}" in "${language}"`
  );
}

/**
 * A key's text in the current language, with its placeholders (`{name}` and
 * `{{name}}` alike) filled from `params`.
 */
export function translate(key: string, params?: TranslationParams): string {
  return textInLanguage(key, currentLanguage.value, params);
}

// The feedback module (`./feedback-words.ts`) reads its default words through
// this when the page loads the language module, and English without it.
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("design-system-1.translate")] = translate;

/**
 * A key's text in a given language, whatever the page's own language is (a
 * drawing made for one language, say). The fallback order: the language, its
 * primary subtag (`ja-JP` reads `ja`), its relatives (`nn` reads `nb`,
 * `pt-BR` reads `pt`), English, then the key itself. In each, the product's
 * words come before the shared words.
 */
export function textInLanguage(
  key: string,
  language: LanguageCode,
  params?: TranslationParams
): string {
  const data = getTranslationData();
  const resolved = resolveText(key, language, [data, sharedWords], params);
  if (resolved.language !== null) {
    return resolved.text;
  }

  // Loaded a language at a time, English may not have arrived yet
  const codes = fallbackLanguages(language);
  if (
    !codes.includes(defaultLanguage) &&
    !data?.[defaultLanguage] &&
    codes.some((code) => data?.[code])
  ) {
    void loadLanguage(defaultLanguage);
  }

  reportMissingKey(key, codes[codes.length - 1] ?? language);
  return resolved.text;
}

export function hasTranslation(
  key: string,
  language: LanguageCode = currentLanguage.value
): boolean {
  if (!key) {
    return false;
  }

  const codes = fallbackLanguages(language);
  if (!codes.includes(defaultLanguage)) {
    codes.push(defaultLanguage);
  }

  return [getTranslationData(), sharedWords].some((source) =>
    codes.some((code) => {
      const langData = source?.[code];
      return Boolean(
        langData && Object.prototype.hasOwnProperty.call(langData, key)
      );
    })
  );
}

// Get text - synchronous version for components
export function getText(key: string, params?: TranslationParams): string {
  return translate(key, params);
}

// Get available languages: the configured ones, else the ones in the loaded words
export function getAvailableLanguages(): Promise<LanguageCode[]> {
  return Promise.resolve(getAvailableLanguagesSync());
}

// Synchronous version for immediate use
export function getAvailableLanguagesSync(): LanguageCode[] {
  if (i18nOptions.languages && i18nOptions.languages.length > 0) {
    return sortLanguageCodes([...i18nOptions.languages]);
  }

  const currentData = getTranslationData();

  if (currentData && Object.keys(currentData).length > 0) {
    return sortLanguageCodes(Object.keys(currentData));
  }
  return [defaultLanguage];
}

/**
 * Add words to what is loaded: one language's (`loadTranslations("da", {…})`)
 * or several at once (`loadTranslations({ en: {…}, da: {…} })`), from a JSON
 * file or a TypeScript module of the same shape (a `Partial` table is fine).
 * Components update as they do when a translation file arrives.
 */
export function loadTranslations(
  language: LanguageCode,
  translations: TranslationTable
): void;
export function loadTranslations(translations: TranslationsFile): void;
export function loadTranslations(
  languageOrMap: LanguageCode | TranslationsFile,
  translations?: TranslationTable
): void {
  const map: TranslationsFile =
    typeof languageOrMap === "string"
      ? { [languageOrMap]: translations ?? {} }
      : languageOrMap;

  if (!validateTranslationMap(map)) {
    console.warn(
      "[Design system 1] loadTranslations expects words keyed by language code."
    );
    return;
  }

  const data = getTranslationData();
  const merged: TranslationMap = {};
  for (const [code, words] of Object.entries(map)) {
    const defined: TranslationData = {};
    for (const [key, text] of Object.entries(words ?? {})) {
      if (typeof text === "string") {
        defined[key] = text;
      }
    }
    merged[code] = { ...data[code], ...defined };
  }
  mergeTranslations(merged);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("translations-ready"));
  }
}

/**
 * Change the language: store it (unless `remember: false`), fetch its words,
 * write it as `lang` (see `langTarget`) and announce `language-changed`.
 */
export function setLanguage(language: LanguageCode, options?: SetLanguageOptions): void {
  // The signal owns persistence, loading, document language and notification.
  currentLanguage.set(language, options);
}
