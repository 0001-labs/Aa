/**
 * Comments on ranges of the text, as a person comments on a document: a
 * thread is anchored to a run of the Markdown (`from` and `to`, offsets into
 * the document, and `quote`, the words there), and kept right as the text
 * changes around it. Link's project comments are the model (a thread on a
 * block, replies, resolving and reopening, who wrote what and when, mentions,
 * an orphaned thread when its words are gone); here the anchor is a range of
 * the words rather than a block.
 *
 * Nothing in this file touches the page: the drawing is comments-view.ts, and
 * the storage, the people, the permissions and the notifications are the
 * product's, reached through a `CommentStore`.
 */

/** Someone who comments: the product's id for them, their name, and the colour they are drawn in (one from the palette by their id otherwise). */
export type CommentPerson = { id: string; name: string; colour?: string }

/** Where a thread stands: offsets into the Markdown, and the words there. */
export type CommentRange = { from: number; to: number; quote: string }

/** One emoji on a comment: how many gave it, whether the person reading did, and who else did. */
export type CommentReaction = { emoji: string; count: number; reacted: boolean; names: readonly string[] }

export type Comment = {
  id: string
  author: CommentPerson
  body: string
  createdAt: number
  editedAt?: number
  /** The people named in the body, as `@Name`. */
  mentions?: readonly CommentPerson[]
  reactions?: readonly CommentReaction[]
}

/** The reactions on offer, Link's sixteen. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏', '👏', '😊', '🔥', '✅', '👀', '🤔', '💡', '🚀', '✨', '🙌', '💯'] as const

export type CommentThread = CommentRange & {
  id: string
  comments: readonly Comment[]
  createdAt: number
  updatedAt: number
  resolvedAt?: number
  resolvedBy?: CommentPerson
  /** Whether the person reading has not seen its latest comment; the product's to say. */
  unread?: boolean
  /** Whether the person reading may delete the thread (its creator, as in Link). */
  canDelete?: boolean
}

/** A thread as it stands in the text now: orphaned when its words are gone. */
export type AnchoredThread = CommentThread & { orphaned: boolean }

/** A thread moved by an edit, for the store to keep. */
export type CommentMove = { id: string; from: number; to: number; quote: string }

/**
 * What a product gives Aa for comments: the threads as they are and change,
 * and the writes, each a promise that may refuse. Without `me` the comments
 * read only. `people` answers the `@` menu in the composer.
 */
export type CommentStore = {
  /** The threads now, and again on every change, until the returned function is called. */
  subscribe(receive: (threads: readonly CommentThread[]) => void): () => void
  /** Who is writing. Without it, nothing can be added, replied to, resolved or edited. */
  me?: CommentPerson
  add(range: CommentRange, body: string, mentions: readonly CommentPerson[]): Promise<unknown>
  reply(threadId: string, body: string, mentions: readonly CommentPerson[]): Promise<unknown>
  edit?(commentId: string, body: string): Promise<unknown>
  resolve(threadId: string, resolved: boolean): Promise<unknown>
  remove?(threadId: string): Promise<unknown>
  /** Threads whose words moved as the text changed, so other readers find them where the words are. */
  move?(moves: readonly CommentMove[]): Promise<unknown>
  /** The person reading has opened the thread. */
  seen?(threadId: string): Promise<unknown>
  /** Give a comment an emoji, or take the person's own back. Without it, no reactions. */
  react?(commentId: string, emoji: string): Promise<unknown>
  /** The people who may be mentioned, for what has been typed after `@`. */
  people?(query: string): readonly CommentPerson[] | Promise<readonly CommentPerson[]>
  /** Where the threads are drawn: an element beside the text for a panel; without it, a popover at the range. */
  panel?: HTMLElement
}

/** One replacement in the text: the characters from `start` to `end` became `text`. */
export type TextEdit = { start: number; end: number; text: string }

