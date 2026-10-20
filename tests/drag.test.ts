import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, type Editor, type EditorOptions } from '../src/editor'
import { HOLD, REST } from '../src/drag'

let editor: Editor | undefined, host: HTMLElement | undefined
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges(); vi.useRealTimers() })

/** Blocks stand a square high, two squares apart: block i from 40i to 40i + 20. */
function setup(value: string, options: EditorOptions = {}) {
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options })
  place()
  return editor
}
function place() {
  const blocks = Array.from(host!.children)
  blocks.forEach((block, index) => {
    Object.defineProperty(block, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 40 * index, 400, 20) })
  })
  Object.defineProperty(host!, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 400, 40 * blocks.length) })
}
const block = (index: number) => host!.children[index] as HTMLElement
function pointer(type: string, target: EventTarget, y: number, init: PointerEventInit = {}) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: y, ...init })
  target.dispatchEvent(event)
  return event
}
/** The blocks being carried: the one lifted into the overlay, hidden in its place, and the selected ones dimmed beside it. */
const lifted = () => Array.from(host!.children).filter(element => (element as HTMLElement).style.visibility === 'hidden' || element.hasAttribute('data-ghost')).map(element => Array.from(host!.children).indexOf(element))
/** The block lands, or goes home, once its drop has played. */
const settle = () => vi.runAllTimers()

