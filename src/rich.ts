/**
 * A block's words as they read: letters, each wearing its marks. The document
 * is Markdown, but a mark's two delimiters are one thing to the person writing
 * and only ever two to the text. So where an edit would part a pair (a
 * selection ending inside bold, Enter in the middle of a colour, a space at
 * bold's end, the last letter of a word deleted) the words are taken out of
 * the Markdown, changed as letters, and written back as sound Markdown. An
 * edit that leaves every pair whole stays a plain splice, so a block keeps its
 * own spelling of what it was not asked to change.
 */

import { blockRuns, parseBlocks, DEFAULT_ATOMS, type AtomSyntax, type Block, type Run } from './markdown'

/**
 * A mark as it is written. `family` holds one at a time: a word has one colour
 * and one link. `tight` marks cannot start or end on a space and still be read
 * (`**word **` is not bold), so spaces at their edges are written outside them.
 */
export type Mark = { family: string; key: string; open: string; close: string; tight: boolean; rank: number }

const simple = (family: string, open: string, close: string, tight: boolean, rank: number): Mark => ({ family, key: family, open, close, tight, rank })
export const BOLD = simple('bold', '**', '**', true, 2)
export const ITALIC = simple('italic', '*', '*', true, 3)
export const STRIKE = simple('strike', '~~', '~~', true, 4)
export const HIGHLIGHT = simple('highlight', '==', '==', true, 5)
export const UNDERLINE = simple('underline', '<u>', '</u>', false, 1)
export const CODE = simple('code', '`', '`', false, 7)
export const colorMark = (color: string): Mark => ({ family: 'color', key: `color:${color}`, open: `<span color="${color}">`, close: '</span>', tight: false, rank: 0 })
export const backgroundMark = (color: string): Mark => ({ family: 'background', key: `background:${color}`, open: `<span color="${color}_background">`, close: '</span>', tight: false, rank: 0 })
export const linkMark = (href: string): Mark => ({ family: 'link', key: `link:${href}`, open: '[', close: `](${href})`, tight: false, rank: 6 })

/** The mark a toolbar's delimiters write; none for what is not a mark of words (an equation's `$`). */
export function markOf(delimiter: string, closing: string): Mark | null {
  if (delimiter === '[') return linkMark(closing.replace(/^\]\(|\)$/g, ''))
  return ({ '**': BOLD, '*': ITALIC, '~~': STRIKE, '==': HIGHLIGHT, '<u>': UNDERLINE, '`': CODE } as Record<string, Mark>)[delimiter] ?? null
}

/**
 * One thing that reads as one: a letter, an atom, a line break with the prefix
 * of the line it starts. `fixed` is a block's own prefix, which wears nothing.
 */
export type Unit = { source: string; marks: readonly Mark[]; from: number; to: number; fixed?: boolean; breaks?: boolean; bare?: string }

/** The blocks whose words are Markdown's inline writing. */
const WRITTEN = new Set(['paragraph', 'heading', 'bullet', 'quote', 'callout', 'table'])
export const isWritten = (block: Block) => WRITTEN.has(block.kind)

function marksOf(run: Run): Mark[] {
  const marks: Mark[] = []
  if (run.background) marks.push(backgroundMark(run.background))
  if (run.color) marks.push(colorMark(run.color))
  if (run.underline) marks.push(UNDERLINE)
  if (run.bold) marks.push(BOLD)
  if (run.italic) marks.push(ITALIC)
  if (run.strike) marks.push(STRIKE)
  if (run.highlight) marks.push(HIGHLIGHT)
  if (run.href !== undefined && !run.autolink) marks.push(linkMark(run.href))
  if (run.code) marks.push(CODE)
  return marks
}

const sameKeys = (a: readonly Mark[], key: string) => a.some(mark => mark.key === key)

