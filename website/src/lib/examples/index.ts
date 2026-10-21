import type { ExampleSpec } from '../example';

// Every group's examples, by name. A name is used once across the site.
const groups = import.meta.glob<Record<string, ExampleSpec>>('./*.ts', { eager: true, import: 'default' });

export const EXAMPLES: Record<string, ExampleSpec> = {};
for (const [file, examples] of Object.entries(groups)) {
  if (file === './index.ts') continue;
  for (const [name, example] of Object.entries(examples)) {
    if (EXAMPLES[name]) throw new Error(`The example "${name}" is named twice (${file})`);
    EXAMPLES[name] = example;
  }
}