/**
 * The smallest replacement that turns `before` into `after`. Where the same
 * replacement could stand a little earlier ("tiny " put before "two" reads
 * the same as "iny t" put after its t), it is moved back to the nearest
 * start of a word, so a word typed before a commented one stands before it.
 */
export function textChange(before: string, after: string): TextEdit {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let end = before.length, tail = after.length
  while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail-- }
  const boundary = (at: number) => at === 0 || /\s/.test(before[at - 1])
  let slid = start, slidEnd = end, slidTail = tail
  while (!boundary(slid) && slid > 0 && before[slid - 1] === after[slidTail - 1] && before[slid - 1] === before[slidEnd - 1]) { slid--; slidEnd--; slidTail-- }
  if (slid < start && boundary(slid)) { start = slid; end = slidEnd; tail = slidTail }
  return { start, end, text: after.slice(start, tail) }
}

/**
 * Where a range stands after an edit, or null when its words are gone. An
 * edit before the range moves it; words put in at its start stand before it,
 * words typed at its end go on with it (as a bold word goes on); an edit
 * inside it grows or shrinks it; one over its start or end cuts that end back
 * to what is left; one over all of it takes it away.
 */
export function mapRange(range: { from: number; to: number }, edit: TextEdit): { from: number; to: number } | null {
  const { start, end, text } = edit
  const delta = text.length - (end - start)
  let { from, to } = range
  // Before the range, or ending at its start: the range moves with the text; words put in at its start stand before it.
  if (end <= from) return { from: from + delta, to: to + delta }
  // Words typed at its end go on with it, as they go on in bold; anything else after it, or starting at its end, leaves it.
  if (start === to && end === to) return { from, to: to + text.length }
  if (start >= to) return { from, to }
  // Over all of it: its words are gone.
  if (start <= from && end >= to) return null
  // Over its start: what is left begins after the words put in. Over its end: it ends where the edit began. Inside: it grows or shrinks.
  if (start <= from) { from = start + text.length; to += delta }
  else if (end >= to) to = start
  else to += delta
  return from < to ? { from, to } : null
}

/**
 * The threads as they stand after the text changed: each range mapped
 * through the edit and its quote read again from the words; a thread whose
 * words are gone is orphaned, kept where it was.
 */
export function applyEdit<T extends CommentRange & { orphaned?: boolean }>(threads: readonly T[], edit: TextEdit, after: string): (T & { orphaned: boolean })[] {
  return threads.map(thread => {
    if (thread.orphaned) return { ...thread, orphaned: true }
    const mapped = mapRange(thread, edit)
    if (!mapped) return { ...thread, orphaned: true }
    return { ...thread, ...mapped, quote: after.slice(mapped.from, mapped.to), orphaned: false }
  })
}

/**
 * Where a thread from the store stands in this text: where it says, when its
 * words are there; else where its words are found nearest to it; else nowhere.
 */
export function relocate(thread: CommentRange, text: string): { from: number; to: number } | null {
  if (!thread.quote) return null
  if (text.slice(thread.from, thread.to) === thread.quote) return { from: thread.from, to: thread.to }
  let best: number | null = null
  for (let at = text.indexOf(thread.quote); at >= 0; at = text.indexOf(thread.quote, at + 1)) {
    if (best === null || Math.abs(at - thread.from) < Math.abs(best - thread.from)) best = at
  }
  return best === null ? null : { from: best, to: best + thread.quote.length }
}

/** The store's threads placed in this text. */
export function anchorThreads(threads: readonly CommentThread[], text: string): AnchoredThread[] {
  return threads.map(thread => {
    const placed = relocate(thread, text)
    return placed ? { ...thread, ...placed, orphaned: false } : { ...thread, orphaned: true }
  })
}

/** The threads whose place or words are not what the store has. */
export function movedThreads(stored: readonly CommentThread[], placed: readonly AnchoredThread[]): CommentMove[] {
  const before = new Map(stored.map(thread => [thread.id, thread]))
  return placed.filter(thread => {
    const was = before.get(thread.id)
    return !!was && !thread.orphaned && (was.from !== thread.from || was.to !== thread.to || was.quote !== thread.quote)
  }).map(({ id, from, to, quote }) => ({ id, from, to, quote }))
}

