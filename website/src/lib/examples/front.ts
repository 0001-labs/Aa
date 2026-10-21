import type { ExampleSpec } from '../example';

export default {
  'front-simple': {
    title: 'A note',
    hint: 'Write as you would anywhere: select words for the toolbar, or type ## , - or [] at the start of a line.',
    markdown: `# Thursday

Call the framer about the **two prints** before noon, and ask whether *Friday* still works.

- Bring the measurements
- [ ] Book the van
- [x] Pay the deposit`,
  },
} satisfies Record<string, ExampleSpec>;
