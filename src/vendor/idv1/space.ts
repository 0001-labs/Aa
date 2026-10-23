/**
 * How many IDv1 codes of each kind there can be, as the candidates in
 * `shapes.ts` draw them, so a product can show how much of each is used and
 * how much is left.
 *
 * - Accounts made from a name, LLnnnn: 52² × 10⁴, 27 million.
 * - Products, LLLLnn: 52⁴ × 10², 731 million, before the blocked words.
 * - Lists, nnLLLL with capitals: 10² × 26⁴, 46 million.
 * - Items, LLnnXX with a letter in the last two: 52² × 10² × (62² − 10²), 1 billion.
 */
const LETTERS = 52
const CAPITALS = 26
const DIGITS = 10

export const ID_SPACE = {
  accounts: LETTERS ** 2 * DIGITS ** 4,
  products: LETTERS ** 4 * DIGITS ** 2,
  lists: DIGITS ** 2 * CAPITALS ** 4,
  items: LETTERS ** 2 * DIGITS ** 2 * ((LETTERS + DIGITS) ** 2 - DIGITS ** 2),
} as const

export type IdSpaceKind = keyof typeof ID_SPACE

/** The share used, as a percentage, and how many are left. */
export function idUsage(kind: IdSpaceKind, used: number): { used: number; space: number; left: number; percent: number } {
  const space = ID_SPACE[kind]
  return { used, space, left: Math.max(0, space - used), percent: (used / space) * 100 }
}
