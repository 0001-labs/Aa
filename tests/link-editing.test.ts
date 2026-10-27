import { afterEach, expect, test } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
let editor: Editor | undefined
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
afterEach(() => { editor?.destroy(); editor = undefined; document.body.replaceChildren(); window.getSelection()?.removeAllRanges() })
function setup(value: string) {
 const host = document.createElement('div'); document.body.append(host)
 editor = createEditor(host, { value, toolbar: true }); return { host, editor }
}
test.each(['plain', 'bold'])('an empty link address removes the link but keeps its %s label and undo', mode => {
 const label = mode === 'plain' ? 'words' : '**words**'
 const value = `Before [${label}](https://example.com) after`
 const { host, editor } = setup(value)
 editor.selectRange(10)
 host.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...mod, bubbles: true, cancelable: true }))
 const form = document.querySelector<HTMLFormElement>('.aa-link-editor')!
 const field = form.querySelector('input')!
 expect(field.value).toBe('https://example.com')
 field.value = ''; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
 expect(editor.value).toBe(`Before ${label} after`); expect(form.hidden).toBe(true)
 editor.undo(); expect(editor.value).toBe(value)
})
test('an empty address for words without a link makes no edit', () => {
 const { host, editor } = setup('Before words after'); editor.selectRange(7, 12)
 host.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...mod, bubbles: true, cancelable: true }))
 document.querySelector('.aa-link-editor')!.dispatchEvent(new Event('submit', { cancelable: true }))
 expect(editor.value).toBe('Before words after')
})
test('plain paste over all linked words removes the old address as one undo step', () => {
 const value = 'Before [words](https://old.example) after'
 const { host, editor } = setup(value); editor.selectRange(8, 13)
 host.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ...mod, shiftKey: true, bubbles: true, cancelable: true }))
 const clipboard = new DataTransfer(); clipboard.setData('text/plain', 'https://new.example/a(b)')
 host.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, cancelable: true }))
 expect(editor.value).toBe('Before https://new.example/a(b) after')
 editor.undo(); expect(editor.value).toBe(value)
})
