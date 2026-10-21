import type { ExampleSpec } from '../example';

export default {
  'comments-thread': {
    title: 'Threads on the words',
    hint: 'Put the caret in the orange words to open a thread, or select other words and press ⌘⇧M to start one.',
    markdown: '# Launch plan\n\nThe new site goes live on the first of March. Every page is checked twice before it ships, and the old addresses are sent on to the new ones.\n\nThe press note goes out the morning after.',
    comments: [
      { quote: 'the first of March', author: 'Ann Lund', body: 'Can we make it the second? The first is a public holiday here.' },
      { quote: 'checked twice', author: 'Bo Ek', body: 'Who does the second check?' },
    ],
  },
  'comments-panel': {
    title: 'Threads in a panel',
    hint: 'The threads stand beside the text under Open and Resolved; press one to open it and select its words.',
    markdown: 'The workshop starts at nine in the library. Bring a laptop and something to write on.\n\nLunch is at half past twelve, and the day ends at four.',
    commentsPanel: true,
    comments: [
      { quote: 'in the library', author: 'Bo Ek', body: 'The library is closed that week. The town hall?' },
      { quote: 'Bring a laptop', author: 'Ann Lund', body: 'We have six to lend, if anyone needs one.' },
      { quote: 'half past twelve', author: 'Ann Lund', body: 'Moved from noon, as agreed.', resolved: true },
    ],
  },
  'comments-orphaned': {
    title: 'When the words are gone',
    hint: 'Select “by Friday” and delete it: the thread stays in the panel, its words no longer in the text. ⌘Z brings them back.',
    markdown: 'Send the invoice by Friday, with the hours for October attached.',
    commentsPanel: true,
    comments: [
      { quote: 'by Friday', author: 'Bo Ek', body: 'Friday is tight. Monday?' },
    ],
  },
  'comments-reactions': {
    title: 'Reactions and mentions',
    hint: 'Open the thread, press the plus under a comment for a reaction, and write @ in the reply to name someone.',
    markdown: 'We print two hundred copies of the first issue and keep fifty for the shop.',
    comments: [
      { quote: 'two hundred copies', author: 'Ann Lund', body: 'The printer can do three hundred for the same price.' },
    ],
  },
  'comments-read-only': {
    title: 'Read only',
    hint: 'Press the orange words to read the thread; there is nothing to reply with.',
    markdown: 'The garden opens to visitors on the first Sunday of every month.',
    readOnly: true,
    comments: [
      { quote: 'the first Sunday', author: 'Bo Ek', body: 'From May to September only.' },
    ],
  },
} satisfies Record<string, ExampleSpec>;
