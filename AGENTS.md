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
- **Edit formatted text, store Markdown.** No Markdown syntax is shown, while writing either: a heading is its size, never its `#` (Backspace at its start makes it a paragraph, and an empty heading says "Heading 2" until it has words). Typed Markdown shortcuts transform into formatting. Bullets and checkboxes remain visible while their text is edited. The toolbar and keyboard shortcuts format without writing syntax; links use a URL field. Source characters stay in DOM spans for lossless reading and source-offset mapping.
- **The browser types, Aa decides.** Typing, spelling and IME composition are the browser's (nothing is touched while composing). Enter, Shift-Enter, Backspace at a block's edge, Delete at its end, paste, cut, ⌘B/I/E/K and ⌘⇧X, undo and the caret's way between blocks are Aa's (`src/editor.ts`). Undo is a stack of whole documents (`src/history.ts`): letters typed within a moment are one step, deleting is a step apart from typing, a space after a word begins a new one, and undo puts the caret where the change it took back was. A `value` set from outside draws again only the blocks that changed, so a collaborator's edit keeps the caret and focus.
- **`<aa-editor>`** is the element (`src/element.ts`, `defineAaEditor()`): `value` is the Markdown, `input` fires on each change, `readonly` and `placeholder` are attributes. `createEditor(host, options)` is the same without an element. Light DOM, so the page's rules reach it.
- **Drawn as Design system 1's prose.** `src/aa.css` draws every block as Design system 1's `prose.css` draws the same Markdown read on a page (`data-ds-prose`), so writing in Aa and reading it elsewhere look the same: a line a square, a square between blocks and two before a heading, a title 20px on two squares, `##` and `###` 17px and 15px, code 13px on the same lines in a hairline frame, links underlined in the text's colour, quotes on a muted hairline, a divider that takes no room, tables two squares a row, Design system 1's checkbox, and the Context face for the block menu. The toolbar is Design system 1's context bar itself (`.ds-context--bar` from its `context.css`, copied into `src/ds1` with Sync 1's `sheets` export and imported by `aa.css`, which both the package and the Sync 1 copy carry beside it); it stays `role="toolbar"`, opening without the focus. Every measure and colour is a `--ds-*` token with its value as the fallback, so a page without the tokens still gets them; a product changes one thing with the `--aa-*` properties (`--aa-heading-gap` for the room before a heading), and its own rules outweigh Aa's. Change a measure in `prose.css` first, then here.
- **Type**: two rules kept here and in Design system 1. **Arrows are always Inter**, in every font Aa sets, code included: "Inter Arrows" (`src/fonts/inter-arrows.woff2`, Inter's arrows alone, limited by `unicode-range`) comes first in each `font-family` in `src/aa.css`, so a new font stack starts with it. **Code is Aa Mono** (`src/fonts/aa-mono.woff2`, Iosevka cut to what code uses), after the product's `--aa-typeface-mono` or `--typeface-mono`, then a system monospace, never a serif. Both fonts ship in the npm package and in the Sync 1 copy (`fonts/`), with their licence in `src/fonts/LICENSE.md`.

- **Atoms** are pieces of the text drawn as one thing, never letter by letter: a picture, `![name](address)`, out of the box, and whatever a product names (`atoms` in the options: Ezo's mentions, link titles, its own pictures). Each has a `match` that finds it in a line (`atomPattern` makes one from a pattern) and a `draw` that fills the uneditable `.aa-atom` Aa gives it, returning what to stop when it leaves. The text keeps the atom's words, in `data-source`, so it reads back as written; the caret stands beside an atom, and an atom drawn once is kept as the block is drawn again (`src/render.ts`).
- **Asking AI** (a concept, `src/prompt.ts`): with `prompt` in the options, Space in an empty block opens a prompt over it in a live colour (the focus ring's blue), never part of the document; Space twice listens instead (the browser's speech recognition), the words heard set in italics and the caret drawn as a breathing dot while it listens. An empty block with the caret says “Press ‘space’ for AI or ‘/’ for commands” where the product answers prompts, “Type / for commands” otherwise. At a sentence's end in a paragraph (its . ! or ? and one space, the caret after it with nothing more) it says “Press ‘space’ for AI” after the caret, never the commands, and Space there opens the prompt at the caret: the marker goes into the line, and the answer goes on from there in the same paragraph. Enter sends it with its section (from the heading over it to the next) as context; the prompt and that section glisten (Ezo's harness glisten, a blended band moved by transform) until the answer comes. The whole document goes with the prompt (`document`, `PROMPT_HERE` on its own line where the prompt stands), and the answer is the whole document as it should be afterwards: titles changed, boxes ticked, diagrams written or changed where they stand, new writing at the marker. Aa takes it in, keeping the blocks it left as they were. An answer may instead edit in place (`edits`, each an exact passage found once before or after the prompt and what it becomes) and put new writing where the prompt stood (`insert`); Aa applies them as one change, one step to undo, drops the empty block when nothing is inserted, keeps unchanged blocks as they were, and shimmers what changed once. Space on a diagram's board asks the same for the diagram's words written again (`aa-atom-prompt`). The product makes the call: Ezo's `aiPrompt:ask` behind `ezo-ai-prompt`, and `aiPrompt:playground` for the playground.
- **From outside**: `selection()` says where the selection is and `replace(start, end, text)` writes, both in offsets into the Markdown, as a picker or an upload needs; `onFiles` receives files pasted or dropped, which Aa never keeps itself.

Toolbar, slash menu, block selection, block dragging with no handle on Drag's sortable engine (a still press lifts a block, a selected one drags at once and carries the others selected with it, the blocks it passes step aside; `src/drag.ts`, the engine copied from Drag into `src/vendor/drag` with Sync 1), nested lists, callouts and toggle headings, GFM tables, equations, highlight, media captions, find/replace, decorations and counts are in the core. React, Yjs collaboration and diagrams are separate optional entries.

- **Diagrams** (`@0001-labs/aa/diagram`, moved from Ezo in October 2026) are fenced ```` ```diagram ```` blocks: boxes, lines, months, grids and charts on Design system 1's squares, written rather than drawn. `src/diagram-language.ts` reads and lays them out with nothing of the page, so a server counts their squares too (Ezo's list widths); `src/diagram.ts` is the `<aa-diagram>` element (plain, no Lit, a product's own name through `defineAaDiagram(name)`) and `diagramAtom`, which draws them in place in the editor on a board (`src/diagram-board.ts`), and adds Diagram to the toolbar and the slash menu (`Atom.insert`, `AtomSyntax.fence`). Nobody writes the language by hand: a diagram's words are never shown, the caret in its block or not. Pressed, or with the caret come into its block (the editor hands such an atom the focus, and takes it back on `aa-atom-leave`), the board rules its squares; its Context row of tools stands on the square under it whenever the writing can be changed: box and post-it (carried onto a square, or pressed for a free one, and named at once), line and arrow (pressed on one box, let go over another; with a line chosen, they make it one), one colour tool whose Select-faced menu, in the top layer, holds the pale accents, Fit the width, and delete (on touch screens only: a keyboard has Delete). Fit the width writes `wrap` on the fence (```` ```diagram wrap ````): the drawing is then laid out again in strips that fit its holder, as writing wraps (`layoutDiagram`'s `room`), except while its board is drawing on it. Unwrapped, a diagram wider than the window stands at its holder's edge and scrolls sideways within itself rather than reaching off a phone's screen. A group carried follows the pointer by transform while its ring glides to the squares it will land on, and settles there when let go (as Music carries a clip); a chosen box's grip sizes it in whole items (`w8`) and a post-it's in whole columns; a double press or Enter names a box. Every gesture is carried on Drag's grid engine (`src/vendor/drag/grid.ts`), never native drag. The keys reach all of it: Tab chooses each group, box and line, arrows move what is chosen (Shift four), Alt and arrows size it, L or A joins it to another from the keys, B and P add, Delete takes away, Escape lets go, and arrows with nothing chosen go on through the writing. What is drawn is written back as the words a person would write (`src/diagram-edit.ts`, from the `groups` and `joins` `layoutDiagram` reports), every line it does not change kept as written, and handed to the editor in `aa-atom-change`, one step of undo. An atom that takes its own keys and presses carries `data-aa-interactive`, which the editor and the block drag leave alone. The drawing is the board's light child, slotted onto its paper, so a product's rules for its diagram element (Ezo's `ezo-diagram { --aa-diagram-* }`) reach it. Measures are Design system 1's, or a product's through `--aa-diagram-*`. Marker charts are `src/marker.ts`, their own entry, loaded only when a diagram has one. The product supplies uploads, equation drawing and authenticated Convex transport. Keep shared-note permissions in the parent app; component functions alone do not authorize a person. The implementation plan lives in Ezo (`91MiVe`).

## Stack

- TypeScript, no framework
- Vite+ through `vp`, pnpm
- Vitest with happy-dom for the model and the rendering

## Scripts

- `vp run dev` — the playground at http://localhost:5195, the editor beside the Markdown it stores
- `vp run site:build` — the playground built into `site/` (`dist/` stays the library's)
- `vp run deploy` — publishes the playground to https://aa.0001.dev, a Cloudflare Worker of static assets (`wrangler.jsonc`)
- `vp run build` — type declarations and `dist/aa.js`
- `vp run check` — type check
- `vp test` — the tests

## Plain text

`createPlainEditor(host, { value, readOnly, onChange })` provides one native plain-text block for short specimens and simple writing surfaces. It shares Aa's rounded native-selection painter and inherits the surrounding typography. It has no Markdown conversion, toolbar, menus, atoms or document model; the browser owns multiline input, clipboard, IME and undo. This single-block mode is an intentional exception to the Markdown document/history rules. Use `createEditor` for documents.

## Using it in a product

```ts
import '@0001-labs/aa/aa.css'
import { defineAaEditor } from '@0001-labs/aa'
defineAaEditor()
```

```html
<aa-editor placeholder="Write"></aa-editor>
```

Products copy the built editor with Sync 1 (`/Users/joachim/0001/Sync 1`): `"Aa": { "build": { "to": "client/vendor/aa", "entries": ["react"] } }` in their `sync.json`, then `sync1`, which builds Aa first (`sync.exports.mjs`; `entries` takes react, collaboration, convex and diagram, which brings diagram-language (the language alone, for a page or a server that only reads diagrams) and marker). Aa takes its shared icons from Design system 1 the same way, Drag's sortable and grid engines from Drag (`src/vendor/drag`, never edited here: change Drag, commit, then `sync1`), and the playground Design system 1's root stylesheet and faces (`public/ds1`, `sync.json`). On npm it is `@0001-labs/aa`: `vp add @0001-labs/aa`.

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
