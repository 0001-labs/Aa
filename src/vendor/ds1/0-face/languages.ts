/**
 * The languages every product chooses from: one list, with the name of
 * each in English and in itself, and how to read whatever a browser, a URL or
 * a saved setting calls a language.
 *
 * No browser code, so a product's backend (Convex, Node) imports it as well.
 * Each product turns on the subset it translates (`configureI18n({ languages })`).
 */

/** Every language Design system 1 knows, in the order pickers show them. */
export const LANGUAGES = [
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "is",
  "it",
  "ja",
  "ko",
  "nb",
  "nn",
  "no",
  "pt",
  "pt-BR",
  "sv",
  "zh",
] as const;

export type Language = (typeof LANGUAGES)[number];

/** The language every product falls back to. */
export const DEFAULT_LANGUAGE: Language = "en";

export type LanguageMetadata = {
  code: Language;
  /** The name in English */
  label: string;
  /** The name in the language itself, as a picker shows it */
  nativeLabel: string;
  /** Other tags that mean this language, lower case (`da-dk`) */
  aliases: readonly string[];
};

export const LANGUAGE_METADATA: Readonly<Record<Language, LanguageMetadata>> = {
  da: { code: "da", label: "Danish", nativeLabel: "Dansk", aliases: ["da-dk"] },
  de: {
    code: "de",
    label: "German",
    nativeLabel: "Deutsch",
    aliases: ["de-de", "de-at", "de-ch"],
  },
  en: {
    code: "en",
    label: "English",
    nativeLabel: "English",
    aliases: ["en-us", "en-gb", "en-ca", "en-au", "en-nz", "en-ie"],
  },
  es: {
    code: "es",
    label: "Spanish",
    nativeLabel: "Español",
    aliases: ["es-es", "es-mx", "es-ar", "es-cl", "es-co"],
  },
  fi: { code: "fi", label: "Finnish", nativeLabel: "Suomi", aliases: ["fi-fi"] },
  fr: {
    code: "fr",
    label: "French",
    nativeLabel: "Français",
    aliases: ["fr-fr", "fr-ca", "fr-be", "fr-ch"],
  },
  is: { code: "is", label: "Icelandic", nativeLabel: "Íslenska", aliases: ["is-is"] },
  it: { code: "it", label: "Italian", nativeLabel: "Italiano", aliases: ["it-it", "it-ch"] },
  ja: { code: "ja", label: "Japanese", nativeLabel: "日本語", aliases: ["ja-jp"] },
  ko: { code: "ko", label: "Korean", nativeLabel: "한국어", aliases: ["ko-kr"] },
  nb: {
    code: "nb",
    label: "Norwegian Bokmål",
    nativeLabel: "Norsk bokmål",
    aliases: ["nb-no"],
  },
  nn: {
    code: "nn",
    label: "Norwegian Nynorsk",
    nativeLabel: "Norsk nynorsk",
    aliases: ["nn-no"],
  },
  no: { code: "no", label: "Norwegian", nativeLabel: "Norsk", aliases: ["no-no"] },
  pt: { code: "pt", label: "Portuguese", nativeLabel: "Português", aliases: ["pt-pt"] },
  "pt-BR": {
    code: "pt-BR",
    label: "Brazilian Portuguese",
    nativeLabel: "Português (Brasil)",
    aliases: ["pt-br"],
  },
  sv: { code: "sv", label: "Swedish", nativeLabel: "Svenska", aliases: ["sv-se", "sv-fi"] },
  zh: {
    code: "zh",
    label: "Chinese",
    nativeLabel: "中文",
    aliases: ["zh-cn", "zh-tw", "zh-hk", "zh-sg", "zh-hans", "zh-hant"],
  },
};

/**
 * Languages close enough to stand in for each other, nearest first. A product
 * that speaks only one of them gets it for the others (one that speaks `nb`
 * reads `no` and `nn` as `nb`; one that speaks `pt-BR` reads `pt` as it), and
 * a missing word is looked up in them before English.
 */
const RELATED_LANGUAGES: Readonly<Partial<Record<Language, readonly Language[]>>> = {
  nb: ["no", "nn"],
  no: ["nb", "nn"],
  nn: ["nb", "no"],
  pt: ["pt-BR"],
  "pt-BR": ["pt"],
};