/** A block read into its units, every character accounted for but the delimiters. */
export function unitsOf(block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): Unit[] {
  const units: Unit[] = []
  let escape = ''
  for (const run of blockRuns(block, atoms)) {
    const text = block.source.slice(run.from, run.to)
    if (run.kind === 'syntax') {
      if (run.escape) escape = text
      else if (run.prefix) {
        const last = units[units.length - 1]
        if (last?.breaks) { last.source += text; last.to = run.to }
        else for (let i = 0; i < text.length; i++) units.push({ source: text[i], marks: [], from: run.from + i, to: run.from + i + 1, fixed: true })
      }
      continue
    }
    if (run.kind === 'break') { units.push({ source: text, marks: [], from: run.from, to: run.to, breaks: true }); continue }
    const marks = marksOf(run)
    if (run.kind === 'atom') { units.push({ source: text, marks, from: run.from, to: run.to }); continue }
    for (let i = 0; i < text.length; i++) {
      const lead = i === 0 ? escape : ''
      units.push({ source: lead + text[i], marks, from: run.from + i - lead.length, to: run.from + i + 1, ...(run.autolink ? { bare: run.href } : {}) })
    }
    escape = ''
  }
  // A line break wears what the words on both its sides wear, so a mark reads on across it.
  units.forEach((unit, index) => {
    if (!unit.breaks) return
    const before = units[index - 1], after = units[index + 1]
    if (before && after) unit.marks = before.marks.filter(mark => sameKeys(after.marks, mark.key))
  })
  return units
}

const isBlank = (unit: Unit) => !!unit.breaks || /^\s+$/.test(unit.source)

/**
 * The units with spaces taken out of the edges of the marks that cannot hold
 * them, and any mark with nothing left in it gone. A line break is never left
 * at a mark's edge: that is how a closing tag came to stand alone on a line.
 */
function fit(units: readonly Unit[]): Unit[] {
  const out = units.map(unit => ({ ...unit }))
  const keys = new Map<string, Mark>()
  for (const unit of out) for (const mark of unit.marks) keys.set(mark.key, mark)
  for (const [key, mark] of keys) {
    const edge = (unit: Unit) => mark.tight ? isBlank(unit) : !!unit.breaks
    for (let i = 0; i < out.length; i++) {
      if (!sameKeys(out[i].marks, key)) continue
      let end = i
      while (end + 1 < out.length && sameKeys(out[end + 1].marks, key)) end++
      let first = i, last = end
      while (first <= last && edge(out[first])) first++
      while (last >= first && edge(out[last])) last--
      // A mark on spaces alone marks nothing: `<span color="red"> </span>` is only tags to carry.
      const empty = out.slice(first, last + 1).every(isBlank)
      for (let at = i; at <= end; at++) if (empty || at < first || at > last) out[at].marks = out[at].marks.filter(each => each.key !== key)
      i = end
    }
  }
  return out
}

/** The units as Markdown, with where each one's own characters start and end in it. */
export type Written = { text: string; starts: number[]; ends: number[]; fitted: Unit[] }

/**
 * Units written as Markdown. The mark that runs furthest goes outermost, so a
 * bold sentence keeps its one `**` round an italic word; code is always
 * innermost, since nothing can be read inside it.
 */
export function writeUnits(units: readonly Unit[]): Written {
  const fitted = fit(units)
  // Nesting can part a mark round another, and a part can then begin or end on a
  // space where the mark as a whole did not. Such a space leaves the mark and the
  // words are written again, until every part can be read.
  for (;;) {
    const written = emit(fitted)
    if (!written.loose.length) return { text: written.text, starts: written.starts, ends: written.ends, fitted }
    for (const { at, key } of written.loose) fitted[at] = { ...fitted[at], marks: fitted[at].marks.filter(mark => mark.key !== key) }
  }
}

