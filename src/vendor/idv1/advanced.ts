/**
 * IDv1 Advanced: the codes the four shapes leave free, for things there are
 * far more of than accounts, lists or items, such as every event a product
 * records or every visit to it. Still six characters of the same 62 letters
 * and digits, capitals mattering, but in any order, so long as the code is
 * none of the four shapes: `k3Rw9Q`, `7xP2mB`, `Q8z1aT`. One look still
 * tells it apart from an account, a product, a list or an item, since none of
 * them can be an event's code.
 *
 * - Six characters of 62 make 62⁶, 56.8 billion codes.
 * - The four shapes, read as they are read (lists with small letters too),
 *   take 2.5 billion of them.
 * - That leaves 54.3 billion for events, before the blocked words: 54 times
 *   as many as there are items, and enough for a product to give each event
 *   its own code for a long while.
 *
 * Nobody types an event's code and it is never scanned to open anything, so
 * it is drawn uniformly, from the browser's or the server's cryptographic
 * random numbers unless a test passes its own. Codes that spell a blocked word
 * anywhere in them, capitals aside, are drawn again (`blockedCodeLetters` in
 * words.ts), since an event's code may still be shown to someone.
 */

import { CODE_PATTERN, codeKind, type CodeKind } from './shapes'
import { blockedCodeLetters } from './words'

/** Every kind, the four shapes and an event. */
export type AdvancedCodeKind = CodeKind | 'event'

/** Any six of IDv1's characters, the outline every code has. */
export const ANY_CODE = /^[A-Za-z0-9]{6}$/

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** An event's code: six letters or digits that make none of the four shapes. */
export const isEventCode = (value: string): boolean => ANY_CODE.test(value) && codeKind(value) === null

/** What a code names by its shape alone, events included, or null when it is no IDv1 code. */
export function advancedCodeKind(value: string): AdvancedCodeKind | null {
  return codeKind(value) ?? (ANY_CODE.test(value) ? 'event' : null)
}

/** Whether a code has the shape of the kind a product expects, events included: `isAdvancedCodeOf('event', 'k3Rw9Q')`. */
export const isAdvancedCodeOf = (kind: AdvancedCodeKind, value: string): boolean =>
  kind === 'event' ? isEventCode(value) : CODE_PATTERN[kind].test(value)

type Random = () => number

/** A number in [0, 1) from the platform's cryptographic random numbers, Math.random where there are none. */
export function secureRandom(): number {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) return Math.random()
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] / 2 ** 32
}

/**
 * An event's code to try: six characters drawn uniformly, again while they
 * make one of the four shapes or spell a blocked word. Whether one is free is
 * the product's to check, as with every other kind; with 54 billion to draw
 * from, two events a product keeps will rarely meet.
 */
export function eventCodeCandidate(random: Random = secureRandom): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = ''
    for (let index = 0; index < 6; index++) code += ALPHABET[Math.floor(random() * ALPHABET.length)]
    if (isEventCode(code) && !blockedCodeLetters(code)) return code
  }
  throw new Error('No event code could be drawn.')
}

/**
 * How many codes each version of IDv1 has room for. The standard version is
 * `ID_SPACE` in space.ts, by kind, as its candidates draw them; the expanded
 * version counts every six-character code, and events are what the four
 * shapes leave, read as they are read (a list's small letters included).
 *
 * - All six-character codes: 62⁶, 56,800,235,584.
 * - The four shapes as read: 52²·10⁴ + 52⁴·10² + 10²·52⁴ + 52²·10²·(62² − 10²), 2,501,740,800.
 * - Events: the rest, 54,298,494,784, before the blocked words.
 */
export const ADVANCED_SPACE = (() => {
  const letters = 52
  const digits = 10
  const all = (letters + digits) ** 6
  const shapes =
    letters ** 2 * digits ** 4 +
    letters ** 4 * digits ** 2 +
    digits ** 2 * letters ** 4 +
    letters ** 2 * digits ** 2 * ((letters + digits) ** 2 - digits ** 2)
  return { all, shapes, events: all - shapes } as const
})()