/** Every tag, lower case, to the language it means. */
const ALIASES = new Map<string, Language>();
for (const code of LANGUAGES) {
  ALIASES.set(code.toLowerCase(), code);
  for (const alias of LANGUAGE_METADATA[code].aliases) {
    ALIASES.set(alias, code);
  }
}

const ORDER = new Map<string, number>(LANGUAGES.map((code, index) => [code, index]));

/** Whether a value is one of the list's codes, exactly as written there. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && ORDER.has(value);
}

function primarySubtag(tag: string): string {
  return tag.split("-")[0] ?? "";
}

/** The first of `language` and its relatives that `allowed` holds. */
function within(language: Language, allowed: ReadonlySet<Language>): Language | null {
  if (allowed.has(language)) {
    return language;
  }
  return RELATED_LANGUAGES[language]?.find((related) => allowed.has(related)) ?? null;
}

/**
 * Read any way of naming a language as one of the list: `da-DK`, `nb_NO`,
 * `pt-br`, or a browser's list (`"nl-NL,da;q=0.8"`, the first language it
 * knows wins). Pass the product's languages to land on one it speaks: a
 * relative stands in where the product lacks the language itself, so with
 * `nb` and `pt-BR` among them, `no` and `nn` read as `nb`, and `pt` as `pt-BR`. Returns
 * `fallback` when nothing matches (`null` to tell).
 */
export function normalizeLanguage(
  input: string | null | undefined,
  fallback?: Language,
  languages?: readonly Language[]
): Language;
export function normalizeLanguage(
  input: string | null | undefined,
  fallback: null,
  languages?: readonly Language[]
): Language | null;
export function normalizeLanguage(
  input: string | null | undefined,
  fallback: Language | null = DEFAULT_LANGUAGE,
  languages: readonly Language[] = LANGUAGES
): Language | null {
  const allowed = new Set(languages);
  const tokens = String(input ?? "")
    .split(",")
    .map((token) => token.split(";")[0]?.trim().toLowerCase().replace(/_/g, "-") ?? "")
    .filter(Boolean);

  for (const token of tokens) {
    const exact = ALIASES.get(token);
    const match = exact ? within(exact, allowed) : null;
    if (match) {
      return match;
    }
    const base = ALIASES.get(primarySubtag(token));
    const baseMatch = base ? within(base, allowed) : null;
    if (baseMatch) {
      return baseMatch;
    }
  }

  return fallback;
}

/**
 * The languages of `subset` that the list knows, in the list's order, each
 * once. Codes are matched whatever their case (`pt-br` is `pt-BR`); others are
 * left out.
 */
export function pickLanguages(subset: Iterable<string>): Language[] {
  const wanted = new Set<Language>();
  for (const code of subset) {
    const member = ALIASES.get(String(code).toLowerCase().replace(/_/g, "-"));
    if (member && member.toLowerCase() === String(code).toLowerCase().replace(/_/g, "-")) {
      wanted.add(member);
    }
  }
  return LANGUAGES.filter((code) => wanted.has(code));
}

/**
 * Where a language sits in the list's order, for sorting: the code itself,
 * else its primary subtag; codes the list does not know come last.
 */
export function languageOrder(code: string): number {
  const normalized = String(code ?? "").toLowerCase().replace(/_/g, "-");
  const member = ALIASES.get(normalized) ?? ALIASES.get(primarySubtag(normalized));
  return member ? (ORDER.get(member) ?? LANGUAGES.length) : LANGUAGES.length;
}

/**
 * The languages to look a word up in for `language`, before English: the
 * language as given, its primary subtag (`ja-JP` reads `ja`), then its
 * relatives (`nn` reads `nb`, `pt-BR` reads `pt`).
 */
export function fallbackLanguages(language: string): string[] {
  const codes: string[] = [];
  const add = (code: string | undefined) => {
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  };

  add(language);
  const normalized = String(language ?? "").toLowerCase().replace(/_/g, "-");
  const member = ALIASES.get(normalized);
  add(member);
  add(primarySubtag(normalized));
  const related = member ?? ALIASES.get(primarySubtag(normalized));
  for (const code of related ? (RELATED_LANGUAGES[related] ?? []) : []) {
    add(code);
  }
  return codes;
}
