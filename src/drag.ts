/**
 * Blocks are moved by hand, with nothing drawn beside them, on Drag's
 * sortable engine (`src/vendor/drag`, copied from /Users/joachim/0001/Drag
 * with Sync 1): the block lifts into an overlay, the blocks it passes step
 * aside by its whole size, and it lands in its place, as Design system 1's
 * sheet rows and Ezo's lists move.
 *
 * A mouse pressed on a block and held still for a moment lifts it, and it
 * goes where the press is let go. Words are selected along a line, so a
 * press that first moves up or down lifts its block at once, and one that
 * first moves along the line selects words, as it always has. A pointer that
 * rests on a block for a moment takes it in hand (the cursor turns to a
 * grab), and a press then lifts it at once, whichever way it moves. A lifted
 * block let go where it began leaves the caret where the press put it. Blocks already selected (Escape,
 * Shift-arrows, a block just moved) are dragged at once, the one pressed
 * carried and the others dimmed in their places, and they land together.
 * Touch keeps its long press for the system's own selection: there the block
 * menu moves blocks, as ⌘⇧↑ and ⌘⇧↓ do from the keyboard. Files dropped from
 * outside land between blocks, on a line.
 *
 * As Notion places pictures, a block carried to another block's side (its
 * first or last fifth, four squares at most) shows a line down that side,
 * and let go there it stands beside it: the two become columns, or it is one
 * more column of columns already there. Carried out of its column over
 * another column of the same columns, it stands at that column's nearer side
 * as a column of its own, so pictures in columns are put in order sideways.
 */
import type { Editor, EditorOptions } from './editor'
import { createSortable, type SortableResult } from './vendor/drag/sortable'
import { besideChange, parseBlocks } from './markdown'

/** How long a still press waits before it lifts its block, in milliseconds. */
export const HOLD = 400
/** How long a pointer rests on a block before it takes the block in hand, in milliseconds. */
export const REST = 400
/** How far a resting pointer may drift and still be resting, in pixels. */
const DRIFT = 8

/** What a press inside a block is for itself: a field, a caption, a player, a diagram's board. */
const OWN = 'button, input, textarea, select, video, audio, .aa-caption, [data-aa-interactive]'
/** Whether a press is a field's, a caption's or a player's in this block: what stands round this editor (columns drawing it) does not count. */
const ownPress = (target: Element | null, block: HTMLElement) => { const own = target?.closest(OWN); return !!own && block.contains(own) }
/** What the lifted block carries from the editor to the overlay it is drawn in. */
const CARRIED = ['--aa-unit', '--aa-sf', '--aa-rule-color', '--aa-gap', '--aa-indent']

