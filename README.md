# Aa

Edit formatted text with the toolbar or typed Markdown shortcuts. Aa stores Markdown and keeps its syntax hidden, including while editing. One editable element per block preserves source offsets through formatting and atoms. Command/Control-K opens a URL field to add or edit a link.

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

Menus are enabled by default. `commands`, `blockCommands` and toolbar actions accept `{ id, label, icon, run(editor) }`; icons name Aa's copied Design system 1 icons. Uploads and product actions belong to the host application.

The core supports headings, nested bullets and boxes, numbered lists, quotes, fenced code, dividers, GFM tables, callouts (`> [!note] Title`), folded callouts (`> [!note]- Title`) and toggle headings (`> [!note]- ## Title`). Equations use `$…$` or a `$$` block; highlight uses `==…==`. Image alt text is an editable caption. Audio and video image atoms are drawn by file extension. Files enter through `onFiles`; Aa does not upload them.

Escape selects a block. Command/Control-A selects its block, then the document. Shift-arrows extend a block selection, Command-D duplicates, Command-Shift-arrows move, and Command-Option-0–8 change the kind. Tab nests lists or moves between table cells. Command-Enter toggles a box or callout, Command-Option-T opens all toggles, and Command-F opens find/replace.

`selection()`, `selectRange()`, `replace()` and `transaction()` work in Markdown offsets. `decorate([{ from, to, className, label }], layer)` adds comments, matches or peer carets without changing Markdown. `stats()` returns word and character counts. Call `destroy()` to release listeners, menus and atom resources.

## React

```tsx
import { AaEditor } from '@0001-labs/aa/react'
import '@0001-labs/aa/aa.css'

<AaEditor value={markdown} onChange={setMarkdown} toolbar />
```

The ref exposes `editor`, `focus()`, `undo()` and `redo()`. Keep capability arrays and callbacks that define atoms or drawing stable to preserve the editor instance. React is an optional peer dependency.

## Diagrams

A fenced ` ```diagram ` block is boxes and lines on Design system 1's squares, written rather than drawn (the language is in `src/diagram-language.ts`). Give the editor the diagram atom and it draws them in place: click one to edit its words as code, with the drawing following under them, and start one from the toolbar or `/diagram`.

```ts
import { createEditor, imageAtom } from '@0001-labs/aa'
import { diagramAtom, defineAaDiagram } from '@0001-labs/aa/diagram'
defineAaDiagram() // <aa-diagram>, or a product's own name: defineAaDiagram('ezo-diagram')
createEditor(host, { atoms: [imageAtom, diagramAtom], toolbar: true })
```

`<aa-diagram source="…">` draws one anywhere. Its measures are Design system 1's (`--ds-grid-unit`, the palette); a product hands in its own with `--aa-diagram-unit`, `--aa-diagram-stroke`, `--aa-diagram-ink`, `--aa-diagram-cell`, `--aa-diagram-radius` and `--aa-diagram-paper`. Charts and marker squares load `@0001-labs/aa/marker` only when a diagram has one. The entry touches no page globals until an element is made, so `layoutDiagram` can run on a server.

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
