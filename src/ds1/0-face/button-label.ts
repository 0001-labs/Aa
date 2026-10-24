import type { Finding } from './constraints';

export function labelledButtons(root: ParentNode): HTMLElement[] {
 const result = [...root.querySelectorAll<HTMLElement>('ds-button:not([icon]):not([split]),button:not(ds-button button),a[role="button"]')];
 return result.filter(button => button.getBoundingClientRect().width && (button.textContent?.trim() || button.getAttribute('text')));
}

/** Inspect actual labels, including a component's shadow face and slotted words. */
export function inspectButtonLabels(root: ParentNode): Finding[] {
 const findings: Finding[] = [];
 for (const button of labelledButtons(root)) {
  const face = button.shadowRoot?.querySelector<HTMLElement>('[part="control"]') ?? button.querySelector<HTMLElement>(':scope > button,:scope > a') ?? button;
  const rect = face.getBoundingClientRect();
  const nodes = [button, face, ...button.querySelectorAll<HTMLElement>('*'), ...face.querySelectorAll<HTMLElement>('*')];
  let faded = false, clipped = false;
  for (const node of new Set(nodes)) {
   const style = (node.ownerDocument.defaultView ?? window).getComputedStyle(node);
   if (node.hasAttribute('data-cut') || (style.maskImage && style.maskImage !== 'none') || (/text/.test(style.backgroundClip) && /gradient/.test(style.backgroundImage))) faded = true;
   for (const child of node.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
    const range = node.ownerDocument.createRange(); range.selectNodeContents(child);
    for (const text of range.getClientRects()) if (text.width && (text.left < rect.left - 1 || text.right > rect.right + 1)) clipped = true;
   }
  }
  if (faded || clipped) findings.push({ element: button, message: faded ? 'Button text must not fade or use a gradient mask.' : 'Give the button enough grid-aligned width to show its complete label.' });
 }
 return findings;
}
