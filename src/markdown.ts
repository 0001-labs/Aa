/**
 * Aa's Markdown. What people write is Markdown, and this is how it is read:
 * block by block, then run by run within a block, with every character kept,
 * so what is drawn on the screen reads straight back into the text.
 */

export type BlockKind = 'paragraph' | 'heading' | 'bullet' | 'quote' | 'code' | 'divider' | 'callout' | 'table' | 'equation' | 'columns'

export type Block = {
  kind: BlockKind
  /** The block's whole Markdown, prefixes and fences included. */
  source: string
  /** How many characters the block's prefix takes on its first line: `## `, `- [ ] `, `> `, the opening fence. */
  prefix: number
  /** A heading's level, 1 to 6. */
  level?: number
  /** A bullet's box: unset for a plain bullet. */
  checked?: boolean
  /** A numbered bullet's number. */
  number?: number
  depth?: number
  indent?: number
  callout?: string
  folded?: boolean
}

/** A block with where its source started in the text it was read from. */
export type Placed = Block & { start: number }

export const HEADING = /^ {0,3}(#{1,6})[ \t]+/
export const BULLET = /^ *(?:([-*+])|(\d{1,9})[.)])[ \t]+(?:\[([ xX])\][ \t]+)?/
export const QUOTE = /^ {0,3}>[ \t]?/
export const FENCE = /^ {0,3}(`{3,}|~{3,})/
export const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

export const COLUMNS_OPEN = /^\s*<columns>\s*$/
const COLUMNS_CLOSE = /^\s*<\/columns>\s*$/
const COLUMN_OPEN = /^\s*<column>\s*$/
const COLUMN_CLOSE = /^\s*<\/column>\s*$/

/**
 * Columns, written as Notion writes them in Markdown: `<columns>` around a
 * `<column>` for each, every column Markdown of its own. A column's lines may
 * be indented by tabs, as Notion indents them; they are read without.
 */
export function readColumns(source: string): string[] {
  const columns: string[][] = []
  let current: string[] | null = null
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (COLUMNS_OPEN.test(line) || COLUMNS_CLOSE.test(line)) continue
    if (COLUMN_OPEN.test(line)) { current = []; columns.push(current); continue }
    if (COLUMN_CLOSE.test(line)) { current = null; continue }
    if (current) current.push(line.replace(/^\t{1,2}/, ''))
  }
  const trimmed = columns.map(lines => lines.join('\n').replace(/^\n+|\n+$/g, ''))
  return trimmed.length ? trimmed : ['', '']
}

/** Columns written back as one block. */
export function writeColumns(columns: readonly string[]): string {
  return ['<columns>', ...columns.flatMap(column => ['<column>', ...(column ? [column] : []), '</column>']), '</columns>'].join('\n')
}

/**
 * The block at `from` put at a side of the one at `to`, as Notion places a
 * picture beside another: the two become columns, or it is one more column of
 * columns already there. The change is the text from `start` to `end`
 * rewritten; null where it cannot (the same block, or columns carried).
 */
export function besideChange(text: string, from: number, to: number, at: 'start' | 'end'): { start: number; end: number; text: string } | null {
  const placed = parseBlocks(text)
  const carried = placed[from], target = placed[to]
  if (from === to || !carried || !target || carried.kind === 'columns') return null
  const columns = target.kind === 'columns' ? readColumns(target.source) : [target.source]
  if (at === 'start') columns.unshift(carried.source)
  else columns.push(carried.source)
  const next: Block[] = placed
    .filter((_, index) => index !== from)
    .map(block => (block === target ? { ...block, kind: 'columns' as const, prefix: '<columns>'.length, source: writeColumns(columns) } : block))
  const first = Math.min(from, to), last = Math.max(from, to)
  return { start: placed[first].start, end: placed[last].start + placed[last].source.length, text: serialize(next.slice(first, last)) }
}

function closesFence(line: string, fence: string): boolean {
  const close = FENCE.exec(line)
  return !!close && close[1][0] === fence[0] && close[1].length >= fence.length && !line.slice(close[0].length).trim()
}

/** A line that goes on with the paragraph before it rather than starting something of its own. */
function continues(line: string): boolean {
  return !!line.trim() && !FENCE.test(line) && !DIVIDER.test(line) && !HEADING.test(line) && !BULLET.test(line) && !QUOTE.test(line) && !COLUMNS_OPEN.test(line)
}

/** Read a text into its blocks. A text with nothing in it is one empty paragraph. */
export function parseBlocks(text: string): Placed[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const starts: number[] = []
  let at = 0
  for (const line of lines) { starts.push(at); at += line.length + 1 }
  const blocks: Placed[] = []
  const push = (kind: BlockKind, from: number, to: number, extra: Partial<Block> = {}) => {
    blocks.push({ kind, source: lines.slice(from, to + 1).join('\n'), prefix: 0, ...extra, start: starts[from] })
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '$$') {
      let j = i + 1
      while (j < lines.length && lines[j].trim() !== '$$') j++
      push('equation', i, Math.min(j, lines.length - 1), { prefix: line.length })
      i = j + 1
      continue
    }
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      let j = i + 1
      while (j + 1 < lines.length && lines[j + 1].trim() && lines[j + 1].includes('|')) j++
      push('table', i, j)
      i = j + 1
      continue
    }
    if (COLUMNS_OPEN.test(line)) {
      let j = i + 1
      while (j < lines.length && !COLUMNS_CLOSE.test(lines[j])) j++
      push('columns', i, Math.min(j, lines.length - 1), { prefix: line.length })
      i = j + 1
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      let j = i + 1
      while (j < lines.length && !closesFence(lines[j], fence[1])) j++
      push('code', i, Math.min(j, lines.length - 1), { prefix: line.length })
      i = j + 1
      continue
    }
    if (!line.trim()) { i++; continue }
    if (DIVIDER.test(line)) { push('divider', i, i, { prefix: line.length }); i++; continue }
    const heading = HEADING.exec(line)
    if (heading) { push('heading', i, i, { level: heading[1].length, prefix: heading[0].length }); i++; continue }
    const bullet = BULLET.exec(line)
    if (bullet) {
      const indent = /^ */.exec(line)![0].length
      const previous = blocks[blocks.length - 1]
      let depth = 0
      if (indent && previous?.kind === 'bullet') {
        if (indent > (previous.indent ?? 0)) depth = (previous.depth ?? 0) + 1
        else {
          const sibling = [...blocks].reverse().find(b => b.kind === 'bullet' && (b.indent ?? 0) <= indent)
          depth = sibling?.depth ?? 1
        }
      } else if (indent) depth = Math.floor(indent / (bullet[2] ? 3 : 2))
      push('bullet', i, i, { prefix: bullet[0].length, indent, depth, checked: bullet[3] === undefined ? undefined : bullet[3] !== ' ', number: bullet[2] ? Number(bullet[2]) : undefined })
      i++
      continue
    }
    if (QUOTE.test(line)) {
      let j = i
      while (j + 1 < lines.length && QUOTE.test(lines[j + 1])) j++
      const callout = /^>\s*\[!([a-z]+)\](-)?\s*/i.exec(line)
      const titleHeading = callout ? /^(#{1,6})\s+/.exec(line.slice(callout[0].length)) : null
      push(callout ? 'callout' : 'quote', i, j, callout ? { level: titleHeading?.[1].length, prefix: callout[0].length + (titleHeading?.[0].length ?? 0), callout: callout[1].toLowerCase(), folded: !!callout[2] } : { prefix: QUOTE.exec(line)![0].length })
      i = j + 1
      continue
    }
    let j = i
    while (j + 1 < lines.length && continues(lines[j + 1])) j++
    push('paragraph', i, j)
    i = j + 1
  }
  if (!blocks.length) blocks.push({ kind: 'paragraph', source: '', prefix: 0, start: 0 })
  // Line breaks at the text's own edges are kept by the paragraph there,
  // so a break typed at the end of a block gives it an empty line to write
  // on rather than vanishing. A whole document is trimmed of them first.
  const lead = /^\n+/.exec(text)?.[0] ?? ''
  const trail = text.length > lead.length ? (/\n+$/.exec(text)?.[0] ?? '') : ''
  const first = blocks[0], last = blocks[blocks.length - 1]
  if (lead && first.kind === 'paragraph') { first.source = lead + first.source; first.start = 0 }
  if (trail && last.kind === 'paragraph') last.source += trail
  return blocks
}

/** Write blocks back as one text: a blank line between blocks, none between two bullets, so a list stays a list. */
export function serialize(blocks: readonly Block[]): string {
  let out = ''
  blocks.forEach((block, index) => {
    if (index) out += blocks[index - 1].kind === 'bullet' && block.kind === 'bullet' ? '\n' : '\n\n'
    out += block.source
  })
  return out
}

/** Whether a code block has its closing fence. */
export function codeClosed(block: Block): boolean {
  const lines = block.source.split('\n')
  return lines.length > 1 && closesFence(lines[lines.length - 1], FENCE.exec(lines[0])![1])
}

export type RunKind = 'text' | 'syntax' | 'break' | 'atom'

export type Run = {
  kind: RunKind
  from: number
  to: number
  bold?: true
  italic?: true
  strike?: true
  /** `<u>words</u>`: Markdown has no underline, so it is written as HTML, as GitHub and Notion read it. */
  underline?: true
  code?: true
  highlight?: true
  /** `<span color="red">words</span>`, Notion's way of writing a text colour: one of `TEXT_COLORS`. */
  color?: string
  href?: string
  /**
   * Syntax belongs to a mark: the range of the whole mark, delimiters
   * included, shown together while the caret is in it. Prefix syntax has no
   * group: it shows while its block is being edited.
   */
  group?: [number, number]
  prefix?: true
  /** An atom's kind: the run is drawn as one thing, never letter by letter. */
  atom?: string
}

/**
 * A piece of writing drawn as one thing rather than as its letters: a
 * picture, a reference, a link shown as a title. The text stays what it
 * was written as; only the drawing changes, and the caret steps over it whole.
 */
export type AtomSyntax = {
  name: string
  /** How many characters an atom of this kind takes at `at` in a line, or 0 when none starts there. */
  match(line: string, at: number): number
  /** A fenced code block in this language is drawn whole as this atom, fences and all: `diagram` for ```diagram. */
  fence?: string
}