function emit(fitted: readonly Unit[]) {
  const stack: { mark: Mark; close: string; from: number }[] = []
  const starts: number[] = [], ends: number[] = []
  const loose: { at: number; key: string }[] = []
  let text = ''
  const extent = (from: number, key: string) => { let at = from; while (at + 1 < fitted.length && sameKeys(fitted[at + 1].marks, key)) at++; return at }
  const closeTo = (depth: number, last: number) => {
    while (stack.length > depth) {
      const { mark, close, from } = stack.pop()!
      text += close
      if (mark.tight) {
        if (isBlank(fitted[from])) loose.push({ at: from, key: mark.key })
        if (last !== from && isBlank(fitted[last])) loose.push({ at: last, key: mark.key })
      }
    }
  }
  fitted.forEach((unit, index) => {
    const wanted = unit.marks
    const missing = wanted.filter(mark => !stack.some(open => open.mark.key === mark.key))
    let keep = 0
    while (keep < stack.length && sameKeys(wanted, stack[keep].mark.key) && !(stack[keep].mark === CODE && missing.length)) keep++
    closeTo(keep, index - 1)
    const opening = wanted.filter(mark => !stack.some(open => open.mark.key === mark.key))
      .sort((a, b) => a.key === 'code' ? 1 : b.key === 'code' ? -1 : extent(index, b.key) - extent(index, a.key) || a.rank - b.rank)
    for (const mark of opening) {
      let open = mark.open, close = mark.close
      if (mark.key === 'code') {
        // As many backticks as the words themselves cannot close by accident.
        let words = ''
        for (let at = index; at <= extent(index, 'code'); at++) words += fitted[at].source
        const ticks = '`'.repeat(Math.max(0, ...Array.from(words.matchAll(/`+/g), match => match[0].length)) + 1)
        open = close = ticks
      }
      text += open
      stack.push({ mark, close, from: index })
    }
    starts.push(text.length)
    text += unit.source
    ends.push(text.length)
  })
  closeTo(0, fitted.length - 1)
  return { text, starts, ends, loose }
}

/** Where a block's words start and end, past the syntax hidden at either end: its edges to the caret. */
export function wordEdges(block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): { start: number; end: number } {
  const runs = blockRuns(block, atoms).filter(run => run.kind !== 'syntax')
  return { start: runs[0]?.from ?? block.source.length, end: runs[runs.length - 1]?.to ?? block.source.length }
}

/** How many pairs of marks a block's runs hold. */
const pairs = (runs: readonly Run[]) => {
  let count = 0
  for (const run of runs) if (run.kind === 'syntax' && run.group && !run.lone) count++
  return count / 2
}

export const hasMarks = (block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS) => pairs(blockRuns(block, atoms)) > 0

/** How many pairs lie wholly between two offsets: gone with them, and not parted. */
function pairsWithin(runs: readonly Run[], from: number, to: number) {
  const seen = new Set<number>()
  for (const run of runs) if (run.kind === 'syntax' && run.group && !run.lone && run.group[0] >= from && run.group[1] <= to) seen.add(run.group[0])
  return seen.size
}

/** The words between two offsets, each stretch with what it wears: equal only if the reader would see the same. */
function worn(source: string, runs: readonly Run[], from: number, to: number) {
  let out = '', last = ''
  for (const run of runs) {
    if (run.kind !== 'text' && run.kind !== 'atom') continue
    const start = Math.max(run.from, from), end = Math.min(run.to, to)
    if (end <= start) continue
    const key = marksOf(run).map(mark => mark.key).join(',')
    if (key !== last) { out += `\u0000${key}\u0000`; last = key }
    out += source.slice(start, end)
  }
  return out
}

/** Whether a range lies within a pair that outlasts it. */
const insideMark = (runs: readonly Run[], from: number, to: number) => runs.some(run => run.kind === 'syntax' && run.group && !run.lone && run.group[0] < from && run.group[1] > to)

/** The first unit that reaches past an offset: where a range starts. */
const startIndex = (units: readonly Unit[], offset: number) => { let at = 0; while (at < units.length && units[at].to <= offset) at++; return at }
/** The first unit wholly after an offset: where a range ends. */
const endIndex = (units: readonly Unit[], offset: number) => { let at = 0; while (at < units.length && units[at].from < offset) at++; return at }

const wearing = (marks: readonly Mark[], added: readonly Mark[]) => {
  const families = new Set(added.map(mark => mark.family))
  return [...marks.filter(mark => !families.has(mark.family)), ...added]
}

/** What the next letters typed will wear, or stop wearing, beyond what stands before the caret. `back` units before it wear `add` too. */
export type Carry = { add: readonly Mark[]; remove: readonly string[]; back: number }

export type Edit = { source: string; caret: number; carry?: Carry }

/**
 * Replace `from`–`to` in a block's source with `text`, keeping every mark on
 * the words it was on. Null when a plain splice does that already, which is
 * nearly always: no pair is parted, so the text is the text. New words wear
 * what the words they replace wore (or those before the caret), as they would
 * typed by hand, and any marks of their own.
 */
export function editBlock(block: Block, from: number, to: number, text: string, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS, carry?: Carry | null): Edit | null {
  if (!isWritten(block)) return null
  const runs = blockRuns(block, atoms)
  const before = pairs(runs)
  if (!carry) {
    if (!before) return null
    const spliced = block.source.slice(0, from) + text + block.source.slice(to)
    const placed = parseBlocks(spliced)
    let after = 0
    for (const each of placed) after += pairs(blockRuns(each, atoms))
    // Marks that arrive with the text, inside marks already there, are read as one; anywhere else a splice has kept every pair.
    const arriving = text.length > 1 && !text.includes('\n') && hasMarks({ kind: 'paragraph', source: text, prefix: 0 }, atoms)
    const whole = after >= before - pairsWithin(runs, from, to) && !(arriving && insideMark(runs, from, to))
    // Pairs can come out even and still be the wrong ones: what the reader sees either side of the change is what must be right.
    const plain = !/[*_~=`<[\\\n]/.test(text)
    const end = from + text.length, newRuns = placed.length === 1 ? blockRuns(placed[0], atoms) : []
    if (whole && (!plain || placed.length > 1 || worn(block.source, runs, 0, from) === worn(spliced, newRuns, 0, from) && worn(block.source, runs, to, Infinity) === worn(spliced, newRuns, end, Infinity))) return null
  }
  const units = unitsOf(block, atoms)
  const start = startIndex(units, from), end = from === to ? start : Math.max(start, endIndex(units, to))
  // Lines of their own cannot wear what they land in: what stands either side is closed off and the text goes between.
  if (text.includes('\n')) {
    const head = writeUnits(units.slice(0, start)).text, tail = writeUnits(units.slice(end)).text
    return { source: head + text + tail, caret: head.length + text.length }
  }
  const source = from < to ? units[start] : units[start - 1] ?? units[start]
  let inherited: readonly Mark[] = source && !source.fixed && !source.breaks ? source.marks : []
  const kept = units.slice(0, start)
  if (carry) {
    inherited = wearing(inherited, carry.add).filter(mark => !carry.remove.includes(mark.key))
    for (let at = Math.max(0, kept.length - carry.back); at < kept.length; at++) kept[at] = { ...kept[at], marks: wearing(kept[at].marks, carry.add) }
  }
  const added = text ? unitsOf({ kind: 'paragraph', source: text, prefix: 0 }, atoms).map(unit => ({ ...unit, marks: wearing(inherited, unit.marks) })) : []
  const next = [...kept, ...added, ...units.slice(end)]
  const written = writeUnits(next)
  const last = kept.length + added.length - 1
  const caret = last < 0 ? 0 : written.ends[last]
  // A space typed at a tight mark's end is written outside it, but the next word goes on in it, as it would have.
  const add = new Map<string, Mark>()
  let back = 0
  if (text && /^\s+$/.test(text) || carry) {
    for (let at = last; at >= 0 && isBlank(next[at]); at--) {
      const lost = next[at].marks.filter(mark => !sameKeys(written.fitted[at].marks, mark.key))
      if (!lost.length) break
      for (const mark of lost) add.set(mark.key, mark)
      back++
    }
  }
  return { source: written.text, caret, ...(add.size ? { carry: { add: [...add.values()], remove: [], back } } : {}) }
}

/** A block parted at an offset, each side's marks closed and opened at the cut. Null where nothing is parted. */
export function partBlock(block: Block, offset: number, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): [string, string] | null {
  if (!isWritten(block) || !hasMarks(block, atoms)) return null
  const units = unitsOf(block, atoms)
  const at = startIndex(units, offset)
  return [writeUnits(units.slice(0, at)).text, writeUnits(units.slice(at)).text]
}

/** Two blocks' sources run together from `a` in the first to `b` in the second, with `text` between. Null where a plain join does that. */
export function joinBlocks(first: Block, a: number, second: Block, b: number, text: string, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): Edit | null {
  if (!isWritten(first) || !isWritten(second) || !(hasMarks(first, atoms) || hasMarks(second, atoms))) return null
  const units = unitsOf(first, atoms)
  const head = units.filter(unit => unit.to <= a)
  const tail = unitsOf(second, atoms).filter(unit => unit.from >= b)
  if (text.includes('\n')) {
    const written = writeUnits(head).text
    return { source: written + text + writeUnits(tail).text, caret: written.length + text.length }
  }
  // Typed over a selection, the words wear what the first word they replace wore, as they do within a block.
  const lead = units[head.length] ?? head[head.length - 1]
  const inherited = lead && !lead.fixed && !lead.breaks ? lead.marks : []
  const added = text ? unitsOf({ kind: 'paragraph', source: text, prefix: 0 }, atoms).map(unit => ({ ...unit, marks: wearing(inherited, unit.marks) })) : []
  const next = [...head, ...added, ...tail]
  const written = writeUnits(next)
  const last = head.length + added.length - 1
  return { source: written.text, caret: last < 0 ? 0 : written.ends[last] }
}

/** The words between two offsets as Markdown of their own, wearing what they wear. Null where plain slicing does that. */
export function sliceBlock(block: Block, from: number, to: number, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): string | null {
  if (!isWritten(block) || !hasMarks(block, atoms)) return null
  const units = unitsOf(block, atoms)
  return writeUnits(units.slice(startIndex(units, from), Math.max(startIndex(units, from), endIndex(units, to)))).text
}

/** What the words a range covers wear in common, and whether there are any. */
export function rangeWears(block: Block, from: number, to: number, key: string, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): { words: boolean; all: boolean } {
  const units = unitsOf(block, atoms)
  const within = units.slice(startIndex(units, from), endIndex(units, to)).filter(unit => !unit.fixed && !isBlank(unit))
  return { words: within.length > 0, all: within.length > 0 && within.every(unit => sameKeys(unit.marks, key)) }
}

/**
 * A bare address is a link only while its letters stand together, so a mark on
 * some of them would end the link. One a range's edge falls inside is written
 * out as a link first, and its letters then wear whatever they are given.
 */
function holdAddresses(units: Unit[], start: number, end: number) {
  for (const edge of [start, end]) {
    const href = units[edge]?.bare
    if (!href || units[edge - 1]?.bare !== href) continue
    let first = edge, last = edge
    while (units[first - 1]?.bare === href) first--
    while (units[last + 1]?.bare === href) last++
    const link = linkMark(href)
    for (let at = first; at <= last; at++) if (!sameKeys(units[at].marks, link.key)) units[at] = { ...units[at], marks: wearing(units[at].marks, [link]) }
  }
}

/** A range's words given a mark, or with their marks of a family taken off. The offsets it gives are of the same words afterwards. */
export function markRange(block: Block, from: number, to: number, change: { add?: Mark; remove?: string | readonly string[] }, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): { source: string; from: number; to: number } {
  const units = unitsOf(block, atoms)
  const start = startIndex(units, from), end = Math.max(start, endIndex(units, to))
  if (change.add && end > start) holdAddresses(units, start, end)
  const next = units.map((unit, index) => {
    if (index < start || index >= end || unit.fixed) return unit
    const gone = [change.remove ?? []].flat()
    const off = unit.marks.filter(mark => !gone.includes(mark.family) && !gone.includes(mark.key))
    return { ...unit, marks: change.add ? wearing(off, [change.add]) : off }
  })
  const written = writeUnits(next)
  return { source: written.text, from: written.starts[start] ?? written.text.length, to: end > start ? written.ends[end - 1] : written.starts[start] ?? written.text.length }
}

/** Whether what stands just before a place wears a mark: what ⌘B with no selection is turning off. */
export function wornAt(block: Block, offset: number, key: string, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): boolean {
  const units = unitsOf(block, atoms)
  const before = units[startIndex(units, offset) - 1]
  return !!before && !before.fixed && !before.breaks && sameKeys(before.marks, key)
}
