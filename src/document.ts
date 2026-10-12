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
    if (!source.slice(block.prefix).trim()) return replaceRange(blocks, { block: pos.block, offset: 0 }, { block: pos.block, offset: source.length }, '')
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

/** Tick or untick a bullet's box. */
export function toggleBox(blocks: readonly Block[], index: number): Change | null {
  const block = blocks[index]
  if (block.kind !== 'bullet' || block.checked === undefined) return null
  const box = block.source.indexOf('[') + 1
  return replaceRange(blocks, { block: index, offset: box }, { block: index, offset: box + 1 }, block.checked ? ' ' : 'x')
}

export type TurnKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'todo' | 'bullet' | 'numbered' | 'quote' | 'code'
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
    } else if (block.kind === 'quote') text = block.source.split('\n').map(line => line.replace(QUOTE, '')).join('\n')
    else if (block.kind === 'divider') text = ''
    const prefix = { paragraph: '', h1: '# ', h2: '## ', h3: '### ', todo: '- [ ] ', bullet: '- ', numbered: `${index - first + 1}. `, quote: '> ', code: '' }[kind]
    const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)))
    const source = kind === 'code' ? `${fence}\n${text}\n${fence}` : text.split('\n').map(line => prefix + line).join('\n')
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
