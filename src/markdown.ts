/**
 * Aa's Markdown. What people write is Markdown, and this is how it is read:
 * block by block, then run by run within a block, with every character kept,
 * so what is drawn on the screen reads straight back into the text.
 */
import { tableRows } from './table'

export type BlockKind = 'paragraph' | 'heading' | 'bullet' | 'quote' | 'code' | 'divider' | 'callout' | 'table' | 'equation' | 'columns' | 'tabs' | 'toc'

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
  /** A callout's type word (`note`, `tip`, `warning`); '' when it has none. */
  callout?: string
  /** A callout's icon: an emoji, or a picture's address. */
  icon?: string
  /** A callout's fill, one of `CALLOUT_COLORS`. */
  color?: CalloutColor
  /** A callout drawn as Notion's box: one with an icon, a colour, or no type word. A type word alone is a Markdown alert, a hairline and the type's icon. */
  box?: boolean
  folded?: boolean
}

/** A block with where its source started in the text it was read from. */
export type Placed = Block & { start: number }

export const HEADING = /^ {0,3}(#{1,6})[ \t]+/
export const BULLET = /^ *(?:([-*+])|(\d{1,9})[.)])[ \t]+(?:\[([ xX])\][ \t]+)?/
export const QUOTE = /^ {0,3}>[ \t]?/
export const FENCE = /^ {0,3}(`{3,}|~{3,})/
export const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

/** The fills a callout's box can wear, Notion's names: grey when none is written; `white` is the paper in a hairline frame. */
export const CALLOUT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', 'white'] as const
export type CalloutColor = (typeof CALLOUT_COLORS)[number]
/** What a callout's brackets say: `[!note]`, `[!💡]`, `[!💡 yellow]`, `[!https://… blue]`, `[!]`; a minus after them folds it. */
export type CalloutHead = { kind: string; icon?: string; color?: CalloutColor; folded: boolean }
export const CALLOUT = /^>\s*\[!([^\]\n]*)\](-)?[ \t]*/

/**
 * A callout's first line read: the words in its brackets are its type (a word
 * in letters), its icon (an emoji, or a picture's address) and its colour (one
 * of `CALLOUT_COLORS`), any of them in any order; `length` is how far the
 * prefix reaches, its space included. Null for a line that is not a callout's.
 */
export function readCallout(line: string): (CalloutHead & { length: number }) | null {
  const match = CALLOUT.exec(line)
  if (!match) return null
  let kind = '', icon: string | undefined, color: CalloutColor | undefined
  for (const word of match[1].trim().split(/\s+/).filter(Boolean)) {
    const lower = word.toLowerCase()
    if ((CALLOUT_COLORS as readonly string[]).includes(lower)) color = lower as CalloutColor
    else if (/^[a-z]+$/i.test(word)) kind = lower
    else icon = word
  }
  return { kind, icon, color, folded: !!match[2], length: match[0].length }
}

/** A callout's brackets written: `> [!💡 yellow]`, `> [!note]-`, `> [!]`. */
export function writeCallout(head: CalloutHead): string {
  return `> [!${[head.kind, head.icon, head.color].filter(Boolean).join(' ')}]${head.folded ? '-' : ''}`
}

/** Whether a callout read as `head` is drawn as Notion's box rather than a Markdown alert. */
export function calloutIsBox(head: { kind: string; icon?: string; color?: string }): boolean {
  return head.icon !== undefined || head.color !== undefined || !head.kind
}

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

export const TOC = /^\s*<table_of_contents\s*\/>\s*$/

export const TABS_OPEN = /^\s*<tabs>\s*$/
const TABS_CLOSE = /^\s*<\/tabs>\s*$/
const TAB_OPEN = /^\s*<tab\b([^>]*)>\s*$/
const TAB_CLOSE = /^\s*<\/tab>\s*$/

/** One tab of a tabs block: its name, an icon (an emoji, or a picture's address) and its Markdown. */
export type Tab = { name: string; icon?: string; content: string }

const unescapeAttribute = (value: string) => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ')

/**
 * Tabs, written as columns are: `<tabs>` around a `<tab name="…">` for each,
 * every tab Markdown of its own; `icon="💡"` gives a tab an icon. A tab's lines
 * may be indented by tabs; they are read without.
 */
export function readTabs(source: string): Tab[] {
  const tabs: (Tab & { lines: string[] })[] = []
  let current: (Tab & { lines: string[] }) | null = null
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (TABS_OPEN.test(line) || TABS_CLOSE.test(line)) continue
    const open = TAB_OPEN.exec(line)
    if (open) {
      const attributes: Record<string, string> = {}
      for (const match of open[1].matchAll(/([a-z]+)="([^"]*)"/g)) attributes[match[1]] = unescapeAttribute(match[2])
      current = { name: attributes.name ?? '', ...(attributes.icon ? { icon: attributes.icon } : {}), content: '', lines: [] }
      tabs.push(current)
      continue
    }
    if (TAB_CLOSE.test(line)) { current = null; continue }
    if (current) current.lines.push(line.replace(/^\t{1,2}/, ''))
  }
  const read = tabs.map(({ lines, ...tab }) => ({ ...tab, content: lines.join('\n').replace(/^\n+|\n+$/g, '') }))
  return read.length ? read : [{ name: '', content: '' }]
}

