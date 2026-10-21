import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { pointAt } from '../src/render'

let editor: Editor, host: HTMLElement
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
function setup(value = 'one\n\ntwo\n\nthree') {
  host = document.createElement('div')
  document.body.append(host)
  editor = createEditor(host, { value })
  caret(1, 1)
}
function caret(index: number, offset: number) {
  const point = pointAt(host.children[index] as HTMLElement, offset)
  window.getSelection()!.setBaseAndExtent(point.node, point.offset, point.node, point.offset)
}
function key(key: string, modifiers: KeyboardEventInit = {}) {
  host.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }))
}
afterEach(() => { editor?.destroy(); host?.remove(); window.getSelection()?.removeAllRanges() })

describe('block keyboard commands', () => {
  it('extends directly from the caret, and handles the digit code with Option pressed', () => {
    setup()
    key('ArrowUp', { shiftKey: true })
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(2)
    key('£', { ...mod, altKey: true, code: 'Digit3' })
    expect(editor.value).toBe('### one\n\n### two\n\nthree')
  })
  it('selects, extends, duplicates, moves and deletes blocks with undo', () => {
    setup()
    key('Escape')
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(1)
    key('ArrowDown', { shiftKey: true })
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(2)
    key('d', mod)
    expect(editor.value).toBe('one\n\ntwo\n\nthree\n\ntwo\n\nthree')
    key('ArrowUp', { ...mod, shiftKey: true })
    expect(editor.value).toBe('one\n\ntwo\n\ntwo\n\nthree\n\nthree')
    key('Backspace')
    expect(editor.value).toBe('one\n\ntwo\n\nthree')
    editor.undo()
    expect(editor.value).toBe('one\n\ntwo\n\ntwo\n\nthree\n\nthree')
  })
  it('selects the block’s words then all of the writing, never the blocks, leaving an editable empty block on deletion', () => {
    setup()
    key('a', mod)
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(0)
    expect(editor.selection()).toEqual({ start: 5, end: 8 })
    key('a', mod)
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(0)
    expect(editor.selection()).toEqual({ start: 0, end: 15 })
    key('Escape')
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(1)
    key('a', mod)
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(0)
    expect(editor.selection()).toEqual({ start: 0, end: 15 })
    host.children[0].dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true }))
    expect(editor.value).toBe('')
    expect(host.children).toHaveLength(1)
  })
  it('turns into a box and ticks it; read-only and composition prevent edits', () => {
    setup()
    key('4', { ...mod, altKey: true })
    expect(editor.value).toBe('one\n\n- [ ] two\n\nthree')
    key('Enter', mod)
    expect(editor.value).toContain('- [x] two')
    key('d', { ...mod, isComposing: true })
    editor.readOnly = true
    key('d', mod)
    expect(host.children).toHaveLength(3)
  })
  it('pastes a URL over words as a link, while Shift-paste inserts its plain text', () => {
    setup()
    key('Escape')
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'https://example.com/a(b)')
    host.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, cancelable: true }))
    expect(editor.value).toContain('[two](https://example.com/a%28b%29)')
    editor.undo()
    caret(1, 0)
    key('Escape')
    key('v', { ...mod, shiftKey: true })
    host.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, cancelable: true }))
    expect(editor.value).toBe('one\n\nhttps://example.com/a(b)\n\nthree')
  })
  it('turns a typed [] prefix into an unchecked box', () => {
    setup('one\n\ntwo')
    const block = host.children[1] as HTMLElement
    block.textContent = '[] two'
    caret(1, 3)
    block.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    expect(editor.value).toBe('one\n\n- [ ] two')
    expect(editor.selection()).toEqual({ start: 11, end: 11 })
  })
})
