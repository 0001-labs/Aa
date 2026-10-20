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

/**
 * One change an answer made: the blocks it put in, the blocks they took the
 * place of, and where in each block put in its words are new (in the block's
 * own offsets); `box` when only a box was ticked or unticked.
 */
export type AiChange = { blocks: Block[]; before: Block[]; words: [number, number][][]; box?: boolean }

/** The words of `after` that are not in `before`, as ranges into `after`: whole words, the space between two changed words with them. */
export function changedWords(before: string, after: string): [number, number][] {
  const split = (text: string) => text.match(/\s+|[^\s]+/g) ?? []
  const a = split(before), b = split(after)
  if (a.length * b.length > 60000) return after.trim() ? [[0, after.length]] : []
  // The longest run the two share, word by word; what is left of `after` is new.
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const fresh = new Array<boolean>(b.length).fill(false)
  let i = 0, j = 0
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) { i++; j++ }
    else if (i < a.length && table[i + 1][j] >= table[i][j + 1]) i++
    else { fresh[j] = true; j++ }
  }
  const ranges: [number, number][] = []
  let at = 0
  b.forEach((token, index) => {
    const start = at
    at += token.length
    if (!fresh[index] || !token.trim()) return
    // A changed word right after another, a space between them, joins its run.
    const joins = ranges.length && (fresh[index - 1] || (index > 1 && !b[index - 1].trim() && fresh[index - 2]))
    if (joins) ranges[ranges.length - 1][1] = at
    else ranges.push([start, at])
  })
  return ranges
}

/** Whether two blocks differ only in their box being ticked or unticked. */
export function onlyBox(before: string, after: string): boolean {
  const box = /^(\s*[-*+][ \t]+)\[([ xX])\]/
  const a = box.exec(before), b = box.exec(after)
  return !!a && !!b && a[2].toLowerCase() !== b[2].toLowerCase() && before.slice(a[0].length) === after.slice(b[0].length)
}

export type Marks = {
  /** Mark these changes, in place of any marked before. */
  set(changes: AiChange[]): void
  /** Put the marks away, the blue fading back into the ink. */
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
  /** The changes still marked, each time they are drawn, so their words can be coloured. */
  shown?: (changes: readonly AiChange[]) => void
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
    options.shown?.(changes)
    const elements = options.elements(), blocks = options.blocks()
    // A ticked or unticked box wears the blue too.
    for (const element of elements) element.toggleAttribute('data-ai-box', changes.some(change => change.box && change.blocks.some(block => elements[blocks.indexOf(block)] === element)))
    if (!changes.length) { layer?.remove(); layer = null; return }
    if (!layer) {
      const made = doc.createElement('div')
      made.className = 'aa-ai-marks'
      ;(options.root ?? host.closest('dialog') ?? doc.body).append(made)
      layer = made
    }
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

  /** The blue fades back into the ink, then the marks go. */
  const clear = () => {
    if (!changes.length) return
    host.setAttribute('data-ai-fading', '')
    layer?.setAttribute('data-fading', '')
    const reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => { host.removeAttribute('data-ai-fading'); changes = []; draw() }, reduced ? 0 : 400)
  }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  resize?.observe(host)
  view.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule)
  view.visualViewport?.addEventListener('resize', schedule)

  return {
    set(next) { changes = next.filter(change => change.blocks.length); draw() },
    clear,
    get size() { return showing().length },
    draw: schedule,
    destroy() {
      if (frame) view.cancelAnimationFrame(frame)
      resize?.disconnect()
      view.removeEventListener('scroll', schedule, true)
      view.removeEventListener('resize', schedule)
      view.visualViewport?.removeEventListener('resize', schedule)
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
