# Aa

> **Read first:** `/Users/joachim/.agents/harness-instructions.md` (harness instructions), `/Users/joachim/0001/AGENTS.md` (0001). This file wins where they differ.

Aa is the text editor of 0001's products: Ezo's notes and writing blocks, Link's comments and messages, and whatever comes next. It is Markdown drawn as you write it, Notion's architecture on 0001's own terms. Local only, no remote.

## What it is

- **The document is Markdown.** That is what every product stores, what the `.ezo` file is, what agents write and what the iPhone app reads, so nothing is converted and nothing is lost. `src/markdown.ts` reads a text into blocks (paragraph, heading, bullet with or without a box, quote, fenced code, divider) and a block into runs (text, syntax, line break), every character kept with its offset.
- **One editable element a block**, as Notion does it, never one big contenteditable. Each block is drawn from its source and read back from the screen after each change (`src/render.ts`); the blocks it touched are read again, so `- ` typed at the start of a paragraph makes a bullet and a heading that loses its `## ` is a paragraph (`replaceRange` in `src/document.ts`).
- **Syntax steps aside.** A mark's `**`, a heading's `## `, a fence: all stay in the DOM as text, so the screen reads back exactly, but are not displayed until the caret is in the mark or the block (`data-hidden`, `revealKey`). Bullets wear a dot or a box while their `- ` is away.
- **The browser types, Aa decides.** Typing, spelling and IME composition are the browser's (nothing is touched while composing). Enter, Shift-Enter, Backspace at a block's edge, Delete at its end, paste, cut, ⌘B/I/E/K and ⌘⇧X, undo and the caret's way between blocks are Aa's (`src/editor.ts`). Undo is a stack of whole documents, letters typed within a moment joined (`src/history.ts`).
- **`<aa-editor>`** is the element (`src/element.ts`, `defineAaEditor()`): `value` is the Markdown, `input` fires on each change, `readonly` and `placeholder` are attributes. `createEditor(host, options)` is the same without an element. Light DOM, so the page's type and colours reach it; it reads Design system 1's tokens and the `--aa-*` properties in `src/aa.css`.

- **Atoms** are pieces of the text drawn as one thing, never letter by letter: a picture, `![name](address)`, out of the box, and whatever a product names (`atoms` in the options: Ezo's mentions, link titles, its own pictures). Each has a `match` that finds it in a line (`atomPattern` makes one from a pattern) and a `draw` that fills the uneditable `.aa-atom` Aa gives it, returning what to stop when it leaves. The text keeps the atom's words, in `data-source`, so it reads back as written; the caret stands beside an atom, and an atom drawn once is kept as the block is drawn again (`src/render.ts`).
- **From outside**: `selection()` says where the selection is and `replace(start, end, text)` writes, both in offsets into the Markdown, as a picker or an upload needs; `onFiles` receives files pasted or dropped, which Aa never keeps itself.

Not yet: a toolbar, a `/` menu, tables, maths, callouts and toggles, nested bullets, a React binding, collaboration. The plan for them, phase by phase against what Notion's editor has, is the Aa list in Ezo (`91MiVe`); its icons are in Design system 1's library. Each paragraph stays its own block, as Ezo settled.

## Stack

- TypeScript, no framework
- Vite+ through `vp`, pnpm
- Vitest with happy-dom for the model and the rendering

## Scripts

- `vp run dev` — the playground at http://localhost:5195, the editor beside the Markdown it stores
- `vp run build` — type declarations and `dist/aa.js`
- `vp run check` — type check
- `vp test` — the tests

## Using it in a product

```ts
import '@0001/aa/aa.css'
import { defineAaEditor } from '@0001/aa'
defineAaEditor()
```

```html
<aa-editor placeholder="Write"></aa-editor>
```

Until it is published, link it: `pnpm add ../Aa` from the product, or a workspace path.

## Git commits

- English. Do not add Co-Authored-By lines to commits. No tool names anywhere.
