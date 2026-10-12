import './src/aa.css'
import { defineAaEditor, type AaEditorElement } from './src/index'

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
