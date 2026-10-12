/**
 * The editor: one editable element a block, each drawn from the document and
 * read back from the screen after every change, the way Notion's blocks are.
 * The browser types, spells and composes; Aa owns Enter, Backspace at an
 * edge, paste, marks, undo and the caret's way between blocks.
 */

import { IMAGE, EQUATION, type AtomSyntax, type Block } from './markdown'
import { fromMarkdown, toMarkdown, replaceRange, splitAt, liftPrefix, joinWithPrevious, joinWithNext, wrapSelection, toggleBox, sliceMarkdown, order, comparePos, select, turnInto, moveBlocks, duplicateBlocks, deleteBlocks, type BlockSelection, type TurnKind, type Pos } from './document'
import { History, type Snapshot } from './history'
import { renderBlock, readBlock, offsetIn, pointAt, revealKey, atomElement, type Reveal, type Decoration } from './render'
import { indentBlocks, renumber, toggleCallout } from './document'
import { editTable, fromTSV, tableRows, writeTable, type TableAction } from './table'
import { createControls, type Command, type ToolbarAction } from './controls'

/**
 * An atom the editor reads and draws: what it is in the text, and how it is
 * drawn into the element Aa gives it. What `draw` returns is called once the
 * atom leaves the page, to stop whatever it started.
 */
export type Atom = AtomSyntax & { draw?(element: HTMLElement, source: string): void | (() => void) }

