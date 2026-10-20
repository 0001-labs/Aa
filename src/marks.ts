/**
 * What an AI answer changed, marked so it can be seen and taken back: a
 * small blue dot after a block it changed, or a soft blue hold round a run of
 * blocks it rewrote or wrote. Hovered or focused, the dot grows into a
 * Revert button (Design system 1's button, in Sharp blue), which puts that
 * change back as it was, the answer's other changes left as they are.
 *
 * The marks stand over the page, as Aa's other floating pieces do, so the
 * blocks and how they read back are untouched; they follow the page as it
 * scrolls and the writing as it moves. A mark goes when its blocks change by
 * hand (they are then other blocks), when it is reverted, or when the marks
 * are put away. They grow and fade by transform and opacity alone, and with
 * less motion asked for they only appear.
 */

import type { Block } from './markdown'

/** One change an answer made: the blocks it put in, and the blocks they took the place of. */
export type AiChange = { blocks: Block[]; before: Block[] }

export type Marks = {
  /** Mark these changes, in place of any marked before. */
  set(changes: AiChange[]): void
  clear(): void
  /** Whether anything is marked. */
  readonly size: number
  /** Draw the marks where their blocks stand now; a mark whose blocks are gone goes. */
  draw(): void
  destroy(): void
}

export type MarksOptions = {
  /** The blocks as they are now, and the element each is drawn in. */
  blocks: () => readonly Block[]
  elements: () => readonly HTMLElement[]
  /** Put a change back; false when it can no longer be. */
  revert: (change: AiChange) => boolean
  root?: Element
}

export function createMarks(host: HTMLElement, options: MarksOptions): Marks {
  const doc = host.ownerDocument, view = doc.defaultView!
  let changes: AiChange[] = []
  let layer: HTMLElement | null = null
  let frame = 0

  const showing = () => changes.filter(change => change.blocks.every(block => options.blocks().includes(block)))

  const draw = () => {
    frame = 0
    changes = showing()
    if (!changes.length) { layer?.remove(); layer = null; return }
    if (!layer) {
      const made = doc.createElement('div')
      made.className = 'aa-ai-marks'
      ;(options.root ?? host.closest('dialog') ?? doc.body).append(made)
      layer = made
    }
    const blocks = options.blocks(), elements = options.elements()
    const drawn = changes.map(change => {
      const boxes = change.blocks.map(block => elements[blocks.indexOf(block)]?.getBoundingClientRect()).filter((box): box is DOMRect => !!box)
      if (!boxes.length) return null
      const section = change.blocks.length > 1 || change.before.length > 1 || /^(`{3,}|~{3,})/.test(change.blocks[0]?.source ?? '')
      const mark = doc.createElement('div')
      mark.className = 'aa-ai-mark'
      mark.dataset.kind = section ? 'section' : 'dot'
      const top = Math.min(...boxes.map(box => box.top)), bottom = Math.max(...boxes.map(box => box.bottom))
      const left = Math.min(...boxes.map(box => box.left)), right = Math.max(...boxes.map(box => box.right))
      if (section) {
        const hold = doc.createElement('div')
        hold.className = 'aa-ai-hold'
        // A little past the blocks all round, so the hold takes them rather than touching them.
        Object.assign(hold.style, { left: `${left - 4}px`, top: `${top - 4}px`, width: `${right - left + 8}px`, height: `${bottom - top + 8}px` })
        mark.append(hold)
      }
      // The dot stands after the words' end, or at a section's top end.
      const end = section ? { x: right, y: top + 10 } : textEnd(elements[blocks.indexOf(change.blocks[0])]) ?? { x: right, y: top + 10 }
      const control = doc.createElement('button')
      control.type = 'button'
      control.className = 'aa-ai-revert'
      control.setAttribute('aria-label', section ? 'Revert what AI wrote here' : 'Revert what AI changed here')
      control.title = 'Revert'
      control.style.left = `${end.x}px`
      control.style.top = `${end.y}px`
      control.append(Object.assign(doc.createElement('span'), { className: 'aa-ai-dot' }), Object.assign(doc.createElement('span'), { className: 'aa-ai-label', textContent: 'Revert' }))
      // A press on it is its own: the caret and the focus stay in the writing.
      control.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation() })
      control.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation()
        options.revert(change)
        changes = changes.filter(each => each !== change)
        schedule()
      })
      mark.append(control)
      return mark
    }).filter((mark): mark is HTMLDivElement => !!mark)
    layer.replaceChildren(...drawn)
  }

  const schedule = () => { if (!frame) frame = view.requestAnimationFrame(draw) }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  resize?.observe(host)
  view.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule)

  return {
    set(next) { changes = next.filter(change => change.blocks.length); draw() },
    clear() { changes = []; draw() },
    get size() { return showing().length },
    draw: schedule,
    destroy() {
      if (frame) view.cancelAnimationFrame(frame)
      resize?.disconnect()
      view.removeEventListener('scroll', schedule, true)
      view.removeEventListener('resize', schedule)
      layer?.remove()
    },
  }
}

/** Where a block's words end on screen: after its last character, on its last line. */
function textEnd(element: HTMLElement | undefined): { x: number; y: number } | null {
  if (!element) return null
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if ((node.textContent ?? '').trim() && !parent?.closest('[data-hidden], .aa-atom')) last = node as Text
  }
  if (!last) return null
  const text = last.textContent ?? ''
  const end = text.trimEnd().length
  if (!end) return null
  const range = element.ownerDocument.createRange()
  range.setStart(last, end - 1); range.setEnd(last, end)
  const box = Array.from(range.getClientRects()).pop()
  return box ? { x: box.right, y: box.top + box.height / 2 } : null
}
