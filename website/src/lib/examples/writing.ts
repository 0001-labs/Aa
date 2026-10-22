import type { ExampleSpec } from '../example';

// The Writing pages' examples. Pictures are Design system 1's example photographs, from its own site.
const LAKE = 'https://designsystem1.com/examples/images/lake.jpg';
const CUP = 'https://designsystem1.com/examples/images/cup.jpg';

export default {
  // Formatting
  formatting: {
    title: 'Words formatted as you write',
    hint: 'Select words for the toolbar, or press ⌘B, ⌘I, ⌘U, ⌘E or ⌘⇧S.',
    markdown: 'Write **bold**, *italic*, <u>underlined</u>, ~~struck~~, `code` and ==highlighted== words, or words in <span color="blue">a colour</span>.',
  },
  'formatting-typed': {
    title: 'Markdown typed in place',
    hint: 'Type **two words** at the end of the line: the stars go once the second pair closes them.',
    markdown: 'Markdown typed here turns into formatting as soon as it is closed.',
  },
  'formatting-colours': {
    title: 'Text colours',
    hint: 'Select words and press Text colour, the first cell on the toolbar. Default takes the colour off.',
    markdown: 'Words in <span color="gray">grey</span>, <span color="red">red</span>, <span color="orange">orange</span>, <span color="green">green</span>, <span color="blue">blue</span> and <span color="purple">purple</span>.',
  },

  // Links
  links: {
    title: 'A link, and addresses linked by themselves',
    hint: 'Put the caret in the link and press ⌘K to change its address. Select words and paste an address to link them.',
    markdown: 'Read the [release notes](https://github.com/0001-labs/Aa) before you update. Addresses such as https://designsystem1.com and www.example.com are links as they are written.',
  },
  'links-read-only': {
    title: 'A link in a read-only editor',
    hint: 'Press the link: it opens in a new tab.',
    markdown: 'The measures come from [Design system 1](https://designsystem1.com).',
    readOnly: true,
    toolbar: false,
  },

  // Headings and paragraphs
  headings: {
    title: 'Headings over paragraphs',
    hint: 'Backspace at the start of a heading makes it a paragraph. Type ## and a space at the start of a paragraph to make it a heading.',
    markdown: `# Spring retreat

Three days by the lake, for the whole team.

## Travel

The train leaves at nine on Thursday.

### Coming by car

Parking is free at the station.`,
  },
  'paragraphs-lines': {
    title: 'Lines within a paragraph',
    hint: 'Shift-Enter breaks a line within the paragraph; Enter starts a new one.',
    markdown: `The Old Mill
River Lane 4
2100 Copenhagen

An address on three lines is still one paragraph.`,
  },

  // Lists and boxes
  'lists-bullets': {
    title: 'Bullets',
    hint: 'Type - and a space at the start of a block for a bullet. Enter on an empty bullet ends the list.',
    markdown: `- Bread
- Olives
- A good cheese`,
  },
  'lists-numbered': {
    title: 'A numbered list',
    hint: 'Enter numbers the next step. Move a step with ⌘⇧↑ and the list counts again.',
    markdown: `1. Heat the oven
2. Rub the butter into the flour
3. Bake for twenty minutes`,
  },
  'lists-boxes': {
    title: 'Boxes',
    hint: 'Press a box to tick it, or press ⌘Enter with the caret in its line. Type [] and a space for a new one.',
    markdown: `- [x] Book the room
- [ ] Send the agenda
- [ ] Order lunch`,
  },
  'lists-nested': {
    title: 'Nested lists',
    hint: 'Tab nests a bullet under the one above it; Shift-Tab brings it back out.',
    markdown: `- Design
  - Colours
  - Type
- Build
  - [x] The editor
  - [ ] The documentation`,
  },

  // Quotes and code
  quotes: {
    title: 'A quote',
    hint: 'Type > and a space at the start of a block. Enter goes on quoting; Enter on an empty line ends the quote.',
    markdown: `> Keep the first draft. It knows what you meant.
> The second only knows what you said.`,
  },
  code: {
    title: 'Fenced code',
    hint: 'Enter is a new line inside code. At the end of a closed block, Enter starts a paragraph after it.',
    markdown: `\`\`\`ts
const editor = createEditor(host, { value: '# A note' })
editor.focus()
\`\`\``,
  },
  dividers: {
    title: 'A divider',
    hint: 'Type --- in an empty block. Backspace at the start of the block after it takes the divider away.',
    markdown: `The first part ends here.

---

The second part starts below the line.`,
  },

  // Callouts and toggles
  callouts: {
    title: 'Callouts',
    hint: 'Enter starts a new line of the body. Press the icon for another, and ⌘/ for the fills.',
    markdown: `> [!💡] Nothing to save
> Every change is reported as Markdown, so there is no save button.

> [!📅 yellow] Before you publish
> Check the links in the last section.

> [!] A callout without an icon keeps its words on the first square.`,
  },
  tabs: {
    title: 'Tabs',
    hint: 'Press a tab to open it, the open one again to name it, the plus to add one; Delete on a tab takes it away.',
    markdown: `<tabs>
<tab name="Entrance">
A red carpet in the doorway, and the sign on its stand just inside.
</tab>
<tab name="Stairs">
- Lights along the handrail
- The programme on the landing
</tab>
<tab name="Stage">
The backdrop, three by two metres, hung before the doors open.
</tab>
</tabs>`,
  },
  'callouts-alerts': {
    title: 'Markdown alerts',
    hint: 'A type word alone: a hairline and the type\'s icon. Press the icon, or ⌘Enter, to fold one.',
    markdown: `> [!tip] Nothing to save
> Every change is reported as Markdown, so there is no save button.

> [!warning] Before you publish
> Check the links in the last section.`,
  },
  'callouts-folded': {
    title: 'A folded callout',
    hint: 'Press the icon, or put the caret in the title and press ⌘Enter, to open it.',
    markdown: `> [!note]- What is kept while it is folded
> Everything: folding writes one minus sign after the type, and the body stays as it was.`,
  },
  'toggle-headings': {
    title: 'A toggle heading',
    hint: 'Press the icon to open it. ⌘⌥T opens every toggle in the editor.',
    markdown: `> [!note]- ## Questions from the review
> Should the toolbar show the highlight?
> Who writes the release notes?`,
  },

  'table-of-contents': {
    title: 'Table of contents',
    hint: 'Open the contents, then press a heading to go to it. Edit a heading and the contents follows.',
    markdown: `<table_of_contents/>

# The visit

Start at the front door.

## Arrival

Leave your coat in the hall.

### Getting here

The station is a short walk away.

## Before you leave

Sign the book by the door.`,
  },
  'table-of-contents-empty': {
    title: 'Before the first heading',
    hint: 'Open the contents, then turn the paragraph below into a heading.',
    markdown: '<table_of_contents/>\n\nA new section',
  },

  // Tables
  'tables-basic': {
    title: 'A table',
    hint: 'Tab moves to the next cell and Enter leaves the table. ⌘/ has Add row and Add column.',
    markdown: `| Room | Seats | Floor |
| --- | --- | --- |
| Lake | 8 | 1 |
| Forest | 12 | 2 |`,
  },
  'tables-aligned': {
    title: 'Columns set to their end',
    hint: 'The second column is written ---:, so its figures stand at its end.',
    markdown: `| Item | Price |
| :--- | ---: |
| Coffee | 3.50 |
| Cake | 4.25 |
| Both | 7.75 |`,
  },

  // Columns
  'columns-text': {
    title: 'Two columns',
    hint: 'Each column is written where it stands, with Enter, the slash menu and the keys, as a page of its own.',
    markdown: `<columns>
<column>
## Before
The draft, as it was sent.
</column>
<column>
## After
The draft, with the changes in.
</column>
</columns>`,
  },
  'columns-pictures': {
    title: 'Pictures put side by side',
    hint: 'Press the cup and hold it still for a moment, then carry it to the right edge of the lake and let go.',
    markdown: `![A mountain reflected in a still lake](${LAKE})

![A ceramic cup on a white table](${CUP})`,
  },

  // Equations
  'equations-inline': {
    title: 'Equations in a line',
    hint: 'Put the caret in an equation to edit its TeX. Select words and press Equation on the toolbar to make one.',
    markdown: String.raw`A circle's area is $\pi r^2$ and its circumference $2 \pi r$.`,
  },
  'equations-block': {
    title: 'An equation of its own',
    hint: 'Put the caret in it to edit the TeX between the two lines of $$.',
    markdown: String.raw`The sum of the first n numbers:

$$
\sum_{i=1}^{n} i = \frac{n(n + 1)}{2}
$$`,
  },

  // Pictures and media
  'media-picture': {
    title: 'A picture and its caption',
    hint: 'Write under a picture to change its caption. The second has none yet.',
    markdown: `![A mountain reflected in a still lake](${LAKE})

![](${CUP})`,
  },
  'media-files': {
    title: 'Files dropped or pasted',
    hint: 'Drop a picture here, paste one, or type /image. This page keeps it in the Markdown as a data address; an app uploads it.',
    markdown: 'Drop a picture under this line.',
  },
} satisfies Record<string, ExampleSpec>;
