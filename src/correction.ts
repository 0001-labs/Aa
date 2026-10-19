/**
 * Correction as the person writes. The product supplies the call that
 * corrects a block's words (`correct` in the editor's options); Aa decides
 * when to ask and how much of the answer to take. A block is asked about once
 * its words rest: after a short pause in typing, or as soon as the caret
 * leaves it. The answer is put in as an edit from outside, and only where it
 * is safe: the words between Markdown's syntax, never the syntax, never the
 * word the caret is in, never during a composition, and never in a block that
 * changed since it was asked about. Each correction is a step of its own to
 * undo, and one taken back is not made again.
 */

import { blockRuns, parseBlocks, type AtomSyntax, type Block, type BlockKind } from './markdown'
import type { Pos } from './document'

export type CorrectionContext = {
  /** What the block is: a paragraph, a heading, a bullet, a quote or a callout. */
  kind: BlockKind
  /** The Markdown just before and after the block, to read it by; never to be corrected. */
  before: string
  after: string
  /** Aborted once the answer can no longer be used: the block changed, or correction stopped. */
  signal: AbortSignal
}

/** Given a block's Markdown, the same Markdown with its spelling fixed and its words lightly corrected. */
export type Corrector = (text: string, context: CorrectionContext) => Promise<string>

/** One change to a block's source: the characters from `from` to `to` give way to `text`. */
export type Edit = { from: number; to: number; text: string }

/** How long typing rests before the block with the caret is asked about. */
export const PAUSE = 800
/** Blocks longer than this are left as written. */
const LONGEST = 4000
/** The blocks that are words; code, tables, equations and dividers are not. */
const KINDS: ReadonlySet<BlockKind> = new Set(['paragraph', 'heading', 'bullet', 'quote', 'callout'])
const WORD = /[\p{L}\p{M}\p{N}_]/u
const TOKENS = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|\s+|[^]/gu
/** Addresses are written as they are, even among words. */
const LITERAL = /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

/** Whether a block has words for correction to read. */
export function correctable(block: Block): boolean {
  return KINDS.has(block.kind) && block.source.length <= LONGEST && /\p{L}/u.test(block.source)
}

/** The ranges of a block's source that are words: its text, without syntax, code, atoms or addresses. */
export function wordRanges(block: Block, atoms?: readonly AtomSyntax[]): [number, number][] {
  if (!correctable(block)) return []
  let ranges: [number, number][] = []
  for (const run of blockRuns(block, atoms)) {
    if (run.kind !== 'text' || run.code) continue
    const last = ranges[ranges.length - 1]
    if (last && last[1] === run.from) last[1] = run.to
    else ranges.push([run.from, run.to])
  }
  for (const match of block.source.matchAll(LITERAL)) {
    const from = match.index!, to = from + match[0].length
    ranges = ranges.flatMap(([a, b]): [number, number][] => b <= from || a >= to ? [[a, b]] : [...(a < from ? [[a, from] as [number, number]] : []), ...(b > to ? [[to, b] as [number, number]] : [])])
  }
  return ranges
}

const tokens = (text: string) => Array.from(text.matchAll(TOKENS), match => ({ text: match[0], at: match.index! }))

/** The edits that turn `before` into `after`, a word at a time, in order. */
export function diffWords(before: string, after: string): Edit[] {
  const a = tokens(before), b = tokens(after)
  const at = (index: number) => index < a.length ? a[index].at : before.length
  const join = (from: number, to: number) => b.slice(from, to).map(token => token.text).join('')
  let start = 0
  while (start < a.length && start < b.length && a[start].text === b[start].text) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1].text === b[endB - 1].text) { endA--; endB-- }
  const n = endA - start, m = endB - start
  if (!n && !m) return []
  // So much changed that it is one edit, which is no correction.
  if (n * m > 250_000) return [{ from: at(start), to: at(endA), text: join(start, endB) }]
  // The longest run of words both share, from each place on.
  const common = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) common[i][j] = a[start + i].text === b[start + j].text ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
  const edits: Edit[] = []
  let i = 0, j = 0, open: [number, number] | null = null
  const close = () => { if (open) edits.push({ from: at(start + open[0]), to: at(start + i), text: join(start + open[1], start + j) }); open = null }
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i].text === b[start + j].text) { close(); i++; j++; continue }
    open ??= [i, j]
    if (j < m && (i >= n || common[i][j + 1] >= common[i + 1][j])) j++
    else i++
  }
  close()
  return edits
}

