/**
 * Words selected with the mouse across blocks. Each block is its own
 * editable element, and a browser keeps a selection dragged in one inside
 * it, so once a press that selects words reaches another block, Aa drives
 * the selection itself: from where the press began to the point under the
 * pointer, over every block between, as one selection the editor already
 * reads, edits, formats, copies and cuts. Shift and a click in another block
 * reach it the same way. The caret, typing, IME and spelling stay the
 * browser's: nothing changes while the press stays in its own block.
 *
 * A press that first moves up or down lifts its block (`src/drag.ts`); one
 * that first moves along the line selects words, and goes on selecting when
 * it then moves down into other blocks. A block lifted, the selection is
 * left alone.
 */
import { offsetIn, pointAt } from './render'

/** How near the window's edge a press selecting across blocks scrolls it, in pixels. */
const EDGE = 24
/** What a press inside a block is for itself, as `src/drag.ts` has it. */
const OWN = 'button, input, textarea, select, video, audio, .aa-caption, [data-aa-interactive]'

type Point = { node: Node; offset: number }
/** A place in the text kept as its block and its offset into the block's source, which outlives the block being drawn again. */
type Place = { block: HTMLElement; offset: number }

export function selectAcrossBlocks(host: HTMLElement, readOnly: () => boolean): () => void {
  const blocks = () => (Array.from(host.children) as HTMLElement[]).filter(element => element.classList.contains('aa-block'))
  const blockOf = (node: Node | null) => {
    const block = (node instanceof Element ? node : node?.parentElement)?.closest('.aa-block') as HTMLElement | null
    return block && block.parentElement === host ? block : null
  }
  const caretAt = (x: number, y: number): Point | null => {
    const position = (document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(x, y)
    if (position) return { node: position.offsetNode, offset: position.offset }
    const range = document.caretRangeFromPoint?.(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  /** Where the pointer is in the writing: the block level with it, or the nearest, and the place in it nearest the pointer. */
  const placeAt = (x: number, y: number): Place | null => {
    const all = blocks()
    if (!all.length) return null
    const rects = all.map(block => block.getBoundingClientRect())
    let index = rects.findIndex(rect => y < rect.bottom)
    if (index < 0) index = all.length - 1
    // Between two blocks, the nearer one.
    if (index > 0 && y < rects[index].top && rects[index].top - y > y - rects[index - 1].bottom) index--
    const block = all[index], rect = rects[index]
    if (y < rect.top) return { block, offset: 0 }
    if (y >= rect.bottom) return { block, offset: sourceLength(block) }
    const point = caretAt(Math.min(Math.max(x, rect.left + 1), rect.right - 1), y)
    if (!point || blockOf(point.node) !== block) return { block, offset: x < rect.left + rect.width / 2 ? 0 : sourceLength(block) }
    return { block, offset: offsetIn(block, point.node, point.offset) }
  }
  const sourceLength = (block: HTMLElement) => offsetIn(block, block, block.childNodes.length)
  const placeOf = (node: Node | null, offset: number): Place | null => {
    const block = blockOf(node)
    return block && node ? { block, offset: offsetIn(block, node, offset) } : null
  }

  let setting = false
  const select = (anchor: Place, focus: Place) => {
    const selection = window.getSelection()
    if (!selection || !anchor.block.isConnected || !focus.block.isConnected) return
    const a = pointAt(anchor.block, anchor.offset), f = pointAt(focus.block, focus.offset)
    if (selection.anchorNode === a.node && selection.anchorOffset === a.offset && selection.focusNode === f.node && selection.focusOffset === f.offset) return
    setting = true
    try { selection.setBaseAndExtent(a.node, a.offset, f.node, f.offset) } finally { setting = false }
  }

  /** The press selecting words: where it began, and, once it has reached another block, the selection it draws. */
  let press: { pointer: number; start: Place; words: boolean; anchor: Place | null; focus: Place | null; x: number; y: number } | null = null
  let frame = 0

  const down = (event: PointerEvent) => {
    press = null
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.altKey || event.metaKey || event.ctrlKey || readOnly()) return
    const target = event.target instanceof Element ? event.target : null
    const block = blockOf(target)
    if (!block || target?.closest(OWN)) return
    const at = placeAt(event.clientX, event.clientY)
    if (!at) return
    if (event.shiftKey) {
      // Shift and a click in another block: from where the selection began to here.
      const selection = window.getSelection()
      const anchor = selection?.rangeCount ? placeOf(selection.anchorNode, selection.anchorOffset) : null
      if (!anchor || anchor.block === at.block) return
      event.preventDefault()
      press = { pointer: event.pointerId, start: anchor, words: false, anchor, focus: at, x: event.clientX, y: event.clientY }
      select(anchor, at)
      return
    }
    press = { pointer: event.pointerId, start: at, words: false, anchor: null, focus: null, x: event.clientX, y: event.clientY }
  }

  const follow = () => {
    if (!press?.anchor) return
    const at = placeAt(press.x, press.y)
    if (!at) return
    press.focus = at
    select(press.anchor, at)
  }

  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointer) return
    // A block lifted, or a press let go somewhere the page never told: the press is over.
    if (!(event.buttons & 1) || host.hasAttribute('data-dragging')) { end(); return }
    press.x = event.clientX; press.y = event.clientY
    if (!press.anchor) {
      const at = placeAt(event.clientX, event.clientY)
      if (!at || at.block === press.start.block) return
      // Reaching another block, the selection goes on from where the press began, or, for a double or
      // triple press, from the start of the word or line the browser selected with it.
      const selection = window.getSelection()
      const begun = press.words && selection?.rangeCount ? placeOf(selection.anchorNode, selection.anchorOffset) : null
      press.anchor = begun?.block === press.start.block ? begun : press.start
    }
    follow()
    scrollNearEdge()
  }

  /** The browser's own selecting would pull the selection back into its block: while Aa draws it, the mouse is Aa's. */
  const mouse = (event: MouseEvent) => { if (press?.anchor && event.buttons & 1) event.preventDefault() }
  /** A pointer press says nothing of how many clicks it is; the mouse's own does. */
  const many = (event: MouseEvent) => { if (press && event.detail > 1) press.words = true }
  const selectStart = (event: Event) => { if (press?.anchor) event.preventDefault() }
  /** And should the browser set it anyway, it is set back. */
  const kept = () => { if (!setting && press?.anchor && press.focus) select(press.anchor, press.focus) }

  /** Near the window's top or bottom, the page scrolls on, and the selection with it. */
  const scrollNearEdge = () => {
    if (frame || !press?.anchor) return
    const step = press.y < EDGE ? press.y - EDGE : press.y > window.innerHeight - EDGE ? press.y - (window.innerHeight - EDGE) : 0
    if (!step) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!press?.anchor) return
      scrollerOf(host).scrollBy(0, Math.sign(step) * Math.min(Math.abs(step), EDGE))
      follow()
      scrollNearEdge()
    })
  }

  const end = () => {
    press = null
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
  const up = (event: PointerEvent) => { if (press && event.pointerId === press.pointer) end() }

  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('mousemove', mouse, true)
  window.addEventListener('mousedown', many, true)
  document.addEventListener('selectstart', selectStart, true)
  document.addEventListener('selectionchange', kept)
  return () => {
    end()
    window.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('mousemove', mouse, true)
    window.removeEventListener('mousedown', many, true)
    document.removeEventListener('selectstart', selectStart, true)
    document.removeEventListener('selectionchange', kept)
  }
}

/** What scrolls the editor: its nearest scrolling holder, or the page. */
function scrollerOf(element: HTMLElement): Element | Window {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent
  }
  return window
}
