import './src/aa.css'
import { createEditor, defineAaEditor, imageAtom, type AaEditorElement } from './src/index'
import { diagramAtom } from './src/diagram'

const editor = document.getElementById('editor') as AaEditorElement
editor.options = {
  atoms: [imageAtom, diagramAtom],
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

const SAMPLE = `# Aa

Aa is the text editor of 0001's products. Write formatted text using the toolbar or Markdown shortcuts. Aa stores it as **Markdown** while keeping its syntax out of your way. Press ⌘B, ⌘I, ⌘E or ⌘K.

## Blocks

Each paragraph is a block of its own, edited on its own, as Notion's are. Enter starts a new one and Shift-Enter breaks a line within it. Type / in a block to change its style.

Hold a block still for a moment, then drag it to move it; a selected block drags at once. Escape selects a block. ⌘A selects this block, then the whole document. Shift-Up and Shift-Down extend a block selection. ⌘D duplicates it; ⌘Shift-Up and ⌘Shift-Down move it. Backspace removes it. ⌘Enter ticks a box; ⌘Option-0 through 8 change its kind. Paste a URL over selected words to make a link; ⌘Shift-V keeps it plain. ⌘Shift-S strikes selected words, including words across blocks.

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
| Menus | Type / for styles, ⌘/ for the block's commands |

==Highlight a thought==, or write an equation: $E = mc^2$.

$$
a^2 + b^2 = c^2
$$

> A quote, on its hairline, with *emphasis* and ~~a change of mind~~ in it.

\`\`\`ts
const editor = createEditor(host, { value, atoms: [imageAtom, diagramAtom] })
\`\`\`

A diagram is drawn on its own board: press it for the squares and the tools. Pick Box and press a square, draw a Line from one box to another, choose a colour, double-press a box to name it, or drag a box to move it. Words writes it as code instead. Type /diagram to start one.

\`\`\`diagram
# Writing a diagram

[Words] @ 0 3
[Drawing] @ 6 3 light-green
Words -> Drawing
\`\`\`

---

Addresses turn into links by themselves: https://using.link and www.ezo.gs.`

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
