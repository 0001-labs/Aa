/**
 * One example on a page: the editor itself, with what it stores beside it, as Design system 1's
 * pages show a component beside its code. Each group of pages keeps its examples in
 * lib/examples/<group>.ts, named as the page names them: <Example name="formatting" />.
 */
export interface ExampleSpec {
  /** A title over the example, in sentence case. */
  title?: string;
  /** One line under the title: what to try. */
  hint?: string;
  /** The Markdown the editor starts with. */
  markdown: string;
  /** The toolbar over selected words; on by default. */
  toolbar?: boolean;
  /** Show the Markdown it stores beside it; on by default. */
  source?: boolean;
  /** Draw diagrams (the diagram atom). */
  diagram?: boolean;
  /** Ask AI and correct as you write, through the playground's shared allowance. */
  ai?: boolean;
  /** Comments: threads already on the words, each anchored to the first place its quote stands. */
  comments?: { quote: string; author: string; body: string; resolved?: boolean }[];
  /** Comments in a panel beside the text rather than at the words. */
  commentsPanel?: boolean;
  /** Portable comments and a clean Markdown download. */
  sourceComments?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}
