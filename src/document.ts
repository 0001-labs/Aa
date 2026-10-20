/**
 * The document and what can be done to it. Every change is one replacement:
 * the text between two positions gives way to new text, and the blocks it
 * touched are read again, so a bullet typed at the start of a paragraph is a
 * bullet, and a paragraph that lost its `## ` is a paragraph.
 */

import { parseBlocks, serialize, codeClosed, QUOTE, type Block } from './markdown'

/** A place in the document: a block, and a character offset into its source. */
export type Pos = { block: number; offset: number }

export type Change = { blocks: Block[]; caret: Pos }

export function fromMarkdown(text: string): Block[] {
  return parseBlocks(text.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')).map(({ start: _start, ...block }) => block)
}

const EMPTY: Block = { kind: 'paragraph', source: '', prefix: 0 }

/** A text as blocks, an empty paragraph when there is nothing in it. */
function blocksOf(text: string): Block[] {
  return text.trim() ? fromMarkdown(text) : [EMPTY]
}

export const toMarkdown = serialize

export function comparePos(a: Pos, b: Pos): number {
  return a.block - b.block || a.offset - b.offset
}

/** The two ends of a selection, first one first. */
export function order(a: Pos, b: Pos): [Pos, Pos] {
  return comparePos(a, b) <= 0 ? [a, b] : [b, a]
}

/** Replace what stands between `from` and `to` with `text`. The caret lands after the text. */
export function replaceRange(blocks: readonly Block[], from: Pos, to: Pos, text: string): Change {
  const [a, b] = order(from, to)
  const head = blocks[a.block].source.slice(0, a.offset)
  const tail = blocks[b.block].source.slice(b.offset)
  const joined = head + text + tail
  const caretAt = head.length + text.length
  const placed = parseBlocks(joined)
  const replacement = placed.map(({ start: _start, ...block }) => block)
  const next = [...blocks.slice(0, a.block), ...replacement, ...blocks.slice(b.block + 1)]
  let caret: Pos = { block: a.block + placed.length - 1, offset: replacement[replacement.length - 1].source.length }
  for (let i = 0; i < placed.length; i++) {
    const block = placed[i]
    if (caretAt < block.start) { caret = { block: a.block + i, offset: 0 }; break }
    if (caretAt <= block.start + block.source.length) { caret = { block: a.block + i, offset: caretAt - block.start }; break }
  }
  return { blocks: next, caret }
}

/** The Markdown between two positions, as it would be copied. */
export function sliceMarkdown(blocks: readonly Block[], from: Pos, to: Pos): string {
  const [a, b] = order(from, to)
  if (a.block === b.block) return blocks[a.block].source.slice(a.offset, b.offset)
  const parts: Block[] = [
    { ...blocks[a.block], source: blocks[a.block].source.slice(a.offset) },
    ...blocks.slice(a.block + 1, b.block),
    { ...blocks[b.block], source: blocks[b.block].source.slice(0, b.offset) },
  ]
  return serialize(parts)
}

/** The marker a bullet's next line starts with: the same, numbered one on. */
function nextMarker(block: Block): string {
  const prefix = block.source.slice(0, block.prefix)
  const box = block.checked === undefined ? '' : '[ ] '
  if (block.number !== undefined) return prefix.replace(/\d+/, String(block.number + 1)).replace(/\[[ xX]\][ \t]+$/, '') + box
  return prefix.replace(/\[[ xX]\][ \t]+$/, '') + box
}

/**
 * Enter: the block ends at the caret and a new one begins with the rest. A
 * bullet goes on as a bullet (numbered one on, its box empty) and an empty
 * one ends the list; a quote goes on quoting and an empty line ends it; a
 * line in code is a line, and after a closed fence a paragraph follows; a
 * heading's rest is a paragraph.
 */
export function splitAt(blocks: readonly Block[], pos: Pos): Change {
  const block = blocks[pos.block]
  const source = block.source
  let head = source.slice(0, pos.offset)
  let tail = source.slice(pos.offset)
  if (block.kind === 'code') {
    if (!(pos.offset === source.length && codeClosed(block))) return replaceRange(blocks, pos, pos, '\n')
  } else if (block.kind === 'bullet') {
    if (!source.slice(block.prefix).trim()) {
      if (block.depth) return indentBlocks(blocks, { anchor: pos.block, focus: pos.block }, -1)!
      return replaceRange(blocks, { block: pos.block, offset: 0 }, { block: pos.block, offset: source.length }, '')
    }
    tail = nextMarker(block) + tail
  } else if (block.kind === 'quote') {
    const lineStart = source.lastIndexOf('\n', pos.offset - 1) + 1
    const line = source.slice(lineStart, pos.offset).replace(QUOTE, '')
    if (!line.trim() && !tail.trim()) { head = source.slice(0, Math.max(0, lineStart - 1)); tail = '' }
    else return replaceRange(blocks, pos, pos, '\n> ')
  }
  const before = blocksOf(head)
  const after = blocksOf(tail)
  const next = [...blocks.slice(0, pos.block), ...before, ...after, ...blocks.slice(pos.block + 1)]
  const landing = after[0]
  const offset = landing.kind === 'bullet' || landing.kind === 'quote' ? landing.prefix : 0
  return { blocks: next, caret: { block: pos.block + before.length, offset } }
}

/** Backspace at the start of a heading, bullet or quote: it becomes a paragraph. */
export function liftPrefix(blocks: readonly Block[], index: number): Change | null {
  const block = blocks[index]
  if (!block.prefix || block.kind === 'code' || block.kind === 'divider') return null
  return replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: block.prefix }, '')
}