/** Tabs written back as one block. */
export function writeTabs(tabs: readonly Tab[]): string {
  return ['<tabs>', ...tabs.flatMap(tab => [`<tab name="${escapeAttribute(tab.name)}"${tab.icon ? ` icon="${escapeAttribute(tab.icon)}"` : ''}>`, ...(tab.content ? [tab.content] : []), '</tab>']), '</tabs>'].join('\n')
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
  return !!line.trim() && !FENCE.test(line) && !DIVIDER.test(line) && !HEADING.test(line) && !BULLET.test(line) && !QUOTE.test(line) && !COLUMNS_OPEN.test(line) && !TABS_OPEN.test(line) && !TOC.test(line)
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
    if (TOC.test(line)) { push('toc', i, i); i++; continue }
    if (TABS_OPEN.test(line)) {
      let j = i + 1
      while (j < lines.length && !TABS_CLOSE.test(lines[j])) j++
      push('tabs', i, Math.min(j, lines.length - 1), { prefix: line.length })
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
      const callout = readCallout(line)
      const titleHeading = callout ? /^(#{1,6})\s+/.exec(line.slice(callout.length)) : null
      push(callout ? 'callout' : 'quote', i, j, callout
        ? { level: titleHeading?.[1].length, prefix: callout.length + (titleHeading?.[0].length ?? 0), callout: callout.kind, folded: callout.folded, ...(callout.icon !== undefined ? { icon: callout.icon } : {}), ...(callout.color ? { color: callout.color } : {}), ...(calloutIsBox(callout) ? { box: true } : {}) }
        : { prefix: QUOTE.exec(line)![0].length })
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
  /** `<span color="red_background">words</span>`, Notion's way of writing a colour behind words: one of `BACKGROUND_COLORS`. */
  background?: string
  href?: string
  /** A link's title, shown when the pointer rests on it. */
  title?: string
  /** A link's `(address "title")` as written, where `(href)` would not say the same. */
  linkSource?: string
  /**
   * Syntax belongs to a mark: the range of the whole mark, delimiters
   * included, shown together while the caret is in it. Prefix syntax has no
   * group: it shows while its block is being edited.
   */
  group?: [number, number]
  prefix?: true
  /** An atom's kind: the run is drawn as one thing, never letter by letter. */
  atom?: string
  /** A bare address drawn as a link: `href` set with no brackets of its own in the text. */
  autolink?: true
  /** The backslash of an escaped character (`\\*`): hidden, and what it escapes reads as itself. */
  escape?: true
  /** A tag with no partner: hidden, as a tag is, but no pair for an edit to keep. */
  lone?: true
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
/**
 * A picture, `![caption](address)`, with its width in squares as the image's title where it has one,
 * `![caption](address "w12")`: a title every Markdown reader takes, so the picture reads anywhere.
 */
export const IMAGE = atomPattern('image', /!\[[^\]\n]*\]\([^\s()]+(?: "w\d+")?\)/)

/** A picture's source read: its caption, address and width in squares (none where it has no width of its own). */
export function readPicture(source: string): { alt: string; src: string; width: number | null } {
  const [, alt = '', src = '', width] = /^!\[([^\]]*)\]\(([^\s)]*)(?: "w(\d+)")?\)$/.exec(source) ?? []
  return { alt, src, width: width ? Number(width) : null }
}

