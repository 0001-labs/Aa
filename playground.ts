import './src/aa.css'
import { createEditor, defineAaEditor, imageAtom, type AaEditorElement, type Corrector, type Prompter } from './src/index'
import { diagramAtom } from './src/diagram'

/**
 * The playground has no sign-in, so its words are corrected by Ezo's server
 * within one small allowance everyone here shares (`aiCorrection:playground`).
 */
const correct: Corrector = async (text, { before, after, signal }) => {
  const response = await fetch('https://first-impala-987.convex.cloud/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ path: 'aiCorrection:playground', args: { text, before, after }, format: 'json' }),
  })
  const result = await response.json() as { status?: string; value?: unknown }
  if (result.status !== 'success' || typeof result.value !== 'string') throw new Error('Not corrected')
  return result.value
}

/**
 * Asking AI the same way: Ezo's server answers the playground within one
 * allowance everyone here shares (`aiPrompt:playground`), with Markdown for
 * writing and the diagram written again for a diagram.
 */
const prompt: Prompter = async (said, { kind, text, before = '', after = '', signal }) => {
  const response = await fetch('https://first-impala-987.convex.cloud/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ path: 'aiPrompt:playground', args: { kind, prompt: said, text: text.slice(0, 8000), before: before.slice(-4000), after: after.slice(0, 4000) }, format: 'json' }),
  })
  const result = await response.json() as { status?: string; value?: unknown }
  if (result.status !== 'success' || typeof result.value !== 'string') throw new Error('Not answered')
  return result.value
}

const editor = document.getElementById('editor') as AaEditorElement
editor.options = {
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

const SAMPLE = `# Aa

Aa is the text editor of 0001's products. Write formatted text using the toolbar or Markdown shortcuts. Aa stores it as **Markdown** while keeping its syntax out of your way. Press ⌘B, ⌘I, ⌘E or ⌘K.

Press Space in an empty line to ask AI: the prompt is written in a live colour, Enter sends it, and what it is about glistens until the answer comes in. Press Space twice to say it instead: what you say appears in italics. On a diagram, Space asks AI to draw.\n\nYour spelling and grammar are corrected as you write, a moment after you pause or as you leave a block, never in the word you are still typing. ⌘Z takes a correction back.

## Blocks

Each paragraph is a block of its own, edited on its own, as Notion's are. Enter starts a new one and Shift-Enter breaks a line within it. Type / in a block to change its style.

Drag a block up or down to move it; dragging along a line selects words. Rest the pointer on a block until it turns into a hand, and the block moves whichever way you drag; a selected block drags at once. Escape selects a block. ⌘A selects a block’s words, then all of them. Shift-Up and Shift-Down extend a block selection. ⌘D duplicates it; ⌘Shift-Up and ⌘Shift-Down move it. Backspace removes it. ⌘Enter ticks a box; ⌘Option-0 through 8 change its kind. Paste a URL over selected words to make a link; ⌘Shift-V keeps it plain. ⌘Shift-S strikes selected words, including words across blocks.

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

A diagram is drawn by hand on its own board: press it for its squares and tools. Drag a Box or a Post-it out of the tools onto a square, drag a box to move it, pull a chosen box's grip to widen it, press Line or Arrow and drag from one box to another, double-press a box to name it, and choose a colour. From the keys: Tab chooses, the arrows move, Alt and the arrows size, Enter names, L joins, B adds a box and Delete takes it away. Type /diagram to start one.

\`\`\`diagram
# A diagram by hand

[Drawn] @ 0 3
[Kept as Markdown] @ 6 3 w8 light-green
Drawn -> Kept as Markdown
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
