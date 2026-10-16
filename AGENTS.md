# Aa

> **Read first:** `/Users/joachim/.agents/harness-instructions.md` (harness instructions), `/Users/joachim/0001/AGENTS.md` (0001). This file wins where they differ.

Aa is the text editor of 0001's products: Ezo's notes and writing blocks, Link's comments and messages, and whatever comes next. It is Markdown drawn as you write it, Notion's architecture on 0001's own terms. Local only, no remote.

## System parts

System node: `aa` ([map](https://system.0001.dev/system?focus=aa)). Follow the studio’s Selecting System requirements workflow; inspect current edges for Stack dependencies and their evidence.

- Recorded relationships — local: `editing`; shared: `sharing`, `documentation`.
- Decisions/exceptions: What it is and Using it in a product below own Markdown storage and optional adapters; uploads, permissions and authenticated transport stay in the consuming product.
- Coverage: relationships select guides, not proof of acceptance. Proposed (`opportunity`) and unknown (`unverified`) relationships stay distinct; verify applicable requirements for the current change.

## What it is

- **The document is Markdown.** That is what every product stores, what the `.ezo` file is, what agents write and what the iPhone app reads, so nothing is converted and nothing is lost. `src/markdown.ts` reads a text into blocks (paragraph, heading, bullet with or without a box, quote, fenced code, divider) and a block into runs (text, syntax, line break), every character kept with its offset.
- **One editable element a block**, as Notion does it, never one big contenteditable. Each block is drawn from its source and read back from the screen after each change (`src/render.ts`); the blocks it touched are read again, so `- ` typed at the start of a paragraph makes a bullet and a heading that loses its `## ` is a paragraph (`replaceRange` in `src/document.ts`).
- **Edit formatted text, store Markdown.** An active heading shows its grey Markdown prefix just to the left of the text, positioned outside the line so entering and leaving it never shifts the heading. Other Markdown syntax stays hidden while typing and selecting. Typed Markdown shortcuts transform into formatting. Bullets and checkboxes remain visible while their text is edited. The toolbar and keyboard shortcuts format without writing syntax; links use a URL field. Source characters stay in DOM spans for lossless reading and source-offset mapping.
- **The browser types, Aa decides.** Typing, spelling and IME composition are the browser's (nothing is touched while composing). Enter, Shift-Enter, Backspace at a block's edge, Delete at its end, paste, cut, ⌘B/I/E/K and ⌘⇧X, undo and the caret's way between blocks are Aa's (`src/editor.ts`). Undo is a stack of whole documents, letters typed within a moment joined (`src/history.ts`).
- **`<aa-editor>`** is the element (`src/element.ts`, `defineAaEditor()`): `value` is the Markdown, `input` fires on each change, `readonly` and `placeholder` are attributes. `createEditor(host, options)` is the same without an element. Light DOM, so the page's type and colours reach it; it reads Design system 1's tokens and the `--aa-*` properties in `src/aa.css`.
- **Type**: two rules kept here and in Design system 1. **Arrows are always Inter**, in every font Aa sets, code included: "Inter Arrows" (`src/fonts/inter-arrows.woff2`, Inter's arrows alone, limited by `unicode-range`) comes first in each `font-family` in `src/aa.css`, so a new font stack starts with it. **Code is Aa Mono** (`src/fonts/aa-mono.woff2`, Iosevka cut to what code uses), after the product's `--aa-typeface-mono` or `--typeface-mono`, then a system monospace, never a serif. Both fonts ship in the npm package and in the Sync 1 copy (`fonts/`), with their licence in `src/fonts/LICENSE.md`.

- **Atoms** are pieces of the text drawn as one thing, never letter by letter: a picture, `![name](address)`, out of the box, and whatever a product names (`atoms` in the options: Ezo's mentions, link titles, its own pictures). Each has a `match` that finds it in a line (`atomPattern` makes one from a pattern) and a `draw` that fills the uneditable `.aa-atom` Aa gives it, returning what to stop when it leaves. The text keeps the atom's words, in `data-source`, so it reads back as written; the caret stands beside an atom, and an atom drawn once is kept as the block is drawn again (`src/render.ts`).
- **From outside**: `selection()` says where the selection is and `replace(start, end, text)` writes, both in offsets into the Markdown, as a picker or an upload needs; `onFiles` receives files pasted or dropped, which Aa never keeps itself.

Toolbar, slash menu, block selection and handle, nested lists, callouts and toggle headings, GFM tables, equations, highlight, media captions, find/replace, decorations and counts are in the core. React and Yjs collaboration are separate optional entries. The product supplies uploads, equation drawing and authenticated Convex transport. Keep shared-note permissions in the parent app; component functions alone do not authorize a person. The implementation plan lives in Ezo (`91MiVe`).

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
import '@0001-labs/aa/aa.css'
import { defineAaEditor } from '@0001-labs/aa'
defineAaEditor()
```

```html
<aa-editor placeholder="Write"></aa-editor>
```

Products copy the built editor with Sync 1 (`/Users/joachim/0001/Sync 1`): `"Aa": { "build": { "to": "client/vendor/aa", "entries": ["react"] } }` in their `sync.json`, then `sync1`, which builds Aa first (`sync.exports.mjs`; `entries` takes react, collaboration and convex). Aa takes its shared icons from Design system 1 the same way (`sync.json`). On npm it is `@0001-labs/aa`: `vp add @0001-labs/aa`.

## Releasing to npm

One command publishes a new version, with semantic versioning (`scripts/release.mjs`, the same file in Aa, Design system 1, IDv1, Drag and Worktrees):

- `vp run release patch` — fixes, nothing changes for products (0.2.0 → 0.2.1)
- `vp run release minor` — something new, nothing breaks (0.2.0 → 0.3.0)
- `vp run release major` — something breaks for products (0.2.0 → 1.0.0)
- `vp run release alpha` — a preview under the `alpha` tag (0.2.1-alpha.0, then .1 …)
- `vp run release current` — publishes the version already in `package.json`, for the first release
- `--dry-run` after any of them goes through every step without publishing

It refuses with uncommitted changes or when npm is signed out (`vp pm login`), runs `check`, `test` and `build`, publishes, then commits `Release @0001-labs/aa <version>` and tags `v<version>`. A failed step puts the version back. Products then take it with `vp update @0001-labs/aa`.

## Git commits

- English. Do not add Co-Authored-By lines to commits. No tool names anywhere.
