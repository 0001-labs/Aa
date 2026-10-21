import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'

let editor: Editor | undefined, host: HTMLElement | undefined
afterEach(() => {
  editor?.destroy(); host?.remove(); editor = undefined; host = undefined
  window.getSelection()?.removeAllRanges()
  delete (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint
  vi.useRealTimers()
})

/** Blocks stand a square high, two squares apart, block i from 40i to 40i + 20; a letter is 10 pixels wide. */
function setup(value: string) {
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value })
  place()
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: (x: number, y: number) => {
      const block = host!.children[Math.floor(y / 40)]
      if (!block || y % 40 >= 20) return null
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      const text = walker.nextNode()
      return text ? { offsetNode: text, offset: Math.min(Math.round(x / 10), text.textContent!.length) } : null
    },
  })
  return editor
}
/** Where each block stands, again after the editor draws blocks anew (an undo). */
function place() {
  Array.from(host!.children).forEach((block, index) => {
    Object.defineProperty(block, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 40 * index, 400, 20) })
  })
  Object.defineProperty(host!, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 400, 40 * host!.children.length) })
}
const block = (index: number) => host!.children[index] as HTMLElement
function pointer(type: string, target: EventTarget, x: number, y: number, init: PointerEventInit = {}) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, ...init })
  target.dispatchEvent(event)
  return event
}
/** A press in a block that moves along its line, as a person selecting words does, and where it goes next. */
function select(from: [number, number], ...path: [number, number][]) {
  place()
  pointer('pointerdown', block(Math.floor(from[1] / 40)), ...from)
  block(Math.floor(from[1] / 40)).focus()
  pointer('pointermove', window, from[0] + 20, from[1])
  for (const point of path) pointer('pointermove', window, ...point)
}
const lifted = () => Array.from(host!.children).filter(element => (element as HTMLElement).style.visibility === 'hidden').length

describe('selecting words across blocks with the mouse', () => {
  it('selects from the press to the pointer over every block between, as one selection', () => {
    const e = setup('One one\n\nTwo two\n\nThree three')
    select([20, 10], [60, 50], [30, 90])
    pointer('pointerup', window, 30, 90)
    // From "One one" at 2 to "Three three" at 3: 2 … 9 + 9 + 3.
    expect(e.selection()).toEqual({ start: 2, end: 21 })
    expect(lifted()).toBe(0)
  })

  it('follows the pointer back up, and back into the block it began in', () => {
    const e = setup('One one\n\nTwo two\n\nThree three')
    select([30, 10], [30, 90], [50, 50])
    expect(e.selection()).toEqual({ start: 3, end: 14 })
    pointer('pointermove', window, 10, 10)
    expect(e.selection()).toEqual({ start: 1, end: 3 })
    pointer('pointerup', window, 10, 10)
  })

  it('takes the gap between blocks for the nearer edge', () => {
    const e = setup('One one\n\nTwo two')
    select([20, 10], [200, 36])
    expect(e.selection()).toEqual({ start: 2, end: 9 })
    pointer('pointermove', window, 200, 24)
    // Nearer the first block, the selection stays in it, which is the browser's to draw.
    pointer('pointermove', window, 200, 70)
    expect(e.selection()).toEqual({ start: 2, end: 16 })
    pointer('pointerup', window, 200, 70)
  })

  it('types over the selection, as one change and one step of undo', () => {
    const e = setup('One one\n\nTwo two\n\nThree three')
    select([20, 10], [30, 90])
    pointer('pointerup', window, 30, 90)
    block(0).dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }))
    expect(e.value).toBe('OnXee three')
    e.undo()
    expect(e.value).toBe('One one\n\nTwo two\n\nThree three')
  })

  it('formats, deletes and cuts the whole selection', () => {
    const e = setup('One one\n\nTwo two')
    select([40, 10], [30, 50])
    pointer('pointerup', window, 30, 50)
    host!.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))
    expect(e.value).toBe('One **one**\n\n**Two** two')
    e.undo()
    select([40, 10], [30, 50])
    pointer('pointerup', window, 30, 50)
    block(0).dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }))
    expect(e.value).toBe('One  two')
    e.undo()
    select([40, 10], [30, 50])
    pointer('pointerup', window, 30, 50)
    const data = new DataTransfer()
    const cut = new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: data })
    block(0).dispatchEvent(cut)
    expect(data.getData('text/plain')).toBe('one\n\nTwo')
    expect(e.value).toBe('One  two')
  })

  it('reaches another block with Shift and a click', () => {
    const e = setup('One one\n\nTwo two\n\nThree three')
    e.selectRange(2)
    const press = pointer('pointerdown', block(2), 50, 90, { shiftKey: true })
    pointer('pointerup', window, 50, 90)
    expect(press.defaultPrevented).toBe(true)
    expect(e.selection()).toEqual({ start: 2, end: 23 })
  })

  it('leaves a press that first moves up or down to lift its block, and draws no selection', () => {
    const e = setup('One\n\nTwo\n\nThree')
    pointer('pointerdown', block(0), 10, 10)
    pointer('pointermove', window, 11, 17)
    expect(lifted()).toBe(1)
    pointer('pointermove', window, 11, 115)
    expect(e.selection()?.start).toBe(e.selection()?.end)
    pointer('pointerup', window, 11, 115)
    vi.runAllTimers()
    expect(e.value).toBe('Two\n\nThree\n\nOne')
  })

  it('leaves a press that stays in its block to the browser', () => {
    const e = setup('One one\n\nTwo two')
    e.selectRange(1)
    select([20, 10], [60, 12])
    expect(e.selection()).toEqual({ start: 1, end: 1 })
    pointer('pointerup', window, 60, 12)
  })

  it('stays out of a read-only editor, whose blocks the browser selects across itself', () => {
    const e = setup('One one\n\nTwo two')
    e.readOnly = true
    e.selectRange(1)
    select([20, 10], [30, 50])
    expect(e.selection()).toEqual({ start: 1, end: 1 })
  })
})