/** Backspace at the very start of a block: it joins the block before it. */
export function joinWithPrevious(blocks: readonly Block[], index: number): Change | null {
  if (index === 0) return null
  const previous = blocks[index - 1]
  const end = { block: index - 1, offset: previous.source.length }
  if (previous.kind === 'divider') return replaceRange(blocks, { block: index - 1, offset: 0 }, { block: index, offset: 0 }, '')
  if (previous.kind === 'code' && blocks[index].source) return { blocks: [...blocks], caret: end }
  return replaceRange(blocks, end, { block: index, offset: 0 }, '')
}

/** Delete at the very end of a block: the next block joins it. */
export function joinWithNext(blocks: readonly Block[], index: number): Change | null {
  if (index + 1 >= blocks.length) return null
  const next = blocks[index + 1]
  if (next.kind === 'divider') return replaceRange(blocks, { block: index, offset: blocks[index].source.length }, { block: index + 1, offset: next.source.length }, '')
  const change = joinWithPrevious(blocks, index + 1)
  return change && { ...change, caret: { block: index, offset: blocks[index].source.length } }
}

export type Wrapped = { blocks: Block[]; anchor: Pos; focus: Pos }

/**
 * Put a mark round the selection, or take it off: `**` for bold. Within
 * each selected block. With nothing selected the delimiters are typed with the
 * caret between them.
 */
export function wrapSelection(blocks: readonly Block[], from: Pos, to: Pos, delimiter: string, closing = delimiter): Wrapped | null {
  const [a, b] = order(from, to)
  if (a.block !== b.block) {
    let next = [...blocks]
    let anchor = a, focus = b
    for (let index = b.block; index >= a.block; index--) {
      let start = index === a.block ? Math.max(a.offset, blocks[index].prefix) : blocks[index].prefix
      let end = index === b.block ? b.offset : blocks[index].source.length
      const source = blocks[index].source
      if (index === a.block && source.slice(start - delimiter.length, start) === delimiter && source.endsWith(closing)) end -= closing.length
      if (index === b.block && source.slice(end, end + closing.length) === closing && source.slice(start, start + delimiter.length) === delimiter) start += delimiter.length
      if (end <= start || blocks[index].kind === 'code' || blocks[index].kind === 'divider') continue
      const wrapped = wrapSelection(next, { block: index, offset: start }, { block: index, offset: end }, delimiter, closing)!
      next = wrapped.blocks
      if (index === a.block) anchor = wrapped.anchor
      if (index === b.block) focus = wrapped.focus
    }
    return { blocks: next, anchor, focus }
  }
  const source = blocks[a.block].source
  const inner = source.slice(a.offset, b.offset)
  const d = delimiter.length, c = closing.length
  const at = (offset: number): Pos => ({ block: a.block, offset })
  if (source.slice(a.offset - d, a.offset) === delimiter && source.slice(b.offset, b.offset + c) === closing) {
    const change = replaceRange(blocks, at(a.offset - d), at(b.offset + c), inner)
    return { blocks: change.blocks, anchor: at(a.offset - d), focus: at(b.offset - d) }
  }
  if (inner.length > d + c && inner.startsWith(delimiter) && inner.endsWith(closing)) {
    const change = replaceRange(blocks, a, b, inner.slice(d, inner.length - c))
    return { blocks: change.blocks, anchor: a, focus: at(b.offset - d - c) }
  }
  const change = replaceRange(blocks, a, b, delimiter + inner + closing)
  return { blocks: change.blocks, anchor: at(a.offset + d), focus: at(a.offset + d + inner.length) }
}

