import { describe, expect, it } from 'vite-plus/test'
import { blockRuns, parseBlocks, serialize, type Block } from '../src/markdown'
import { colorSelection, fromMarkdown, joinWithPrevious, replaceRange, sliceMarkdown, splitAt, wrapSelection, type Pos } from '../src/document'

/**
 * Whatever is done to a document, nothing shows as syntax and no word loses a
 * mark nobody took off it. The document here is letters and spaces, so any
 * other character on the screen is syntax; and a model of its own, every letter
 * with the marks it should wear, says what the words must be, with no help from
 * the code under test. Seeded: a failure reads the same every run.
 */
/** `fresh` letters were just typed: what they first wear is the editor's to choose; from then on they are held to it. */
type Letter = { char: string; marks: Set<string>; fresh?: boolean }
type Model = Letter[][]

function random(seed: number) {
  return (below: number) => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) % below)
  }
}

const OPEN: Record<string, [string, string]> = { bold: ['**', '**'], italic: ['*', '*'], strike: ['~~', '~~'], highlight: ['==', '=='], underline: ['<u>', '</u>'], 'color:red': ['<span color="red">', '</span>'], 'color:blue': ['<span color="blue">', '</span>'], 'background:green': ['<span color="green_background">', '</span>'] }
const NAMES = Object.keys(OPEN)

const runMarks = (run: ReturnType<typeof blockRuns>[number]) => {
  const marks = new Set<string>()
  if (run.bold) marks.add('bold')
  if (run.italic) marks.add('italic')
  if (run.strike) marks.add('strike')
  if (run.highlight) marks.add('highlight')
  if (run.underline) marks.add('underline')
  if (run.color) marks.add(`color:${run.color}`)
  if (run.background) marks.add(`background:${run.background}`)
  return marks
}

/** What a block shows: each letter on the screen with what it wears. */
function shows(block: Block): Letter[] {
  const letters: Letter[] = []
  for (const run of blockRuns(block)) {
    if (run.kind !== 'text') continue
    const marks = runMarks(run)
    for (const char of block.source.slice(run.from, run.to)) letters.push({ char, marks })
  }
  return letters
}

/** A source offset for a place in a block's letters. */
function sourceAt(block: Block, letter: number, bias: 'start' | 'end'): number {
  let seen = 0
  const runs = blockRuns(block).filter(run => run.kind === 'text')
  for (const run of runs) {
    const length = run.to - run.from
    if (letter < seen + length || (bias === 'end' && letter === seen + length)) return run.from + letter - seen
    seen += length
  }
  return runs.at(-1)?.to ?? block.source.length
}

const startModel = (take: (below: number) => number): { text: string; model: Model } => {
  const model: Model = [], parts: string[] = []
  for (let b = 0, count = 1 + take(3); b < count; b++) {
    const words = 1 + take(6), letters: Letter[] = []
    let source = ''
    for (let w = 0; w < words; w++) {
      const word = 'abcdefgh'.slice(0, 1 + take(5))
      const name = take(3) === 0 ? NAMES[take(NAMES.length)] : null
      if (w) { source += ' '; letters.push({ char: ' ', marks: new Set() }) }
      source += name ? `${OPEN[name][0]}${word}${OPEN[name][1]}` : word
      for (const char of word) letters.push({ char, marks: new Set(name ? [name] : []) })
    }
    model.push(letters); parts.push(source)
  }
  return { text: parts.join('\n\n'), model }
}

function check(blocks: Block[], model: Model, trail: string[]) {
  const context = () => `\n${trail.join('\n')}\nstored ${JSON.stringify(serialize(blocks))}`
  const seen = blocks.map(shows)
  // A block of spaces alone reads as an empty one, as Markdown has it, or keeps them inside a tag: either is nothing to see.
  model.forEach((letters, index) => { if (letters.every(letter => letter.char === ' ') && (seen[index] ?? []).every(letter => letter.char === ' ')) model[index] = seen[index] ?? [] })
  const words = (letters: Letter[]) => letters.every(l => l.char === ' ') ? '' : letters.map(l => l.char).join('')
  expect(seen.map(words), `words${context()}`).toEqual(model.map(words))
  seen.forEach((letters, b) => model[b].length && letters.forEach((letter, i) => {
    if (model[b][i].fresh) { model[b][i] = letter; return }
    if (letter.char === ' ') return
    expect([...letter.marks].sort(), `marks of letter ${i} of block ${b}${context()}`).toEqual([...model[b][i].marks].sort())
  }))
  // Reopened, it reads the same: nothing depends on how it got there.
  const reopened = parseBlocks(serialize(blocks)).map(({ start: _start, ...block }) => shows(block))
  expect(reopened.map(words).filter(Boolean), `reopened${context()}`).toEqual(seen.map(words).filter(Boolean))
}

