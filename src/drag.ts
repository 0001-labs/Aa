/**
 * Blocks are moved by hand, with nothing drawn beside them. A mouse pressed
 * on a block and held still for a moment lifts it, and it goes where the
 * press is let go; a press that moves sooner selects words, as it always has,
 * and a lifted block let go where it began leaves the caret where the press
 * put it. Blocks already selected (Escape, Shift-arrows, a block just moved)
 * are dragged at once. Touch keeps its long press for the system's own
 * selection: there the block menu moves blocks, as ⌘⇧↑ and ⌘⇧↓ do from the
 * keyboard. Files dropped from outside land between blocks the same way.
 */
import type { Editor, EditorOptions } from './editor'

/** How long a still press waits before it lifts its block, in milliseconds. */
export const HOLD = 400
/** How far a press may wander, in pixels, and still be still. */
export const STILL = 4

type Press = { id: number; x: number; y: number; block: HTMLElement; timer?: ReturnType<typeof setTimeout>; selected?: [HTMLElement, HTMLElement] }
type Lift = { first: HTMLElement; last: HTMLElement; y: number; moved: boolean; cancelled: boolean; caret: { start: number; end: number } | null; scroller: HTMLElement | null }

export function createDragging(editor: Editor, options: EditorOptions, root: Element): () => void {
  const host = editor.element
  const line = document.createElement('div'); line.className = 'aa-drop-line'; line.hidden = true
  root.append(line)
  const children = () => Array.from(host.children) as HTMLElement[]
  const movable = () => !editor.readOnly && options.menus !== false
  const square = () => 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--sf')) || 1)
  host.toggleAttribute('data-movable', options.menus !== false)

  /** Where something let go at `y` lands: before the first block whose middle is below it. */
  const landing = (y: number) => {
    const index = children().findIndex(block => { const rect = block.getBoundingClientRect(); return y < rect.top + rect.height / 2 })
    return index < 0 ? host.children.length : index
  }
  /** The line halfway across the gap a block would land in; none for -1. */
  const showLine = (index: number) => {
    const all = children(), after = all[index], before = all[index - 1]
    if (index < 0 || (!after && !before)) { line.hidden = true; return }
    const rect = (after ?? before).getBoundingClientRect()
    const top = after && before ? (before.getBoundingClientRect().bottom + rect.top) / 2 : after ? rect.top : rect.bottom
    line.style.left = `${rect.left}px`; line.style.top = `${top}px`; line.style.width = `${rect.width}px`; line.hidden = false
  }

  let press: Press | null = null, lift: Lift | null = null, destination = -1, frame = 0
  /** The lifted blocks as indices, while they are all still on the page. */
  const lifted = () => {
    if (!lift) return null
    const all = children(), first = all.indexOf(lift.first), last = all.indexOf(lift.last)
    return first < 0 || last < first ? null : { first, last }
  }
  const aim = () => {
    const range = lifted(), index = lift && !lift.cancelled ? landing(lift.y) : -1
    destination = range && (index < range.first || index > range.last + 1) ? index : -1
    showLine(destination)
  }
  /** The selection stays away while a block is carried, so the browser does not go on selecting words under it. */
  const keepClear = () => { if (lift && window.getSelection()?.rangeCount) window.getSelection()!.removeAllRanges() }
  const scroll = () => {
    frame = 0
    if (!lift || lift.cancelled) return
    const box = lift.scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
    const edge = 2 * square()
    const by = lift.y < box.top + edge ? lift.y - box.top - edge : lift.y > box.bottom - edge ? lift.y - box.bottom + edge : 0
    if (!by) return
    const step = Math.max(-edge, Math.min(edge, by)) / 2
    if (lift.scroller) lift.scroller.scrollTop += step; else window.scrollBy(0, step)
    aim(); frame = requestAnimationFrame(scroll)
  }
  const scroller = () => {
    for (let node = host.parentElement; node; node = node.parentElement) {
      if (/auto|scroll|overlay/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node
    }
    return null
  }

  const pick = (first: HTMLElement, last: HTMLElement, y: number, caret: Lift['caret']) => {
    lift = { first, last, y, moved: false, cancelled: false, caret, scroller: scroller() }
    const all = children()
    all.slice(all.indexOf(first), all.indexOf(last) + 1).forEach(block => block.setAttribute('data-lifted', ''))
    host.setAttribute('data-dragging', '')
    document.addEventListener('selectionchange', keepClear)
    keepClear(); aim()
  }
  /** Put the lifted blocks down without moving them. */
  const settle = () => {
    for (const block of host.querySelectorAll(':scope > [data-lifted]')) block.removeAttribute('data-lifted')
    host.removeAttribute('data-dragging')
    line.hidden = true; destination = -1
    cancelAnimationFrame(frame); frame = 0
    if (lift) lift.cancelled = true
  }
  const finish = () => { settle(); lift = null; document.removeEventListener('selectionchange', keepClear) }
  /** The click that ends a drag is not a click on what it ended over. */
  const swallowClick = () => {
    const swallow = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation() }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true))
  }
  const caretAt = (x: number, y: number) => {
    const position = (document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(x, y)
    if (position) return { node: position.offsetNode, offset: position.offset }
    const range = document.caretRangeFromPoint?.(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  /** What a click would have done where a press on a selected block was let go: the caret there. */
  const placeCaret = (x: number, y: number) => {
    const point = caretAt(x, y)
    const block = (point?.node instanceof Element ? point.node : point?.node.parentElement)?.closest('.aa-block') as HTMLElement | null
    if (!point || !block || block.parentElement !== host) return
    block.focus({ preventScroll: true })
    window.getSelection()?.collapse(point.node, point.offset)
  }
  const insideSelection = (x: number, y: number) => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return false
    return Array.from(selection.getRangeAt(0).getClientRects()).some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
  }

  const down = (event: PointerEvent) => {
    if (press) end(null, false)
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || !movable()) return
    const target = event.target as HTMLElement
    const block = target.closest?.('.aa-block') as HTMLElement | null
    if (!block || block.parentElement !== host || target.closest('button, input, textarea, select, video, audio, .aa-caption')) return
    const selected = children().filter(element => element.hasAttribute('data-selected'))
    if (selected.includes(block)) {
      // Selected blocks go as soon as the press moves, so the press does not
      // put the caret in them until it is let go where it began.
      event.preventDefault()
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, block, selected: [selected[0], selected[selected.length - 1]] }
      return
    }
    // Words already selected are dragged the browser's way.
    if (insideSelection(event.clientX, event.clientY)) return
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, block }
    press.timer = setTimeout(() => {
      if (!press?.block.isConnected || !movable()) { press = null; return }
      pick(press.block, press.block, press.y, editor.selection())
    }, HOLD)
  }
  // A second or third click selects a word or a line; it never lifts.
  const many = (event: MouseEvent) => { if (event.detail > 1 && press && !lift) { clearTimeout(press.timer); press = null } }
  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return
    const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) > STILL
    if (!lift) {
      if (!far) return
      if (!press.selected) { clearTimeout(press.timer); press = null; return }
      pick(press.selected[0], press.selected[1], event.clientY, null)
    }
    lift!.y = event.clientY; lift!.moved ||= far
    if (lift!.cancelled) return
    aim()
    if (!frame) frame = requestAnimationFrame(scroll)
  }
  const end = (event: PointerEvent | null, drop = true) => {
    if (!press || (event && event.pointerId !== press.id)) return
    const pressed = press; press = null; clearTimeout(pressed.timer)
    if (!lift) { if (drop && pressed.selected && event) placeCaret(event.clientX, event.clientY); return }
    const { caret, moved, cancelled } = lift, range = lifted(), to = drop && !cancelled && movable() ? destination : -1
    finish()
    if (moved) swallowClick()
    if (range && to >= 0) {
      const count = range.last - range.first + 1
      editor.moveBlock(range.first, to > range.last ? to - count : to, count)
    } else if (caret) editor.selectRange(caret.start, caret.end)
    else if (range) editor.selectBlocks(range.first, range.last)
  }
  const up = (event: PointerEvent) => end(event, event.type === 'pointerup')
  const key = (event: KeyboardEvent) => {
    if (!lift || lift.cancelled || event.key !== 'Escape') return
    event.preventDefault(); event.stopImmediatePropagation(); settle()
  }
  const blur = () => end(null, false)

  // Files from outside land between blocks: the caret goes to the start of
  // the block they land before, or the end of the last, for the product.
  let fileDestination = -1
  const files = (event: DragEvent) => !editor.readOnly && !!options.onFiles && Array.from(event.dataTransfer?.types ?? []).includes('Files')
  const dragOver = (event: DragEvent) => {
    if (!files(event)) return
    event.preventDefault()
    fileDestination = landing(event.clientY); showLine(fileDestination)
  }
  const dragLeave = (event: DragEvent) => { if (!host.contains(event.relatedTarget as Node | null)) { line.hidden = true; fileDestination = -1 } }
  const drop = (event: DragEvent) => {
    line.hidden = true
    const at = fileDestination; fileDestination = -1
    if (at < 0 || !files(event) || !event.dataTransfer?.files.length) return
    event.preventDefault(); event.stopImmediatePropagation()
    const all = children(), block = all[at] ?? all[all.length - 1]
    block.focus({ preventScroll: true })
    window.getSelection()?.collapse(block, all[at] ? 0 : block.childNodes.length)
    options.onFiles!(Array.from(event.dataTransfer.files))
  }

  host.addEventListener('pointerdown', down, true)
  host.addEventListener('mousedown', many, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', blur)
  host.addEventListener('dragover', dragOver)
  host.addEventListener('dragleave', dragLeave)
  host.addEventListener('drop', drop, true)
  return () => {
    clearTimeout(press?.timer); press = null; finish(); line.remove()
    host.removeAttribute('data-movable')
    host.removeEventListener('pointerdown', down, true); host.removeEventListener('mousedown', many, true)
    window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur)
    host.removeEventListener('dragover', dragOver); host.removeEventListener('dragleave', dragLeave); host.removeEventListener('drop', drop, true)
  }
}