/** A picture's source written: its width in squares as the title, or none. */
export function writePicture(alt: string, src: string, width: number | null): string {
  return `![${alt}](${src}${width ? ` "w${width}"` : ''})`
}
export const EQUATION = atomPattern('equation', /\$(?!\$)(?:\\.|[^$\n])+\$/)

/** The atoms an editor reads unless it is given others. */
export const DEFAULT_ATOMS: readonly AtomSyntax[] = [IMAGE, EQUATION]

type Marks = Pick<Run, 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'href' | 'title' | 'linkSource' | 'highlight' | 'color' | 'background' | 'autolink'>

/** The colours words can be written in, by Notion's names for them. */
export const TEXT_COLORS = ['gray', 'red', 'orange', 'green', 'blue', 'purple'] as const
export type TextColor = (typeof TEXT_COLORS)[number]
/** The colours behind words. Yellow is the highlight, written `==words==`; the others as Notion writes them. */
export const BACKGROUND_COLORS = ['gray', 'yellow', 'orange', 'green', 'blue', 'purple', 'red'] as const
export type BackgroundColor = (typeof BACKGROUND_COLORS)[number]
const BACKGROUND = /_background$/
/**
 * The tags that open an underline or a colour, at a place in a line. Any
 * colour's name is read, so Notion's others come in as tags and never as words;
 * one Aa has no ink for keeps the text's own.
 */
const TAG = /<u>|<span color="([a-z_]+)">/y

/**
 * A link as CommonMark writes one: `[words](address)`, `[words](<an address> "title")`.
 * The address may hold a pair of brackets, and the title may be in `"`, `'` or `()`.
 */