/** A picture drawn as itself. */
export const imageAtom: Atom = {
  ...IMAGE,
  draw(element, source) {
    const [, alt = '', src = ''] = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(source) ?? []
    const extension = src.split(/[?#]/)[0].split('.').pop()?.toLowerCase()
    if (/^data:(audio|video)\//.test(src) || (extension && /^(mp4|webm|mov|mp3|wav|ogg|m4a)$/.test(extension))) {
      const media = document.createElement(/^data:video\//.test(src) || /^(mp4|webm|mov)$/.test(extension ?? '') ? 'video' : 'audio')
      media.src = src; media.controls = true; media.preload = 'metadata'
      media.setAttribute('aria-label', alt)
      element.append(media)
    } else {
      const image = document.createElement('img')
      image.src = src; image.alt = alt; image.loading = 'lazy'; image.draggable = false
      element.append(image)
    }
    const caption = document.createElement('span'); caption.className = 'aa-caption'; caption.textContent = alt; caption.contentEditable = 'true'; caption.dataset.placeholder = 'Add a caption'; element.append(caption)
  },
}

export type EditorOptions = {
  value?: string
  readOnly?: boolean
  placeholder?: string
  /** Called after every change the person made, with the document as Markdown. */
  onChange?: (value: string) => void
  /** The atoms to read and draw; a picture unless told otherwise. */
  atoms?: readonly Atom[]
  /** Files pasted or dropped into the editor. Without it, they are ignored. */
  onFiles?: (files: File[]) => void
  toolbar?: boolean | readonly ToolbarAction[]
  commands?: readonly Command[]
  blockCommands?: readonly Command[]
  menus?: boolean
  drawEquation?: (element: HTMLElement, source: string, display: boolean) => void | (() => void)
}

export type Editor = {
  readonly element: HTMLElement
  value: string
  readOnly: boolean
  placeholder: string
  focus(): void
  blur(): void
  /** Where the selection is, as offsets into `value`; null when it is not in the editor. */
  selection(): { start: number; end: number } | null
  /** Put `text` in place of `value`'s characters from `start` to `end`, the caret after it, as one step to undo. */
  replace(start: number, end: number, text: string): void
  undo(): boolean
  redo(): boolean
  activeBlock(): { index: number; start: number; end: number; block: Block } | null
  selectBlocks(anchor: number, focus?: number): void
  format(mark: 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'equation' | 'highlight'): void
  turnInto(kind: TurnKind): void
  blockAction(action: 'delete' | 'duplicate' | 'up' | 'down'): void
  moveBlock(from: number, to: number): void
  indent(direction: -1 | 1): void
  toggle(open?: boolean): void
  table(action: TableAction): void
  insertFile(file: File): void
  decorate(ranges: readonly Decoration[], layer?: string): void
  stats(): { words: number; characters: number; blocks: number }
  find(query: string, caseSensitive?: boolean): { start: number; end: number }[]
  selectRange(start: number, end?: number): void
  transaction(action: () => void): void
  setHistoryProvider(provider: { undo(): boolean; redo(): boolean } | null): void
  destroy(): void
}

type Selection2 = { anchor: Pos; focus: Pos }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function createEditor(host: HTMLElement, options: EditorOptions = {}): Editor {
  let blocks: Block[] = fromMarkdown(options.value ?? '')
  let readOnly = !!options.readOnly
  let placeholder = options.placeholder ?? ''
  let composing = false
  let destroyed = false
  let selected: BlockSelection | null = null
  let plainPaste = false
  let decorations: readonly Decoration[] = []
  const decorationLayers = new Map<string, readonly Decoration[]>()
  let stopControls = () => {}
  let transactionDepth = 0
  let historyProvider: { undo(): boolean; redo(): boolean } | null = null
  const atoms: readonly Atom[] = [...(options.atoms ?? [imageAtom]), { ...EQUATION, draw: (element, source) => options.drawEquation ? options.drawEquation(element, source.slice(1, -1), false) : void (element.textContent = source.slice(1, -1)) }, { name: 'equation-block', match: () => 0, draw: (element, source) => options.drawEquation ? options.drawEquation(element, source.replace(/^\$\$\n?|\n?\$\$$/g, ''), true) : void (element.textContent = source.replace(/^\$\$\n?|\n?\$\$$/g, '')) }]
  const drawn = new Map<HTMLElement, (() => void) | void>()
  const drawAtom = (name: string, source: string) => {
    const element = atomElement(name, source)
    const atom = atoms.find(candidate => candidate.name === name)
    if (atom?.draw) drawn.set(element, atom.draw(element, source))
    else element.textContent = source
    element.querySelectorAll<HTMLElement>('.aa-caption').forEach(caption => caption.contentEditable = readOnly ? 'false' : 'true')
    return element
  }
  /** Stop the atoms that are no longer on the page. */
  const sweep = (all = false) => {
    for (const [element, stop] of drawn) {
      if (!all && host.contains(element)) continue
      drawn.delete(element)
      stop?.()
    }
  }
  const draw = (element: HTMLElement, block: Block, reveal: Reveal) => {
    element.dataset.readonly = String(readOnly)
    const index = blocks.indexOf(block)
    const offset = index < 0 ? 0 : offsetOf({ block: index, offset: 0 })
    renderBlock(element, block, reveal, atoms, drawAtom, decorations.map(range => ({ ...range, from: range.from - offset, to: range.to - offset })))
  }
  const history = new History({ blocks, anchor: { block: 0, offset: 0 }, focus: { block: 0, offset: 0 } })

  host.classList.add('aa')
  host.setAttribute('role', 'textbox')
  host.setAttribute('aria-multiline', 'true')

  const elements = () => Array.from(host.children) as HTMLElement[]

  const makeElement = (block: Block): HTMLElement => {
    const element = document.createElement('div')
    element.contentEditable = readOnly ? 'false' : 'true'
    draw(element, block, null)
    return element
  }

  const showPlaceholder = () => {
    const first = host.firstElementChild as HTMLElement | null
    if (!first) return
    if (blocks.length === 1 && !blocks[0].source && placeholder) first.dataset.placeholder = placeholder
    else delete first.dataset.placeholder
  }

  const renderAll = () => {
    host.replaceChildren(...blocks.map(makeElement))
    showPlaceholder()
    sweep()
  }

  /** Bring the DOM to the new blocks, touching only the blocks that changed. */
  const syncDom = (next: Block[]) => {
    const old = blocks
    const els = elements()
    let start = 0
    while (start < old.length && start < next.length && old[start] === next[start]) start++
    let endOld = old.length, endNew = next.length
    while (endOld > start && endNew > start && old[endOld - 1] === next[endNew - 1]) { endOld--; endNew-- }
    blocks = next
    const fresh = next.slice(start, endNew).map(makeElement)
    const anchor = els[endOld] ?? null
    for (let i = start; i < endOld; i++) els[i].remove()
    for (const element of fresh) host.insertBefore(element, anchor)
    showPlaceholder()
    sweep()
  }

  // ----- the selection -----

  const blockIndexOf = (node: Node | null): number => {
    const element = node instanceof HTMLElement ? node : node?.parentElement ?? null
    const block = element?.closest('.aa-block')
    if (!block || block.parentElement !== host) return -1
    return elements().indexOf(block as HTMLElement)
  }

  const readSelection = (): Selection2 | null => {
    if (document.activeElement?.closest?.('.aa-caption')) return null
    if (selected) {
      const first = Math.min(selected.anchor, selected.focus), last = Math.max(selected.anchor, selected.focus)
      return { anchor: { block: first, offset: 0 }, focus: { block: last, offset: blocks[last].source.length } }
    }
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) return null
    const a = blockIndexOf(selection.anchorNode), f = blockIndexOf(selection.focusNode)
    if (a < 0 || f < 0) return null
    const els = elements()
    return {
      anchor: { block: a, offset: offsetIn(els[a], selection.anchorNode, selection.anchorOffset) },
      focus: { block: f, offset: offsetIn(els[f], selection.focusNode, selection.focusOffset) },
    }
  }

  let settingSelection = false
  const setSelection = (anchor: Pos, focus: Pos = anchor) => {
    const els = elements()
    const a = pointAt(els[anchor.block], Math.min(anchor.offset, blocks[anchor.block].source.length))
    const f = pointAt(els[focus.block], Math.min(focus.offset, blocks[focus.block].source.length))
    const selection = window.getSelection()
    if (!selection) return
    settingSelection = true
    try { selection.setBaseAndExtent(a.node, a.offset, f.node, f.offset) } finally { settingSelection = false }
  }

  const revealFor = (index: number, selection: Selection2 | null): Reveal => {
    if (!selection) return null
    const [a, b] = order(selection.anchor, selection.focus)
    if (index < a.block || index > b.block) return null
    return { from: index === a.block ? a.offset : 0, to: index === b.block ? b.offset : blocks[index].source.length }
  }

  /** Draw again every block whose shown syntax changed with the selection. */
  const applyReveal = (selection = readSelection()) => {
    if (composing) return
    const els = elements()
    let changed = false
    blocks.forEach((block, index) => {
      const reveal = revealFor(index, selection)
      if (els[index].dataset.reveal === revealKey(block, reveal, atoms)) return
      draw(els[index], block, reveal)
      changed = true
    })
    if (!changed) return
    sweep()
    if (selection) setSelection(selection.anchor, selection.focus)
  }

  // ----- offsets into the Markdown -----

  /** What stands between two blocks in the Markdown: a line break between bullets, a blank line otherwise. */
  const gap = (index: number) => blocks[index].kind === 'bullet' && blocks[index + 1]?.kind === 'bullet' ? 1 : 2
  const offsetOf = (pos: Pos) => {
    let at = 0
    for (let i = 0; i < pos.block; i++) at += blocks[i].source.length + gap(i)
    return at + pos.offset
  }
  const posOf = (offset: number): Pos => {
    let at = 0
    for (let i = 0; i < blocks.length; i++) {
      const end = at + blocks[i].source.length
      if (offset <= end || i === blocks.length - 1) return { block: i, offset: Math.max(0, Math.min(offset - at, blocks[i].source.length)) }
      // An offset between two blocks belongs to the end of the first.
      if (offset < end + gap(i)) return { block: i, offset: blocks[i].source.length }
      at = end + gap(i)
    }
    return { block: 0, offset: 0 }
  }

  // ----- changes -----

  const snapshot = (anchor: Pos, focus: Pos): Snapshot => ({ blocks, anchor, focus })

  const commit = (next: Block[], anchor: Pos, focus: Pos, kind: 'type' | 'edit') => {
    clearBlocks()
    const numbered = renumber(next)
    const adjust = (pos: Pos) => ({ ...pos, offset: Math.max(0, pos.offset + numbered[pos.block].prefix - next[pos.block].prefix) })
    anchor = adjust(anchor); focus = adjust(focus)
    syncDom(numbered)
    setSelection(anchor, focus)
    applyReveal({ anchor, focus })
    if (!transactionDepth) {
      history.record(snapshot(anchor, focus), kind)
      options.onChange?.(toMarkdown(blocks))
      host.dispatchEvent(new Event('aa-change'))
    }
  }

  const restore = (state: Snapshot) => {
    clearBlocks()
    syncDom(state.blocks)
    setSelection(state.anchor, state.focus)
    applyReveal({ anchor: state.anchor, focus: state.focus })
    options.onChange?.(toMarkdown(blocks))
    host.dispatchEvent(new Event('aa-change'))
  }

  const undo = () => { if (readOnly) return false; if (historyProvider) return historyProvider.undo(); const state = history.undo(); if (state) restore(state); return !!state }
  const redo = () => { if (readOnly) return false; if (historyProvider) return historyProvider.redo(); const state = history.redo(); if (state) restore(state); return !!state }

  /** The block the browser just changed, read back into the document. */
  const readBack = (element: HTMLElement, kind: 'type' | 'edit' = 'type') => {
    const index = elements().indexOf(element)
    if (index < 0) return
    const raw = readBlock(element)
    const text = raw.replace(/^\[\] /, '- [ ] ')
    if (text === blocks[index].source) return
    const selection = readSelection()
    const { blocks: next, caret } = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: blocks[index].source.length }, text)
    const within = (pos: Pos): Pos => pos.block !== index ? { ...pos, block: pos.block + (next.length - blocks.length) * (pos.block > index ? 1 : 0) } : mapOffset(next, index, caret, text, pos.offset)
    const adjust = (pos: Pos) => text !== raw && pos.block === index ? { ...pos, offset: pos.offset + text.length - raw.length } : pos
    const anchor = selection ? within(adjust(selection.anchor)) : caret
    const focus = selection ? within(adjust(selection.focus)) : caret
    commit(next, anchor, focus, kind)
  }

  /** An offset into the text a block became, as a position in the blocks it was read into. */
  const mapOffset = (next: Block[], index: number, last: Pos, text: string, offset: number): Pos => {
    let at = 0
    for (let i = index; i <= last.block; i++) {
      const length = next[i].source.length
      if (offset <= at + length) return { block: i, offset: Math.max(0, offset - at) }
      at = text.indexOf(next[i + 1]?.source ?? '', at + length)
      if (at < 0) break
    }
    return last
  }

  const insert = (selection: Selection2, text: string, kind: 'type' | 'edit' = 'edit') => {
    const { blocks: next, caret } = replaceRange(blocks, selection.anchor, selection.focus, text)
    commit(next, caret, caret, kind)
  }

  // ----- events -----

  const onBeforeInput = (event: InputEvent) => {
    if (destroyed) return
    if (readOnly) { event.preventDefault(); return }
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const type = event.inputType
    if (type === 'historyUndo') { event.preventDefault(); undo(); return }
    if (type === 'historyRedo') { event.preventDefault(); redo(); return }
    if (composing || event.isComposing) return
    const selection = readSelection()
    if (!selection) return
    if (selected && type.startsWith('insert')) { event.preventDefault(); insert(selection, event.data ?? '', 'edit'); return }
    const [a, b] = order(selection.anchor, selection.focus)
    const spanning = a.block !== b.block
    const collapsed = !spanning && a.offset === b.offset
    const block = blocks[a.block]
    if (block.kind === 'table') {
      const cell = tableRows(block.source).flat().find(cell => a.offset >= cell.from && a.offset <= cell.to)
      if (cell && collapsed && ((type === 'deleteContentBackward' && a.offset === cell.from) || (type === 'deleteContentForward' && a.offset === cell.to))) { event.preventDefault(); return }
    }
    switch (type) {
      // Enter is handled on keydown, where Shift can be read. A line break
      // arriving here came some other way (a keyboard that composes, say) and
      // is Enter: the block is plain text to the browser, so it never says
      // insertParagraph.
      case 'insertParagraph':
      case 'insertLineBreak':
        event.preventDefault()
        enter(selection)
        return
      case 'insertFromPaste': {
        event.preventDefault()
        const text = event.dataTransfer?.getData('text/plain') ?? ''
        if (text) insert(selection, text.replace(/\r\n?/g, '\n'))
        return
      }
      case 'insertFromDrop':
        event.preventDefault()
        return
      case 'deleteContentBackward': {
        if (!collapsed) { event.preventDefault(); insert(selection, ''); return }
        // At the start of a heading, bullet or quote the prefix comes off
        // first; at the very start of anything else the block before takes
        // this one in.
        if (a.offset <= block.prefix) {
          const change = liftPrefix(blocks, a.block)
          if (change) { event.preventDefault(); commit(change.blocks, change.caret, change.caret, 'edit'); return }
        }
        if (a.offset === 0) {
          event.preventDefault()
          const change = joinWithPrevious(blocks, a.block)
          if (change) commit(change.blocks, change.caret, change.caret, 'edit')
        }
        return
      }
      case 'deleteContentForward': {
        if (!collapsed) { event.preventDefault(); insert(selection, ''); return }
        if (a.offset === block.source.length) {
          event.preventDefault()
          const change = joinWithNext(blocks, a.block)
          if (change) commit(change.blocks, change.caret, change.caret, 'edit')
        }
        return
      }
      case 'deleteByCut':
        event.preventDefault()
        return
      case 'formatBold': event.preventDefault(); wrap(selection, '**'); return
      case 'formatItalic': event.preventDefault(); wrap(selection, '*'); return
      case 'formatStrikeThrough': event.preventDefault(); wrap(selection, '~~'); return
      default:
        if (!spanning) return
        event.preventDefault()
        if (type.startsWith('insert')) insert(selection, event.data ?? '', 'type')
        else if (type.startsWith('delete')) insert(selection, '')
    }
  }

  const onInput = (event: Event) => {
    if (destroyed || readOnly) return
    if (composing || (event instanceof InputEvent && event.isComposing)) return
    const caption = (event.target as HTMLElement).closest?.('.aa-caption') as HTMLElement | null
    if (caption) {
      const atom = caption.closest('.aa-atom') as HTMLElement
      const blockElement = atom.closest('.aa-block') as HTMLElement
      const index = elements().indexOf(blockElement)
      const source = atom.dataset.source ?? ''
      const nextSource = source.replace(/^!\[[^\]]*\]/, `![${(caption.textContent ?? '').replace(/\]/g, '').replace(/\n/g, ' ')}]`)
      atom.dataset.source = nextSource
      const next = [...blocks]
      next[index] = { ...blocks[index], source: readBlock(blockElement) }
      blocks = next
      const pos = { block: index, offset: offsetIn(blockElement, atom, 1) }
      history.record(snapshot(pos, pos), 'type')
      options.onChange?.(toMarkdown(blocks)); host.dispatchEvent(new Event('aa-change'))
      return
    }
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
  }

  /** Enter: the block ends here and the next begins; with Shift, a line break within it. */
  const enter = (selection: Selection2, soft = false) => {
    if (blocks[selection.focus.block].kind === 'table') {
      const index = selection.focus.block
      const next = [...blocks.slice(0, index + 1), { kind: 'paragraph' as const, source: '', prefix: 0 }, ...blocks.slice(index + 1)]
      const pos = { block: index + 1, offset: 0 }
      commit(next, pos, pos, 'edit'); return
    }
    if (blocks[selection.focus.block].kind === 'callout' && !soft) { insert(selection, '\n> '); return }
    if (soft) { insert(selection, '\n'); return }
    const [a, b] = order(selection.anchor, selection.focus)
    let current = blocks, pos = a
    if (comparePos(a, b) !== 0) ({ blocks: current, caret: pos } = replaceRange(blocks, a, b, ''))
    const change = splitAt(current, pos)
    commit(change.blocks, change.caret, change.caret, 'edit')
  }

  const wrap = (selection: Selection2, delimiter: string, closing = delimiter) => {
    const wrapped = wrapSelection(blocks, selection.anchor, selection.focus, delimiter, closing)
    if (wrapped) commit(wrapped.blocks, wrapped.anchor, wrapped.focus, 'edit')
  }

  const insertLink = (selection: Selection2) => {
    const [a, b] = order(selection.anchor, selection.focus)
    if (a.block !== b.block) return
    let start = a.offset, end = b.offset, text = blocks[a.block].source.slice(start, end), url = ''
    for (const match of blocks[a.block].source.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
      if (a.offset >= match.index! && b.offset <= match.index! + match[0].length) {
        start = match.index!; end = start + match[0].length; text = match[1]; url = match[2]; break
      }
    }
    host.dispatchEvent(new CustomEvent('aa-link-request', { detail: { start: offsetOf({ block: a.block, offset: start }), end: offsetOf({ block: a.block, offset: end }), text, url } }))
  }

  const caretRect = (): DOMRect | null => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return null
    const range = selection.getRangeAt(0)
    const rects = range.getClientRects()
    if (rects.length) return rects[rects.length - 1]
    const rect = range.getBoundingClientRect()
    if (rect.height) return rect
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      const probe = document.createRange()
      probe.setStart(node, range.startOffset - 1)
      probe.setEnd(node, range.startOffset)
      const probed = probe.getClientRects()
      if (probed.length) return probed[probed.length - 1]
    }
    const element = node instanceof HTMLElement ? node : node.parentElement
    return element?.getBoundingClientRect() ?? null
  }

  /** Put the caret in a block at the point under `x`, on its first or last line. */
  const placeAt = (index: number, x: number, edge: 'top' | 'bottom') => {
    const element = elements()[index]
    const rect = element.getBoundingClientRect()
    const y = edge === 'top' ? rect.top + 2 : rect.bottom - 2
    let node: Node | null = null, offset = 0
    const caretPositionFromPoint = (document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint
    if (caretPositionFromPoint) { const position = caretPositionFromPoint.call(document, x, y); if (position) { node = position.offsetNode; offset = position.offset } }
    else if (document.caretRangeFromPoint) { const range = document.caretRangeFromPoint(x, y); if (range) { node = range.startContainer; offset = range.startOffset } }
    const pos: Pos = node && element.contains(node) ? { block: index, offset: offsetIn(element, node, offset) } : { block: index, offset: edge === 'top' ? startOf(index) : blocks[index].source.length }
    setSelection(pos)
    applyReveal({ anchor: pos, focus: pos })
  }

  /** Where writing starts in a block: after its prefix. */
  const startOf = (index: number) => {
    const block = blocks[index]
    return block.kind === 'code' || block.kind === 'divider' ? 0 : block.prefix
  }

  const clearBlocks = () => {
    selected = null
    for (const element of elements()) element.removeAttribute('data-selected')
  }
  const selectBlocks = (anchor: number, focus = anchor) => {
    selected = select(blocks, anchor, focus)
    const first = Math.min(selected.anchor, selected.focus), last = Math.max(selected.anchor, selected.focus)
    setSelection({ block: first, offset: 0 }, { block: last, offset: blocks[last].source.length })
    applyReveal()
    elements().forEach((element, index) => element.toggleAttribute('data-selected', index >= first && index <= last))
  }
  const changeBlocks = (action: 'delete' | 'duplicate' | 'up' | 'down', range: BlockSelection) => {
    const first = Math.min(range.anchor, range.focus), last = Math.max(range.anchor, range.focus)
    const change = action === 'delete' ? deleteBlocks(blocks, range) : action === 'duplicate' ? duplicateBlocks(blocks, range) : moveBlocks(blocks, range, action === 'up' ? -1 : 1)
    if (!change) return
    commit(change.blocks, change.caret, change.caret, 'edit')
    if (action !== 'delete') selectBlocks(change.caret.block, change.caret.block + last - first)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (destroyed || readOnly || composing || event.isComposing || event.defaultPrevented) return
    const caption = (event.target as HTMLElement).closest?.('.aa-caption')
    if (caption) {
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); const range = document.createRange(); range.selectNodeContents(caption)
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
        return
      }
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); (event.target as HTMLElement).blur() }
      return
    }
    const mod = isMac ? event.metaKey : event.ctrlKey
    if (mod && !event.altKey && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
    const selection = readSelection()
    if (!selection) return
    const key = event.key.toLowerCase()
    plainPaste = false
    if (mod && event.shiftKey && key === 'v') { plainPaste = true; return }
    if (event.key === 'Escape') { event.preventDefault(); selectBlocks(selection.focus.block); return }
    if (mod && key === 'a' && !event.altKey) {
      event.preventDefault()
      const block = blocks[selection.focus.block]
      const cell = block.kind === 'table' && !selected ? tableRows(block.source).flat().find(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to) : null
      if (cell && (selection.anchor.offset !== cell.from || selection.focus.offset !== cell.to)) {
        setSelection({ block: selection.focus.block, offset: cell.from }, { block: selection.focus.block, offset: cell.to })
        applyReveal()
      } else if (selected) selectBlocks(0, blocks.length - 1)
      else selectBlocks(selection.focus.block)
      return
    }
    const range = selected ?? select(blocks, selection.anchor.block, selection.focus.block)
    const tableBlock = blocks[selection.focus.block]
    if (tableBlock.kind === 'table' && !mod && !event.shiftKey && selection.anchor.offset === selection.focus.offset && /^Arrow/.test(event.key)) {
      const rows = tableRows(tableBlock.source), cells = rows.flat()
      const index = cells.findIndex(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to)
      const cell = cells[index]
      let next: typeof cell | undefined
      if (cell && event.key === 'ArrowLeft' && selection.focus.offset === cell.from) next = cells[index - 1]
      if (cell && event.key === 'ArrowRight' && selection.focus.offset === cell.to) next = cells[index + 1]
      if (cell && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) next = cells[index + (event.key === 'ArrowUp' ? -rows[0].length : rows[0].length)]
      if (next) { event.preventDefault(); const pos = { block: selection.focus.block, offset: event.key === 'ArrowLeft' ? next.to : next.from }; elements()[pos.block].querySelectorAll<HTMLElement>('[data-cell]')[cells.indexOf(next)]?.focus(); setSelection(pos); return }
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
      const block = blocks[selection.focus.block]
      if (block.kind === 'table') {
        event.preventDefault()
        const cells = tableRows(block.source).flat()
        const current = cells.findIndex(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to)
        const next = cells[current + (event.shiftKey ? -1 : 1)]
        if (next) { const pos = { block: selection.focus.block, offset: next.from }; setSelection(pos); elements()[pos.block].querySelectorAll<HTMLElement>('[data-cell]')[cells.indexOf(next)]?.focus(); setSelection(pos) }
        else if (!event.shiftKey) enter(selection)
        return
      }
      if (block.kind === 'bullet') { event.preventDefault(); const change = indentBlocks(blocks, range, event.shiftKey ? -1 : 1); if (change) commit(change.blocks, change.caret, change.caret, 'edit'); return }
    }
    if (mod && event.altKey && key === 't') {
      event.preventDefault()
      let next = blocks
      for (let i = 0; i < next.length; i++) next = toggleCallout(next, i, true)?.blocks ?? next
      commit(next, selection.anchor, selection.focus, 'edit'); return
    }
    if (mod && key === 'd' && !event.altKey) { event.preventDefault(); changeBlocks('duplicate', range); return }
    if (mod && event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) { event.preventDefault(); changeBlocks(key === 'arrowup' ? 'up' : 'down', range); return }
    const digit = /^Digit[0-9]$/.test(event.code) ? Number(event.code.slice(-1)) : /^\d$/.test(key) ? Number(key) : -1
    if (mod && event.altKey && digit >= 0) {
      const kinds: TurnKind[] = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'quote', 'code']
      const kind = kinds[digit]
      if (kind) { event.preventDefault(); const change = turnInto(blocks, range, kind); commit(change.blocks, change.caret, change.caret, 'edit') }
      return
    }
    if (mod && event.key === 'Enter') {
      event.preventDefault()
      const change = toggleBox(blocks, selection.focus.block) ?? toggleCallout(blocks, selection.focus.block)
      if (change) commit(change.blocks, change.caret, change.caret, 'edit')
      return
    }
    if (selected) {
      if (key === 'backspace' || key === 'delete') { event.preventDefault(); changeBlocks('delete', selected); return }
      if (key === 'arrowup' || key === 'arrowdown') {
        event.preventDefault()
        const index = selected.focus + (key === 'arrowup' ? -1 : 1)
        selectBlocks(event.shiftKey ? selected.anchor : index, index)
        return
      }
      if (key === 'arrowleft' || key === 'arrowright' || key === 'enter') {
        event.preventDefault()
        const index = selected.focus
        clearBlocks()
        const pos = { block: index, offset: key === 'arrowright' ? blocks[index].source.length : startOf(index) }
        elements()[index].focus(); setSelection(pos); applyReveal()
        return
      }
    }
    if (!mod && !event.altKey && event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
      event.preventDefault()
      selectBlocks(selection.anchor.block, selection.focus.block + (key === 'arrowup' ? -1 : 1))
      return
    }
    if (event.key === 'Enter' && !mod && !event.altKey) { event.preventDefault(); enter(selection, event.shiftKey); return }
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'b' && !event.shiftKey) { event.preventDefault(); wrap(selection, '**'); return }
      if (key === 'i' && !event.shiftKey) { event.preventDefault(); wrap(selection, '*'); return }
      if (key === 'e' && !event.shiftKey) { event.preventDefault(); wrap(selection, '`'); return }
      if ((key === 'x' || key === 's') && event.shiftKey) { event.preventDefault(); wrap(selection, '~~'); return }
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        insertLink(selection)
        return
      }
      return
    }
    if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return
    if (comparePos(selection.anchor, selection.focus) !== 0) return
    const { block: index, offset } = selection.focus
    const element = elements()[index]
    if (event.key === 'ArrowLeft' && offset === 0 && index > 0) {
      event.preventDefault()
      const pos = { block: index - 1, offset: blocks[index - 1].source.length }
      setSelection(pos); applyReveal({ anchor: pos, focus: pos })
    } else if (event.key === 'ArrowRight' && offset === blocks[index].source.length && index + 1 < blocks.length) {
      event.preventDefault()
      const pos = { block: index + 1, offset: startOf(index + 1) }
      setSelection(pos); applyReveal({ anchor: pos, focus: pos })
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const up = event.key === 'ArrowUp'
      if (up ? index === 0 : index + 1 >= blocks.length) return
      const caret = caretRect()
      const rect = element.getBoundingClientRect()
      if (!caret) return
      const line = caret.height || parseFloat(getComputedStyle(element).lineHeight) || 16
      const onEdge = up ? caret.top - rect.top < line * 0.75 : rect.bottom - caret.bottom < line * 0.75
      if (!onEdge) return
      event.preventDefault()
      placeAt(up ? index - 1 : index + 1, caret.left, up ? 'bottom' : 'top')
    }
  }

  const onCopy = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const selection = readSelection()
    if (!selection || !event.clipboardData || comparePos(selection.anchor, selection.focus) === 0) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', sliceMarkdown(blocks, selection.anchor, selection.focus))
    if (event.type === 'cut' && !readOnly) {
      if (selected) changeBlocks('delete', selected)
      else insert(selection, '')
    }
  }

  const onClick = (event: MouseEvent) => {
    clearBlocks()
    const target = event.target as HTMLElement | null
    const link = target?.closest?.('a.aa-link') as HTMLAnchorElement | null
    if (link && host.contains(link)) {
      if (event.metaKey || event.ctrlKey || readOnly) { event.preventDefault(); window.open(link.href, '_blank', 'noopener,noreferrer') }
      else event.preventDefault()
      return
    }
    const element = target?.closest?.('.aa-block') as HTMLElement | null
    if (!element || element.parentElement !== host || readOnly) return
    const index = elements().indexOf(element)
    const block = blocks[index]
    if (block.kind === 'callout' && event.clientX - element.getBoundingClientRect().left < parseFloat(getComputedStyle(element).paddingLeft)) {
      event.preventDefault(); const change = toggleCallout(blocks, index); if (change) commit(change.blocks, change.caret, change.caret, 'edit'); return
    }
    if (block.kind !== 'bullet' || block.checked === undefined) return
    const rect = element.getBoundingClientRect()
    const box = parseFloat(getComputedStyle(element).paddingLeft)
    if (event.clientX - rect.left > box) return
    event.preventDefault()
    const change = toggleBox(blocks, index)
    if (change) commit(change.blocks, change.caret, change.caret, 'edit')
  }

  const onCompositionStart = () => { composing = true }
  const onCompositionEnd = (event: CompositionEvent) => {
    composing = false
    if ((event.target as HTMLElement).closest?.('.aa-caption')) { onInput(event); return }
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
  }
  const onSelectionChange = () => { if (!destroyed && !composing && !settingSelection && !document.activeElement?.closest?.('.aa-caption') && !(window.getSelection()?.anchorNode?.parentElement?.closest('.aa-caption'))) { applyReveal(); host.dispatchEvent(new Event('aa-selectionchange')) } }
  const onPointerDown = () => clearBlocks()
  const filesOf = (data: DataTransfer | null) => Array.from(data?.files ?? [])
  // A file pasted is the product's to keep; Aa only says where it arrived.
  const onPaste = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const plain = plainPaste
    plainPaste = false
    if (readOnly || destroyed) return
    const files = filesOf(event.clipboardData)
    if (files.length && options.onFiles) { event.preventDefault(); options.onFiles(files); return }
    const selection = readSelection()
    const text = event.clipboardData?.getData('text/plain')
    if (!selection || text === undefined) return
    event.preventDefault()
    const [a, b] = order(selection.anchor, selection.focus)
    const block = blocks[a.block]
    if (!plain && !selected && a.block === b.block && block.kind === 'table' && text.includes('\t')) {
      const cells = tableRows(block.source), row = cells.findIndex(row => row.some(cell => a.offset >= cell.from && a.offset <= cell.to))
      const column = row < 0 ? -1 : cells[row].findIndex(cell => a.offset >= cell.from && a.offset <= cell.to)
      if (row >= 0 && column >= 0) {
        const rows = cells.map(row => row.map(cell => cell.text))
        const pasted = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
        pasted.forEach((values, i) => { const target = rows[row + i] ?? (rows[row + i] = []); values.forEach((value, j) => { target[column + j] = value }) })
        const source = writeTable(rows)
        const cell = tableRows(source)[row][column]
        const change = replaceRange(blocks, { block: a.block, offset: 0 }, { block: a.block, offset: block.source.length }, source)
        const pos = { block: a.block, offset: cell.to }
        commit(change.blocks, pos, pos, 'edit'); return
      }
    }
    if (!plain && a.block === b.block && a.offset !== b.offset && /^https?:\/\/[^\s<>]+$/i.test(text.trim())) {
      wrap(selection, '[', `](${text.trim().replace(/\(/g, '%28').replace(/\)/g, '%29')})`)
    } else insert(selection, (!plain ? fromTSV(text) : null) ?? text.replace(/\r\n?/g, '\n'))
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const files = filesOf(event.dataTransfer)
    if (!files.length || !options.onFiles || readOnly || destroyed) return
    // The caret goes where the files were let go, so they land there.
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    const index = range ? blockIndexOf(range.startContainer) : -1
    if (range && index >= 0) {
      const pos = { block: index, offset: offsetIn(elements()[index], range.startContainer, range.startOffset) }
      elements()[index].focus({ preventScroll: true })
      setSelection(pos)
    }
    options.onFiles(files)
  }

  host.addEventListener('beforeinput', onBeforeInput)
  host.addEventListener('input', onInput)
  host.addEventListener('keydown', onKeyDown)
  host.addEventListener('copy', onCopy)
  host.addEventListener('cut', onCopy)
  host.addEventListener('click', onClick)
  host.addEventListener('pointerdown', onPointerDown)
  host.addEventListener('drop', onDrop)
  host.addEventListener('paste', onPaste)
  host.addEventListener('compositionstart', onCompositionStart)
  host.addEventListener('compositionend', onCompositionEnd)
  document.addEventListener('selectionchange', onSelectionChange)

  renderAll()

  const setReadOnly = (value: boolean) => {
    if (value === readOnly) return
    readOnly = value
    clearBlocks()
    for (const element of elements()) { element.contentEditable = value || element.dataset.kind === 'table' ? 'false' : 'true'; element.dataset.readonly = String(value); element.querySelectorAll<HTMLElement>('[data-cell], .aa-caption').forEach(cell => cell.contentEditable = value ? 'false' : 'true') }
    host.dispatchEvent(new Event('aa-change'))
  }

  const editor: Editor = {
    element: host,
    get value() { return toMarkdown(blocks) },
    set value(text: string) {
      if (toMarkdown(blocks) === text) return
      blocks = fromMarkdown(text)
      clearBlocks()
      renderAll()
      history.reset({ blocks, anchor: { block: 0, offset: 0 }, focus: { block: 0, offset: 0 } })
    },
    get readOnly() { return readOnly },
    set readOnly(value: boolean) { setReadOnly(value) },
    get placeholder() { return placeholder },
    set placeholder(value: string) { placeholder = value; showPlaceholder() },
    focus() {
      const last = blocks.length - 1
      elements()[last]?.focus({ preventScroll: true })
      const pos = { block: last, offset: blocks[last].source.length }
      setSelection(pos)
      applyReveal({ anchor: pos, focus: pos })
    },
    blur() { (document.activeElement as HTMLElement | null)?.blur() },
    selection() {
      const selection = readSelection()
      if (!selection) return null
      const [a, b] = order(selection.anchor, selection.focus)
      return { start: offsetOf(a), end: offsetOf(b) }
    },
    replace(start, end, text) {
      if (destroyed) return
      const { blocks: next, caret } = replaceRange(blocks, posOf(Math.min(start, end)), posOf(Math.max(start, end)), text)
      commit(next, caret, caret, 'edit')
      // Written from outside, by a picker or an upload, the editor may not have the focus to show the caret in.
      if (!host.contains(document.activeElement)) { elements()[caret.block]?.focus({ preventScroll: true }); setSelection(caret) }
    },
    undo,
    redo,
    activeBlock() { const selection = readSelection(); if (!selection) return null; const index = selection.focus.block; return { index, block: blocks[index], start: offsetOf({ block: index, offset: 0 }), end: offsetOf({ block: index, offset: blocks[index].source.length }) } },
    selectBlocks,
    format(mark) { if (readOnly) return; const selection = readSelection(); if (!selection) return; if (mark === 'link') { insertLink(selection); return }; const delimiters = { bold: '**', italic: '*', strike: '~~', code: '`', link: '[', equation: '$', highlight: '==' }; wrap(selection, delimiters[mark]) },
    turnInto(kind) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = turnInto(blocks, selected ?? select(blocks, selection.anchor.block, selection.focus.block), kind); commit(change.blocks, change.caret, change.caret, 'edit') },
    blockAction(action) { if (readOnly) return; const selection = readSelection(); if (selection) changeBlocks(action, selected ?? select(blocks, selection.anchor.block, selection.focus.block)) },
    moveBlock(from, to) { if (readOnly || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length || from === to) return; const next = [...blocks], moved = next.splice(from, 1)[0]; next.splice(to, 0, moved); const pos = { block: to, offset: moved.prefix }; commit(next, pos, pos, 'edit'); selectBlocks(to) },
    indent(direction) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = indentBlocks(blocks, selected ?? select(blocks, selection.anchor.block, selection.focus.block), direction); if (change) commit(change.blocks, change.caret, change.caret, 'edit') },
    toggle(open) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = toggleCallout(blocks, selection.focus.block, open) ?? toggleBox(blocks, selection.focus.block); if (change) commit(change.blocks, change.caret, change.caret, 'edit') },
    table(action) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const index = selection.focus.block, block = blocks[index]; if (block.kind !== 'table') return; const rows = tableRows(block.source); let row = 0, column = 0; rows.forEach((cells, r) => cells.forEach((cell, c) => { if (selection.focus.offset >= cell.from && selection.focus.offset <= cell.to) { row = r; column = c } })); const source = editTable(block, action, row, column); const change = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: block.source.length }, source); const pos = { block: index, offset: tableRows(source)[Math.min(row, tableRows(source).length - 1)][Math.min(column, tableRows(source)[0].length - 1)].from }; commit(change.blocks, pos, pos, 'edit') },
    insertFile(file) { if (!readOnly && !destroyed) options.onFiles?.([file]) },
    decorate(ranges, layer = 'external') { decorationLayers.set(layer, ranges.map(range => ({ ...range }))); decorations = [...decorationLayers.values()].flat(); const selection = readSelection(); blocks.forEach((block, index) => draw(elements()[index], block, revealFor(index, selection))); if (selection) setSelection(selection.anchor, selection.focus); sweep() },
    stats() { const text = blocks.flatMap(block => block.kind === 'code' ? [] : [block.source.slice(block.prefix)]).join(' ').replace(/[*_~`#>|=$\[\]()]/g, ' '); const words = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).length : (text.match(/\S+/g)?.length ?? 0); return { words, characters: [...toMarkdown(blocks)].length, blocks: blocks.length } },
    find(query, caseSensitive = false) { if (!query) return []; const text = caseSensitive ? toMarkdown(blocks) : toMarkdown(blocks).toLocaleLowerCase(); const needle = caseSensitive ? query : query.toLocaleLowerCase(); const matches: { start: number; end: number }[] = []; for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + needle.length)) matches.push({ start, end: start + query.length }); return matches },
    selectRange(start, end = start) { const a = posOf(start), b = posOf(end); clearBlocks(); elements()[a.block].focus(); setSelection(a, b); applyReveal() },
    transaction(action) {
      const before = toMarkdown(blocks)
      transactionDepth++
      try { action() } finally {
        transactionDepth--
        if (!transactionDepth && toMarkdown(blocks) !== before) {
          const selection = readSelection() ?? { anchor: { block: 0, offset: 0 }, focus: { block: 0, offset: 0 } }
          history.record(snapshot(selection.anchor, selection.focus), 'edit')
          options.onChange?.(toMarkdown(blocks)); host.dispatchEvent(new Event('aa-change'))
        }
      }
    },
    setHistoryProvider(provider) { historyProvider = provider },
    destroy() {
      destroyed = true
      stopControls()
      host.removeEventListener('beforeinput', onBeforeInput)
      host.removeEventListener('input', onInput)
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('copy', onCopy)
      host.removeEventListener('cut', onCopy)
      host.removeEventListener('click', onClick)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('drop', onDrop)
      host.removeEventListener('paste', onPaste)
      host.removeEventListener('compositionstart', onCompositionStart)
      host.removeEventListener('compositionend', onCompositionEnd)
      document.removeEventListener('selectionchange', onSelectionChange)
      sweep(true)
    },
  }
  stopControls = createControls(editor, options)
  return editor
}
