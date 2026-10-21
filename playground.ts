import './src/aa.css'
import { startScaling } from './src/ds1/0-face/scaling'
import { createEditor, defineAaEditor, imageAtom, memoryCommentStore, type AaEditorElement } from './src/index'
import { diagramAtom } from './src/diagram'
import { correct, prompt } from './playground-ai'
import { SAMPLE } from './playground-sample'

// Design system 1's scale goes on before anything is drawn, so a phone's first paint is already to scale.
startScaling({ snap: 'layout' })


/**
 * Comments, kept here in the tab as a product's backend would keep them: two
 * people have already commented on the sample, one thread resolved; you write
 * as Joachim. Select words and press Comment in the toolbar (or ⌘⇧M) to start a
 * thread, press marked words to open theirs, @ in a reply names someone.
 */
const joachim = { id: 'joachim', name: 'Joachim' }, ann = { id: 'ann', name: 'Ann Lund' }, bo = { id: 'bo', name: 'Bo Ek' }
const anchor = (text: string, quote: string) => { const from = text.indexOf(quote); return { from, to: from + quote.length, quote } }
const hour = 3_600_000, now = Date.now()
const comments = memoryCommentStore({
  me: joachim, people: [joachim, ann, bo], delay: 150,
  threads: [
    { id: 'blocks', ...anchor(SAMPLE, 'Each paragraph is a block of its own'), comments: [
      { id: 'b1', author: ann, body: 'Should this say what a block is for a reader who has never used Notion?', createdAt: now - 26 * hour },
      { id: 'b2', author: bo, body: '@Ann Lund I would keep it: the next sentence shows it.', createdAt: now - 3 * hour, mentions: [ann] },
    ], createdAt: now - 26 * hour, updatedAt: now - 3 * hour },
    { id: 'drag', ...anchor(SAMPLE, 'Drag a block up or down to move it'), comments: [
      { id: 'd1', author: bo, body: 'Say that a still press lifts it first.', createdAt: now - 50 * hour },
    ], createdAt: now - 50 * hour, updatedAt: now - 20 * hour, resolvedAt: now - 20 * hour, resolvedBy: joachim },
  ],
})

const editor = document.getElementById('editor') as AaEditorElement
editor.options = {
  comments,
  atoms: [imageAtom, diagramAtom],
  correct,
  prompt,
  drawEquation: (element, tex, displayMode) => {
    let active = true
    element.textContent = tex
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([{ default: katex }]) => {
      if (active) katex.render(tex, element, { displayMode, throwOnError: false, trust: false })
    }).catch(() => { /* Keep the TeX source visible if the renderer cannot load. */ })
    return () => { active = false }
  },
  onFiles: async files => {
    const instance = editor.editor
    if (!instance) return
    let selection = instance.selection()
    for (const file of files) {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      if (instance.readOnly || !selection) return
      const name = file.name.replace(/[\[\]\n]/g, '')
      const source = `${/^(image|audio|video)\//.test(file.type) ? '!' : ''}[${name}](${url})`
      const start = selection.start, before = instance.value.slice(0, start), after = instance.value.slice(selection.end)
      const text = `${before && !before.endsWith('\n\n') ? '\n\n' : ''}${source}${after && !after.startsWith('\n\n') ? '\n\n' : ''}`
      instance.replace(start, selection.end, text)
      selection = instance.selection()
    }
  },
}
defineAaEditor()


const source = document.getElementById('source')!
const readOnly = document.getElementById('readonly') as HTMLButtonElement
editor.value = SAMPLE
const show = () => { source.textContent = editor.value }
show()
editor.addEventListener('input', show)
readOnly.addEventListener('click', () => {
  editor.readOnly = !editor.readOnly
  readOnly.setAttribute('aria-pressed', String(editor.readOnly))
})
document.getElementById('undo')!.addEventListener('click', () => { editor.undo(); show() })
// Comments beside the text: the same store drawn in the panel, the editor made again around it.
const beside = document.getElementById('comments-beside') as HTMLButtonElement, panel = document.getElementById('comments') as HTMLElement
beside.addEventListener('click', () => {
  const on = beside.getAttribute('aria-pressed') !== 'true'
  beside.setAttribute('aria-pressed', String(on))
  panel.hidden = !on
  comments.panel = on ? panel : undefined
  const parent = editor.parentElement!, next = editor.nextSibling
  editor.remove(); parent.insertBefore(editor, next)
})
document.getElementById('redo')!.addEventListener('click', () => { editor.redo(); show() })

document.getElementById('share')!.addEventListener('click', async event => {
  (event.currentTarget as HTMLButtonElement).disabled = true
  const [{ connectCollaboration }, Y] = await Promise.all([import('./src/collaboration'), import('yjs')])
  const doc = new Y.Doc(), listeners = new Set<(state: Uint8Array) => void>()
  let initialized = false
  const transport = {
    initialize: async (markdown: string) => { if (!initialized) { doc.getText('markdown').insert(0, markdown); initialized = true }; return Y.encodeStateAsUpdate(doc) },
    subscribe: (receive: (state: Uint8Array) => void) => { listeners.add(receive); return () => { listeners.delete(receive) } },
    send: async (update: Uint8Array) => { Y.applyUpdate(doc, update); const state = Y.encodeStateAsUpdate(doc); listeners.forEach(receive => receive(state)) },
  }
  const first = createEditor(document.getElementById('shared-first')!, { value: 'Write here; the second editor follows. Undo keeps the other editor’s changes.', toolbar: true })
  const second = createEditor(document.getElementById('shared-second')!, { toolbar: true })
  await Promise.all([connectCollaboration(first, transport, { id: 'first' }).ready, connectCollaboration(second, transport, { id: 'second' }).ready])
})
