# Aa

Edit formatted text with the toolbar or typed Markdown shortcuts. Aa stores Markdown and keeps its syntax hidden, including while editing, a heading's `#` too. It draws writing as Design system 1's `prose.css` draws the same Markdown on a page, from the `--ds-*` tokens with their values as fallbacks; `--aa-*` properties change one measure. One editable element per block preserves source offsets through formatting and atoms. Command/Control-K opens a URL field to add or edit a link.

```ts
import { createEditor } from '@0001-labs/aa'
import '@0001-labs/aa/aa.css'

const editor = createEditor(host, {
  value: '# A note',
  toolbar: true,
  onChange: markdown => save(markdown),
  onFiles: files => upload(files),
  drawEquation: (element, tex, displayMode) => katex.render(tex, element, { displayMode, throwOnError: false }),
})
```

Menus are enabled by default. `commands`, `blockCommands` and toolbar actions accept `{ id, label, icon, run(editor) }`; icons name Aa's copied Design system 1 icons. `blockPlaceholder` is what an empty block with the caret says, `Type / for styles` unless set, `''` for nothing. Uploads and product actions belong to the host application.

The toolbar is Design system 1's context bar, drawn by its own `context.css`, which `aa.css` imports from `ds1/` beside it (in the package and in the Sync 1 copy). Its black fill is `light-dark()`: a build that lowers `light-dark()` for older browsers needs a `color-scheme` declared in that same build, or Design system 1's theme script, or the fill draws nothing.

The core supports headings, nested bullets and boxes, numbered lists, quotes, fenced code, dividers, GFM tables, callouts (`> [!note] Title`), folded callouts (`> [!note]- Title`) and toggle headings (`> [!note]- ## Title`). Equations use `$…$` or a `$$` block; highlight uses `==…==`. Image alt text is an editable caption. Audio and video image atoms are drawn by file extension. Files enter through `onFiles`; Aa does not upload them.

Nothing is drawn beside a block. Enter starts a new one, `/` opens the styles, and Command/Control-/ the block's commands. With a mouse, a block pressed and held still for a moment lifts and goes where the press is let go; a press that moves sooner selects words, and a selected block drags at once. The blocks it passes step aside as it goes, on the Drag library's sortable engine; several selected blocks travel together. Touch keeps its long press for selecting words; on touch the toolbar opens the block commands, which move blocks up and down. Escape selects a block. Command/Control-A selects its block, then the document. Shift-arrows extend a block selection, Command-D duplicates, Command-Shift-arrows move, and Command-Option-0–8 change the kind. Tab nests lists or moves between table cells. Command-Enter toggles a box or callout, Command-Option-T opens all toggles, and Command-F opens find/replace.

`selection()`, `selectRange()`, `replace()` and `transaction()` work in Markdown offsets. `decorate([{ from, to, className, label }], layer)` adds comments, matches or peer carets without changing Markdown. `stats()` returns word and character counts. Call `destroy()` to release listeners, menus and atom resources.

## Correction while writing

Give the editor a `correct` call and it corrects the person's words as they write, in place, with no suggestions or underlines: the corrected text simply replaces what was written. The product makes the call (Aa holds no model or key); Aa decides when to ask and how much of the answer to take.

```ts
createEditor(host, {
  correct: (markdown, { kind, before, after, signal }) => api.correct({ markdown, before, after }, { signal }),
})
```

