import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, type Editor, type EditorOptions } from '../src/editor'
import { AaEditorElement, defineAaEditor } from '../src/element'
import { PAUSE, corrections, correctedWords, diffWords, pair, wordAround, type CorrectionContext } from '../src/correction'
import { SHIMMER, lightness } from '../src/shimmer'
import { parseBlocks } from '../src/markdown'

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, correct: EditorOptions['correct'], options: EditorOptions = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, correct, ...options })
  return editor
}
const blockElements = () => Array.from(host!.children) as HTMLElement[]
/** The person types: the block's text becomes `text`, read back as the browser's input is, the caret at `caret` or the block's end. */
const type = (index: number, text: string, caret?: number) => {
  const element = blockElements()[index]
  element.focus()
  element.textContent = text
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  // The block is drawn again in a new element, which a browser gives the focus with the caret.
  if (caret !== undefined) editor!.selectRange(caret)
  else { const at = editor!.selection(); blockElements()[index].focus(); if (at) editor!.selectRange(at.start, at.end) }
}
const moved = () => document.dispatchEvent(new Event('selectionchange'))
const block = (source: string) => { const { start: _start, ...rest } = parseBlocks(source)[0]; return rest }
/** A correction call that answers when told to. */
function later() {
  const calls: { text: string; context: CorrectionContext; answer(text: string): void }[] = []
  const correct = vi.fn((text: string, context: CorrectionContext) => new Promise<string>(resolve => calls.push({ text, context, answer: resolve })))
  return { correct, calls }
}

afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges(); vi.useRealTimers() })

describe('what of an answer is taken', () => {
  it('compares word by word', () => {
    expect(diffWords('I liek cats', 'I like cats.')).toEqual([{ from: 2, to: 6, text: 'like' }, { from: 11, to: 11, text: '.' }])
    expect(diffWords('same', 'same')).toEqual([])
  })
  it('corrects words and never syntax, code or addresses', () => {
    const source = 'Teh **bold teh** `teh` [teh](https://teh.example) at https://teh.example/x'
    const answer = source.replace(/teh/gi, match => match === 'Teh' ? 'The' : 'the')
    const { edits } = corrections(block(source), answer)
    const text = edits.reduceRight((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), source)
    expect(text).toBe('The **bold the** `teh` [the](https://teh.example) at https://teh.example/x')
  })
  it('keeps a heading a heading and a bullet a bullet', () => {
    const fix = (source: string, answer: string) => { const { edits } = corrections(block(source), answer); return edits.reduceRight((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), source) }
    expect(fix('## teh title', '# The title')).toBe('## The title')
    expect(fix('- [ ] by teh way', '- [x] by the way')).toBe('- [ ] by the way')
    expect(fix('a **teh** b', 'a the b')).toBe('a **teh** b')
  })
  it('takes a sentence of small corrections whole', () => {
    const source = 'i dont no wat u mean'
    const { edits } = corrections(block(source), "I don't know what you mean")
    expect(edits.reduceRight((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), source)).toBe("I don't know what you mean")
  })
  it('names the whole words each correction changed, where they now stand', () => {
    expect(correctedWords('I liek cats', [{ from: 2, to: 6, text: 'like' }, { from: 11, to: 11, text: '.' }])).toEqual([[2, 6], [7, 12]])
    expect(correctedWords('the the cat', [{ from: 3, to: 7, text: '' }])).toEqual([[0, 3]])
    expect(correctedWords('a b', [{ from: 1, to: 2, text: '  ' }])).toEqual([[0, 4]])
  })
  it('takes nothing from an answer that rewrites rather than corrects', () => {
    expect(corrections(block('the cat sat on the mat'), 'a feline was resting upon a rug').edits).toEqual([])
  })
  it('holds back what touches the words being written, and what was taken back before', () => {
    const source = 'I liek cats'
    const held = corrections(block(source), 'I like cats.', { protect: wordAround(source, 11) })
    expect(held).toEqual({ edits: [{ from: 2, to: 6, text: 'like' }], partial: true })
    expect(corrections(block(source), 'I like cats', { rejected: new Set([pair('liek', 'like')]) }).edits).toEqual([])
  })
  it('leaves code, tables and dividers alone', () => {
    expect(corrections(block('```\nteh\n```'), '```\nthe\n```').edits).toEqual([])
    expect(corrections(block('| teh |\n| --- |\n| teh |'), '| the |\n| --- |\n| the |').edits).toEqual([])
  })
})