const COLOR_OPEN = /<span color="[a-z]+">$/
const COLOR_PAIRS = /<span color="[a-z]+">([\s\S]*?)<\/span>/g
/**
 * Write the selected words in a colour (`<span color="red">`), or back in the
 * text's own with `null`: a colour already round exactly these words is
 * changed or taken off rather than nested, and colours wholly inside them go.
 * Across blocks each block's part is coloured on its own, as a mark is.
 */
export function colorSelection(blocks: readonly Block[], from: Pos, to: Pos, color: string | null): Wrapped | null {
  const [a, b] = order(from, to)
  let next = [...blocks], anchor = a, focus = b, changed = false
  for (let index = b.block; index >= a.block; index--) {
    const block = next[index]
    if (block.kind === 'code' || block.kind === 'divider') continue
    const start = index === a.block ? Math.max(a.offset, block.prefix) : block.prefix
    const end = index === b.block ? b.offset : block.source.length
    if (end <= start) continue
    const source = block.source, inner = source.slice(start, end)
    const open = COLOR_OPEN.exec(source.slice(0, start))
    let from = start, to = end, words: string
    if (open && source.startsWith('</span>', end)) { from = start - open[0].length; to = end + 7; words = inner.replace(COLOR_PAIRS, '$1') }
    else {
      const whole = /^<span color="[a-z]+">([\s\S]*)<\/span>$/.exec(inner)
      words = (whole && !whole[1].includes('</span>') ? whole[1] : inner).replace(COLOR_PAIRS, '$1')
      if (!color && words === inner) continue
    }
    const tag = color ? `<span color="${color}">` : ''
    next = replaceRange(next, { block: index, offset: from }, { block: index, offset: to }, color ? `${tag}${words}</span>` : words).blocks
    changed = true
    if (index === a.block) anchor = { block: index, offset: from + tag.length }
    if (index === b.block) focus = { block: index, offset: from + tag.length + words.length }
  }
  return changed ? { blocks: next, anchor, focus } : null
}

/** Tick or untick a bullet's box. */
export function toggleBox(blocks: readonly Block[], index: number): Change | null {
  const block = blocks[index]
  if (block.kind !== 'bullet' || block.checked === undefined) return null
  const box = block.source.indexOf('[') + 1
  return replaceRange(blocks, { block: index, offset: box }, { block: index, offset: box + 1 }, block.checked ? ' ' : 'x')
}

export type TurnKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'todo' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'callout' | 'toggle' | 'toggle-h1' | 'toggle-h2' | 'toggle-h3' | 'table' | 'equation'
export type BlockSelection = { anchor: number; focus: number }

/** Select a contiguous range of whole blocks, clamped to this document. */
export function select(blocks: readonly Block[], anchor: number, focus = anchor): BlockSelection {
  const clamp = (index: number) => Math.max(0, Math.min(blocks.length - 1, index))
  return { anchor: clamp(anchor), focus: clamp(focus) }
}

export function turnInto(blocks: readonly Block[], selection: BlockSelection, kind: TurnKind): Change {
  const first = Math.min(selection.anchor, selection.focus), last = Math.max(selection.anchor, selection.focus)
  const next = blocks.flatMap((block, index) => {
    if (index < first || index > last) return [block]
    let text = block.source.slice(block.prefix)
    if (block.kind === 'code') {
      const lines = block.source.split('\n').slice(1)
      if (codeClosed(block)) lines.pop()
      text = lines.join('\n')
    } else if (block.kind === 'quote' || block.kind === 'callout') text = block.source.split('\n').map((line, i) => i === 0 ? line.slice(block.prefix) : line.replace(QUOTE, '')).join('\n')
    else if (block.kind === 'divider') text = ''
    const prefix = { paragraph: '', h1: '# ', h2: '## ', h3: '### ', todo: '- [ ] ', bullet: '- ', numbered: `${index - first + 1}. `, quote: '> ', code: '', divider: '', callout: '> [!note] ', toggle: '> [!note]- ', 'toggle-h1': '> [!note]- # ', 'toggle-h2': '> [!note]- ## ', 'toggle-h3': '> [!note]- ### ', table: '', equation: '' }[kind]
    const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)))
    const source = kind === 'code' ? `${fence}\n${text}\n${fence}` : kind === 'divider' ? '---' : kind === 'equation' ? `$$\n${text}\n$$` : kind === 'table' ? '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |' : kind === 'callout' || kind.startsWith('toggle') ? prefix + text.split('\n').join('\n> ') : text.split('\n').map(line => prefix + line).join('\n')
    return parseBlocks(source).map(({ start: _start, ...converted }) => converted)
  })
  return { blocks: next, caret: { block: first, offset: next[first].prefix } }
}