- **When.** A block is asked about once its words rest: after a pause in typing (`PAUSE`, 400 ms), or as soon as the caret leaves it. Only blocks the person typed in are asked about, never text set from outside, code, tables or equations. Nothing is asked or changed during an IME composition.
- **What is taken.** The answer is compared word by word. Only edits within the words are made: never Markdown's syntax, code, atoms, link addresses or bare addresses, and never the word the caret is in (that one follows once the caret leaves). An answer that rewrites rather than corrects, changing more than half the block's words, is not taken. An answer for a block that changed since it was asked about is dropped, and its `signal` aborted.
- **How.** Each correction is an edit from outside: only its block is drawn again, in its own element, and the caret and focus stay among the same words. It is a step of its own to undo; ⌘Z gives back what the person wrote, and a correction taken back is not made again. `onChange` reports it like any change, and collaboration keeps it a step of its own in Yjs's undo.
- **Seen.** The words a correction changed shimmer once: a band of the accent colour (`--aa-shimmer`, else Design system 1's accent) passes through their letters in under a second, drawn over the text and never in it (`.aa-shimmer`). It only fades with reduced motion, and is not drawn with forced colours.
- **Off.** `correcting: false` starts it off, `editor.correcting` turns it on and off, and `<aa-editor correct="off">` turns it off on the element. While it corrects, the editor turns the browser's own spelling marks off.

## React

```tsx
import { AaEditor } from '@0001-labs/aa/react'
import '@0001-labs/aa/aa.css'

<AaEditor value={markdown} onChange={setMarkdown} toolbar />
```

The ref exposes `editor`, `focus()`, `undo()` and `redo()`; `correct` and `correcting` are props. Keep capability arrays and callbacks that define atoms or drawing stable to preserve the editor instance. React is an optional peer dependency.

## Diagrams

A fenced ` ```diagram ` block is boxes and lines on Design system 1's squares, stored as words (the language is in `src/diagram-language.ts`). Give the editor the diagram atom and it draws them in place on a board: press one for its squares and its tools (choose and move, box, post-it, line, arrow, the colours, delete), double-press a box to name it, and drag a box to move it. Every change is written back as words, one step of undo. Words, or the caret in the block, shows the words as code with the board under them. Start one from the toolbar or `/diagram`.

```ts
import { createEditor, imageAtom } from '@0001-labs/aa'
import { diagramAtom, defineAaDiagram } from '@0001-labs/aa/diagram'
defineAaDiagram() // <aa-diagram>, or a product's own name: defineAaDiagram('ezo-diagram')
createEditor(host, { atoms: [imageAtom, diagramAtom], toolbar: true })
```

`<aa-diagram source="…">` draws one anywhere. Its measures are Design system 1's (`--ds-grid-unit`, the palette); a product hands in its own with `--aa-diagram-unit`, `--aa-diagram-stroke`, `--aa-diagram-ink`, `--aa-diagram-cell`, `--aa-diagram-radius` and `--aa-diagram-paper`. Charts and marker squares load `@0001-labs/aa/marker` only when a diagram has one. The language alone is `@0001-labs/aa/diagram-language`, for a page or a server that only reads diagrams (`layoutDiagram`, `diagramFences`) and should not carry the element; the diagram entry loads it from beside itself and touches no page globals until an element is made.

## Collaboration and Convex

```ts
import { connectCollaboration } from '@0001-labs/aa/collaboration'
const connection = connectCollaboration(editor, transport, { id: sessionId, label: name, onError })
await connection.ready
```

The transport atomically initializes one canonical Yjs document, subscribes to its persisted state and sends updates. Optional `publishSelection` and `subscribeSelections` carry encoded relative positions. Local undo preserves remote edits. Failed sends remain pending for `retry()` or `flush()`; transports should persist unsent updates if navigation or process termination must survive. Initialization locks editing until the canonical document arrives. Destroy the connection before the editor.

A Convex component is exported at `@0001-labs/aa/convex.config`. Register it in the parent app and expose authenticated wrappers for `collaboration.get`, `initialize` and `append`. Check the note's read/write permission and entitlement in every wrapper; never expose component calls directly to clients. `append` returns Markdown for the parent to store atomically on its note. Stored state and updates are limited to 512 KiB. Applications with other writers must reconcile their Markdown changes into the collaborative state. Ezo's `convex/aaNotes.ts` implements this reconciliation and authenticated presence.

`convexTransport` from `@0001-labs/aa/convex` supports `ConvexClient`; applications using `ConvexReactClient` can implement the same transport with `watchQuery` and `mutation`. Convex is an optional peer dependency. The core imports neither React nor Yjs.

Run the playground with `vp run dev` at http://localhost:5195. Run `vp test`, `vp run check` and `vp run build` before a release.
