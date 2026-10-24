import type { Finding } from './constraints';

const selector = 'h1,h2,h3,h4,h5,h6,th,[role="heading"],[role="columnheader"],[role="rowheader"],ds-text[size="heading"],ds-text[size="display"],.ds-text--heading,.ds-text--display';
const styleOf = (element: Element) => element.ownerDocument.defaultView!.getComputedStyle(element);
const parentOf = (node: Node): Element | null => (node as Element).assignedSlot
  ?? node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null);

function children(node: Node): Node[] {
  if (node.nodeType === 1) {
    const element = node as Element;
    if (element.localName === 'slot') {
      const assigned = (element as HTMLSlotElement).assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    if (element.shadowRoot) return Array.from(element.shadowRoot.childNodes);
  }
  return Array.from(node.childNodes);
}

/** Headings in the rendered tree, including native table headers, slots and open shadow roots. */
export function wordHeaders(root: ParentNode): Element[] {
  const headers: Element[] = [];
  function visit(node: Node, inHeader = false) {
    if (node.nodeType === 1) {
      const element = node as Element;
      const style = styleOf(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      if (element.matches(selector) && !inHeader) {
        headers.push(element);
        inHeader = true;
      }
    }
    for (const child of children(node)) visit(child, inHeader);
  }
  visit(root as Node);
  return headers;
}

function languageOf(element: Element): string {
  for (let current: Element | null = element; current; current = parentOf(current)) {
    if (current.hasAttribute('lang')) return current.getAttribute('lang') ?? '';
  }
  return '';
}

type Letter = { node: Text; offset: number; element: Element };

/** Measure actual line breaks, not merely a CSS declaration that might never break a word. */
export function inspectWordWrap(root: ParentNode): Finding[] {
  const findings: Finding[] = [];
  for (const header of wordHeaders(root)) {
    let text = '';
    const letters: Letter[] = [];
    function collect(node: Node) {
      if (node.nodeType === 3) {
        const element = parentOf(node);
        if (!element) return;
        for (let offset = 0; offset < (node.nodeValue?.length ?? 0); offset++) {
          text += node.nodeValue![offset];
          letters.push({ node: node as Text, offset, element });
        }
      } else {
        if (node.nodeType === 1) {
          const style = styleOf(node as Element);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
        }
        for (const child of children(node)) collect(child);
      }
    }
    collect(header);
    // These alphabetic scripts break at words. CJK and scripts with dictionary-based line
    // breaking retain their native typesetting rules instead of being treated as long words.
    const words = text.matchAll(/[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{M}\u00ad]+/gu);
    for (const match of words) {
      const word = match[0];
      const start = match.index!;
      let previous: { box: DOMRect; letter: Letter; index: number } | undefined;
      let broken = false;
      for (let index = start; index < start + word.length; index++) {
        if (text[index] === '\u00ad') continue;
        const letter = letters[index]!;
        const range = header.ownerDocument.createRange();
        range.setStart(letter.node, letter.offset);
        range.setEnd(letter.node, letter.offset + 1);
        const box = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).pop();
        if (!box) continue;
        const style = styleOf(letter.element);
        const vertical = style.writingMode.startsWith('vertical');
        const overlap = previous && (vertical
          ? Math.min(box.right, previous.box.right) - Math.max(box.left, previous.box.left)
          : Math.min(box.bottom, previous.box.bottom) - Math.max(box.top, previous.box.top));
        if (previous && overlap! <= 1) {
          const previousStyle = styleOf(previous.letter.element);
          const hyphens = style.hyphens || style.getPropertyValue('-webkit-hyphens');
          const manual = text.slice(previous.index + 1, index).includes('\u00ad') && hyphens !== 'none';
          // Auto hyphenation is an engine/language decision. Never excuse emergency wrapping
          // or an explicit line break just because hyphens:auto happens to be inherited.
          const automatic = hyphens === 'auto' && languageOf(letter.element) !== ''
            && letter.node === previous.letter.node
            && [style, previousStyle].every(s => !['break-all', 'break-word'].includes(s.wordBreak)
              && !['anywhere', 'break-word'].includes(s.overflowWrap));
          if (!manual && !automatic) { broken = true; break; }
        }
        previous = { box, letter, index };
      }
      if (broken) {
        findings.push({ element: header, message: `“${word.replace(/\u00ad/g, '')}” breaks inside a word without a typesetting hyphen; give the header room, wrap between words, or hyphenate a long word at a valid language-specific point.` });
        break;
      }
    }
  }
  return findings;
}
