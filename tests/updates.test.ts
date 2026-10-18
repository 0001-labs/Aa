import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type Editor } from '../src/editor'

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options })
  return editor
}
const blockElements = () => Array.from(host!.children) as HTMLElement[]
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges() })

describe('a value set from outside', () => {
  it('draws again only the blocks that changed and keeps the caret', () => {
    const e = setup('one\n\ntwo\n\nthree')
    const [first, , last] = blockElements()
    e.selectRange(e.value.length)
    e.value = 'one\n\ntwo, changed\n\nthree'
    const [nextFirst, middle, nextLast] = blockElements()
    expect(nextFirst).toBe(first)
    expect(nextLast).toBe(last)
    expect(middle.textContent).toBe('two, changed')
    expect(e.selection()).toEqual({ start: e.value.length, end: e.value.length })
  })
  it('moves the caret with the blocks after a block added before it', () => {
    const e = setup('one\n\ntwo')
    e.selectRange(7)
    e.value = 'zero\n\none\n\ntwo'
    expect(e.selection()).toEqual({ start: 13, end: 13 })
  })
})

describe('decorations', () => {
  it('draw again only the blocks whose decorations changed', () => {
    const e = setup('one\n\ntwo\n\nthree')
    const before = blockElements().map(element => element.firstChild)
    e.decorate([{ from: 5, to: 5, className: 'aa-peer-selection', label: 'Peer' }])
    const after = blockElements().map(element => element.firstChild)
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(after[2]).toBe(before[2])
    expect(blockElements()[1].querySelector('.aa-peer-caret')).not.toBeNull()
  })
  it('wait for a composition to end before drawing', () => {
    const e = setup('one')
    const block = blockElements()[0]
    block.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    e.decorate([{ from: 1, to: 1, className: 'aa-peer-selection', label: 'Peer' }])
    expect(block.querySelector('.aa-peer-caret')).toBeNull()
    block.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(blockElements()[0].querySelector('.aa-peer-caret')).not.toBeNull()
  })
})

describe('undo', () => {
  it('puts the caret back in the block the change was in', () => {
    const e = setup('one\n\ntwo')
    const [first, second] = blockElements()
    e.selectRange(3); first.textContent = 'one!'; first.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    e.selectRange(e.value.length); second.textContent = 'two?'; second.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    expect(e.value).toBe('one!\n\ntwo?')
    e.undo()
    expect(e.value).toBe('one!\n\ntwo')
    expect(e.selection()).toEqual({ start: 9, end: 9 })
  })
})

describe('what the editor says about itself', () => {
  it('tells a screen reader whether it is read only and what its placeholder is', () => {
    const e = setup('', { placeholder: 'Write' })
    expect(host!.getAttribute('aria-readonly')).toBe('false')
    expect(host!.getAttribute('aria-placeholder')).toBe('Write')
    e.readOnly = true; e.placeholder = ''
    expect(host!.getAttribute('aria-readonly')).toBe('true')
    expect(host!.hasAttribute('aria-placeholder')).toBe(false)
  })
  it('keeps spelling marks and phone corrections out of code', () => {
    setup('Words\n\n```\nconst a = 1\n```\n\nSome `code` here')
    const [words, code, inline] = blockElements()
    expect(words.hasAttribute('spellcheck')).toBe(false)
    expect(code.getAttribute('spellcheck')).toBe('false')
    expect(code.getAttribute('autocapitalize')).toBe('off')
    expect(code.getAttribute('autocorrect')).toBe('off')
    expect((inline.querySelector('.aa-c') as HTMLElement).spellcheck).toBe(false)
  })
})