const LINK_SOURCE = String.raw`\[((?:\\.|[^[\]\\])*)\]\(\s*(<(?:\\.|[^<>\\\n])*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*)(?:\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))?\s*\)`
const LINK = new RegExp(LINK_SOURCE, 'y')
/** What a title holds when it says nothing: Trello writes `""` with an invisible letter in it. */
const EMPTY_TITLE = /^[\s\u200b-\u200d\u2060\ufeff]*$/u
const AUTOLINK = /(?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"]/g
/** Characters a backslash can make plain, CommonMark's ASCII punctuation. */
const ESCAPABLE = /[!-/:-@[-`{-~]/
const plain = (value: string) => value.replace(/\\([!-/:-@[-`{-~])/g, '$1')

type LinkParts = { words: string; href: string; title?: string; linkSource?: string; close: number; end: number }

/** A written link's parts, from the regular expression's match at `at`. */
function linkParts(found: RegExpExecArray, at: number): LinkParts {
  const [whole, words, address, written] = found
  const title = written ? plain(written.slice(1, -1)) : ''
  const said = !EMPTY_TITLE.test(title)
  const href = plain(address.replace(/^<([^]*)>$/, '$1'))
  // A title that says nothing is not kept, and an address with nothing unusual needs no writing of its own.
  const tail = `(${address}${said ? ` ${written}` : ''})`
  return { words, href, close: at + 1 + words.length, end: at + whole.length, ...(said ? { title } : {}), ...(tail === `(${href})` ? {} : { linkSource: tail }) }
}

/** The link the range `from`..`to` of a block's source lies in, written or a bare address. */
export function linkAround(source: string, from: number, to: number): { from: number; to: number; words: string; href: string } | null {
  for (const found of source.matchAll(new RegExp(LINK_SOURCE, 'g'))) {
    const at = found.index!
    if (from < at || to > at + found[0].length) continue
    const parts = linkParts(found, at)
    return { from: at, to: parts.end, words: parts.words, href: parts.href }
  }
  for (const found of source.matchAll(AUTOLINK)) {
    const at = found.index!
    if (from >= at && to <= at + found[0].length) return { from: at, to: at + found[0].length, words: found[0], href: found[0].startsWith('www.') ? `https://${found[0]}` : found[0] }
  }
  return null
}

const isWord = (char: string | undefined) => !!char && (/[A-Za-z0-9]/.test(char) || char > '\u007f' && /[\p{L}\p{N}]/u.test(char))
const isSpace = (char: string | undefined) => !char || /\s/.test(char)

/** What a delimiter's character marks, with how many of it make the mark. */
const EMPHASIS: Record<string, { one?: 'bold' | 'italic'; two: 'bold' | 'strike' | 'highlight' }> = {
  '*': { one: 'italic', two: 'bold' }, _: { one: 'italic', two: 'bold' }, '~': { two: 'strike' }, '=': { two: 'highlight' },
}

/** A row of one delimiter's character, and how the letters round it let it be used. */
type Delimiters = {
  at: number
  length: number
  char: string
  /** Characters not yet used, left of them the closers' and right of them the openers'. */
  left: number
  right: number
  opens: boolean
  closes: boolean
  /**
   * Only an edit could have left these: a double mark standing apart from its
   * words (`** words**`, `**words **`). Markdown does not read them, but a
   * pair of them with the other side sound is plainly a mark, not two sets of
   * stars, so it is drawn as one and the document heals on its next edit.
   */
  looseOpen: boolean
  looseClose: boolean
  used: { at: number; length: number; mark: 'bold' | 'italic' | 'strike' | 'highlight'; opening: boolean; group: [number, number] }[]
}

type Token =
  | { type: 'break'; at: number; prefix: number }
  | { type: 'code'; at: number; ticks: number; close: number }
  | { type: 'atom'; at: number; length: number; name: string }
  | { type: 'escape'; at: number }
  | { type: 'delimiters'; run: Delimiters }
  | { type: 'tag'; at: number; length: number; mark: 'underline' | 'color'; color?: string; closing: boolean; group: [number, number]; lone: boolean; id: number }
  | ({ type: 'link'; at: number; group: [number, number] } & Omit<LinkParts, 'words'>)
  | { type: 'link-end'; at: number; end: number; group: [number, number] }

/** How many characters a line's own prefix takes at a place: a quote's `> ` on each of its lines. */
type LinePrefix = (at: number) => number

/** Read a stretch of writing into what marks it, leaving the words between as they are. */
function scan(text: string, start: number, end: number, atoms: readonly AtomSyntax[], linePrefix?: LinePrefix): Token[] {
  const tokens: Token[] = []
  let i = start
  let lineStart = text.lastIndexOf('\n', start - 1) + 1
  let line: string | null = null
  let linkText = -1, linkEnd = -1
  let link: Extract<Token, { type: 'link' }> | null = null
  const lineOf = () => {
    if (line === null) { const next = text.indexOf('\n', lineStart); line = text.slice(lineStart, next < 0 ? text.length : next) }
    return line
  }
  while (i < end) {
    if (i === linkText) {
      tokens.push({ type: 'link-end', at: i, end: linkEnd, group: link!.group })
      i = linkEnd
      linkText = -1; link = null
      continue
    }
    const char = text[i]
    const limit = linkText >= 0 ? linkText : end
    if (char === '\n') {
      const prefix = linePrefix?.(i + 1) ?? 0
      tokens.push({ type: 'break', at: i, prefix })
      i += 1 + prefix
      lineStart = text.lastIndexOf('\n', i - 1) + 1
      line = null
      continue
    }
    if (char === '\\' && i + 1 < limit && ESCAPABLE.test(text[i + 1])) {
      tokens.push({ type: 'escape', at: i })
      i += 2
      continue
    }
    if (char === '`') {
      let n = 1
      while (text[i + n] === '`') n++
      const ticks = '`'.repeat(n)
      let close = text.indexOf(ticks, i + n)
      while (close >= 0 && close + n < limit && text[close + n] === '`') {
        let m = close
        while (text[m] === '`') m++
        close = text.indexOf(ticks, m)
      }
      if (close >= 0 && close + n <= limit && !(linePrefix && text.slice(i, close).includes('\n'))) {
        tokens.push({ type: 'code', at: i, ticks: n, close })
        i = close + n
        continue
      }
      i += n
      continue
    }
    if (linkText < 0 && atoms.length) {
      let length = 0, name = ''
      for (const atom of atoms) { length = atom.match(lineOf(), i - lineStart); if (length && i + length <= end) { name = atom.name; break }; length = 0 }
      if (length) {
        tokens.push({ type: 'atom', at: i, length, name })
        i += length
        continue
      }
    }
    if (char === '[' && linkText < 0) {
      LINK.lastIndex = i
      const found = LINK.exec(text)
      if (found && i + found[0].length <= end) {
        const { words: _words, ...parts } = linkParts(found, i)
        link = { type: 'link', at: i, ...parts, group: [i, parts.end] }
        tokens.push(link)
        linkText = link.close; linkEnd = link.end
        i++
        continue
      }
    }
    if (char === '<') {
      TAG.lastIndex = i
      const tag = TAG.exec(text)
      if (tag && i + tag[0].length <= limit) {
        tokens.push({ type: 'tag', at: i, length: tag[0].length, mark: tag[1] ? 'color' : 'underline', color: tag[1], closing: false, group: [i, end], lone: true, id: tokens.length })
        i += tag[0].length
        continue
      }
      const closing = text.startsWith('</span>', i) ? 7 : text.startsWith('</u>', i) ? 4 : 0
      if (closing && i + closing <= limit) {
        tokens.push({ type: 'tag', at: i, length: closing, mark: closing === 7 ? 'color' : 'underline', closing: true, group: [i, i + closing], lone: true, id: tokens.length })
        i += closing
        continue
      }
    }
    if (EMPHASIS[char]) {
      let r = 1
      while (i + r < limit && text[i + r] === char) r++
      const double = r >= 2
      if (double || EMPHASIS[char].one) {
        const previous = tokens[tokens.length - 1]
        const atLineStart = i === lineStart || text[i - 1] === '\n' || previous?.type === 'break' && previous.at + 1 + previous.prefix === i
        const before = i === start ? undefined : atLineStart ? '\n' : text[i - 1]
        const after = i + r < limit ? text[i + r] : undefined
        // A closing mark left alone on the next line, by selecting a whole line in an earlier version: the mark is still meant.
        const lineClose = atLineStart && i > start && !isSpace(text[text.lastIndexOf('\n', i - 1) - 1]) && (!after || after === '\n')
        const opens = !isSpace(after) && !(char === '_' && isWord(before))
        const closes = (!isSpace(before) || lineClose) && !(char === '_' && isWord(after))
        tokens.push({ type: 'delimiters', run: { at: i, length: r, char, left: 0, right: 0, opens, closes, looseOpen: double && !opens && !!after && isSpace(before), looseClose: double && !closes && !!before && isSpace(after), used: [] } })
      }
      i += r
      continue
    }
    i++
  }
  if (linkText >= 0) tokens.push({ type: 'link-end', at: linkText, end: linkEnd, group: link!.group })
  return tokens
}

/**
 * Pair the delimiters as Markdown does: each closer takes the nearest opener of
 * its character, from the inside out, so `*a **b** c*` and `***both***` nest and
 * `**a***b*` closes one and opens the next. Unlike Markdown, a pair may cross
 * another (`**a *b** c*`): the marks are drawn independently, so nothing an
 * earlier version wrote shows as stars.
 */
function pairDelimiters(tokens: Token[]) {
  const runs = tokens.flatMap(token => token.type === 'delimiters' ? [token.run] : [])
  const free = (run: Delimiters) => run.length - run.left - run.right
  for (let c = 0; c < runs.length; c++) {
    const closer = runs[c]
    if (!closer.closes && !closer.looseClose) continue
    while (free(closer) > 0) {
      let found = -1, use = 0
      for (let o = c - 1; o >= 0; o--) {
        const opener = runs[o]
        if (opener.char !== closer.char || !free(opener) || !(opener.opens || opener.looseOpen)) continue
        // Two loose ends make no mark: `2 ** 8 and 3 ** 4`.
        if (!opener.opens && !closer.closes) continue
        // Markdown's rule of three, on what is left of each row: one that could open or
        // close does not close one whose length would make three, so `*a**b***` keeps its
        // bold whole. Two even rows are two marks touching (`**a****b**`), an earlier version's.
        const either = opener.opens && opener.closes || closer.opens && closer.closes
        const a = free(opener), b = free(closer)
        if (either && (a + b) % 3 === 0 && (a % 3 || b % 3) && (a % 2 || b % 2)) continue
        const both = Math.min(free(opener), free(closer))
        use = both >= 2 ? 2 : EMPHASIS[closer.char].one ? 1 : 0
        if (!use) continue
        found = o
        break
      }
      if (found < 0) break
      const opener = runs[found]
      const open = opener.at + opener.length - opener.right - use, close = closer.at + closer.left
      const mark = use === 2 ? EMPHASIS[closer.char].two : EMPHASIS[closer.char].one!
      const group: [number, number] = [open, close + use]
      opener.used.push({ at: open, length: use, mark, opening: true, group })
      closer.used.push({ at: close, length: use, mark, opening: false, group })
      opener.right += use
      closer.left += use
    }
  }
}

/** Pair the tags: each closes the nearest open tag of its kind; one left open reads on to the stretch's end. */
function pairTags(tokens: Token[]) {
  const open: Record<'underline' | 'color', Extract<Token, { type: 'tag' }>[]> = { underline: [], color: [] }
  for (const token of tokens) {
    if (token.type !== 'tag') continue
    if (!token.closing) { open[token.mark].push(token); continue }
    const opener = open[token.mark].pop()
    if (!opener) continue
    opener.lone = token.lone = false
    opener.group = token.group = [opener.at, token.at + token.length]
    token.id = opener.id
  }
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
    out.push({ kind: 'text', from: base + from + index, to: base + from + index + url.length, ...marks, autolink: true, href: url.startsWith('www.') ? `https://${url}` : url })
    last = index + url.length
  }
  if (last < slice.length) out.push({ kind: 'text', from: base + from + last, to: base + to, ...marks })
}