describe('correction while writing', () => {
  it('waits for typing to pause, then corrects finished words but not the one being written', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace('liek', 'like').replace(/cats$/, 'cats.'))
    const e = setup('', correct)
    type(0, 'I liek cats')
    await vi.advanceTimersByTimeAsync(PAUSE - 100)
    expect(correct).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(correct).toHaveBeenCalledTimes(1)
    expect(correct.mock.calls[0][0]).toBe('I liek cats')
    expect(e.value).toBe('I like cats')
    expect(e.selection()).toEqual({ start: 11, end: 11 })
  })
  it('shimmers the words it corrected once, then takes the shimmer away', async () => {
    vi.useFakeTimers()
    const rects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([{ left: 10, top: 20, width: 30, height: 20, right: 40, bottom: 40 }] as unknown as DOMRectList)
    const correct = vi.fn(async (text: string) => text.replace('liek', 'like'))
    setup('', correct)
    type(0, 'I liek cats')
    await vi.advanceTimersByTimeAsync(PAUSE)
    const pieces = document.querySelectorAll<HTMLElement>('.aa-shimmer')
    expect(pieces).toHaveLength(1)
    expect(pieces[0].getAttribute('aria-hidden')).toBe('true')
    expect(pieces[0].style.left).toBe('10px')
    expect(host!.querySelector('.aa-shimmer')).toBeNull()
    await vi.advanceTimersByTimeAsync(SHIMMER * 2)
    expect(document.querySelectorAll('.aa-shimmer')).toHaveLength(0)
    rects.mockRestore()
  })
  it('reads how light the letters are, to colour them on a light or a dark page', () => {
    expect(lightness('rgb(0, 0, 0)')).toBe(0)
    expect(lightness('rgba(255, 255, 255, 0.9)')).toBeCloseTo(1)
    expect(lightness('oklch(0.92 0.01 250)')).toBeCloseTo(0.92)
    expect(lightness('oklch(20% 0 0)')).toBeCloseTo(0.2)
    expect(lightness('color(srgb 1 1 1)')).toBeCloseTo(1)
    expect(lightness('canvastext')).toBeNull()
  })
  it('restarts the pause with each letter', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text)
    setup('', correct)
    type(0, 'I liek')
    await vi.advanceTimersByTimeAsync(PAUSE - 100)
    type(0, 'I liek c')
    await vi.advanceTimersByTimeAsync(PAUSE - 100)
    expect(correct).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(correct).toHaveBeenCalledTimes(1)
  })
  it('corrects a block whole as soon as the caret leaves it, the rest from what was answered', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace('liek', 'like').replace(/cats$/, 'cats.'))
    const e = setup('Start\n\nEnd', correct)
    type(0, 'I liek cats')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(e.value).toBe('I like cats\n\nEnd')
    e.selectRange(e.value.length); moved()
    await vi.advanceTimersByTimeAsync(0)
    expect(e.value).toBe('I like cats.\n\nEnd')
    expect(correct).toHaveBeenCalledTimes(1)
    expect(e.selection()).toEqual({ start: 17, end: 17 })
  })
  it('does not wait for the pause once the caret has left', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string, _context: CorrectionContext) => text.replace('Teh', 'The'))
    const e = setup('Start\n\nEnd', correct)
    type(0, 'Teh start')
    e.selectRange(e.value.length); moved()
    await vi.advanceTimersByTimeAsync(0)
    expect(correct).toHaveBeenCalledTimes(1)
    expect(correct.mock.calls[0][1]).toMatchObject({ kind: 'paragraph', before: '', after: 'End' })
    expect(e.value).toBe('The start\n\nEnd')
  })
  it('drops an answer for a block that changed after it was asked about', async () => {
    vi.useFakeTimers()
    const { correct, calls } = later()
    const e = setup('', correct)
    type(0, 'Teh cat')
    await vi.advanceTimersByTimeAsync(PAUSE)
    type(0, 'Teh cat sat')
    expect(calls[0].context.signal.aborted).toBe(true)
    calls[0].answer('The cat')
    await vi.advanceTimersByTimeAsync(0)
    expect(e.value).toBe('Teh cat sat')
  })
  it('never touches the text during a composition, and corrects once it ends', async () => {
    vi.useFakeTimers()
    const { correct, calls } = later()
    const e = setup('', correct)
    type(0, 'Teh cat ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    const element = blockElements()[0]
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    calls[0].answer('The cat')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(e.value).toBe('Teh cat ')
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    moved()
    await vi.advanceTimersByTimeAsync(0)
    expect(e.value).toBe('The cat ')
    expect(correct).toHaveBeenCalledTimes(1)
  })
  it('does not ask while composing', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text)
    setup('', correct)
    type(0, 'Teh')
    blockElements()[0].dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(PAUSE * 2)
    expect(correct).not.toHaveBeenCalled()
  })
  it('draws again only the corrected block, in its own element, the caret and focus kept', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace('Teh', 'The'))
    const e = setup('One\n\nTwo\n\nThree', correct)
    type(1, 'Teh two', 12)
    const [first, middle, last] = blockElements()
    expect(document.activeElement).toBe(middle)
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(e.value).toBe('One\n\nThe two\n\nThree')
    expect(blockElements()).toEqual([first, middle, last])
    expect(middle.textContent).toBe('The two')
    expect(document.activeElement).toBe(middle)
    expect(e.selection()).toEqual({ start: 12, end: 12 })
  })
  it('keeps the Markdown as written', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace(/teh/gi, 'the').replace(/\*\*/g, ''))
    const e = setup('Start\n\nEnd', correct)
    type(0, 'Teh **teh** `teh` and teh')
    e.selectRange(e.value.length); moved()
    await vi.advanceTimersByTimeAsync(0)
    expect(e.value).toBe('the **teh** `teh` and the\n\nEnd')
  })
  it('is one step to undo, which gives back what the person wrote and is not corrected again', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace('Ezo', 'Eco'))
    const onChange = vi.fn()
    const e = setup('', correct, { onChange })
    type(0, 'Ezo is ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(e.value).toBe('Eco is ')
    expect(onChange).toHaveBeenLastCalledWith('Eco is ')
    e.undo()
    expect(e.value).toBe('Ezo is ')
    e.redo()
    expect(e.value).toBe('Eco is ')
    e.undo()
    type(0, 'Ezo is fast')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(correct).toHaveBeenCalledTimes(2)
    expect(e.value).toBe('Ezo is fast')
    e.undo()
    expect(e.value).toBe('Ezo is ')
  })
  it('asks only about words the person typed', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text)
    const e = setup('Teh old words\n\n```\nteh\n```', correct)
    e.value = 'Teh new words\n\n```\nteh\n```'
    await vi.advanceTimersByTimeAsync(PAUSE)
    type(1, '```\nteh code\n```')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(correct).not.toHaveBeenCalled()
  })
  it('can be turned off, and is off without a correct call', async () => {
    vi.useFakeTimers()
    const correct = vi.fn(async (text: string) => text.replace('Teh', 'The'))
    const e = setup('', correct, { correcting: false })
    expect(e.correcting).toBe(false)
    expect(host!.hasAttribute('spellcheck')).toBe(false)
    type(0, 'Teh cat ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(correct).not.toHaveBeenCalled()
    e.correcting = true
    expect(host!.getAttribute('spellcheck')).toBe('false')
    type(0, 'Teh cat sat')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(e.value).toBe('The cat sat')
    e.correcting = false
    expect(host!.hasAttribute('spellcheck')).toBe(false)
    const plain = createEditor(document.createElement('div'))
    expect(plain.correcting).toBe(false)
    plain.correcting = true
    expect(plain.correcting).toBe(false)
    plain.destroy()
  })
  it('is turned off on the element with correct="off"', () => {
    defineAaEditor()
    const element = document.createElement('aa-editor') as AaEditorElement
    element.options = { correct: async text => text }
    element.setAttribute('correct', 'off')
    document.body.append(element)
    expect(element.editor!.correcting).toBe(false)
    element.removeAttribute('correct')
    expect(element.editor!.correcting).toBe(true)
    element.remove()
  })
})
