/**
 * The words a correction changed shimmer once: a band of the accent colour
 * passes through their letters and is gone. It is drawn over the text, never
 * in it, as Aa's other floating pieces are, so the block's element and how it
 * reads back are untouched. Blended onto the page, the band colours the
 * letters and leaves the paper as it is: lightening on a light page, darkening
 * on a dark one. It moves by transform and fades by opacity alone; with
 * reduced motion it only fades, and with forced colours it is not drawn.
 */

import { pointAt } from './render'

/** How long a shimmer lasts, and the most it waits before a later word's begins. */
export const SHIMMER = 900
const STAGGER = 60, STAGGERED = 6

/** How light a CSS colour is, from 0 to 1, or null when it is written in a way not read here. */
export function lightness(color: string): number | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color)
  if (rgb) return (0.2126 * +rgb[1] + 0.7152 * +rgb[2] + 0.0722 * +rgb[3]) / 255
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color)
  if (srgb) return 0.2126 * +srgb[1] + 0.7152 * +srgb[2] + 0.0722 * +srgb[3]
  const ok = /^ok(?:lch|lab)\(\s*([\d.]+)(%?)/.exec(color)
  if (ok) return ok[2] ? +ok[1] / 100 : +ok[1]
  const lab = /^(?:lch|lab)\(\s*([\d.]+)/.exec(color)
  if (lab) return +lab[1] / 100
  return null
}

/** Shimmer the ranges of a block's source once; gives back what takes the shimmer away early. */
export function shimmer(element: HTMLElement, ranges: readonly (readonly [number, number])[], root: Element = element.closest('dialog') ?? element.ownerDocument.body): () => void {
  const doc = element.ownerDocument, view = doc.defaultView
  if (!view || !ranges.length || !element.isConnected || view.matchMedia?.('(forced-colors: active)').matches) return () => {}
  const style = view.getComputedStyle(element)
  const color = ['--aa-shimmer', '--ds-accent-color', '--accent-color'].map(name => style.getPropertyValue(name).trim()).find(Boolean)
  const light = lightness(style.color)
  const dark = light === null ? !!view.matchMedia?.('(prefers-color-scheme: dark)').matches : light > 0.5
  const pieces: HTMLElement[] = []
  ranges.forEach(([from, to], order) => {
    const range = doc.createRange()
    try {
      const start = pointAt(element, from), end = pointAt(element, to)
      range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset)
    } catch { return }
    if (range.collapsed || typeof range.getClientRects !== 'function') return
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue
      const piece = doc.createElement('div')
      piece.className = 'aa-shimmer'
      piece.setAttribute('aria-hidden', 'true')
      if (dark) piece.dataset.dark = ''
      Object.assign(piece.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, animationDelay: `${Math.min(order, STAGGERED) * STAGGER}ms` })
      if (color) piece.style.setProperty('--aa-shimmer-color', color)
      pieces.push(piece)
    }
  })
  if (!pieces.length) return () => {}
  root.append(...pieces)
  // It is drawn where the words stood: a scroll or a new size moves them, so it goes.
  const done = () => {
    clearTimeout(timer)
    doc.removeEventListener('scroll', done, true)
    view.removeEventListener('resize', done)
    for (const piece of pieces) piece.remove()
  }
  const timer = setTimeout(done, SHIMMER + STAGGERED * STAGGER + 100)
  doc.addEventListener('scroll', done, true)
  view.addEventListener('resize', done)
  return done
}