describe('moving blocks without a handle, on the Drag library', () => {
  it('draws no grip and no plus beside a block, hovered or not', () => {
    setup('One\n\nTwo', { toolbar: true })
    block(0).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(document.querySelector('.aa-grip, [aria-label="Block menu"], [aria-label="Add a block"]')).toBeNull()
  })

  it('lifts a block after a still press and puts it where the press is let go', () => {
    const e = setup('One\n\nTwo\n\nThree')
    e.selectRange(1)
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD - 1)
    expect(lifted()).toEqual([])
    vi.advanceTimersByTime(1)
    expect(lifted()).toEqual([0])
    expect(host!.hasAttribute('data-dragging')).toBe(true)
    expect(document.querySelector('[data-drag-preview]')?.hasAttribute('data-lifted')).toBe(true)
    pointer('pointermove', window, 70)
    // The block it passes steps aside by the lifted block's whole size, rather than a line being drawn.
    expect(block(1).style.translate).toMatch(/^0(px)? -20px$/)
    pointer('pointermove', window, 115)
    pointer('pointerup', window, 115)
    settle()
    expect(e.value).toBe('Two\n\nThree\n\nOne')
    expect(block(2).hasAttribute('data-selected')).toBe(true)
    expect(host!.hasAttribute('data-dragging')).toBe(false)
    expect(lifted()).toEqual([])
    e.undo(); expect(e.value).toBe('One\n\nTwo\n\nThree')
  })

  it('leaves a press that first moves along the line to select words', () => {
    const e = setup('One\n\nTwo')
    pointer('pointerdown', block(0), 10)
    pointer('pointermove', window, 12, { clientX: 30 })
    vi.advanceTimersByTime(HOLD * 2)
    expect(lifted()).toEqual([])
    pointer('pointermove', window, 70, { clientX: 30 })
    pointer('pointerup', window, 70, { clientX: 30 })
    expect(e.value).toBe('One\n\nTwo')
  })

  it('lifts a block at once when the press first moves up or down, without waiting for the hold', () => {
    const e = setup('One\n\nTwo\n\nThree')
    pointer('pointerdown', block(0), 10)
    pointer('pointermove', window, 17, { clientX: 11 })
    expect(lifted()).toEqual([0])
    pointer('pointermove', window, 115)
    pointer('pointerup', window, 115)
    settle()
    expect(e.value).toBe('Two\n\nThree\n\nOne')
  })

  it('takes a block in hand when the pointer rests on it, and a press then lifts it whichever way it moves', () => {
    const e = setup('One\n\nTwo\n\nThree')
    pointer('pointermove', block(0), 10, { buttons: 0 })
    vi.advanceTimersByTime(REST - 1)
    expect(block(0).hasAttribute('data-grab')).toBe(false)
    pointer('pointermove', block(0), 12, { clientX: 13, buttons: 0 })
    vi.advanceTimersByTime(1)
    expect(block(0).hasAttribute('data-grab')).toBe(true)
    const press = pointer('pointerdown', block(0), 12, { clientX: 13 })
    expect(press.defaultPrevented).toBe(true)
    expect(block(0).hasAttribute('data-grab')).toBe(false)
    pointer('pointermove', window, 13, { clientX: 40 })
    expect(lifted()).toEqual([0])
    pointer('pointermove', window, 115, { clientX: 40 })
    pointer('pointerup', window, 115, { clientX: 40 })
    settle()
    expect(e.value).toBe('Two\n\nThree\n\nOne')
  })

  it('lets a block in hand go when the pointer moves on, leaves, or the person types', () => {
    setup('One\n\nTwo')
    const rest = (index: number, y: number) => { pointer('pointermove', block(index), y, { buttons: 0 }); vi.advanceTimersByTime(REST) }
    rest(0, 10)
    pointer('pointermove', block(0), 10, { clientX: 30, buttons: 0 })
    expect(block(0).hasAttribute('data-grab')).toBe(false)
    rest(0, 10)
    host!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    expect(block(0).hasAttribute('data-grab')).toBe(false)
    rest(1, 50)
    block(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(block(1).hasAttribute('data-grab')).toBe(false)
  })

  it('puts the caret back where the press put it when a lifted block is let go where it began', () => {
    const e = setup('One\n\nTwo')
    e.selectRange(6)
    pointer('pointerdown', block(1), 50)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([1])
    pointer('pointerup', window, 50)
    settle()
    expect(e.value).toBe('One\n\nTwo')
    expect(e.selection()).toEqual({ start: 6, end: 6 })
    expect(block(1).hasAttribute('data-selected')).toBe(false)
  })

  it('drags selected blocks at once, without a caret from the press', () => {
    const e = setup('One\n\nTwo\n\nThree')
    e.selectBlocks(0, 1)
    const down = pointer('pointerdown', block(0), 10)
    expect(down.defaultPrevented).toBe(true)
    pointer('pointermove', window, 20)
    expect(lifted()).toEqual([0, 1])
    pointer('pointermove', window, 115)
    pointer('pointerup', window, 115)
    settle()
    expect(e.value).toBe('Three\n\nOne\n\nTwo')
    expect([1, 2].map(index => block(index).hasAttribute('data-selected'))).toEqual([true, true])
  })

  it('takes a dragged block back with Escape', () => {
    const e = setup('One\n\nTwo')
    e.selectRange(1)
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD)
    pointer('pointermove', window, 75)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    block(0).dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    settle()
    expect(lifted()).toEqual([])
    pointer('pointerup', window, 75)
    expect(e.value).toBe('One\n\nTwo')
    expect(e.selection()).toEqual({ start: 1, end: 1 })
  })

  it('swallows the click that ends a drag', () => {
    setup('One\n\nTwo')
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD)
    pointer('pointermove', window, 75)
    pointer('pointerup', window, 75)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    block(0).dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('leaves touch, other buttons, read-only and menu-less editors to the browser', () => {
    let e = setup('One\n\nTwo')
    pointer('pointerdown', block(0), 10, { pointerType: 'touch' })
    pointer('pointerdown', block(0), 10, { pointerId: 2, button: 2 })
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
    e.readOnly = true
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
    e.destroy(); host!.remove()
    e = setup('One\n\nTwo', { menus: false })
    expect(host!.hasAttribute('data-movable')).toBe(false)
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
  })

  it('leaves a press on a diagram board, with a modifier key, or a double click to the page', () => {
    const e = setup('One\n\nTwo')
    const board = document.createElement('span'); board.setAttribute('data-aa-interactive', ''); block(0).append(board)
    pointer('pointerdown', board, 10)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
    pointer('pointerup', window, 10)
    pointer('pointerdown', block(0), 10, { shiftKey: true })
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
    pointer('pointerup', window, 10)
    pointer('pointerdown', block(1), 50)
    block(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 2 }))
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([])
    expect(e.value).toBe('One\n\nTwo')
  })

  it('makes each block an item of the engine, kept while blocks are drawn again', () => {
    const e = setup('One\n\nTwo')
    expect(block(0).getAttribute('data-drag-handle')).toBe('text')
    expect(block(0).hasAttribute('aria-describedby')).toBe(false)
    e.replace(0, 3, 'Uno')
    place()
    pointer('pointerdown', block(0), 10)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([0])
    pointer('pointerup', window, 10)
    settle()
  })

  it('lands files dropped from outside between blocks, the caret where they land', () => {
    const files = vi.fn()
    const e = setup('One\n\nTwo', { onFiles: files })
    // As a browser hands over files from outside: happy-dom's drag events carry neither the files nor the place.
    const data = { types: ['Files'], files: [new File(['x'], 'x.png', { type: 'image/png' })] }
    const drag = (type: string) => { const event = new DragEvent(type, { bubbles: true, cancelable: true }); Object.defineProperties(event, { dataTransfer: { value: data }, clientY: { value: 45 } }); block(1).dispatchEvent(event); return event }
    expect(drag('dragover').defaultPrevented).toBe(true)
    expect((document.querySelector('.aa-drop-line') as HTMLElement).hidden).toBe(false)
    drag('drop')
    expect(files).toHaveBeenCalledWith([expect.any(File)])
    expect(e.selection()).toEqual({ start: 5, end: 5 })
    expect((document.querySelector('.aa-drop-line') as HTMLElement).hidden).toBe(true)
  })

  it('moves several blocks to a place in one step', () => {
    const e = setup('A\n\nB\n\nC\n\nD')
    e.moveBlock(0, 2, 2)
    expect(e.value).toBe('C\n\nD\n\nA\n\nB')
    expect([2, 3].map(index => block(index).hasAttribute('data-selected'))).toEqual([true, true])
    e.moveBlock(3, 0, 2)
    expect(e.value).toBe('C\n\nD\n\nA\n\nB')
  })
})

