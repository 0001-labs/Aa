import { describe, expect, it } from 'vite-plus/test'
import { blockRuns, linkAround, parseBlocks, serialize, type Block } from '../src/markdown'
import { addressFold } from '../src/render'
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

describe('reading a block once', () => {
  it('gives the same reading of the same block, and a reading of its own to other atoms', () => {
    const [block] = parseBlocks('Some **bold** words')
    expect(blockRuns(block)).toBe(blockRuns(block))
    expect(blockRuns(block, [])).not.toBe(blockRuns(block))
  })
})

describe('links as Markdown writes them', () => {
  const trello = 'https://thailandtours.webirium.com/rejseblog/phuket/'
  const links = (source: string) => blockRuns(parseBlocks(source)[0]).filter(run => run.kind === 'text' && run.href)
  const shown = (source: string) => blockRuns(parseBlocks(source)[0]).filter(run => run.kind === 'text').map(run => source.slice(run.from, run.to)).join('')
  const typed = (source: string, at: number, text: string) => serialize(replaceRange(fromMarkdown(source), { block: 0, offset: at }, { block: 0, offset: at }, text).blocks)

  it.each([
    ['an empty title', `[${trello}](${trello} "")`, trello, undefined],
    ['the invisible title Trello writes', `[${trello}](${trello} "‌")`, trello, undefined],
    ['a title', '[words](https://a.dk "Read this")', 'https://a.dk', 'Read this'],
    ['a title in single quotes', "[words](https://a.dk 'Read this')", 'https://a.dk', 'Read this'],
    ['a title in brackets', '[words](https://a.dk (Read this))', 'https://a.dk', 'Read this'],
    ['an address in angle brackets', '[words](<https://a.dk/two words>)', 'https://a.dk/two words', undefined],
    ['a pair of brackets in the address', '[words](https://a.dk/x_(y))', 'https://a.dk/x_(y)', undefined],
    ['spaces inside the brackets', '[words]( https://a.dk )', 'https://a.dk', undefined],
    ['an escaped bracket in the words', '[wo\\]rds](https://a.dk)', 'https://a.dk', undefined],
  ])('reads %s as one link', (_name, source, href, title) => {
    const [link] = links(source)
    expect(link.href).toBe(href)
    expect(link.title).toBe(title)
    expect(shown(source)).not.toMatch(/\]\(|""/)
  })

  it('leaves what is not a link as it is written', () => {
    expect(links('[words] (https://a.dk "x")')[0]?.title).toBeUndefined()
    expect(shown('[words](not an address)')).toBe('[words](not an address)')
    expect(shown('[words](https://a.dk "open')).toContain('"open')
  })
  const bolded = (source: string, words: string) => { const at = source.indexOf(words); return serialize(wrapSelection(fromMarkdown(source), { block: 0, offset: at }, { block: 0, offset: at + words.length }, '**')!.blocks) }
  it('keeps a title while the words change and while they are marked', () => {
    expect(typed('[words](https://a.dk "Read this")', 1, 'my ')).toBe('[my words](https://a.dk "Read this")')
    expect(bolded('[two words](https://a.dk "Read this")', 'words')).toBe('[two **words**](https://a.dk "Read this")')
  })
  it('keeps an address in angle brackets while the words are marked', () => {
    expect(bolded('[two words](<https://a.dk/two words>)', 'words')).toBe('[two **words**](<https://a.dk/two words>)')
  })
  it('lets a title that says nothing go when the words are marked', () => {
    expect(bolded('[two words](https://a.dk "")', 'words')).toBe('[two **words**](https://a.dk)')
  })
  it('finds the link around the caret, written or bare', () => {
    const source = 'See [words](https://a.dk "Read this") or https://b.dk now'
    expect(linkAround(source, 6, 6)).toEqual({ from: 4, to: 37, words: 'words', href: 'https://a.dk' })
    expect(linkAround(source, 45, 45)).toEqual({ from: 41, to: 53, words: 'https://b.dk', href: 'https://b.dk' })
    expect(linkAround(source, 0, 2)).toBeNull()
  })
  it('folds an address to what reads, never a link of words', () => {
    const fold = (text: string, href = text) => { const found = addressFold({ kind: 'text', from: 0, to: text.length, href }, text); return found && text.slice(found.shown, found.end) + (found.more ? ' (cut)' : '') }
    expect(fold('https://github.com/Pankado-kk/thailandtours/pull/143')).toBe('github.com/Pankado-kk/thailandtours/pull/143')
    expect(fold('https://www.example.com/')).toBe('example.com')
    expect(fold('www.example.com')).toBe('example.com')
    expect(fold('https://thailandtours.webirium.com/rejseblog/phuket-eller-krabi-hvilken-destination-er-den-rigtige-for-dig/')).toBe('thailandtours.webirium.com/rejseblog/phuket-eller-krabi (cut)')
    expect(fold('Our words', 'https://a.dk')).toBeNull()
    expect(addressFold({ kind: 'text', from: 0, to: 12, href: 'https://a.dk', code: true }, 'https://a.dk')).toBeNull()
  })
})

