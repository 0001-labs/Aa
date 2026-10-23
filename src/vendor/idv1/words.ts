/**
 * Words a paper product's code must never spell. A product's code is four
 * letters and two digits (`productCodeCandidate` in shapes.ts),
 * printed on every page and on the wrapper, and the account code of whoever signs up
 * with it, so its four letters are read as a word whether anyone means them
 * to be or not. A code is passed over when its letters, capitals aside, hold
 * one of these anywhere in them (`blockedCodeLetters`): FUCK12, xFuk34 and
 * Pass56 are all skipped, the last for the word inside it, which costs a few
 * harmless codes and nothing else.
 *
 * Rude, crude or hurtful words, and a few merely awkward ones, in English,
 * Danish, Japanese romaji, and the other languages the app speaks or a shop
 * sells in. Three-letter entries catch a word inside a longer run, so they
 * are kept to ones that are rude almost wherever they stand. The list is
 * small on purpose: skipping a code costs nothing, since there are 731
 * million of them.
 */
export const BLOCKED_CODE_WORDS: readonly string[] = [
  // English
  'fuck', 'fuk', 'fck', 'fux', 'shit', 'sht', 'crap', 'turd', 'piss', 'cunt', 'twat', 'dick', 'dik', 'cock', 'knob',
  'wank', 'jizz', 'cum', 'porn', 'sex', 'anal', 'anus', 'arse', 'ass', 'butt', 'boob', 'tit', 'puss', 'slut',
  'whor', 'hoe', 'bich', 'btch', 'bitc', 'damn', 'hell', 'suck', 'fart', 'puke', 'barf', 'poo', 'smeg', 'dumb', 'ugly',
  'fat', 'kill', 'dead', 'rape', 'hate', 'nazi', 'hitl', 'heil', 'kkk', 'isis', 'fag', 'nig', 'nigg', 'coon', 'spic',
  'kike', 'gook', 'paki', 'dyke', 'homo', 'tard',
  // Words naming who someone is, which a code handed to a stranger should never say.
  'jew', 'gay',
  // Danish
  'lort', 'pik', 'pis', 'fis', 'fiss', 'kuss', 'knep', 'hore', 'lude', 'skid', 'nege', 'fand', 'svin', 'klam',
  // Japanese, in romaji
  'baka', 'aho', 'kuso', 'unko', 'mank', 'chnk', 'ecch', 'etch', 'ero', 'hent', 'kasu', 'kuzu',
  'busu', 'debu', 'hage', 'kich', 'yari', 'oppa',
  // German, Swedish, Spanish, French, Italian, Portuguese, Korean, Chinese
  'fick', 'fotz', 'hure', 'kack', 'arsc', 'fitt', 'kuk', 'hora', 'knul', 'puta', 'puto', 'cono', 'culo', 'mier', 'jode',
  'pene', 'verg', 'merd', 'pute', 'bite', 'salo', 'cazz', 'figa', 'porr', 'ssib', 'shib', 'tmd', 'cao',
] as const

/**
 * Two digits awkward on a pad: 42 and 49 read as 死に (to die) and 死苦
 * (suffering) in Japanese, where the pads are made and many are sold, and 69
 * in English. Codes ending in them are passed over too.
 */
export const BLOCKED_CODE_DIGITS: readonly string[] = ['42', '49', '69'] as const

/** Whether a run of letters spells a blocked word anywhere in it, capitals aside. */
export function blockedCodeLetters(letters: string): boolean {
  const small = letters.toLowerCase()
  return BLOCKED_CODE_WORDS.some(word => small.includes(word))
}

/** Whether a product code, `LLLLnn`, is one never to print: a blocked word in its letters, or awkward digits. */
export function blockedProductCode(code: string): boolean {
  return blockedCodeLetters(code.slice(0, 4)) || BLOCKED_CODE_DIGITS.includes(code.slice(4))
}
