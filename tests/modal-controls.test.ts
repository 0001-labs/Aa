import { expect, test } from 'vitest'
import { createEditor } from '../src/editor'

test('editor controls stay inside their native dialog and are removed with the editor', () => {
  const dialog = document.createElement('dialog')
  const host = document.createElement('div')
  dialog.append(host); document.body.append(dialog)
  const editor = createEditor(host, { value: 'A link', toolbar: true })
  try {
    const controls = [...dialog.querySelectorAll('.aa-controls, .aa-drop-line')]
    expect(controls).toHaveLength(5)
    expect(document.body.querySelector(':scope > .aa-controls')).toBeNull()
    host.dispatchEvent(new CustomEvent('aa-link-request', { detail: { start: 0, end: 6, text: 'A link', url: 'https://example.com' } }))
    const form = dialog.querySelector<HTMLFormElement>('.aa-link-editor')!
    expect(form.hidden).toBe(false)
    expect(form.contains(document.activeElement)).toBe(true)
    editor.destroy()
    expect(dialog.querySelectorAll('.aa-controls, .aa-drop-line')).toHaveLength(0)
  } finally { editor.destroy(); dialog.remove() }
})

test('an editor outside a dialog keeps viewport controls in its document', () => {
  const host = document.createElement('div'); document.body.append(host)
  const editor = createEditor(host, { value: 'Example', toolbar: true })
  try { expect(document.body.querySelector(':scope > aa-toolbar')).not.toBeNull() }
  finally { editor.destroy(); host.remove() }
})