export function deleteBlocks(blocks: readonly Block[], selection: BlockSelection): Change {
  const first = Math.min(selection.anchor, selection.focus), last = Math.max(selection.anchor, selection.focus)
  const next = [...blocks.slice(0, first), ...blocks.slice(last + 1)]
  if (!next.length) next.push({ ...EMPTY })
  const index = Math.min(first, next.length - 1)
  return { blocks: next, caret: { block: index, offset: next[index].prefix } }
}

export function duplicateBlocks(blocks: readonly Block[], selection: BlockSelection): Change {
  const first = Math.min(selection.anchor, selection.focus), last = Math.max(selection.anchor, selection.focus)
  const copies = blocks.slice(first, last + 1).map(block => ({ ...block }))
  return { blocks: [...blocks.slice(0, last + 1), ...copies, ...blocks.slice(last + 1)], caret: { block: last + 1, offset: copies[0].prefix } }
}

export function moveBlocks(blocks: readonly Block[], selection: BlockSelection, direction: -1 | 1): Change | null {
  const first = Math.min(selection.anchor, selection.focus), last = Math.max(selection.anchor, selection.focus)
  if (direction < 0 ? first === 0 : last === blocks.length - 1) return null
  const next = [...blocks], moved = next.splice(first, last - first + 1)
  next.splice(first + direction, 0, ...moved)
  return { blocks: next, caret: { block: first + direction, offset: moved[0].prefix } }
}

/** Renumber siblings without changing the starting number of a list. */
export function renumber(blocks: readonly Block[]): Block[] {
  const counters = new Map<number, number>()
  return blocks.map(block => {
    if (block.kind !== 'bullet') { counters.clear(); return block }
    const depth = block.indent ?? 0
    for (const key of counters.keys()) if (key > depth) counters.delete(key)
    if (block.number === undefined) { counters.delete(depth); return block }
    const number = counters.has(depth) ? counters.get(depth)! + 1 : block.number
    counters.set(depth, number)
    if (number === block.number) return block
    const source = block.source.replace(/^( *)(\d+)/, `$1${number}`)
    return { ...block, source, number, prefix: block.prefix + String(number).length - String(block.number).length }
  })
}

export function indentBlocks(blocks: readonly Block[], selection: BlockSelection, direction: -1 | 1): Change | null {
  const first = Math.min(selection.anchor, selection.focus), last = Math.max(selection.anchor, selection.focus)
  const current = blocks[first]
  if (current.kind !== 'bullet') return null
  if (direction === 1 && (first === 0 || blocks[first - 1].kind !== 'bullet')) return null
  if (direction === -1 && !(current.indent ?? 0)) return null
  const previous = blocks[first - 1]
  const parentIndent = previous?.indent ?? 0
  const spaces = direction === 1 ? Math.max(0, parentIndent + (previous.number === undefined ? 2 : 3) - (current.indent ?? 0)) : -Math.min(current.indent ?? 0, current.number === undefined ? 2 : 3)
  if (!spaces) return null
  const next = blocks.map((block, index) => {
    if (index < first || index > last || block.kind !== 'bullet') return block
    const source = spaces > 0 ? ' '.repeat(spaces) + block.source : block.source.slice(Math.min(-spaces, block.indent ?? 0))
    return { ...block, source, prefix: block.prefix + source.length - block.source.length, indent: Math.max(0, (block.indent ?? 0) + spaces), depth: Math.max(0, (block.depth ?? 0) + direction) }
  })
  return { blocks: renumber(next), caret: { block: first, offset: next[first].prefix } }
}

export function toggleCallout(blocks: readonly Block[], index: number, open?: boolean): Change | null {
  const block = blocks[index]
  if (block.kind !== 'callout') return null
  const folded = open === undefined ? !block.folded : !open
  const source = block.source.replace(/^(>\s*\[![a-z]+\])-?/i, `$1${folded ? '-' : ''}`)
  const next = [...blocks]
  next[index] = { ...block, source, folded, prefix: block.prefix + source.length - block.source.length }
  return { blocks: next, caret: { block: index, offset: next[index].prefix } }
}
