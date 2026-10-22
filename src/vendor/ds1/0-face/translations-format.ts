/**
 * The one translations file format every product writes its words in.
 *
 *   { "<language>": { "<key>": "<text>" } }
 *
 * - `<language>` is a code from the language list (`da`, `pt-BR`).
 * - `<key>` is any string: the English sentence (`"Send": "Send"`) or a
 *   dotted id (`"settings.language": "Language"`). Both are the same format.
 * - English (`en`) is the fallback table. When a key is missing from `en`
 *   too, the key itself is the English text, so a sentence key needs no
 *   English entry and an id key needs one.
 * - Placeholders are `{name}` and `{{name}}` alike; `fillPlaceholders` (and
 *   `translate(key, params)`) fill both.
 * - A per-language file (`/translations/da.json`) holds one language's table,
 *   wrapped as `{ "da": { … } }` (or bare, `{ … }`, which `readLanguageFile`
 *   wraps).
 * - A product can ship the same shape as a TypeScript module and pass it to
 *   `loadTranslations`.
 *
 * A word is looked up in the language, its primary subtag (`ja-JP` reads
 * `ja`), its relatives (`nn` reads `nb`, `pt-BR` reads `pt`), then English,
 * then the key itself. See `resolveText`.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, fallbackLanguages } from "./languages";

/** One language's words, key to text. Values may be absent (a `Partial` table). */
export type TranslationTable = { readonly [key: string]: string | undefined };

/** Every language's words, keyed by language code. */
export type TranslationsFile = { readonly [language: string]: TranslationTable | undefined };

/** Values for a text's placeholders, by name. */
export type TranslationParams = { readonly [name: string]: string | number | boolean };

/** The language whose table is the fallback. */
export const FALLBACK_LANGUAGE = DEFAULT_LANGUAGE;

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}|\{([\w.-]+)\}/g;

/** The names of a text's placeholders, `{name}` and `{{name}}` alike, each once. */
export function placeholdersIn(text: string): string[] {
  const names: string[] = [];
  for (const match of String(text ?? "").matchAll(PLACEHOLDER)) {
    const name = match[1] ?? match[2];
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Fill a text's placeholders, `{name}` and `{{name}}` alike. A placeholder
 * with no value is left as written, so it shows rather than vanishing.
 */
export function fillPlaceholders(text: string, params?: TranslationParams): string {
  if (!params) {
    return text;
  }
  return text.replace(PLACEHOLDER, (whole, double: string | undefined, single: string | undefined) => {
    const name = (double ?? single) as string;
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
  });
}

/** A key's English text: the `en` table's, else the key itself. */
export function englishText(file: TranslationsFile, key: string): string {
  return file[FALLBACK_LANGUAGE]?.[key] || key;
}

export type ResolvedText = {
  text: string;
  /** The language the text was found in, or null when the key itself was used */
  language: string | null;
};

/**
 * A key's text in `language`, from several sets of words: for each language
 * in the fallback order (the language, its primary subtag, its relatives,
 * English), the first set that has the key wins. With no text anywhere, the
 * key itself. Placeholders are filled from `params`.
 */
export function resolveText(
  key: string,
  language: string,
  sources: readonly (TranslationsFile | undefined)[],
  params?: TranslationParams
): ResolvedText {
  const order = fallbackLanguages(language);
  if (!order.includes(FALLBACK_LANGUAGE)) {
    order.push(FALLBACK_LANGUAGE);
  }

  for (const code of order) {
    for (const source of sources) {
      const text = source?.[code]?.[key];
      if (text) {
        return { text: fillPlaceholders(text, params), language: code };
      }
    }
  }
  return { text: fillPlaceholders(key, params), language: null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * A per-language file's words as a translations file: `{ "da": { … } }` as it
 * is, a bare `{ … }` table wrapped under `language`. Null when it is neither.
 */
export function readLanguageFile(language: string, value: unknown): TranslationsFile | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const wrapped = value[language];
  if (isPlainObject(wrapped)) {
    return value as TranslationsFile;
  }
  const values = Object.values(value);
  if (values.length > 0 && values.every((text) => typeof text === "string")) {
    return { [language]: value as TranslationTable };
  }
  if (values.length > 0 && values.every(isPlainObject)) {
    return value as TranslationsFile;
  }
  return null;
}

export type TranslationsCheck = {
  /** True when the value is a translations file a product can load */
  valid: boolean;
  /** What makes it unloadable */
  errors: string[];
  /** What loads but is likely a mistake */
  warnings: string[];
};

export type TranslationsCheckOptions = {
  /** The languages the file may hold. Defaults to the language list. */
  languages?: readonly string[];
};

const ID_KEY = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

/**
 * Check a value against the format. Errors: it is not an object of language
 * tables, or a text is not a string. Warnings: a language outside the list,
 * an id key (`settings.language`) with no English text, a translation whose
 * placeholders differ from its English text's.
 */
export function validateTranslations(
  value: unknown,
  options: TranslationsCheckOptions = {}
): TranslationsCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(value)) {
    return {
      valid: false,
      errors: ["Expected an object keyed by language code."],
      warnings,
    };
  }

  const known = new Set((options.languages ?? LANGUAGES).map((code) => code.toLowerCase()));
  const file = value as Record<string, unknown>;
  const english = isPlainObject(file[FALLBACK_LANGUAGE])
    ? (file[FALLBACK_LANGUAGE] as Record<string, unknown>)
    : {};

  for (const [language, table] of Object.entries(file)) {
    if (!isPlainObject(table)) {
      errors.push(`"${language}" should hold an object of words.`);
      continue;
    }
    if (!known.has(language.toLowerCase())) {
      warnings.push(`"${language}" is not in the language list.`);
    }

    for (const [key, text] of Object.entries(table)) {
      if (text === undefined) {
        continue;
      }
      if (typeof text !== "string") {
        errors.push(`"${language}" → "${key}" should be a string.`);
        continue;
      }
      if (language === FALLBACK_LANGUAGE) {
        continue;
      }

      const source = typeof english[key] === "string" ? (english[key] as string) : undefined;
      if (source === undefined && ID_KEY.test(key)) {
        warnings.push(`"${key}" has no English text, so English readers see the key.`);
      }
      const expected = placeholdersIn(source ?? key).sort().join(", ");
      const found = placeholdersIn(text).sort().join(", ");
      if (expected !== found) {
        warnings.push(
          `"${language}" → "${key}" has placeholders [${found}] where English has [${expected}].`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}

/** Whether a value is a translations file a product can load. */
export function isTranslationsFile(value: unknown): value is TranslationsFile {
  return validateTranslations(value).valid;
}
