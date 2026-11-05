/**
 * A table's columns sized by hand, as Design system 1's tables are: on its
 * `.ds-table-column-resize` handle the edge follows the pointer exactly and
 * settles on whole squares when let go; arrows move a square, Shift five, and
 * Escape takes a drag back. The width is the table's own Markdown, its dashes
 * counted in squares (`tableWidths`), so nothing is kept beside the document.
 */

/** The narrowest a column is set: three dashes are every table's default, and mean no width at all. */
const NARROWEST = 4
const SETTLE = 140

type Options = {
  readOnly(): boolean
  /** One square in pixels where a block is drawn. */
  square(block: HTMLElement): number
  /** The columns' widths in squares, written as one step to undo; gives back the block drawn anew. */
  write(block: HTMLElement, widths: readonly number[]): HTMLElement | null
}

export function resizeColumns(host: HTMLElement, options: Options): () => void {
  const handleOf = (target: EventTarget | null) => (target as Element | null)?.closest?.<HTMLElement>('.ds-table-column-resize') ?? null
  const blockOf = (handle: HTMLElement) => handle.closest<HTMLElement>('.aa-block')!
  const handlesIn = (block: HTMLElement) => Array.from(block.querySelectorAll<HTMLElement>('.ds-table-column-resize'))
  const measured = (block: HTMLElement) => handlesIn(block).map(handle => handle.parentElement!.getBoundingClientRect().width)
  const apply = (block: HTMLElement, widths: readonly number[]) => block.style.setProperty('--aa-table-columns', widths.map(width => `${width}px`).join(' '))
  const inSquares = (widths: readonly number[], unit: number) => widths.map(width => Math.max(NARROWEST, Math.round(width / unit)))
  /** A handle's line reaches the table's foot. */
  const reach = (handle: HTMLElement) => handle.style.setProperty('--ds-table-resize-height', `${blockOf(handle).getBoundingClientRect().height}px`)

  let drag: { handle: HTMLElement; block: HTMLElement; pointer: number; index: number; start: number; before: number[]; written: string; widths: number[]; unit: number; rtl: boolean } | null = null

  const put = (block: HTMLElement, widths: readonly number[], index: number) => {
    const drawn = options.write(block, widths)
    const handle = drawn && handlesIn(drawn)[index]
    if (handle) { reach(handle); handle.focus({ preventScroll: true }) }
  }
  const stop = () => {
    if (!drag) return
    const { handle } = drag
    delete handle.dataset.resizing
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', cancel)
    drag = null
  }
  const move = (event: PointerEvent) => {
    if (!drag) return
    const moved = (event.clientX - drag.start) * (drag.rtl ? -1 : 1)
    drag.widths = drag.before.map((width, at) => at === drag!.index ? Math.max(NARROWEST * drag!.unit, width + moved) : width)
    apply(drag.block, drag.widths)
  }
  const cancel = () => {
    if (!drag) return
    const { block, written } = drag
    if (written) block.style.setProperty('--aa-table-columns', written); else block.style.removeProperty('--aa-table-columns')
    stop()
  }
  const up = () => {
    if (!drag) return
    const { block, widths, unit, index } = drag
    stop()
    const squares = inSquares(widths, unit)
    const settle = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    block.toggleAttribute('data-settling', settle)
    void block.getBoundingClientRect()
    apply(block, squares.map(width => width * unit))
    const write = () => { block.removeAttribute('data-settling'); put(block, squares, index) }
    if (settle) setTimeout(write, SETTLE); else write()
  }
  const down = (event: PointerEvent) => {
    const handle = handleOf(event.target)
    if (!handle || event.button !== 0 || options.readOnly()) return
    event.preventDefault()
    const block = blockOf(handle)
    drag = {
      handle, block, pointer: event.pointerId, index: handlesIn(block).indexOf(handle), start: event.clientX, before: measured(block), widths: measured(block),
      written: block.style.getPropertyValue('--aa-table-columns'), unit: options.square(block), rtl: getComputedStyle(block).direction === 'rtl',
    }
    handle.dataset.resizing = ''
    handle.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', cancel)
  }
  const key = (event: KeyboardEvent) => {
    const handle = handleOf(event.target)
    if (!handle) return
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); cancel(); return }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault(); event.stopPropagation()
    if (options.readOnly() || drag) return
    const block = blockOf(handle), unit = options.square(block), index = handlesIn(block).indexOf(handle)
    const rtl = getComputedStyle(block).direction === 'rtl'
    const squares = inSquares(measured(block), unit)
    squares[index] = Math.max(NARROWEST, squares[index] + (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1) * (event.shiftKey ? 5 : 1))
    put(block, squares, index)
  }
  const near = (event: Event) => { const handle = handleOf(event.target); if (handle) reach(handle) }
  host.addEventListener('pointerdown', down, true)
  host.addEventListener('keydown', key, true)
  host.addEventListener('pointerover', near)
  host.addEventListener('focusin', near)
  return () => {
    cancel()
    host.removeEventListener('pointerdown', down, true)
    host.removeEventListener('keydown', key, true)
    host.removeEventListener('pointerover', near)
    host.removeEventListener('focusin', near)
  }
}
