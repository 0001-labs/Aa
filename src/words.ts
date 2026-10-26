/**
 * The words Aa shows (its toolbar, menus, placeholders, comment threads, diagrams and what it says to screen readers),
 * in the page's language, as Design system 1's feedback module finds its own:
 *
 * - a product's own words first, given with `setAaWords()`: a table keyed by the English words, or a function;
 * - then Design system 1's `translate()` where the page loads its language module (`configureI18n`), so a product's
 *   translations file can carry Aa's words beside its own;
 * - then Aa's own table for the page's language (`translations/<language>.ts`), read from `lang` on the page's root;
 * - then the English words themselves.
 *
 * Every key is the English sentence, with `{name}` where a value goes in (`React with {emoji}`). A word is looked up
 * when it is drawn, so a page that changes its language draws the next menu in the new one.
 */
import { da } from './translations/da'

/** Words of a product's own: a table of the English words it changes, or a function giving each in the language. */
export type AaWords = Readonly<Record<string, string>> | ((words: string, language: string) => string | undefined)

const TABLES: Record<string, Readonly<Record<string, string>>> = { da }
/** Where Design system 1's language module leaves its `translate()`; on `globalThis`, so every copy finds it. */
const TRANSLATOR = Symbol.for('design-system-1.translate')

let own: AaWords | null = null

/** Give Aa words of the product's own, or `null` to go back to the page's language. */
export function setAaWords(next: AaWords | null): void {
  own = next
}

/** The page's language, as its root says (`da`, `pt-br`); English without one. */
export function aaLanguage(): string {
  return (typeof document === 'undefined' ? '' : document.documentElement.lang || '').trim().toLowerCase() || 'en'
}

/** `words` in the page's language, with each `{name}` filled from `values`. */
export function word(words: string, values?: Readonly<Record<string, string | number>>): string {
  const language = aaLanguage()
  let found = typeof own === 'function' ? own(words, language) : own?.[words]
  if (found === undefined) {
    const translate = (globalThis as unknown as Record<symbol, unknown>)[TRANSLATOR]
    if (typeof translate === 'function') {
      const given = String(translate(words))
      if (given !== words) found = given
    }
  }
  if (found === undefined) found = TABLES[language]?.[words] ?? TABLES[language.split('-')[0]!]?.[words]
  const text = found ?? words
  return values ? text.replace(/\{(\w+)\}/g, (whole, name: string) => name in values ? String(values[name]) : whole) : text
}
