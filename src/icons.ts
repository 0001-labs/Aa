/** Aa's icons by path, as they are in the folder. */
export const icons = import.meta.glob<string>('./icons/*.svg', { query: '?raw', import: 'default', eager: true })

/** An icon as a CSS mask: black where it is drawn, whichever colour it was drawn in. */
export function iconMask(name: string): string {
  let mask = masks.get(name)
  if (mask === undefined) {
    const svg = icons[`./icons/${name}.svg`]
    masks.set(name, mask = svg ? `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, 'black'))}")` : '')
  }
  return mask
}
const masks = new Map<string, string>()

/** An icon as an element, in whatever colour the text around it has. */
export function iconElement(name: string, document: Document = globalThis.document): HTMLElement {
  const picture = document.createElement('span')
  picture.className = 'aa-icon'
  picture.style.maskImage = iconMask(name)
  return picture
}
