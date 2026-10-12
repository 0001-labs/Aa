import './src/aa.css'
import { createEditor, defineAaEditor, type AaEditorElement } from './src/index'

defineAaEditor()

const SAMPLE = `# Aa

Aa is the text editor of 0001's products. What you write is **Markdown**, drawn as you write it: the marks show while the caret is in them and step aside when it leaves. Press ⌘B, ⌘I, ⌘E or ⌘K.

## Blocks

Each paragraph is a block of its own, edited on its own, as Notion's are. Enter starts a new one and Shift-Enter breaks a line within it.

Escape selects a block. ⌘A selects this block, then the whole document. Shift-Up and Shift-Down extend a block selection. ⌘D duplicates it; ⌘Shift-Up and ⌘Shift-Down move it. Backspace removes it. ⌘Enter ticks a box; ⌘Option-0 through 8 change its kind. Paste a URL over selected words to make a link; ⌘Shift-V keeps it plain. ⌘Shift-S strikes selected words, including words across blocks.

- A bullet
- Another, with a [link](https://ezo.gs) and some \`code\`
- [ ] Something to do
- [x] Something done
  - A nested bullet: Tab indents, Shift-Tab outdents

> [!tip] A callout
> Its body stays Markdown. Click its icon or press ⌘Enter to fold it.

> [!note]- A folded note
> The title holds the body while it is folded.

| Capability | Try it |
| --- | --- |
| Tables | Tab moves between cells; Enter leaves the table |
| Menus | Type /, or use the handle beside a block |

==Highlight a thought==, or write an equation: $E = mc^2$.

$$
a^2 + b^2 = c^2
$$

> A quote, in italics, with *emphasis* and ~~a change of mind~~ in it.

\`\`\`ts
const editor = createEditor(host, { value })
\`\`\`

---

Addresses turn into links by themselves: https://using.link and www.ezo.gs.`

const editor = document.getElementById('editor') as AaEditorElement
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