/**
 * The runs of inline writing between `start` and `end`, offsets made absolute
 * with `base`. Three passes: what is marked is found, its pairs are matched,
 * and a sweep over the words wears whichever marks are open at each. Marks are
 * intervals, not a tree, so a pair that crosses another draws as written.
 */
function inline(text: string, start: number, end: number, base: number, out: Run[], atoms: readonly AtomSyntax[], linePrefix?: LinePrefix) {
  const tokens = scan(text, start, end, atoms, linePrefix)
  pairDelimiters(tokens)
  pairTags(tokens)
  const count = { bold: 0, italic: 0, strike: 0, highlight: 0, underline: 0 }
  const colors: { id: number; color: string }[] = []
  let href: string | undefined, title: string | undefined, linkSource: string | undefined
  let from = start
  const marks = (): Marks => {
    const on: Marks = {}
    if (count.bold) on.bold = true
    if (count.italic) on.italic = true
    if (count.strike) on.strike = true
    if (count.highlight) on.highlight = true
    if (count.underline) on.underline = true
    for (const { color } of colors) { if (BACKGROUND.test(color)) on.background = color.replace(BACKGROUND, ''); else on.color = color }
    if (href !== undefined) on.href = href
    if (title !== undefined) on.title = title
    if (linkSource !== undefined) on.linkSource = linkSource
    return on
  }
  const flush = (to: number) => pushText(text, from, to, base, marks(), out)
  const syntax = (at: number, to: number, group: [number, number], lone = false) => {
    flush(at)
    out.push({ kind: 'syntax', from: base + at, to: base + to, group: [base + group[0], base + group[1]], ...(lone ? { lone: true as const } : {}) })
    from = to
  }
  for (const token of tokens) {
    switch (token.type) {
      case 'break':
        flush(token.at)
        out.push({ kind: 'break', from: base + token.at, to: base + token.at + 1 })
        if (token.prefix) out.push({ kind: 'syntax', from: base + token.at + 1, to: base + token.at + 1 + token.prefix, prefix: true })
        from = token.at + 1 + token.prefix
        break
      case 'code': {
        const group: [number, number] = [token.at, token.close + token.ticks]
        syntax(token.at, token.at + token.ticks, group)
        if (token.close > from) out.push({ kind: 'text', from: base + from, to: base + token.close, ...marks(), code: true })
        from = token.close
        syntax(token.close, token.close + token.ticks, group)
        break
      }
      case 'atom':
        flush(token.at)
        out.push({ kind: 'atom', atom: token.name, from: base + token.at, to: base + token.at + token.length, ...marks(), ...(token.name === 'equation' ? { group: [base + token.at, base + token.at + token.length] as [number, number] } : {}) })
        from = token.at + token.length
        break
      case 'escape':
        flush(token.at)
        out.push({ kind: 'syntax', from: base + token.at, to: base + token.at + 1, escape: true })
        from = token.at + 1
        break
      case 'delimiters':
        for (const use of [...token.run.used].sort((a, b) => a.at - b.at)) {
          if (!use.opening) { flush(use.at); count[use.mark]--; from = use.at }
          syntax(use.at, use.at + use.length, use.group)
          if (use.opening) count[use.mark]++
        }
        break
      case 'tag':
        syntax(token.at, token.at + token.length, token.group, token.lone)
        if (token.closing) {
          if (token.lone) break
          if (token.mark === 'underline') count.underline--
          else colors.splice(colors.findIndex(each => each.id === token.id), 1)
        } else if (token.mark === 'underline') count.underline++
        else colors.push({ id: token.id, color: token.color! })
        break
      case 'link':
        syntax(token.at, token.at + 1, token.group)
        ;({ href, title, linkSource } = token)
        break
      case 'link-end':
        flush(token.at)
        from = token.at
        href = title = linkSource = undefined
        syntax(token.at, token.end, token.group)
        break
    }
  }
  flush(end)
}