describe('writing without a plus', () => {
  const key = (key: string, init: KeyboardEventInit = {}) => host!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  it('starts a new block with Enter at the end of one, and breaks the line with Shift-Enter', () => {
    const e = setup('# Title')
    e.selectRange(7); key('Enter')
    expect(Array.from(host!.children).map(element => (element as HTMLElement).dataset.kind)).toEqual(['heading', 'paragraph'])
    expect(e.selection()).toEqual({ start: 9, end: 9 })
    e.replace(9, 9, 'One'); key('Enter', { shiftKey: true })
    expect(e.value).toBe('# Title\n\nOne\n')
    expect(host!.children).toHaveLength(2)
  })

  it('says how to reach the styles in the empty block the caret is in', () => {
    const e = setup('One')
    e.selectRange(3); key('Enter')
    expect(block(1).dataset.placeholder).toBe('Type / for commands')
    e.replace(5, 5, 'T')
    expect(block(1).dataset.placeholder).toBeUndefined()
    e.destroy(); host!.remove()
    setup('One', { blockPlaceholder: '' }).selectRange(3); key('Enter')
    expect(block(1).dataset.placeholder).toBeUndefined()
    editor!.destroy(); host!.remove()
    setup('One', { menus: false }).selectRange(3); key('Enter')
    expect(block(1).dataset.placeholder).toBeUndefined()
  })

  it('keeps the product placeholder for an empty document', () => {
    const e = setup('', { placeholder: 'Write' })
    expect(block(0).dataset.placeholder).toBe('Write')
    e.selectRange(0); document.dispatchEvent(new Event('selectionchange'))
    expect(block(0).dataset.placeholder).toBe('Write')
  })
})
