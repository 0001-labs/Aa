import './src/aa.css'
import { startScaling } from './src/ds1/0-face/scaling'
import { createEditor, defineAaEditor, imageAtom, memoryCommentStore, type AaEditorElement } from './src/index'
import { diagramAtom } from './src/diagram'
import { correct, prompt } from './playground-ai'

// Design system 1's scale goes on before anything is drawn, so a phone's first paint is already to scale.
startScaling({ snap: 'layout' })

const SAMPLE = `# Aa

Aa is the text editor of 0001's products. Write formatted text using the toolbar or Markdown shortcuts. Aa stores it as **Markdown** while keeping its syntax out of your way. Press ⌘B, ⌘I, ⌘E or ⌘K.

Press Space in an empty line to ask AI: the prompt is written in a live colour, Enter sends it, and what it is about glistens until the answer comes in. Press Space twice to say it instead: what you say appears in italics. On a diagram, Space asks AI to draw.\n\nYour spelling and grammar are corrected as you write, a moment after you pause or as you leave a block, never in the word you are still typing. ⌘Z takes a correction back.

## Blocks

Each paragraph is a block of its own, edited on its own, as Notion's are. Enter starts a new one and Shift-Enter breaks a line within it. Type / in a block to change its style.

Drag a block up or down to move it; dragging along a line selects words, and goes on selecting into the blocks above and below. Rest the pointer on a block until it turns into a hand, and the block moves whichever way you drag; a selected block drags at once. Escape selects a block. ⌘A selects a block’s words, then all of them. Shift-Up and Shift-Down extend a block selection. ⌘D duplicates it; ⌘Shift-Up and ⌘Shift-Down move it. Backspace removes it. ⌘Enter ticks a box; ⌘Option-0 through 8 change its kind. Paste a URL over selected words to make a link; ⌘Shift-V keeps it plain. ⌘Shift-S strikes selected words, including words across blocks.

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
| Menus | Space for AI, / for commands, ⌘/ for the block's commands |

==Highlight a thought==, or write an equation: $E = mc^2$.

$$
a^2 + b^2 = c^2
$$

> A quote, on its hairline, with *emphasis* and ~~a change of mind~~ in it.

\`\`\`ts
const editor = createEditor(host, { value, atoms: [imageAtom, diagramAtom] })
\`\`\`

A diagram is drawn by hand on its own board: press it for its squares and tools. Drag an Item or a Note out of the tools onto a square, drag an item to move it, pull a chosen item's grip to widen it, press Line or Arrow and drag from one item to another, click an item to write in it, and choose a colour. From the keys: Tab chooses, the arrows move, Alt and the arrows size, Enter writes in it, L joins, I adds an item, N a note, and Delete takes it away. Type /diagram to start one.

\`\`\`diagram
# A diagram by hand

[Drawn] @ 0 3
[Kept as Markdown] @ 6 3 w8 light-green
Drawn -> Kept as Markdown
\`\`\`

---

Addresses turn into links by themselves: https://using.link and www.ezo.gs.`

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