describe('coloured links', () => {
  const paint = (source: string, words: string, color: string | null = 'purple') => {
    const blocks = fromMarkdown(source), at = source.indexOf(words)
    return serialize(colorSelection(blocks, { block: 0, offset: at }, { block: 0, offset: at + words.length }, color)!.blocks)
  }
  const links = (source: string) => blockRuns(parseBlocks(source)[0]).filter(run => run.kind === 'text' && run.href)
  it('colours a whole bare address and leaves it bare', () => {
    expect(paint('See https://using.link now', 'https://using.link')).toBe('See <span color="purple">https://using.link</span> now')
  })
  it('colours a written link and takes the colour off again', () => {
    const painted = paint('See [Using](https://using.link) now', 'Using')
    expect(painted).toBe('See <span color="purple">[Using](https://using.link)</span> now')
    expect(paint(painted, 'Using', null)).toBe('See [Using](https://using.link) now')
  })
  it('keeps a bare address a link when part of it is coloured', () => {
    const painted = paint('See https://using.link now', 'using')
    expect(painted).toBe('See [https://<span color="purple">using</span>.link](https://using.link) now')
    expect(links(painted).map(run => [run.href, run.color])).toEqual([['https://using.link', undefined], ['https://using.link', 'purple'], ['https://using.link', undefined]])
  })
  it('keeps a bare address a link when colour runs in from outside it', () => {
    const painted = paint('See https://using.link now', 'See https')
    expect(links(painted).every(run => run.href === 'https://using.link')).toBe(true)
    expect(links(painted).map(run => run.color)).toEqual(['purple', undefined])
  })
  it('gives a www address its https when it has to be written out', () => {
    expect(paint('www.using.link', 'using')).toBe('[www.<span color="purple">using</span>.link](https://www.using.link)')
  })
})

describe('marks across table cells', () => {
  const TABLE = '| Tjeneste | Formål | Pris |\n| --- | --- | --- |\n| Cloudflare | Hosting | 750 |'
  const across = (source: string, first: string, last: string, delimiter = '**', closing = delimiter) => {
    const blocks = fromMarkdown(source)
    return wrapSelection(blocks, { block: 0, offset: source.indexOf(first) }, { block: 0, offset: source.indexOf(last) + last.length }, delimiter, closing)
  }
  it('marks each cell on its own', () => {
    expect(serialize(across(TABLE, 'Tjeneste', 'Pris')!.blocks)).toBe('| **Tjeneste** | **Formål** | **Pris** |\n| --- | --- | --- |\n| Cloudflare | Hosting | 750 |')
  })
  it('takes the mark off every cell again', () => {
    const bold = serialize(across(TABLE, 'Tjeneste', 'Pris')!.blocks)
    expect(serialize(across(bold, 'Tjeneste', 'Pris')!.blocks)).toBe(TABLE)
  })
  it('passes over the delimiter row between rows, and leaves the table a table', () => {
    const marked = serialize(across(TABLE, 'Pris', 'Cloudflare')!.blocks)
    expect(marked).toBe('| Tjeneste | Formål | **Pris** |\n| --- | --- | --- |\n| **Cloudflare** | Hosting | 750 |')
    expect(parseBlocks(marked).map(block => block.kind)).toEqual(['table'])
  })
  it('colours each cell on its own', () => {
    const blocks = fromMarkdown(TABLE)
    const coloured = colorSelection(blocks, { block: 0, offset: TABLE.indexOf('Tjeneste') }, { block: 0, offset: TABLE.indexOf('Formål') + 6 }, 'red')!
    expect(serialize(coloured.blocks).split('\n')[0]).toBe('| <span color="red">Tjeneste</span> | <span color="red">Formål</span> | Pris |')
  })
  it('writes no equation over a pipe', () => {
    expect(across(TABLE, 'Tjeneste', 'Formål', '$')).toBeNull()
  })
  const over = (source: string, first: string, last: string, text = '') => {
    const blocks = fromMarkdown(source)
    return replaceRange(blocks, { block: 0, offset: source.indexOf(first) }, { block: 0, offset: source.indexOf(last) + last.length }, text)
  }
  it('empties the cells a deletion covers and keeps the columns', () => {
    expect(serialize(over(TABLE, 'Tjeneste', 'Pris').blocks).split('\n')[0]).toBe('|  |  |  |')
    expect(parseBlocks(serialize(over(TABLE, 'Formål', 'Cloudflare').blocks))[0].source).toBe('| Tjeneste |  |  |\n| --- | --- | --- |\n|  | Hosting | 750 |')
  })
  it('puts what is typed over cells in the first, where the caret stays', () => {
    const typed = over(TABLE, 'Tjeneste', 'Formål', 'x')
    expect(serialize(typed.blocks).split('\n')[0]).toBe('| x |  | Pris |')
    expect(typed.caret).toEqual({ block: 0, offset: 3 })
  })
  it('keeps what is pasted over cells inside the first', () => {
    expect(serialize(over(TABLE, 'Tjeneste', 'Formål', 'a|b\nc').blocks).split('\n')[0]).toBe('| a\\|b c |  | Pris |')
  })
  it('leaves the words of bold cells bold when part of them goes', () => {
    const source = '| **Tjeneste** | **Formål** |\n| --- | --- |'
    expect(serialize(over(source, 'neste', 'For').blocks).split('\n')[0]).toBe('| **Tje** | **mål** |')
  })
  it('still replaces a table whole', () => {
    expect(serialize(replaceRange(fromMarkdown(TABLE), { block: 0, offset: 0 }, { block: 0, offset: TABLE.length }, 'Words').blocks)).toBe('Words')
  })
  it('reads a cell as it is drawn: a mark never reaches over a pipe', () => {
    const block = parseBlocks('| **a | b** |\n| --- | --- |')[0]
    expect(blockRuns(block).filter(run => run.kind === 'text' && run.bold)).toEqual([])
  })
})
