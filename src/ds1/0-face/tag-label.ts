import type { Finding } from './constraints';

/** Include the face, slotted content and clipping ancestors in the visible-label check. */
export function inspectTagLabels(root: ParentNode): Finding[] {
  return [...root.querySelectorAll<HTMLElement>('ds-tag')].flatMap(tag => {
    const face = tag.shadowRoot?.querySelector<HTMLElement>('.frame');
    if (!face || !tag.getBoundingClientRect().width) return [];
    const rect = face.getBoundingClientRect();
    const view = tag.ownerDocument.defaultView ?? window;
    const nodes = [tag, ...tag.querySelectorAll<HTMLElement>('*'), ...tag.shadowRoot!.querySelectorAll<HTMLElement>('*')];
    for (const node of nodes) {
      const style = view.getComputedStyle(node);
      if (node.hasAttribute('data-cut') || (style.maskImage && style.maskImage !== 'none'))
        return [{ element: tag, message: 'Tag labels must never fade or use a mask.' }];
      if (/hidden|clip|auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1)
        return [{ element: tag, message: 'Give the tag room for its complete label.' }];
      for (const child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
        const range = tag.ownerDocument.createRange(); range.selectNodeContents(child);
        if ([...range.getClientRects()].some(text => text.width && (text.left < rect.left - 1 || text.right > rect.right + 1)))
          return [{ element: tag, message: 'The tag face must contain its complete label.' }];
      }
    }
    for (let parent: Element | null = tag; parent; parent = parent.assignedSlot ?? parent.parentElement ?? (parent.getRootNode() as ShadowRoot).host ?? null) {
      // A carousel intentionally hides other slides; each slide still gives its tags room.
      if (parent.matches('[part~="track"]') && (parent.getRootNode() as ShadowRoot).host?.matches('ds-carousel')) break;
      const style = view.getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1))
        return [{ element: tag, message: 'The surrounding layout must not clip the tag.' }];
    }
    return [];
  });
}
