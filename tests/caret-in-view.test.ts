import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { pointAt } from '../src/render'

// happy-dom lays nothing out, so each block is given a line, 20px high and 40px below the one before.
let editor: Editor, host: HTMLElement
const blocks = () => Array.from(host.querySelectorAll<HTMLElement>(':scope > .aa-block'))
function setup(value: string, height: number) {
  host = document.createElement('div')
  document.body.append(host)
  editor = createEditor(host, { value })
  vi.stubGlobal('innerHeight', height)
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList)
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect())
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = blocks().indexOf(this.closest('.aa-block') as HTMLElement)
    return index < 0 ? new DOMRect() : new DOMRect(0, 40 * index, 400, 20)
  })
  return vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
}
function caretAtEnd(index: number) {
  const element = blocks()[index]
  element.focus()
  const point = pointAt(element, editor.value.split('\n\n')[index].length)
  window.getSelection()!.setBaseAndExtent(point.node, point.offset, point.node, point.offset)
}
const enter = () => host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
afterEach(() => { editor?.destroy(); host?.remove(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('the caret stays in view', () => {
  it('keeps the page still when Enter makes a block that is in view', () => {
    const scrollBy = setup('one\n\ntwo\n\nthree', 200)
    caretAtEnd(1)
    enter()
    expect(editor.value).toBe('one\n\ntwo\n\n\n\nthree')
    expect(scrollBy).not.toHaveBeenCalled()
  })
  it('moves the page just far enough to show a block Enter makes below its edge', () => {
    const scrollBy = setup('one\n\ntwo\n\nthree', 100)
    caretAtEnd(2)
    enter()
    expect(blocks()).toHaveLength(4)
    // The new block stands at 120–140 in a window 100 high.
    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy).toHaveBeenCalledWith({ top: 40, left: 0, behavior: 'instant' })
  })
  it('brings back a caret scrolled out of view above', () => {
    const scrollBy = setup('one\n\ntwo\n\nthree', 100)
    caretAtEnd(0)
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      const index = blocks().indexOf(this.closest('.aa-block') as HTMLElement)
      return index < 0 ? new DOMRect() : new DOMRect(0, 40 * index - 500, 400, 20)
    })
    enter()
    expect(scrollBy).toHaveBeenCalledWith({ top: -460, left: 0, behavior: 'instant' })
  })
  it('leaves the page alone for a change from outside', () => {
    const scrollBy = setup('one\n\ntwo\n\nthree', 100)
    caretAtEnd(0)
    editor.value = 'one\n\ntwo\n\nthree\n\nfour\n\nfive'
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