/** Open threads first, each group in the order of the text; orphaned ones last among their group. */
export function sortThreads<T extends AnchoredThread>(threads: readonly T[]): T[] {
  const rank = (thread: T) => (thread.resolvedAt ? 2 : 0) + (thread.orphaned ? 1 : 0)
  return [...threads].sort((a, b) => rank(a) - rank(b) || a.from - b.from || a.createdAt - b.createdAt)
}

/** The threads standing on an offset of the text: the caret in a range, its ends included. */
export function threadsAt<T extends AnchoredThread>(threads: readonly T[], offset: number): T[] {
  return threads.filter(thread => !thread.orphaned && !thread.resolvedAt && thread.from <= offset && offset <= thread.to)
}

export function countThreads(threads: readonly CommentThread[]): { open: number; resolved: number } {
  const resolved = threads.filter(thread => thread.resolvedAt).length
  return { open: threads.length - resolved, resolved }
}

/** "3 comments · 1 resolved", as Link heads its threads. */
export function commentsLabel(open: number, resolved: number): string {
  if (open <= 0 && resolved <= 0) return 'Comments'
  const words = `${Math.max(0, open)} comment${open === 1 ? '' : 's'}`
  return resolved > 0 ? `${words} · ${resolved} resolved` : words
}

/** The people among `people` named in `body` as `@Name`, longest names first so "Jo Ann" is not taken for "Jo". */
export function mentionsIn(body: string, people: readonly CommentPerson[]): CommentPerson[] {
  const found: CommentPerson[] = []
  const names = [...people].filter(person => person.name.trim()).sort((a, b) => b.name.length - a.name.length)
  let rest = body
  for (const person of names) {
    const token = `@${person.name.trim()}`
    if (!rest.includes(token)) continue
    found.push(person)
    rest = rest.split(token).join(' ')
  }
  return found
}

/**
 * The `@` and the letters after it just before the caret, for the people
 * menu: null when the caret is not in one, or the letters have a space.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null
  const query = before.slice(at + 1)
  if (/\s/.test(query) || query.length > 40) return null
  return { start: at, query }
}

/**
 * When something happened, told as Design system 1 tells it: "now", "3
 * minutes ago", "yesterday" by the calendar, days ago within a week, and the
 * date beyond, with its year once it is another year's.
 */
export function relativeTime(at: number, now = Date.now(), locale?: string): string {
  const seconds = Math.round((now - at) / 1000)
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  const then = new Date(at), today = new Date(now)
  const day = (date: Date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000)
  const days = day(today) - day(then)
  if (hours < 24 && days === 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(then.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })
}

/** Kanji and kana: a name written in them is a Japanese (or Chinese) one. */
const IDEOGRAPHIC = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/**
 * The letters a person is drawn with, as Ezo draws them: a name in kanji or
 * kana by its first two characters, the family name that leads it; any other
 * by its first letter, a capital.
 */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  if (IDEOGRAPHIC.test(trimmed)) return [...trimmed.split(/[\s　・]/)[0]].slice(0, 2).join('')
  return ([...trimmed][0] ?? '?').toLocaleUpperCase()
}

/**
 * Each person's own ink, told apart by their id, as Ezo tells them: the
 * palette's accents, a darker shade that reads on white and a lighter one
 * that reads on black.
 */
const INKS: readonly [string, string][] = [
  ['#2e9e1f', '#99ff73'],
  ['#4b44e6', '#b3aeff'],
  ['#c4417f', '#f5aad1'],
  ['#d93b3b', '#ff8f8f'],
  ['#b27a00', '#fec20d'],
  ['#6f6b1f', '#d2cd72'],
]

export function personColour(person: CommentPerson): string {
  if (person.colour) return person.colour
  let hash = 0
  for (const char of person.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const [light, dark] = INKS[hash % INKS.length]
  return `light-dark(${light}, ${dark})`
}