/** Every run of a block, in order, covering its source from end to end. */
export function blockRuns(block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): readonly Run[] {
  // A key asks several times over, for drawing, marks and edges. Blocks are replaced, never changed, so each is read once.
  let read = readBlocks.get(block)
  if (!read) readBlocks.set(block, read = new WeakMap())
  let runs = read.get(atoms)
  if (!runs) {
    // An edit makes the same block twice over, once to check and once to keep: the second is the first's words.
    const same = latest && latest.atoms === atoms && latest.source === block.source && latest.kind === block.kind && latest.prefix === block.prefix
    runs = same ? latest!.runs : readRuns(block, atoms)
    read.set(atoms, runs)
    latest = { atoms, source: block.source, kind: block.kind, prefix: block.prefix, runs }
  }
  return runs
}
const readBlocks = new WeakMap<Block, WeakMap<readonly AtomSyntax[], readonly Run[]>>()
let latest: { atoms: readonly AtomSyntax[]; source: string; kind: Block['kind']; prefix: number; runs: readonly Run[] } | null = null

function readRuns(block: Block, atoms: readonly AtomSyntax[]): Run[] {
  const runs: Run[] = []
  const lines = block.source.split('\n')
  const closed = block.kind === 'code' && codeClosed(block)
  if (block.kind === 'equation') return [{ kind: 'atom', atom: 'equation-block', from: 0, to: block.source.length, group: [0, block.source.length] }]
  // Columns are drawn whole, each column written where it stands; their tags are never shown.
  if (block.kind === 'columns') return [{ kind: 'atom', atom: 'columns', from: 0, to: block.source.length }]
  // Tabs too: the open tab written where it stands, the others kept; their tags are never shown.
  if (block.kind === 'toc') return [{ kind: 'atom', atom: 'toc', from: 0, to: block.source.length }]
  if (block.kind === 'tabs') return [{ kind: 'atom', atom: 'tabs', from: 0, to: block.source.length }]
  const fenced = fencedAtom(block, atoms)
  if (fenced) return [{ kind: 'atom', atom: fenced.name, from: 0, to: block.source.length, group: [0, block.source.length] }]
  // Marks read across soft breaks, in a quote or callout as in a paragraph: the
  // prefix on each line is passed over, so a colour or bold written over two
  // lines is one mark. Fenced code keeps its line-by-line reading below.
  if (block.kind === 'paragraph') {
    inline(block.source, 0, block.source.length, 0, runs, atoms)
    return runs
  }
  if (block.kind === 'quote' || block.kind === 'callout') {
    const first = block.kind === 'callout' ? block.prefix : QUOTE.exec(lines[0])?.[0].length ?? 0
    if (first) runs.push({ kind: 'syntax', from: 0, to: first, prefix: true })
    inline(block.source, first, block.source.length, 0, runs, atoms, at => {
      const next = block.source.indexOf('\n', at)
      return QUOTE.exec(block.source.slice(at, next < 0 ? block.source.length : next))?.[0].length ?? 0
    })
    return runs
  }
  // A table is read as it is drawn, each cell its own writing, so no mark reaches over a pipe.
  if (block.kind === 'table') {
    let at = 0
    for (const cell of tableRows(block.source).flat()) {
      if (cell.from > at) runs.push({ kind: 'syntax', from: at, to: cell.from, prefix: true })
      inline(cell.text, 0, cell.text.length, cell.from, runs, atoms)
      at = cell.to
    }
    if (at < block.source.length) runs.push({ kind: 'syntax', from: at, to: block.source.length, prefix: true })
    return runs
  }
  let at = 0
  lines.forEach((line, index) => {
    if (index) runs.push({ kind: 'break', from: at - 1, to: at })
    if (block.kind === 'code') {
      if (index === 0 || (closed && index === lines.length - 1)) runs.push({ kind: 'syntax', from: at, to: at + line.length, prefix: true })
      else if (line) runs.push({ kind: 'text', from: at, to: at + line.length, code: true })
    } else if (block.kind === 'divider') {
      runs.push({ kind: 'syntax', from: at, to: at + line.length, prefix: true })
    } else {
      const prefix = index === 0 && (block.kind === 'heading' || block.kind === 'bullet') ? block.prefix : 0
      if (prefix) runs.push({ kind: 'syntax', from: at, to: at + prefix, prefix: true })
      inline(line, prefix, line.length, at, runs, atoms)
    }
    at += line.length + 1
  })
  return runs
}
