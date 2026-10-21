import type { ExampleSpec } from '../example';

export default {
  'ai-ask': {
    ai: true,
    title: 'Asking AI',
    hint: 'Press Enter at the end of the last line, then Space, and ask for two more ideas. Press Space twice to say it instead.',
    markdown: '## Names for the reading room\n\n- The quiet room\n- Second floor\n\nWe choose on Friday.',
  },
  'ai-ask-edits': {
    ai: true,
    title: 'Changes where they stand',
    hint: 'Press Enter after the last line, then Space, and ask “tick the first two and call the list Weekend”. Rest the pointer on a dot for Revert.',
    markdown: '## Saturday\n\n- [ ] Buy bread\n- [ ] Call the plumber\n- [ ] Water the plants\n\nWhat is left goes to Sunday.',
  },
  'ai-ask-words': {
    ai: true,
    title: 'Asking about selected words',
    hint: 'Select the second sentence, write “make it shorter” in Ask AI under the cells, and press Enter.',
    markdown: 'The library opens at nine. On weekdays and on most Saturdays, except during the summer holidays, when it opens an hour later, at ten, and closes early.',
  },
  'ai-correct': {
    ai: true,
    title: 'Corrected as you write',
    hint: 'Press Enter at the end, write a sentence with a word misspelt, then pause or move to another line. ⌘Z gives back what you wrote.',
    markdown: 'The words already here are left as they are: only what you type is corrected.',
  },
} satisfies Record<string, ExampleSpec>;
