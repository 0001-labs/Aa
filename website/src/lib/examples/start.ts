import type { ExampleSpec } from '../example';

export default {
  overview: {
    title: 'A note, written in Aa',
    hint: 'Write in it: select words for the toolbar, type / for the kinds of block, and watch the Markdown beside it.',
    markdown: `# Planning the launch

Aa draws **Markdown** as you write it, and keeps its syntax out of your way: a heading is its size, a bold word is bold.

## Before Friday

- [x] Agree the name
- [ ] Write the announcement
- [ ] Send it to [the list](https://example.com)

> [!tip] One editor everywhere
> Notes, comments and messages are the same editor, so they read the same.`,
  },
  install: {
    title: 'The element on a page',
    hint: 'An <aa-editor> with the toolbar, and nothing else configured.',
    markdown: 'Write here. Press **⌘B** for bold, or select words for the toolbar.',
  },
  'design-system-1': {
    title: 'Prose, as Design system 1 draws it',
    hint: 'A line a square, a square between blocks, two before a heading.',
    markdown: `## A section

A paragraph on a line a square high, a square below the heading.

- A bullet
- Another

\`\`\`ts
const code = 'thirteen on the same lines'
\`\`\``,
  },
} satisfies Record<string, ExampleSpec>;