export function createDragging(editor: Editor, options: EditorOptions, root: Element): () => void {
  const host = editor.element
  const line = document.createElement('div'); line.className = 'aa-drop-line'; line.hidden = true
  root.append(line)
  const sideLine = document.createElement('div'); sideLine.className = 'aa-drop-line aa-drop-side'; sideLine.hidden = true
  root.append(sideLine)
  /** The block's side the carried block would stand at, while it is over one. */
  let side: { index: number; at: 'start' | 'end' } | null = null
  /** In columns: where among the columns the carried block would stand as a column of its own, or the column it would trade places with. */
  let across: { slot: number } | { swap: number } | null = null
  const children = () => Array.from(host.children) as HTMLElement[]
  const movable = () => !editor.readOnly && options.menus !== false && (editor.reordering || editor.placing)
  const placeable = () => movable() && editor.placing
  host.toggleAttribute('data-movable', movable())

  /** The press as the editor saw it, before the engine decides: what it may lift, and what it leaves to the page. */
  let press: { block: HTMLElement; mouse: boolean; plain: boolean; own: boolean; inSelection: boolean; selected: HTMLElement[]; grabbed: boolean; x: number; y: number } | null = null
  /** What a drag carries: the caret to give back, and the selected blocks that go with the one lifted. */
  let carried: { caret: { start: number; end: number } | null; group: HTMLElement[]; from: number } | null = null

  const insideSelection = (x: number, y: number) => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return false
    return Array.from(selection.getRangeAt(0).getClientRects()).some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
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
  /** The selection stays away while a block is carried, so the browser does not go on selecting words under it. */
  const keepClear = () => { if (carried && window.getSelection()?.rangeCount) window.getSelection()!.removeAllRanges() }

  // Keep side targets where the blocks stood at lift: sortable moves siblings
  // aside during the gesture, but that must not move a column target away.
  let sideTargets: DOMRect[] = []
  let liftedScroll = { x: 0, y: 0 }

  const sortable = createSortable({
    inheritProperties: CARRIED,
    renderPreview: source => {
      const clone = source.cloneNode(true) as HTMLElement
      clone.removeAttribute('contenteditable')
      clone.removeAttribute('data-selected')
      clone.setAttribute('data-lifted', '')
      return clone
    },
    onDragStart: start => {
      // The blocks selected when the press began: the editor lets the selection go as the press lands.
      const block = children()[start.source.index]
      const selected = press?.selected ?? []
      const group = block && selected.includes(block) ? selected : []
      sideTargets = children().map(element => element.getBoundingClientRect())
      liftedScroll = { x: window.scrollX, y: window.scrollY }
      carried = { caret: group.length ? null : editor.selection(), group, from: start.source.index }
      document.addEventListener('pointermove', besides, true)
      for (const element of group) if (element !== block) element.setAttribute('data-ghost', '')
      host.setAttribute('data-dragging', '')
      document.addEventListener('selectionchange', keepClear)
      keepClear()
    },
    prepareDrop: result => {
      const source = children()[result.source.index];
      const text = source?.textContent;
      const existing = new Set(host.querySelectorAll('.aa-block'));
      applyDrop(result);
      if (source?.isConnected && host.contains(source)) return source;
      const matches = Array.from(host.querySelectorAll<HTMLElement>('.aa-block')).filter(block => block.textContent === text);
      return matches.find(block => !existing.has(block)) ?? matches[0] ?? null;
    },
    onDragEnd: result => { if (result.reason !== 'DROP' || !result.destination) applyDrop(result); },
  })
  function applyDrop(result: SortableResult) {
      const { caret, group } = carried ?? { caret: null, group: [] as HTMLElement[] }
      carried = null
      sideTargets = []
      document.removeEventListener('pointermove', besides, true)
      const beside = side, over = across
      side = null; across = null; sideLine.hidden = true; sideLine.removeAttribute('data-swap')
      for (const element of host.querySelectorAll(':scope > [data-ghost]')) element.removeAttribute('data-ghost')
      host.removeAttribute('data-dragging')
      document.removeEventListener('selectionchange', keepClear)
      const all = children(), from = result.source.index, to = result.destination?.index
      if (result.reason === 'DROP' && beside && group.length <= 1 && placeable() && placeBeside(from, beside.index, beside.at)) return
      // Out of its column, beside another: the columns move it, as one step to undo of the page around them.
      if (result.reason === 'DROP' && over && group.length <= 1 && placeable()) {
        host.dispatchEvent(new CustomEvent('aa-column-carry', { bubbles: true, detail: { from, ...over } }))
        return
      }
      if (result.reason === 'DROP' && to !== undefined && movable() && editor.reordering) {
        if (group.length > 1) {
          // The others go where the one carried went: after as many unchosen blocks as stood before it.
          const first = all.indexOf(group[0]), count = group.length
          const rest = all.filter((_, index) => index !== from)
          const before = rest.slice(0, to).filter(element => !group.includes(element)).length
          if (before !== first) { editor.moveBlock(first, before, count); return }
          editor.selectBlocks(first, first + count - 1)
          return
        }
        if (to !== from) { editor.moveBlock(from, to); return }
      }
      if (caret) editor.selectRange(caret.start, caret.end)
      else if (group.length) editor.selectBlocks(all.indexOf(group[0]), all.indexOf(group[group.length - 1]))
  }
  sortable.container({ element: host, id: 'aa', type: 'aa-block', isDropDisabled: () => !movable() })

  /** Follows the carried block over the others: near one's side, the line down that side shows where it would stand. */
  function besides(event: PointerEvent) {
    if (!carried || carried.group.length > 1 || !placeable()) return
    if (acrossColumns(event)) return
    const unit = parseFloat(getComputedStyle(host).getPropertyValue('--aa-unit')) || 20
    const dx = window.scrollX - liftedScroll.x, dy = window.scrollY - liftedScroll.y
    const x = event.clientX + dx, y = event.clientY + dy
    // Include one square beyond the edge: a picture is placed beside another,
    // so the pointer need not stay inside the picture it is placed beside.
    const index = sideTargets.findIndex((rect, index) => index !== carried!.from &&
      y >= rect.top && y <= rect.bottom && x >= rect.left - unit && x <= rect.right + unit)
    const original = sideTargets[index]
    const rect = original ? new DOMRect(original.left - dx, original.top - dy, original.width, original.height) : null
    const zone = rect ? Math.min(rect.width / 5, 4 * unit) : 0
    const at = !rect ? null
      : event.clientX < rect.left + zone ? 'start'
      : event.clientX > rect.right - zone ? 'end'
      : null
    if (!at || !rect) { side = null; sideLine.hidden = true; return }
    sideLine.removeAttribute('data-swap')
    side = { index, at }
    sideLine.style.left = `${at === 'start' ? rect.left : rect.right}px`
    sideLine.style.top = `${rect.top}px`
    sideLine.style.height = `${rect.height}px`
    sideLine.style.width = ''
    sideLine.hidden = false
  }

  /**
   * In a column of columns, carried out of its own column anywhere along the row (over another
   * column, in the gap between two, or past either end): the line where it would stand as a column
   * of its own, halfway across the gap it would land in, and that place among the columns. A block
   * alone in its column leaves it, so its column is not counted and its own place shows no line;
   * let go on another column, it trades places with it, that column ringed to show which.
   * False over its own column, where it moves up and down as any block does.
   */
  function acrossColumns(event: PointerEvent): boolean {
    across = null
    const row = host.parentElement
    if (!host.classList.contains('aa-column') || !row?.classList.contains('aa-columns')) return false
    const unit = parseFloat(getComputedStyle(host).getPropertyValue('--aa-unit')) || 20
    const box = row.getBoundingClientRect()
    if (event.clientY < box.top - unit || event.clientY > box.bottom + unit) return false
    const own = host.getBoundingClientRect()
    if (event.clientX >= own.left && event.clientX <= own.right) return false
    const columns = Array.from(row.children).filter(child => child.classList.contains('aa-column')) as HTMLElement[]
    const origin = columns.indexOf(host)
    const alone = host.querySelectorAll(':scope > .aa-block').length <= 1
    const others = alone ? columns.filter(column => column !== host) : columns
    sideLine.removeAttribute('data-swap')
    // Alone in its column and let go on another, the two trade places.
    const over = alone ? columns.findIndex(column => { const rect = column.getBoundingClientRect(); return column !== host && event.clientX >= rect.left && event.clientX <= rect.right }) : -1
    if (over >= 0) {
      // Ringed round what it holds, the picture, rather than the column's whole height.
      const rect = (columns[over].querySelector(':scope > .aa-block') ?? columns[over]).getBoundingClientRect()
      across = { swap: over }
      side = null
      sideLine.setAttribute('data-swap', '')
      sideLine.style.left = `${rect.left}px`
      sideLine.style.top = `${rect.top}px`
      sideLine.style.height = `${rect.height}px`
      sideLine.style.width = `${rect.width}px`
      sideLine.hidden = false
      return true
    }
    const rects = others.map(column => column.getBoundingClientRect())
    const slot = rects.filter(rect => rect.left + rect.width / 2 < event.clientX).length
    sideLine.hidden = true
    // Let go where it already stands, nothing moves: no line.
    if (alone && slot === origin) return true
    across = { slot }
    const gap = rects.length > 1 ? rects[1].left - rects[0].right : 2 * unit
    const x = slot === 0 ? rects[0].left - gap / 2 : slot === rects.length ? rects[rects.length - 1].right + gap / 2 : (rects[slot - 1].right + rects[slot].left) / 2
    side = null
    sideLine.style.left = `${x}px`
    sideLine.style.top = `${box.top}px`
    sideLine.style.height = `${box.height}px`
    sideLine.style.width = ''
    sideLine.hidden = false
    return true
  }

  /** A block that is pictures alone: no words to select, so a press carries it whichever way it moves. */
  function wordless(block: HTMLElement): boolean {
    const placed = parseBlocks(editor.value)[children().indexOf(block)]
    return !!placed && /^(?:!\[[^\]\n]*\]\([^)\n]*\)\s*)+$/.test(placed.source.trim())
  }

  /** The block at `from` stands at a side of the one at `to`, in columns, as one step to undo. False where it cannot. */
  function placeBeside(from: number, to: number, at: 'start' | 'end'): boolean {
    if (parseBlocks(editor.value).length !== children().length) return false
    const change = besideChange(editor.value, from, to, at)
    if (!change) return false
    editor.replace(change.start, change.end, change.text)
    return true
  }

  // Seen before the engine's own listener, which asks canDrag about the press
  // it has just been given: so it is added before the first block is an item.
  const down = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const block = target?.closest?.('.aa-block') as HTMLElement | null
    const grabbed = !!block && ready === block
    stopResting()
    if (!block || block.parentElement !== host) { press = null; return }
    register()
    const chosen = children().filter(element => element.hasAttribute('data-selected'))
    const selected = chosen.includes(block) ? chosen : []
    press = {
      block,
      mouse: event.pointerType === 'mouse' && event.button === 0,
      plain: !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey,
      own: ownPress(target, block),
      // Words already selected are dragged the browser's way.
      inSelection: insideSelection(event.clientX, event.clientY),
      selected,
      grabbed,
      x: event.clientX, y: event.clientY,
    }
    // A press on selected blocks, or a block in hand, does not put the caret in it unless it is let go where it began.
    // The press is the block's, not the browser's selecting: the selected, the one in hand, and a picture.
    if ((selected.length || grabbed || wordless(block)) && press.mouse && press.plain && !press.own && !press.inSelection && movable()) event.preventDefault()
  }
  window.addEventListener('pointerdown', down, true)

  // Each block is an item while it is on the page; the editor draws blocks again as they change.
  let count = 0
  const registered = new Map<HTMLElement, () => void>()
  function register() {
    for (const [block, stop] of registered) if (block.parentElement !== host) { stop(); registered.delete(block) }
    for (const block of children()) {
      if (registered.has(block) || !block.classList.contains('aa-block')) continue
      registered.set(block, sortable.item({
        element: block,
        id: `aa-block-${++count}`,
        type: 'aa-block',
        // Selected blocks, a block in hand and a picture, which has no words to select, go as soon as the press
        // moves, whichever way; any other when the press moves up or down, or after a still press, so a press
        // moving along a line selects words.
        text: { hold: () => press?.block === block && (press.selected.length || press.grabbed || wordless(block)) ? 0 : HOLD, axis: 'y' },
        canDrag: ({ input }) => input === 'mouse' && movable() && !!press && press.block === block && press.mouse && press.plain && !press.own && !press.inSelection,
      }))
    }
  }
  register()
  const observer = new MutationObserver(register)
  observer.observe(host, { childList: true })

  // A second or third click selects a word or a line; it never lifts.
  const many = (event: MouseEvent) => { if (event.detail > 1 && !sortable.isDragging()) sortable.cancel() }
  const up = (event: PointerEvent) => {
    const pressed = press
    press = null
    if (!(pressed?.selected.length || pressed?.grabbed) || pressed.inSelection || sortable.isDragging() || carried || !movable() || event.type !== 'pointerup') return
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 5) placeCaret(event.clientX, event.clientY)
  }
  host.addEventListener('mousedown', many, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)

  // A pointer resting on a block takes it in hand; moving on, typing or leaving lets it go.
  let resting: { block: HTMLElement; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null
  let ready: HTMLElement | null = null
  function stopResting() {
    if (resting) clearTimeout(resting.timer)
    resting = null
    ready?.removeAttribute('data-grab')
    ready = null
  }
  const hover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.buttons || sortable.isDragging() || !movable()) { stopResting(); return }
    const target = event.target instanceof Element ? event.target : null
    const block = target?.closest?.('.aa-block') as HTMLElement | null
    if (!block || block.parentElement !== host || ownPress(target, block)) { stopResting(); return }
    if (resting?.block === block && Math.hypot(event.clientX - resting.x, event.clientY - resting.y) < DRIFT) return
    stopResting()
    const timer = setTimeout(() => {
      if (resting?.block !== block || !movable()) return
      ready = block
      block.setAttribute('data-grab', '')
    }, REST)
    resting = { block, x: event.clientX, y: event.clientY, timer }
  }
  host.addEventListener('pointermove', hover)
  host.addEventListener('pointerleave', stopResting)
  host.addEventListener('keydown', stopResting)

  // Files from outside land between blocks: the caret goes to the start of
  // the block they land before, or the end of the last, for the product.
  /** Where something let go at `y` lands: before the first block whose middle is below it. */
  const landing = (y: number) => {
    const index = children().findIndex(block => { const rect = block.getBoundingClientRect(); return y < rect.top + rect.height / 2 })
    return index < 0 ? host.children.length : index
  }
  /** The line halfway across the gap something would land in; none for -1. */
  const showLine = (index: number) => {
    const all = children(), after = all[index], before = all[index - 1]
    if (index < 0 || (!after && !before)) { line.hidden = true; return }
    const rect = (after ?? before).getBoundingClientRect()
    const top = after && before ? (before.getBoundingClientRect().bottom + rect.top) / 2 : after ? rect.top : rect.bottom
    line.style.left = `${rect.left}px`; line.style.top = `${top}px`; line.style.width = `${rect.width}px`; line.hidden = false
  }
  let fileDestination = -1
  const files = (event: DragEvent) => !editor.readOnly && editor.placing && !!options.onFiles && Array.from(event.dataTransfer?.types ?? []).includes('Files')
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
  const movementChanged = () => {
    sortable.cancel()
    press = null
    stopResting()
    side = null; across = null; sideLine.hidden = true; line.hidden = true; fileDestination = -1
    host.toggleAttribute('data-movable', movable())
  }
  host.addEventListener('aa-movement-change', movementChanged)
  host.addEventListener('dragover', dragOver)
  host.addEventListener('dragleave', dragLeave)
  host.addEventListener('drop', drop, true)

  return () => {
    observer.disconnect()
    sortable.destroy()
    registered.clear()
    carried = null; press = null
    document.removeEventListener('selectionchange', keepClear)
    line.remove(); sideLine.remove()
    document.removeEventListener('pointermove', besides, true)
    host.removeAttribute('data-movable'); host.removeAttribute('data-dragging')
    window.removeEventListener('pointerdown', down, true)
    host.removeEventListener('mousedown', many, true)
    window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true)
    stopResting()
    host.removeEventListener('pointermove', hover); host.removeEventListener('pointerleave', stopResting); host.removeEventListener('keydown', stopResting)
    host.removeEventListener('aa-movement-change', movementChanged)
    host.removeEventListener('dragover', dragOver); host.removeEventListener('dragleave', dragLeave); host.removeEventListener('drop', drop, true)
  }
}
