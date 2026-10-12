/**
 * The editor: one editable element a block, each drawn from the document and
 * read back from the screen after every change, the way Notion's blocks are.
 * The browser types, spells and composes; Aa owns Enter, Backspace at an
 * edge, paste, marks, undo and the caret's way between blocks.
 */

import { IMAGE, type AtomSyntax, type Block } from './markdown'
import { fromMarkdown, toMarkdown, replaceRange, splitAt, liftPrefix, joinWithPrevious, joinWithNext, wrapSelection, toggleBox, sliceMarkdown, order, comparePos, select, turnInto, moveBlocks, duplicateBlocks, deleteBlocks, type BlockSelection, type TurnKind, type Pos } from './document'
import { History, type Snapshot } from './history'
import { renderBlock, readBlock, offsetIn, pointAt, revealKey, atomElement, type Reveal } from './render'

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
    const image = document.createElement('img')
    image.src = src
    image.alt = alt
    image.loading = 'lazy'
    image.draggable = false
    element.append(image)
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
  const atoms = options.atoms ?? [imageAtom]
  const drawn = new Map<HTMLElement, (() => void) | void>()
  const drawAtom = (name: string, source: string) => {
    const element = atomElement(name, source)
    const atom = atoms.find(candidate => candidate.name === name)
    if (atom?.draw) drawn.set(element, atom.draw(element, source))
    else element.textContent = source
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
  const draw = (element: HTMLElement, block: Block, reveal: Reveal) => renderBlock(element, block, reveal, atoms, drawAtom)
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

  const setSelection = (anchor: Pos, focus: Pos = anchor) => {
    const els = elements()
    const a = pointAt(els[anchor.block], Math.min(anchor.offset, blocks[anchor.block].source.length))
    const f = pointAt(els[focus.block], Math.min(focus.offset, blocks[focus.block].source.length))
    const selection = window.getSelection()
    if (!selection) return
    selection.setBaseAndExtent(a.node, a.offset, f.node, f.offset)
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
    syncDom(next)
    setSelection(anchor, focus)
    applyReveal({ anchor, focus })
    history.record(snapshot(anchor, focus), kind)
    options.onChange?.(toMarkdown(blocks))
  }

  const restore = (state: Snapshot) => {
    clearBlocks()
    syncDom(state.blocks)
    setSelection(state.anchor, state.focus)
    applyReveal({ anchor: state.anchor, focus: state.focus })
    options.onChange?.(toMarkdown(blocks))
  }

  const undo = () => { const state = history.undo(); if (state) restore(state); return !!state }
  const redo = () => { const state = history.redo(); if (state) restore(state); return !!state }

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
    const type = event.inputType
    if (type === 'historyUndo') { event.preventDefault(); undo(); return }
    if (type === 'historyRedo') { event.preventDefault(); redo(); return }
    if (composing || event.isComposing) return
    const selection = readSelection()
    if (!selection) return
    const [a, b] = order(selection.anchor, selection.focus)
    const spanning = a.block !== b.block
    const collapsed = !spanning && a.offset === b.offset
    const block = blocks[a.block]
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
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
  }

  /** Enter: the block ends here and the next begins; with Shift, a line break within it. */
  const enter = (selection: Selection2, soft = false) => {
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
      if (selected) selectBlocks(0, blocks.length - 1)
      else selectBlocks(selection.focus.block)
      return
    }
    const range = selected ?? select(blocks, selection.anchor.block, selection.focus.block)
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
      const change = toggleBox(blocks, selection.focus.block)
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
        const [a, b] = order(selection.anchor, selection.focus)
        if (a.block !== b.block) return
        const wrapped = wrapSelection(blocks, a, b, '[', '](url)')
        if (!wrapped) return
        const end = { block: a.block, offset: wrapped.focus.offset + 2 }
        commit(wrapped.blocks, end, { block: a.block, offset: end.offset + 3 }, 'edit')
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
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
  }
  const onSelectionChange = () => { if (!destroyed && !composing) applyReveal() }
  const onPointerDown = () => clearBlocks()
  const filesOf = (data: DataTransfer | null) => Array.from(data?.files ?? [])
  // A file pasted is the product's to keep; Aa only says where it arrived.
  const onPaste = (event: ClipboardEvent) => {
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
    if (!plain && a.block === b.block && a.offset !== b.offset && /^https?:\/\/[^\s<>]+$/i.test(text.trim())) {
      wrap(selection, '[', `](${text.trim().replace(/\(/g, '%28').replace(/\)/g, '%29')})`)
    } else insert(selection, text.replace(/\r\n?/g, '\n'))
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
    for (const element of elements()) element.contentEditable = value ? 'false' : 'true'
  }

  return {
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
    destroy() {
      destroyed = true
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
}
