/** Small read-only entry for public guides. No editor, menus, app actions or data access. */
import { BUTTON_PARTIAL, readButtonPartial, paintButton } from './button-partial'
import { configureI18n } from './vendor/ds1/0-face/i18n'
import { word } from './words'
export { BUTTON_STATES, readButtonPartial, writeButtonPartial, type ButtonState, type ButtonPartial } from './button-partial'

configureI18n({ autoLoad: false, persist: false, langTarget: false })

/** Replace known partials in marked prose, keeping unknown notation and code as text. */
export function renderPartials(root: HTMLElement): void {
  const doc = root.ownerDocument, walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.parentElement?.closest('code, pre, a, script, style, .aa-partial')) nodes.push(node)
  }
  for (const node of nodes) {
    const source = node.data, fragment = doc.createDocumentFragment()
    let from = 0
    for (let at = 0; at < source.length; at++) {
      const length = BUTTON_PARTIAL.match(source, at)
      if (!length) continue
      const value = readButtonPartial(source.slice(at, at + length))!
      fragment.append(source.slice(from, at))
      const illustration = doc.createElement('span')
      illustration.className = 'aa-partial'; illustration.dataset.source = source.slice(at, at + length)
      illustration.setAttribute('role', 'img'); illustration.setAttribute('aria-label', word('Button: {label}, {state}', { label: value.label, state: value.state }))
      const button = doc.createElement('ds-button'); button.inert = true; button.setAttribute('aria-hidden', 'true')
      paintButton(button, value); illustration.append(button); fragment.append(illustration)
      at += length - 1; from = at + 1
    }
    if (from) { fragment.append(source.slice(from)); node.replaceWith(fragment) }
  }
}
