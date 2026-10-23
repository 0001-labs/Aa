import type { ExampleSpec } from '../example';

export default {
  'toolbar-bar': {
    title: 'The bar over selected words',
    hint: 'Select a few words: the bar stands over them. Rest the pointer on a cell for its name and shortcut.',
    markdown: 'Select any of these words and the bar stands over them, half a square above the line.\n\nIt formats without writing syntax: the Markdown beside the editor changes, the words never show it.',
  },
  'toolbar-colour': {
    title: 'Text colour',
    hint: 'Select words and press the first cell, Text colour. Default takes the colour off again.',
    markdown: 'Mark <span color="red">what is late</span>, <span color="green">what is done</span> and <span color="gray">what can wait</span>.',
  },
  'toolbar-link': {
    title: 'A link',
    hint: 'Select words and press ⌘K. With the caret in the link, ⌘K changes its address.',
    markdown: 'Read the [release notes](https://github.com/0001-labs/Aa) before you update.\n\nSelect these words and press ⌘K to link them somewhere.',
  },
  'menus-slash': {
    title: 'The slash menu',
    hint: 'Press Enter at the end of the last line, type /, then a few letters to narrow it: /head, /todo, /table.',
    markdown: '## Notes from Tuesday\n\nType / at the start of a block, or after a space, for the kinds of block.',
  },
  'menus-block': {
    title: 'The block menu',
    hint: 'Put the caret in a block and press ⌘/ for its commands: another kind, Duplicate, Move up, Delete.',
    markdown: '## Shopping\n\n- Bread\n- Coffee\n- Apples\n\nA paragraph to turn into a quote, a callout or a heading.',
  },
  'selecting-words': {
    title: 'Words across blocks',
    hint: 'Press in the first paragraph and drag down into the list: the selection runs over every block between. Then press ⌘B.',
    markdown: 'Press here and drag down.\n\n- Each block is its own element\n- The selection still runs over all of them\n\nLet go here, and type, cut or format the words in one go.',
  },
  'selecting-blocks': {
    title: 'Blocks selected',
    hint: 'Press Shift-Down to select blocks, then ⌘D, ⌘⇧↑ or Backspace. Escape clears the selection and leaves editing.',
    markdown: '## Agenda\n\n1. Welcome\n2. Last month’s numbers\n3. The new office\n4. Anything else\n\nPress Escape in any of these lines.',
  },
  'selecting-drag': {
    title: 'Moving blocks by hand',
    hint: 'Rest the pointer on a block until it turns into a hand, then drag it up or down. A press held still for a moment lifts it too.',
    markdown: '- [ ] Pack the car\n- [ ] Lock the back door\n- [ ] Water the plants\n- [ ] Leave the key with Ann',
  },
  'undo-steps': {
    title: 'Steps to undo',
    hint: 'Type a sentence, delete a word, press Enter and bold a word. Then press ⌘Z a few times, and ⌘⇧Z to go forward again.',
    markdown: 'Write here, then take it back a step at a time.',
  },
  'find-replace': {
    title: 'Find and replace',
    hint: 'Click in the text and press ⌘F. Find colour, replace it with color, then press Replace all.',
    markdown: '## House style\n\nThe colour of a heading is the colour of the text. A link takes the colour of the words around it, and a callout keeps its own colour.',
  },
  'keyboard-practice': {
    title: 'Try the keys',
    hint: 'Every key on this page works here: ⌘⌥2 makes a heading, ⌘Enter ticks a box, ⌘⌥T opens the folded note.',
    markdown: 'A paragraph to turn into a heading.\n\n- [ ] A box to tick\n- A bullet to indent with Tab\n- Another bullet\n\n> [!note]- A folded note\n> What it holds shows once it is open.\n\n| Key | Where it goes |\n| --- | --- |\n| Tab | The next cell |',
  },
  'phone-touch': {
    title: 'On touch',
    hint: 'On a phone or a tablet, tap into the text: the bar docks above the keyboard, Insert block first.',
    markdown: '## A note on the go\n\nTap into a line for the bar above the keyboard. Its plus inserts a block; Turn into changes this one.\n\n- Double tap a word to select it\n- The page does not zoom',
  },
} satisfies Record<string, ExampleSpec>;