const OPS = 6
function act(blocks: Block[], model: Model, take: (below: number) => number, trail: string[]): Block[] {
  const b = take(blocks.length), a = take(blocks.length)
  const first = Math.min(a, b), last = Math.max(a, b)
  const length = (index: number) => model[index].length
  const fromLetter = take(length(first) + 1)
  const toLetter = first === last ? fromLetter + take(length(last) - fromLetter + 1) : take(length(last) + 1)
  // With nothing selected the caret stands as the browser stands it: against the letter before it, inside its marks.
  const from: Pos = { block: first, offset: sourceAt(blocks[first], fromLetter, first === last && fromLetter === toLetter ? 'end' : 'start') }
  const to: Pos = { block: last, offset: sourceAt(blocks[last], toLetter, 'end') }
  const op = take(OPS)
  const said = (name: string) => trail.push(`${name} ${first}:${fromLetter} to ${last}:${toLetter} of ${JSON.stringify(serialize(blocks))}`)
  const inRange = (index: number, letter: number) => (index > first || letter >= fromLetter) && (index < last || letter < toLetter)
  if (op === 0 || op === 1) {
    // Delete, or type over, what is selected.
    const typed = op === 1 ? 'zy' : ''
    if (fromLetter === toLetter && first === last && !typed) return blocks
    said(typed ? 'type over' : 'delete')
    const wears = model[first][fromLetter] ?? model[first][fromLetter - 1]
    const kept = [...model[first].slice(0, fromLetter), ...[...typed].map(char => ({ char, marks: new Set(wears?.marks), fresh: true })), ...model[last].slice(toLetter)]
    model.splice(first, last - first + 1, kept)
    return replaceRange(blocks, from, to, typed).blocks
  }
  if (op === 2) {
    // Enter at a place: both sides keep what they wear.
    if (!fromLetter || fromLetter === length(first)) return blocks
    said('enter')
    const here = { block: first, offset: from.offset }
    const head = model[first].slice(0, fromLetter), tail = model[first].slice(fromLetter)
    // A line starting with a space is read without it, as it is in a paragraph's next block.
    model.splice(first, 1, head, tail)
    const next = splitAt(blocks, here).blocks
    if (next.length !== blocks.length + 1) { model.splice(first, 2, [...head, ...tail]); return blocks }
    return next
  }
  if (op === 3) {
    if (first === 0) return blocks
    said('join')
    const change = joinWithPrevious(blocks, first)!
    const joined = [...model[first - 1], ...model[first]]
    model.splice(first - 1, 2, joined)
    return change.blocks
  }
  const words = (index: number) => model[index].filter((letter, at) => inRange(index, at) && letter.char !== ' ')
  const selected = model.flatMap((_, index) => index < first || index > last ? [] : words(index))
  if (!selected.length) return blocks
  if (op === 4) {
    const name = ['bold', 'italic', 'strike', 'highlight', 'underline'][take(5)]
    said(name)
    const all = selected.every(letter => letter.marks.has(name))
    model.forEach((letters, index) => letters.forEach((letter, at) => { if (index >= first && index <= last && inRange(index, at)) { letter.marks = new Set(letter.marks); if (all) letter.marks.delete(name); else letter.marks.add(name) } }))
    const delimiter = OPEN[name][0]
    return wrapSelection(blocks, from, to, delimiter, OPEN[name][1])!.blocks
  }
  const color = [null, 'red', 'blue'][take(3)]
  said(`colour ${color}`)
  model.forEach((letters, index) => letters.forEach((letter, at) => { if (index >= first && index <= last && inRange(index, at)) { letter.marks = new Set([...letter.marks].filter(mark => !mark.startsWith('color:'))); if (color) letter.marks.add(`color:${color}`) } }))
  return colorSelection(blocks, from, to, color)?.blocks ?? blocks
}

describe('sturdiness', () => {
  it('keeps every mark on its words through any edit, and never shows syntax', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const take = random(seed)
      const { text, model } = startModel(take)
      let blocks = fromMarkdown(text)
      const trail = [`seed ${seed}`, `start ${JSON.stringify(text)}`]
      check(blocks, model, trail)
      for (let step = 0; step < 12; step++) {
        blocks = act(blocks, model, take, trail)
        if (!blocks.length || model.some(letters => !letters.length) && blocks.length !== model.length) { model.splice(0, model.length, ...blocks.map(shows)) }
        if (model.length !== blocks.length) model.splice(0, model.length, ...blocks.map(shows))
        check(blocks, model, trail)
      }
    }
  }, 60_000)

  it('copies a piece of a marked phrase with its marks', () => {
    const blocks = fromMarkdown('**one two** three')
    expect(sliceMarkdown(blocks, { block: 0, offset: 6 }, { block: 0, offset: 17 })).toBe('**two** three')
  })
})