/** How many characters an edit really changes: what differs between its two ends' common start and end. */
const weight = (old: string, text: string) => {
  let prefix = 0
  while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) prefix++
  let suffix = 0
  while (suffix < old.length - prefix && suffix < text.length - prefix && old[old.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++
  return Math.max(old.length, text.length) - prefix - suffix
}

/** What a block reads as, its words aside: its kind and prefix, and every piece of syntax, code and atom in order. */
function skeleton(source: string, atoms?: readonly AtomSyntax[]): string {
  const placed = parseBlocks(source)
  if (placed.length !== 1) return ''
  const { start: _start, ...block } = placed[0]
  const parts: unknown[] = []
  for (const run of blockRuns(block, atoms)) {
    const part = run.kind === 'text' && !run.code ? ['text', run.bold, run.italic, run.strike, run.highlight, run.href] : [run.kind, source.slice(run.from, run.to)]
    if (part[0] === 'text' && JSON.stringify(parts[parts.length - 1]) === JSON.stringify(part)) continue
    parts.push(part)
  }
  return JSON.stringify([block.kind, block.prefix, block.level, block.checked, block.number, block.callout, block.folded, parts])
}

export const pair = (old: string, text: string) => `${old}\u0000${text}`

export type Corrections = { edits: Edit[]; partial: boolean }

/**
 * What of an answer may be put in a block: the edits within its words, none
 * that touches the protected range (the words the caret is in), none taken
 * back before, and only while the block reads as the same Markdown. An answer
 * that rewrites rather than corrects is not taken at all. `partial` says some
 * edits were held back for the caret, to be made once it has gone.
 */
export function corrections(block: Block, answer: string, options: { atoms?: readonly AtomSyntax[]; protect?: readonly [number, number] | null; rejected?: ReadonlySet<string> } = {}): Corrections {
  const { source } = block
  const [, lead, , trail] = /^(\s*)([^]*?)(\s*)$/.exec(source)!
  const text = lead + answer.trim() + trail
  const words = wordRanges(block, options.atoms)
  if (text === source || !answer.trim() || !words.length) return { edits: [], partial: false }
  // Only edits within the words are ever made; the rest is left as written.
  const proposed = diffWords(source, text).filter(edit => words.some(([from, to]) => edit.from >= from && edit.to <= to))
  const total = words.reduce((sum, [from, to]) => sum + to - from, 0)
  const changed = proposed.reduce((sum, edit) => sum + weight(source.slice(edit.from, edit.to), edit.text), 0)
  if (changed > Math.max(8, total / 3)) return { edits: [], partial: false }
  const shape = skeleton(source, options.atoms)
  const edits: Edit[] = []
  let partial = false, current = source, delta = 0
  for (const edit of proposed) {
    const old = source.slice(edit.from, edit.to)
    if (/\n/.test(old + edit.text) || options.rejected?.has(pair(old, edit.text))) continue
    const protect = options.protect
    if (protect && edit.from <= protect[1] && edit.to >= protect[0]) { partial = true; continue }
    const next = current.slice(0, edit.from + delta) + edit.text + current.slice(edit.to + delta)
    if (skeleton(next, options.atoms) !== shape) continue
    edits.push(edit)
    current = next
    delta += edit.text.length - old.length
  }
  return { edits, partial }
}

export function applyEdits(source: string, edits: readonly Edit[]): string {
  let out = source
  for (let i = edits.length - 1; i >= 0; i--) out = out.slice(0, edits[i].from) + edits[i].text + out.slice(edits[i].to)
  return out
}

/** Where an offset into a source stands once the edits are made. */
export function shift(offset: number, edits: readonly Edit[]): number {
  let delta = 0
  for (const edit of edits) {
    if (offset <= edit.from) break
    if (offset < edit.to) return edit.from + delta + Math.min(offset - edit.from, edit.text.length)
    delta += edit.text.length - (edit.to - edit.from)
  }
  return offset + delta
}

/** The words a selection is in, which are being written: from the start of the first to the end of the last. */
export function wordAround(text: string, from: number, to = from): [number, number] {
  while (from > 0 && WORD.test(text[from - 1])) from--
  while (to < text.length && WORD.test(text[to])) to++
  return [from, to]
}

/** What the editor lends correction: its blocks, its selection, and a way to put a correction in. */
export type CorrectionHost = {
  blocks(): readonly Block[]
  atoms: readonly AtomSyntax[]
  selection(): { anchor: Pos; focus: Pos } | null
  /** Whether the text may not be touched now: during a composition, or read only. */
  busy(): boolean
  /** Put a block's corrected source in, as one step to undo, offsets in it moving through `shift`. */
  apply(index: number, source: string, shift: (offset: number) => number): void
  value(): string
}

export type Correction = {
  /** Whether it corrects; false stops it, dropping what is asked. */
  enabled: boolean
  /** The person changed the blocks; `typed` when it was typing rather than a command. */
  written(before: readonly Block[], typed: boolean): void
  /** The caret moved: the blocks it left are asked about now. */
  moved(): void
  /** Undo is about to take a step back: a correction it takes back is not made again. */
  undoing(): void
  /** Drop everything asked and waiting. */
  stop(): void
}

export function createCorrection(host: CorrectionHost, correct: Corrector, enabled = true): Correction {
  /** Blocks the person wrote that are not yet corrected. */
  const dirty = new Set<Block>()
  /** Blocks corrected but for the words the caret is in, asked about again once it leaves. */
  const waiting = new Set<Block>()
  const asking = new Map<Block, AbortController>()
  /** Answers by the text asked about, so a block asked about again is answered at once. */
  const answers = new Map<string, string>()
  /** The document after each correction, and what it changed, so undo can tell one is taken back. */
  const applied: { value: string; pairs: string[] }[] = []
  const rejected = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let paused = false

  const remember = (text: string, answer: string) => {
    answers.delete(text)
    answers.set(text, answer)
    if (answers.size > 200) answers.delete(answers.keys().next().value!)
  }

  /** Put an answer in, if the block is still the one asked about and nothing is being composed in it. */
  const settle = (block: Block, answer: string) => {
    const blocks = host.blocks(), index = blocks.indexOf(block)
    if (!enabled || index < 0 || host.busy()) return
    const selection = host.selection()
    let protect: [number, number] | null = null
    if (selection) {
      const [a, b] = selection.anchor.block < selection.focus.block || (selection.anchor.block === selection.focus.block && selection.anchor.offset <= selection.focus.offset) ? [selection.anchor, selection.focus] : [selection.focus, selection.anchor]
      if (a.block <= index && b.block >= index) protect = wordAround(block.source, a.block === index ? a.offset : 0, b.block === index ? b.offset : block.source.length)
    }
    const { edits, partial } = corrections(block, answer, { atoms: host.atoms, protect, rejected })
    dirty.delete(block); waiting.delete(block)
    let result = block
    if (edits.length) {
      host.apply(index, applyEdits(block.source, edits), offset => shift(offset, edits))
      result = host.blocks()[index]
      // What is held back is answered already: the answer holds for the words as they now are.
      if (partial) remember(result.source, answer)
      applied.push({ value: host.value(), pairs: edits.map(edit => pair(block.source.slice(edit.from, edit.to), edit.text)) })
      if (applied.length > 50) applied.shift()
    }
    if (partial) { dirty.add(result); waiting.add(result) }
  }

  const ask = (block: Block, index: number) => {
    const controller = new AbortController()
    asking.set(block, controller)
    const known = answers.get(block.source)
    let answer: Promise<string>
    if (known !== undefined) answer = Promise.resolve(known)
    else {
      const blocks = host.blocks()
      const before = blocks.slice(Math.max(0, index - 2), index).map(other => other.source).join('\n\n').slice(-1000)
      const after = blocks.slice(index + 1, index + 2).map(other => other.source).join('\n\n').slice(0, 500)
      try { answer = Promise.resolve(correct(block.source, { kind: block.kind, before, after, signal: controller.signal })) } catch (error) { answer = Promise.reject(error) }
    }
    answer.then(text => {
      if (asking.get(block) !== controller) return
      asking.delete(block)
      if (controller.signal.aborted || typeof text !== 'string') return
      remember(block.source, text)
      settle(block, text)
    }, () => {
      // A failed answer is not asked for again until the person writes there again.
      if (asking.get(block) !== controller) return
      asking.delete(block)
      dirty.delete(block)
    })
  }

  /** Ask about every block that is due: those the caret is not in, and the one it is in once typing has paused. */
  const due = () => {
    if (!enabled || host.busy()) return
    const blocks = host.blocks(), selection = host.selection()
    const first = selection ? Math.min(selection.anchor.block, selection.focus.block) : -1
    const last = selection ? Math.max(selection.anchor.block, selection.focus.block) : -2
    for (const block of dirty) {
      const index = blocks.indexOf(block)
      if (index < 0) { dirty.delete(block); waiting.delete(block); continue }
      if (asking.has(block)) continue
      const holds = index >= first && index <= last
      if (holds && (!paused || (waiting.has(block) && !answers.has(block.source)))) continue
      ask(block, index)
    }
  }

  const stop = () => {
    clearTimeout(timer)
    for (const controller of asking.values()) controller.abort()
    asking.clear(); dirty.clear(); waiting.clear()
    paused = false
  }

  return {
    get enabled() { return enabled },
    set enabled(value: boolean) { enabled = value; if (!value) stop() },
    written(before, typed) {
      if (!enabled) return
      const blocks = host.blocks(), had = new Set(before), now = new Set(blocks)
      let inherited = false
      for (const block of before) {
        if (now.has(block)) continue
        inherited ||= dirty.has(block)
        dirty.delete(block); waiting.delete(block)
        asking.get(block)?.abort(); asking.delete(block)
      }
      // Typing marks the blocks it made; a command (Enter, a join) passes on what the blocks it replaced had.
      if (typed || inherited) for (const block of blocks) if (!had.has(block) && correctable(block)) dirty.add(block)
      paused = false
      clearTimeout(timer)
      timer = setTimeout(() => { paused = true; due() }, PAUSE)
      due()
    },
    moved() { due() },
    undoing() {
      const value = host.value()
      for (let i = applied.length - 1; i >= 0; i--) {
        if (applied[i].value !== value) continue
        for (const taken of applied[i].pairs) rejected.add(taken)
        applied.splice(i, 1)
        break
      }
      stop()
    },
    stop,
  }
}
