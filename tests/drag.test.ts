import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, type Editor, type EditorOptions } from '../src/editor'
import { HOLD } from '../src/drag'

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
  Array.from(host!.children).forEach((block, index) => {
    Object.defineProperty(block, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 40 * index, 400, 20) })
  })
}
const block = (index: number) => host!.children[index] as HTMLElement
function pointer(type: string, target: EventTarget, y: number, init: PointerEventInit = {}) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: y, ...init })
  target.dispatchEvent(event)
  return event
}
const lifted = () => Array.from(host!.children).filter(element => element.hasAttribute('data-lifted')).map(element => Array.from(host!.children).indexOf(element))

describe('moving blocks without a handle', () => {
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
    pointer('pointermove', window, 70)
    expect((document.querySelector('.aa-drop-line') as HTMLElement).hidden).toBe(false)
    pointer('pointermove', window, 115)
    pointer('pointerup', window, 115)
    expect(e.value).toBe('Two\n\nThree\n\nOne')
    expect(block(2).hasAttribute('data-selected')).toBe(true)
    expect(host!.hasAttribute('data-dragging')).toBe(false)
    expect(lifted()).toEqual([])
    e.undo(); expect(e.value).toBe('One\n\nTwo\n\nThree')
  })

  it('leaves a press that moves before the hold to select words', () => {
    const e = setup('One\n\nTwo')
    pointer('pointerdown', block(0), 10)
    pointer('pointermove', window, 16)
    vi.advanceTimersByTime(HOLD * 2)
    expect(lifted()).toEqual([])
    pointer('pointerup', window, 70)
    expect(e.value).toBe('One\n\nTwo')
  })

  it('puts the caret back where the press put it when a lifted block is let go where it began', () => {
    const e = setup('One\n\nTwo')
    e.selectRange(6)
    pointer('pointerdown', block(1), 50)
    vi.advanceTimersByTime(HOLD)
    expect(lifted()).toEqual([1])
    pointer('pointerup', window, 50)
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
    expect(block(1).dataset.placeholder).toBe('Type / for styles')
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
