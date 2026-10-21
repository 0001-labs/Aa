import type { ExampleSpec } from '../example';

/** A green rectangle as a data address, so the pictures need nothing from a server. */
const picture = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22160%22%20height%3D%2280%22%3E%3Crect%20width%3D%22160%22%20height%3D%2280%22%20rx%3D%224%22%20fill%3D%22%2399ff73%22%2F%3E%3C%2Fsvg%3E';

export default {
  'options-readonly': {
    title: 'Read-only',
    hint: 'The words can be selected and copied, not changed.',
    markdown: '## A note to read\n\nWith `readOnly` the editor draws the same blocks, and nothing in them can be changed.\n\n- [x] Boxes stay as they are\n- [ ] Pressing one does nothing',
    readOnly: true,
    toolbar: false,
  },
  'options-placeholder': {
    title: 'Placeholders',
    hint: 'An empty editor says its placeholder. Write a line and press Enter: the empty line with the caret says how to reach the commands.',
    markdown: '',
    placeholder: 'Write a note',
  },
  'methods-stats': {
    title: 'Counts',
    hint: 'Press ⌘/ in a block: the block menu ends with the counts stats() returns.',
    markdown: '# Counting\n\nWords are counted in every block but code; characters are the Markdown’s, syntax included.\n\n```\nnot counted as words\n```',
  },
  'atoms-inline': {
    title: 'Atoms in a line',
    hint: 'Move the caret along the lines: it steps over the picture whole, and opens the equation as TeX.',
    markdown: `A picture is one atom, ![A green rectangle](${picture}) drawn by imageAtom.\n\nAn equation is another, $a^2 + b^2 = c^2$, drawn by drawEquation.`,
  },
  'commands-slash': {
    title: 'The slash menu',
    hint: 'Press Enter at the end of the line and type /, then a word such as list. Press ⌘/ for the block’s own commands.',
    markdown: 'The commands a product gives in commands follow the built-in ones.',
  },
  'decorations-find': {
    title: 'Find, a decoration layer',
    hint: 'Press ⌘F and look for “square”: each match is a range on the find layer, and the Markdown stays the same.',
    markdown: 'A square is 20px. Every line is one square high, a square stands between two blocks, and two squares before a heading.',
  },
  'decorations-comments': {
    title: 'Comments, a decoration layer',
    hint: 'The commented words are drawn by the comments layer. Press them to open the thread.',
    markdown: 'Decorations colour words without writing anything into the Markdown.',
    comments: [{ quote: 'colour words', author: 'Ann Lund', body: 'Nothing here is stored in the text.' }],
  },
  'styling-prose': {
    title: 'Drawn as prose',
    hint: 'Every block on Design system 1’s squares: a line a square, a square between blocks, two before a heading.',
    markdown: '# A title on two squares\n\nA paragraph in the text’s size, with **bold**, *italic*, `code` and [a link](https://aa.0001.dev).\n\n## A heading at 17px\n\n- A bullet\n- [x] A box ticked\n- [ ] A box to tick\n\n> A quote on a muted hairline.\n\n```\ncode in Aa Mono, 13px → arrows in Inter\n```\n\n---\n\n| Measure | Squares |\n| --- | ---: |\n| A line | 1 |\n| A table row | 2 |',
  },
} satisfies Record<string, ExampleSpec>;
