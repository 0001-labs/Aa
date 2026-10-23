import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type Editor } from '../src/editor'
import { changeCommentSource, exportMarkdown, readCommentSource } from '../src/comments-markdown'
const active: Editor[] = []
afterEach(() => { active.splice(0).forEach(e => e.destroy()); document.body.replaceChildren() })
const seed = () => changeCommentSource('Ship the new editor on Friday.', 'Jo4712', { type: 'add', from: 5, to: 19, body: 'Keyboard first' })
const mount = (value = seed()) => {
  const host = document.createElement('div'); document.body.append(host)
  const changes: string[] = []
  const editor = createEditor(host, { value, sourceComments: { me: { id: 'Jo4712', name: 'Joachim' } }, onChange: s => changes.push(s), menus: false })
  active.push(editor); return { editor, host, changes }
}
describe('source comments in the editor', () => {
  it('hides storage, renders the same comment UI, and keeps full source offsets', () => {
    const { editor, host } = mount()
    expect(host.textContent).toContain('Ship the new editor')
    expect(host.textContent).not.toContain('aa-comments')
    expect(host.textContent).not.toContain('aa:start')
    expect(editor.value).toContain('aa-comments v1')
    expect(editor.exportMarkdown()).toBe('Ship the new editor on Friday.')
    expect(editor.comments?.threads).toHaveLength(1)
    const range = editor.find('the new editor')[0]
    expect(editor.value.slice(range.start, range.end)).toBe('the new editor')
    editor.comments!.open(editor.comments!.threads[0].id)
    expect(document.body.textContent).toContain('Keyboard first')
    expect(document.body.textContent).toContain('Joachim')
  })
  it('keeps anchors and source in undo/redo when words change', () => {
    const { editor, changes } = mount(), original = editor.value
    editor.replace(0, 0, 'Now ')
    expect(editor.exportMarkdown()).toBe('Now Ship the new editor on Friday.')
    expect(readCommentSource(editor.value).anchors[editor.comments!.threads[0].id]).toEqual({ from: 9, to: 23 })
    expect(changes.at(-1)).toBe(editor.value)
    expect(editor.undo()).toBe(true); expect(editor.value).toBe(original)
    expect(editor.redo()).toBe(true); expect(editor.exportMarkdown()).toContain('Now Ship')
  })
  it('orphaned comments stay orphaned even with duplicate text; undo restores their anchor', () => {
    const value = changeCommentSource('same and same', 'Jo4712', { type: 'add', from: 0, to: 4, body: 'First only' })
    const { editor } = mount(value)
    const r = editor.find('same')[0]; editor.replace(r.start, r.end, '')
    expect(editor.comments!.threads[0].orphaned).toBe(true)
    expect(readCommentSource(editor.value).anchors).toEqual({})
    editor.undo(); expect(editor.comments!.threads[0].orphaned).toBe(false)
  })
  it('reloads CLI replies and clears stale local undo instead of removing another writer’s reply', () => {
    const { editor } = mount()
    editor.replace(0, 0, 'Now ')
    const thread = editor.comments!.threads[0].id
    editor.value = changeCommentSource(editor.value, 'An1234', { type: 'reply', thread, body: 'Tested' })
    expect(editor.comments!.threads[0].comments).toHaveLength(2)
    expect(editor.undo()).toBe(false)
    expect(editor.value).toContain('Tested')
  })
  it('writes comments and replies from the UI, with comment-only undo and clean downloads', async () => {
    const { editor } = mount('Write these words.')
    editor.selectRange(6, 17)
    expect(editor.comments!.start()).toBe(true)
    const send = async (body: string) => {
      const field = document.querySelector<HTMLTextAreaElement>('.aa-comments textarea')!
      expect(field).not.toBeNull()
      field.value = body; field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    await send('Check this.')
    expect(readCommentSource(editor.value).threads[0].comments[0].body).toBe('Check this.')
    expect(editor.exportMarkdown()).toBe('Write these words.')
    await send('And this.')
    expect(readCommentSource(editor.value).threads[0].comments).toHaveLength(2)
    editor.undo()
    expect(readCommentSource(editor.value).threads[0].comments).toHaveLength(1)
    editor.redo()
    expect(readCommentSource(editor.value).threads[0].comments).toHaveLength(2)
  })
  it('automatically reads embedded source without a writing identity', () => {
    const host = document.createElement('div'); document.body.append(host)
    const e = createEditor(host, { value: seed(), menus: false }); active.push(e)
    expect(e.comments!.threads).toHaveLength(1)
    expect(e.comments!.start()).toBe(false)
    expect(exportMarkdown(e.value)).toBe('Ship the new editor on Friday.')
  })
})
