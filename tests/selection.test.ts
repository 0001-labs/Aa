import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { paintSelection, selectionPath } from '../src/selection'

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })

describe('selection silhouette', () => {
  it('rounds a single line by two pixels', () => {
    expect(selectionPath([rect(0, 0, 100, 20)], 20, 2)).toBe('M0 2 Q0 0 2 0 L98 0 Q100 0 100 2 L100 18 Q100 20 98 20 L2 20 Q0 20 0 18 Z')
  })
  it('merges overlapping inline fragments without seams', () => {
    const joined = selectionPath([rect(0, 0, 50, 20), rect(45, 2, 70, 18), rect(70, 0, 100, 20)], 20, 2)
    expect(joined).toBe(selectionPath([rect(0, 0, 100, 20)], 20, 2))
  })
  it('joins wrapped rows and rounds the inset at a short last line', () => {
    const path = selectionPath([rect(0, 2, 100, 18), rect(0, 22, 60, 38)], 20, 2)!
    expect(path.match(/M/g)).toHaveLength(1)
    expect(path).toContain('L62 20 Q60 20 60 22')
    expect(path).not.toMatch(/NaN|Infinity/)
  })
  it('keeps genuinely separated lines apart', () => {
    expect(selectionPath([rect(0, 0, 100, 20), rect(0, 60, 60, 80)], 20, 2)!.match(/M/g)).toHaveLength(2)
  })
  it('keeps disjoint bidirectional fragments native instead of filling unselected text', () => {
    expect(selectionPath([rect(0, 0, 20, 20), rect(40, 0, 60, 20)], 20, 2)).toBeNull()
  })
  it('clamps rounding on narrow selections and ignores empty rectangles', () => {
    expect(selectionPath([rect(0, 0, 1, 20), rect(0, 0, 0, 20)], 20, 2)).not.toMatch(/NaN|Infinity/)
    expect(selectionPath([], 20, 2)).toBe('')
  })
})

afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers() })

it('paints without changing selected text, document nodes or offsets, and cleans up', () => {
  vi.useFakeTimers()
  const host = document.createElement('div'), block = document.createElement('div')
  block.className = 'aa-block'; block.style.lineHeight = '20px'; block.textContent = 'Selected words'
  host.append(block); document.body.append(host)
  const text = block.firstChild!
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 8)
  const selection = window.getSelection()!; selection.addRange(range)
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 60, 20)] as unknown as DOMRectList)
  const stop = paintSelection(host)
  document.dispatchEvent(new Event('selectionchange')); vi.advanceTimersByTime(30)
  expect(block.hasAttribute('data-aa-selection')).toBe(true)
  expect(block.childNodes).toHaveLength(1)
  expect(block.firstChild).toBe(text)
  expect(selection.toString()).toBe('Selected')
  expect(selection.anchorOffset).toBe(0); expect(selection.focusOffset).toBe(8)
  selection.collapse(text, 8)
  document.dispatchEvent(new Event('selectionchange')); vi.advanceTimersByTime(30)
  expect(block.hasAttribute('data-aa-selection')).toBe(false)
  stop()
  expect(block.style.getPropertyValue('--aa-selection-mask')).toBe('')
})