/** The atom a closed code block is drawn as, by its fence's language, if any is given one. */
export function fencedAtom<T extends AtomSyntax>(block: Block, atoms: readonly T[]): T | undefined {
  if (block.kind !== 'code' || !codeClosed(block)) return undefined
  // The language is the info string's first word; what follows it (a diagram's `wrap`) is the atom's.
  const language = block.source.slice(0, block.prefix).replace(/^ {0,3}(`{3,}|~{3,})/, '').trim().toLowerCase().split(/\s+/)[0]
  return language ? atoms.find(atom => atom.fence?.toLowerCase() === language) : undefined
}

/** An atom found by a pattern, optionally only where `accept` agrees. */
export function atomPattern(name: string, pattern: RegExp, accept?: (match: RegExpExecArray) => boolean): AtomSyntax {
  const sticky = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + 'y')
  return {
    name,
    match(line, at) {
      sticky.lastIndex = at
      const found = sticky.exec(line)
      return found && found[0].length && (!accept || accept(found)) ? found[0].length : 0
    },
  }
}

/** A Markdown picture, `![name](address)`. */
export const IMAGE = atomPattern('image', /!\[[^\]\n]*\]\([^\s()]+\)/)
export const EQUATION = atomPattern('equation', /\$(?!\$)(?:\\.|[^$\n])+\$/)

/** The atoms an editor reads unless it is given others. */
export const DEFAULT_ATOMS: readonly AtomSyntax[] = [IMAGE, EQUATION]

type Marks = Pick<Run, 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'href' | 'highlight' | 'color'>

/** The colours words can be written in, by Notion's names for them. */
export const TEXT_COLORS = ['gray', 'red', 'orange', 'green', 'blue', 'purple'] as const
export type TextColor = (typeof TEXT_COLORS)[number]
/** The tags that open an underline or a colour, at a place in a line. */
const TAG = /<u>|<span color="(gray|red|orange|green|blue|purple)">/y

const DELIMITERS = ['**', '__', '~~', '==', '*', '_'] as const
const MARK_OF: Record<(typeof DELIMITERS)[number], 'bold' | 'strike' | 'italic' | 'highlight'> = { '**': 'bold', '__': 'bold', '~~': 'strike', '==': 'highlight', '*': 'italic', '_': 'italic' }
const LINK = /^\[([^[\]]*)\]\(([^\s()]*)\)/
const AUTOLINK = /(?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"]/g

const isWord = (char: string | undefined) => !!char && /[\p{L}\p{N}]/u.test(char)
const isSpace = (char: string | undefined) => !char || /\s/.test(char)

/** How many of the delimiter's character stand in a row at `i`. */
function runLength(text: string, i: number, char: string, end: number): number {
  let r = 0
  while (i + r < end && text[i + r] === char) r++
  return r
}

function canOpen(text: string, i: number, d: string, end: number): boolean {
  const r = runLength(text, i, d[0], end)
  if (r < d.length || i + r >= end || isSpace(text[i + r])) return false
  if (d[0] === '_' && isWord(text[i - 1])) return false
  return true
}

/**
 * Where a mark opened at `from` closes: the start of a run of its character
 * that follows a letter. A single delimiter closes at the run's first
 * character and a double at its last two, so `***both***` nests.
 */
function findClose(text: string, from: number, end: number, d: string): number {
  for (let k = from; k < end; k++) {
    if (text[k] !== d[0]) continue
    const r = runLength(text, k, d[0], end)
    const close = d.length === 1 ? k : k + r - d.length
    const fits = r >= d.length && !isSpace(text[k - 1]) && close > from && !(d[0] === '_' && isWord(text[k + r]))
    if (fits) return close
    k += r - 1
  }
  return -1
}

function pushText(text: string, from: number, to: number, base: number, marks: Marks, out: Run[]) {
  if (to <= from) return
  if (marks.href || marks.code) { out.push({ kind: 'text', from: base + from, to: base + to, ...marks }); return }
  const slice = text.slice(from, to)
  let last = 0
  for (const match of slice.matchAll(AUTOLINK)) {
    const index = match.index!
    if (index > last) out.push({ kind: 'text', from: base + from + last, to: base + from + index, ...marks })
    const url = match[0]
    out.push({ kind: 'text', from: base + from + index, to: base + from + index + url.length, ...marks, href: url.startsWith('www.') ? `https://${url}` : url })
    last = index + url.length
  }
  if (last < slice.length) out.push({ kind: 'text', from: base + from + last, to: base + to, ...marks })
}

/** The runs of one line of writing between `start` and `end`, offsets made absolute with `base`. */
function inline(text: string, start: number, end: number, base: number, marks: Marks, out: Run[], atoms: readonly AtomSyntax[]) {
  let i = start
  let from = start
  const flush = (to: number) => pushText(text, from, to, base, marks, out)
  while (i < end) {
    const char = text[i]
    if (char === '`' && !marks.code) {
      let n = 1
      while (text[i + n] === '`') n++
      const ticks = '`'.repeat(n)
      let close = text.indexOf(ticks, i + n)
      while (close >= 0 && close + n < end && text[close + n] === '`') {
        let m = close
        while (text[m] === '`') m++
        close = text.indexOf(ticks, m)
      }
      if (close >= 0 && close + n <= end) {
        flush(i)
        const group: [number, number] = [base + i, base + close + n]
        out.push({ kind: 'syntax', from: base + i, to: base + i + n, group })
        if (close > i + n) out.push({ kind: 'text', from: base + i + n, to: base + close, ...marks, code: true })
        out.push({ kind: 'syntax', from: base + close, to: base + close + n, group })
        i = close + n
        from = i
        continue
      }
    }
    if (!marks.href && !marks.code && atoms.length) {
      let length = 0, name = ''
      for (const atom of atoms) { length = atom.match(text, i); if (length && i + length <= end) { name = atom.name; break }; length = 0 }
      if (length) {
        flush(i)
        out.push({ kind: 'atom', atom: name, from: base + i, to: base + i + length, ...(name === 'equation' ? { group: [base + i, base + i + length] as [number, number] } : {}) })
        i += length
        from = i
        continue
      }
    }
    if (char === '[' && !marks.href && !marks.code) {
      const link = LINK.exec(text.slice(i, end))
      if (link) {
        flush(i)
        const group: [number, number] = [base + i, base + i + link[0].length]
        out.push({ kind: 'syntax', from: base + i, to: base + i + 1, group })
        inline(text, i + 1, i + 1 + link[1].length, base, { ...marks, href: link[2] }, out, atoms)
        out.push({ kind: 'syntax', from: base + i + 1 + link[1].length, to: base + i + link[0].length, group })
        i += link[0].length
        from = i
        continue
      }
    }
    if (char === '<' && !marks.code) {
      TAG.lastIndex = i
      const tag = TAG.exec(text)
      const color = tag?.[1], closing = color ? '</span>' : '</u>'
      const close = tag && !(color ? marks.color : marks.underline) ? text.indexOf(closing, i + tag[0].length) : -1
      if (tag && close >= 0 && close + closing.length <= end) {
        flush(i)
        const group: [number, number] = [base + i, base + close + closing.length]
        out.push({ kind: 'syntax', from: base + i, to: base + i + tag[0].length, group })
        inline(text, i + tag[0].length, close, base, color ? { ...marks, color } : { ...marks, underline: true }, out, atoms)
        out.push({ kind: 'syntax', from: base + close, to: base + close + closing.length, group })
        i = close + closing.length
        from = i
        continue
      }
    }
    let opened = false
    if (!marks.code) {
      for (const d of DELIMITERS) {
        if (!text.startsWith(d, i) || marks[MARK_OF[d]] || !canOpen(text, i, d, end)) continue
        const close = findClose(text, i + d.length, end, d)
        if (close < 0) continue
        flush(i)
        const group: [number, number] = [base + i, base + close + d.length]
        out.push({ kind: 'syntax', from: base + i, to: base + i + d.length, group })
        inline(text, i + d.length, close, base, { ...marks, [MARK_OF[d]]: true }, out, atoms)
        out.push({ kind: 'syntax', from: base + close, to: base + close + d.length, group })
        i = close + d.length
        from = i
        opened = true
        break
      }
    }
    if (!opened) i++
  }
  flush(end)
}

/** Every run of a block, in order, covering its source from end to end. */
export function blockRuns(block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): Run[] {
  const runs: Run[] = []
  const lines = block.source.split('\n')
  const closed = block.kind === 'code' && codeClosed(block)
  if (block.kind === 'equation') return [{ kind: 'atom', atom: 'equation-block', from: 0, to: block.source.length, group: [0, block.source.length] }]
  // Columns are drawn whole, each column written where it stands; their tags are never shown.
  if (block.kind === 'columns') return [{ kind: 'atom', atom: 'columns', from: 0, to: block.source.length }]
  const fenced = fencedAtom(block, atoms)
  if (fenced) return [{ kind: 'atom', atom: fenced.name, from: 0, to: block.source.length, group: [0, block.source.length] }]
  let at = 0
  lines.forEach((line, index) => {
    if (index) runs.push({ kind: 'break', from: at - 1, to: at })
    if (block.kind === 'code') {
      if (index === 0 || (closed && index === lines.length - 1)) runs.push({ kind: 'syntax', from: at, to: at + line.length, prefix: true })
      else if (line) runs.push({ kind: 'text', from: at, to: at + line.length, code: true })
    } else if (block.kind === 'divider') {
      runs.push({ kind: 'syntax', from: at, to: at + line.length, prefix: true })
    } else {
      let prefix = 0
      if (index === 0 && (block.kind === 'heading' || block.kind === 'bullet')) prefix = block.prefix
      else if (block.kind === 'quote' || block.kind === 'callout') prefix = index === 0 && block.kind === 'callout' ? block.prefix : QUOTE.exec(line)?.[0].length ?? 0
      if (prefix) runs.push({ kind: 'syntax', from: at, to: at + prefix, prefix: true })
      inline(line, prefix, line.length, at, {}, runs, atoms)
    }
    at += line.length + 1
  })
  return runs
}
