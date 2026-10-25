import css from './aa.css?inline'

/**
 * Aa brings its own drawing, as a Design system 1 component does: the first
 * editor in a document (or a shadow root) puts aa.css there, its fonts and the
 * Design system 1 sheets it imports included, before it draws anything. It
 * goes first, so a product's own rules still come after it; its rules weigh
 * nothing, so any of the product's wins. A page that imports aa.css itself
 * keeps it, and gets no second copy.
 */
export function drawStyles(host: HTMLElement) {
  const root = host.getRootNode()
  const doc = host.ownerDocument
  // A shadow root (from this frame or another) is the only root with a host.
  const target = (root as ShadowRoot).host ? root as ShadowRoot : doc.head ?? doc.documentElement
  if (target.querySelector('style[data-aa-styles]')) return
  // A page that imports aa.css itself (one whose Content Security Policy allows no inline style or data: fonts, say) has it already.
  if (target !== root && doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue('--aa-sheet').trim()) return
  const style = doc.createElement('style')
  style.dataset.aaStyles = ''
  style.textContent = css
  target.prepend(style)
}
