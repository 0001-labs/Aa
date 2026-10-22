// Design system 1's small rules: one list, each rule a sentence a component keeps and a check that
// measures it on a page as it is drawn. Five presses of C show what a page breaks, in a panel at
// its side, for the page's owner (constraint-panel.ts). The Constraints page
// (website/src/content/docs/1-root/constraints.mdx) lists them all under its big rules, each
// component's page lists its own, and the design-system-1 skill carries them between its
// constraints markers, written by scripts/write-constraints.ts. tests/constraints.test.ts fails
// while a rule has no source test, a component no page, or the skill an old list.
//
// A new rule: add it here with its `inspect`, make the component keep it, write its source test,
// then run `vp run constraints:write`.

/** Where a page breaks a rule: the element, and what is wrong with it in a sentence. */
export type Finding = { element: Element; message: string };

export type Constraint = {
  /** `<component>.<what>`, lower case, never changed once given. */
  code: string;
  /** The rule, one sentence, said of the thing and not of a product. */
  rule: string;
  /** Why it holds, when the rule alone does not say. */
  why?: string;
  /** The elements that keep it, by tag. */
  components: string[];
  /** The test that measures it in the source: a file in tests/ and the name it is given there. */
  check: { file: string; test: string };
  /** Measures it on a page as drawn, and returns where the page breaks it. */
  inspect: (root: ParentNode) => Finding[];
};

/** A pixel either way is the same place. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1;
const px = (n: number) => `${Math.round(n)}px`;

/** Every drawn card with its picture: `ds-card` and its slotted picture, or `.ds-card` and its media's. */
function cards(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>('ds-card, .ds-card')).flatMap(card => {
    const slotted = card.localName === 'ds-card'
      ? card.querySelector<HTMLElement>(':scope > [slot="media"]')
      : card.querySelector<HTMLElement>(':scope > .ds-card__media > *');
    const picture = slotted?.localName === 'picture' ? slotted.querySelector('img') ?? slotted : slotted;
    if (!picture) return [];
    const box = card.getBoundingClientRect();
    const face = picture.getBoundingClientRect();
    if (!box.height || !face.height) return [];
    return [{ card, picture, box, face }];
  });
}

/** Cards side by side: one parent, one top and one height. */
function rows(found: ReturnType<typeof cards>) {
  const groups: (typeof found)[] = [];
  for (const entry of found) {
    const row = groups.find(([first]) => first!.card.parentElement === entry.card.parentElement
      && near(first!.box.top, entry.box.top) && near(first!.box.height, entry.box.height));
    if (row) row.push(entry); else groups.push([entry]);
  }
  return groups.filter(row => row.length > 1);
}

export const constraints: Constraint[] = [
  {
    code: 'card.media-level',
    rule: "A card's picture stands on the card's foot, a square below the words at least, so the pictures of cards side by side stand on one level whatever the words above them.",
    why: 'The room a taller card leaves goes above its picture, never below it.',
    components: ['ds-card'],
    check: { file: 'tests/card.test.ts', test: "a picture stands on the card's foot, so pictures side by side stand on one level" },
    inspect(root) {
      const found = cards(root);
      const findings: Finding[] = [];
      for (const { picture, box, face } of found) {
        if (face.bottom < box.bottom - 1) findings.push({ element: picture, message: `The picture stands ${px(box.bottom - face.bottom)} above the card's foot.` });
      }
      for (const [first, ...rest] of rows(found)) {
        for (const { picture, face } of rest) {
          if (!near(face.top, first!.face.top)) findings.push({ element: picture, message: `The picture starts ${px(Math.abs(face.top - first!.face.top))} ${face.top > first!.face.top ? 'lower' : 'higher'} than the one in the first card beside it.` });
        }
      }
      return findings;
    },
  },
  {
    code: 'card.media-corners',
    rule: "A picture is never rounded where it meets the card's edge: the card cuts it square there, and only a corner standing free inside the card, towards the words, keeps a picture's corner.",
    components: ['ds-card'],
    check: { file: 'tests/card.test.ts', test: "a picture is square where it meets the card's edge" },
    inspect(root) {
      return cards(root).flatMap(({ picture, box, face }) => {
        const top = face.top <= box.top + 1;
        const bottom = face.bottom >= box.bottom - 1;
        const start = face.left <= box.left + 1;
        const end = face.right >= box.right - 1;
        const style = getComputedStyle(picture);
        const corners: [string, string, boolean][] = [
          ['top left', style.borderTopLeftRadius, top || start],
          ['top right', style.borderTopRightRadius, top || end],
          ['bottom right', style.borderBottomRightRadius, bottom || end],
          ['bottom left', style.borderBottomLeftRadius, bottom || start],
        ];
        const rounded = corners.filter(([, radius, meets]) => meets && parseFloat(radius) > 0).map(([name]) => name);
        return rounded.length ? [{ element: picture, message: `The picture's ${rounded.join(' and ')} ${rounded.length > 1 ? 'corners are' : 'corner is'} rounded where it meets the card.` }] : [];
      });
    },
  },
];

/** Every rule a page breaks, in the list's order. */
export function inspectConstraints(root: ParentNode = document): (Finding & { constraint: Constraint })[] {
  return constraints.flatMap(constraint => constraint.inspect(root).map(finding => ({ ...finding, constraint })));
}

/** The component's name as its page is called: `ds-card` is Card. */
export const componentName = (tag: string) => {
  const name = tag.replace(/^ds-/, '').replace(/-/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The rules grouped by the first component that keeps them, in the list's order. */
export function byComponent(list: Constraint[] = constraints): [string, Constraint[]][] {
  const groups = new Map<string, Constraint[]>();
  for (const constraint of list) {
    const tag = constraint.components[0]!;
    groups.set(tag, [...(groups.get(tag) ?? []), constraint]);
  }
  return [...groups];
}

export const skillStart = '<!-- constraints:start (written by scripts/write-constraints.ts from DS1/0-face/constraints.ts) -->';
export const skillEnd = '<!-- constraints:end -->';

/** The skill's list: a line a rule, under its component, between the markers. */
export function skillBlock(list: Constraint[] = constraints): string {
  const lines = [skillStart];
  for (const [tag, rules] of byComponent(list)) {
    lines.push('', `**${componentName(tag)}** (\`${tag}\`)`, '');
    for (const { code, rule, why } of rules) lines.push(`- \`${code}\`: ${rule}${why ? ` ${why}` : ''}`);
  }
  lines.push('', skillEnd);
  return lines.join('\n');
}
