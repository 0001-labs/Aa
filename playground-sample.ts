// The playground's note, every feature in one: the playground and the documentation's front page both start on it.
export const SAMPLE = `# Aa

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

> [!💡] A callout as Notion draws it
> Its body stays Markdown, inside the box. Press the icon for another, ⌘/ for a fill, ⌘Enter to fold it.

> [!📅 yellow] A callout in a colour
> One of Notion's nine, drawn as Design system 1's pastels.

> [!tip] A Markdown alert
> A type word alone: a hairline and the type's icon. Click its icon or press ⌘Enter to fold it.

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
