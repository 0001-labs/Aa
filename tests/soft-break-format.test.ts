import { afterEach, expect, test } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { readBlock } from '../src/render'
let editor: Editor | undefined
afterEach(() => { editor?.destroy(); document.body.replaceChildren(); window.getSelection()?.removeAllRanges() })
const source = '**Link er bygget til at sende briefs og aflevere deliverables til kunder.\n**'
test('loads, edits, pastes and reopens soft-break emphasis with source and history intact', () => {
  const host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value: source })
  expect(host.querySelector('.aa-b')?.textContent).toContain('Link er bygget')
  expect(host.querySelectorAll('.aa-syntax[data-hidden]')).toHaveLength(2)
  expect(readBlock(host.querySelector('.aa-block')!)).toBe(source)
  editor.selectRange(2,6)
  const clipboard = new DataTransfer(); clipboard.setData('text/plain','Workspace')
  host.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,cancelable:true}))
  expect(editor.value).toBe(source.replace('Link','Workspace'))
  editor.undo(); expect(editor.value).toBe(source)
  editor.redo(); const saved = editor.value
  editor.destroy(); editor = createEditor(host,{value:saved})
  expect(host.querySelector('.aa-b')?.textContent).toContain('Workspace')
  expect(editor.value).toBe(saved)
})
test('keeps code literal and HTML inert beside multiline formatted links', () => {
  const value='**[Safe](https://example.org/)\ntext**\n\n`**literal**`\n\n<img src=x onerror=alert(1)>'
  const host=document.createElement('div');document.body.append(host)
  editor=createEditor(host,{value})
  expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.org/')
  expect(host.querySelector('img,script')).toBeNull()
  expect(host.querySelector('.aa-c')?.textContent).toBe('**literal**')
  expect(editor.value).toBe(value)
})
