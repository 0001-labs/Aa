/**
 * A block drawn from its source, and read back from the screen. Every
 * character of the source is in the DOM as text, syntax included; syntax is
 * never displayed, while writing either, so the caret passes over it as if it
 * were not there, and the text still reads straight back.
 */

import { blockRuns, fencedAtom, DEFAULT_ATOMS, type AtomSyntax, type Block } from './markdown'
import { tableAlignments, tableRows } from './table'
import { icons } from './icons'
import { initialOf } from './comments'

/** A run of a block's words drawn with a class (and a title, and attributes a layer reads back, `data-comment` say); `from === to` is a caret. */
export type Decoration = { from: number; to: number; className: string; label?: string; attributes?: Record<string, string> }

/**
 * Makes the element an atom is drawn in: a `.aa-atom` that is not editable,
 * carrying its source in `data-source`, which is what reads back.
 */
export type AtomDrawer = (name: string, source: string) => HTMLElement

/** The atom as its own words, for an editor given nothing better. */
export const drawAtomAsText: AtomDrawer = (name, source) => {
  const element = atomElement(name, source)
  element.textContent = source
  return element
}

export function atomElement(name: string, source: string): HTMLElement {
  const element = document.createElement('span')
  element.className = 'aa-atom'
  element.contentEditable = 'false'
  element.dataset.atom = name
  element.dataset.source = source
  return element
}

const isAtom = (node: Node): boolean => node instanceof HTMLElement && node.classList.contains('aa-atom')

/** Which part of a block the selection is in, in its own offsets; null when the selection is elsewhere. */
export type Reveal = { from: number; to: number } | null

/** The key of what a reveal shows: which groups, and whether the block is active. Same key, same drawing. */
export function revealKey(block: Block, reveal: Reveal, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): string {
  // A block an atom draws whole (a diagram) is drawn the same wherever the caret is.
  if (!reveal || fencedAtom(block, atoms)) return ''
  const groups: string[] = []
  for (const run of blockRuns(block, atoms)) {
    if (!run.group) continue
    const key = `${run.group[0]}-${run.group[1]}`
    if (reveal.from <= run.group[1] && reveal.to >= run.group[0] && !groups.includes(key)) groups.push(key)
  }
  return `on:${groups.join(',')}`
}

export function renderBlock(element: HTMLElement, block: Block, reveal: Reveal, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS, draw: AtomDrawer = drawAtomAsText, decorations: readonly Decoration[] = []) {
  element.className = 'aa-block'
  element.dataset.kind = block.kind
  // Code is not words: no spelling marks, and no phone capitalising or correcting it.
  for (const name of ['spellcheck', 'autocorrect', 'autocapitalize']) {
    if (block.kind === 'code') element.setAttribute(name, name === 'spellcheck' ? 'false' : 'off')
    else element.removeAttribute(name)
  }
  if (block.level) element.dataset.level = String(block.level)
  else delete element.dataset.level
  if (block.checked === undefined) delete element.dataset.checked
  else element.dataset.checked = block.checked ? 'true' : 'false'
  element.toggleAttribute('data-active', !!reveal)
  element.toggleAttribute('data-empty', block.kind === 'heading' && !block.source.slice(block.prefix).trim())
  element.dataset.reveal = revealKey(block, reveal, atoms)
  element.style.setProperty('--aa-depth', String(block.depth ?? 0))
  if (block.number !== undefined) element.dataset.number = String(block.number)
  else delete element.dataset.number
  if (block.kind === 'callout') {
    const icon = icons[`./icons/${block.folded ? 'toggle' : block.callout === 'tip' ? 'check' : block.callout === 'warning' || block.callout === 'caution' ? 'callout' : 'note'}.svg`]
    element.style.setProperty('--aa-callout-icon', `url("data:image/svg+xml,${encodeURIComponent(icon.replace(/currentColor/g, 'black'))}")`)
    element.dataset.callout = block.callout
    element.toggleAttribute('data-folded', !!block.folded)
    element.toggleAttribute('data-body-active', !!reveal && reveal.to > block.source.indexOf('\n') && block.source.includes('\n'))
  } else {
    delete element.dataset.callout
    element.removeAttribute('data-folded')
    element.removeAttribute('data-body-active')
  }
  if (block.kind === 'table') { renderTable(element, block, decorations); renderCarets(element, decorations); return }
  // A fenced block an atom draws (a diagram) is that drawing, the caret in it
  // or not: its words are never shown, and it is changed where it is drawn.
  const fenced = fencedAtom(block, atoms)
  element.toggleAttribute('data-drawn', !!fenced)
  if (fenced) element.dataset.fence = fenced.name
  else delete element.dataset.fence

  // An atom already drawn for the same words is kept rather than drawn
  // again, so a picture does not load twice as the caret moves past it.
  const kept = new Map<string, HTMLElement[]>()
  for (const atom of element.querySelectorAll<HTMLElement>('.aa-atom')) {
    const key = `${atom.dataset.atom}\u0000${atom.dataset.source}`
    kept.set(key, [...(kept.get(key) ?? []), atom])
  }

  const fragment = document.createDocumentFragment()
  const body = document.createElement('span')
  body.className = 'aa-callout-body'
  let destination: DocumentFragment | HTMLElement = fragment
  let visible = false
  let lastBreak = false
  for (const run of blockRuns(block, atoms)) {
    if (block.kind === 'callout' && run.from >= block.source.indexOf('\n') && block.source.includes('\n') && destination === fragment) { fragment.append(body); destination = body }
    lastBreak = run.kind === 'break'
    if (run.kind === 'break') { destination.append(document.createElement('br')); continue }
    const text = block.source.slice(run.from, run.to)
    if (!text) continue
    if (run.kind === 'atom') {
      if (run.group && reveal && !fenced && reveal.from <= run.to && reveal.to >= run.from) destination.append(document.createTextNode(text))
      else destination.append(kept.get(`${run.atom}\u0000${text}`)?.shift() ?? draw(run.atom!, text))
      visible = true
      continue
    }
    if (run.kind === 'syntax') {
      const span = document.createElement('span')
      span.className = 'aa-syntax'
      span.setAttribute('data-hidden', '')
      span.textContent = text
      destination.append(span)
      continue
    }
    visible = true
    const node = run.href ? document.createElement('a') : document.createElement('span')
    if (node instanceof HTMLAnchorElement) { node.href = run.href!; node.className = 'aa-link'; node.rel = 'noopener' }
    if (run.bold) node.classList.add('aa-b')
    if (run.italic) node.classList.add('aa-i')
    if (run.strike) node.classList.add('aa-s')
    if (run.underline) node.classList.add('aa-u')
    if (run.color) node.dataset.color = run.color
    if (run.code) { node.classList.add('aa-c'); node.spellcheck = false }
    if (run.highlight) node.classList.add('aa-highlight')
    node.textContent = text
    decorateNode(node, run.from, decorations)
    destination.append(node)
  }
  // A block with no line to stand on gets one: an empty block, one ending on
  // a line break, or one whose every character is hidden syntax.
  if (!visible || lastBreak) {
    const filler = document.createElement('br')
    filler.dataset.filler = ''
    fragment.append(filler)
  }
  element.replaceChildren(fragment)
  renderCarets(element, decorations)
}

function decorateNode(node: HTMLElement, offset: number, decorations: readonly Decoration[]) {
  const text = node.textContent ?? ''
  const ranges = decorations.filter(range => range.from < offset + text.length && range.to > offset)
  if (!ranges.length) return
  const points = [...new Set([0, text.length, ...ranges.flatMap(range => [Math.max(0, range.from - offset), Math.min(text.length, range.to - offset)])])].sort((a, b) => a - b)
  node.replaceChildren()
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i]
    const span = document.createElement('span')
    span.textContent = text.slice(start, end)
    for (const range of ranges) if (range.from < offset + end && range.to > offset + start) {
      span.classList.add(...range.className.split(/\s+/).filter(Boolean))
      if (range.label) span.title = range.label
      // Two ranges on the same words both name the span: their values stand side by side.
      for (const [name, value] of Object.entries(range.attributes ?? {})) span.setAttribute(name, span.hasAttribute(name) ? `${span.getAttribute(name)} ${value}` : value)
    }
    node.append(span)
  }
}

function renderCarets(element: HTMLElement, decorations: readonly Decoration[]) {
  for (const caret of decorations.filter(range => range.from === range.to && range.from >= 0 && range.from <= readBlock(element).length)) {
    const marker = document.createElement('span'); marker.className = `${caret.className} aa-peer-caret`; marker.contentEditable = 'false'; marker.dataset.label = caret.label ?? ''; if (caret.label) marker.dataset.initial = initialOf(caret.label); marker.title = caret.label ?? ''
    const point = pointAt(element, caret.from)
    const range = document.createRange(); range.setStart(point.node, point.offset); range.collapse(true); range.insertNode(marker)
  }
}

function renderTable(element: HTMLElement, block: Block, decorations: readonly Decoration[]) {
  element.contentEditable = 'false'
  const rows = tableRows(block.source), alignments = tableAlignments(block.source)
  const fragment = document.createDocumentFragment()
  let offset = 0
  rows.forEach((cells, row) => {
    const line = document.createElement('span')
    line.className = 'aa-table-row'
    line.style.setProperty('--aa-columns', String(cells.length))
    cells.forEach((cell, column) => {
      const node = document.createElement('span')
      node.className = 'aa-table-cell'
      node.dataset.cell = `${row}:${column}`
      if (alignments[column]) node.dataset.align = alignments[column]!
      node.dataset.from = String(cell.from)
      node.dataset.to = String(cell.to)
      node.contentEditable = element.dataset.readonly === 'true' ? 'false' : 'true'
      const leading = document.createElement('span')
      leading.className = 'aa-syntax'
      leading.dataset.hidden = ''
      leading.textContent = block.source.slice(offset, cell.from)
      const content = document.createElement('span')
      content.textContent = cell.text
      decorateNode(content, cell.from, decorations)
      if (!cell.text) { const br = document.createElement('br'); br.dataset.filler = ''; content.append(br) }
      node.append(leading, content)
      line.append(node)
      offset = cell.to
    })
    fragment.append(line)
  })
  const tail = document.createElement('span')
  tail.className = 'aa-syntax'
  tail.dataset.hidden = ''
  tail.textContent = block.source.slice(offset)
  fragment.append(tail)
  element.replaceChildren(fragment)
}

/** The block's source, read back from whatever the browser left in it. */
export function readBlock(element: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) { out += (child.textContent ?? '').replace(/ /g, ' '); continue }
      if (!(child instanceof HTMLElement)) continue
      if (isAtom(child)) { out += child.dataset.source ?? ''; continue }
      if (child.tagName === 'BR') { if (!('filler' in child.dataset)) out += '\n'; continue }
      if (/^(DIV|P)$/.test(child.tagName) && out && !out.endsWith('\n')) out += '\n'
      walk(child)
    }
  }
  walk(element)
  return out
}

function isHidden(node: Node): boolean {
  const parent = node.parentElement
  return !!parent && !!parent.closest('.aa-syntax[data-hidden]')
}

/** A DOM point in a block as an offset into its source. */
export function offsetIn(element: HTMLElement, node: Node, nodeOffset: number): number {
  let count = 0
  let found = -1
  const walk = (parent: Node): boolean => {
    const children = Array.from(parent.childNodes)
    for (let index = 0; index < children.length; index++) {
      const child = children[index]
      if (parent === node && index === nodeOffset) { found = count; return true }
      if (child === node && child.nodeType === Node.TEXT_NODE) { found = count + nodeOffset; return true }
      if (child.nodeType === Node.TEXT_NODE) { count += (child.textContent ?? '').length; continue }
      if (!(child instanceof HTMLElement)) continue
      if (isAtom(child)) {
        // A point inside an atom is before it at its very start, after it anywhere else.
        const length = (child.dataset.source ?? '').length
        if (child === node || child.contains(node)) { found = child === node && nodeOffset === 0 ? count : count + length; return true }
        count += length
        continue
      }
      if (child.tagName === 'BR') { count += 'filler' in child.dataset ? 0 : 1; continue }
      if (walk(child)) return true
    }
    if (parent === node && nodeOffset >= children.length) { found = count; return true }
    return false
  }
  if (node === element || element.contains(node)) walk(element)
  return found < 0 ? count : found
}

/** The DOM point for an offset into a block's source, in text that is displayed. */
export function pointAt(element: HTMLElement, offset: number): { node: Node; offset: number } {
  if (element.dataset.kind === 'table') {
    const cell = Array.from(element.querySelectorAll<HTMLElement>('[data-cell]')).find(cell => offset >= Number(cell.dataset.from) && offset <= Number(cell.dataset.to))
    if (cell?.lastElementChild) return pointAt(cell.lastElementChild as HTMLElement, offset - Number(cell.dataset.from))
  }

  let count = 0
  let result: { node: Node; offset: number } | null = null
  const walk = (parent: Node): boolean => {
    const children = Array.from(parent.childNodes)
    for (let index = 0; index < children.length; index++) {
      const child = children[index]
      if (child.nodeType === Node.TEXT_NODE) {
        const length = (child.textContent ?? '').length
        if (!isHidden(child) && offset <= count + length) { result = { node: child, offset: Math.max(0, offset - count) }; return true }
        count += length
        continue
      }
      if (!(child instanceof HTMLElement)) continue
      if (isAtom(child)) {
        // The caret stands beside an atom, never in it.
        const length = (child.dataset.source ?? '').length
        if (offset === count) { result = { node: parent, offset: index }; return true }
        if (offset <= count + length) { result = { node: parent, offset: index + 1 }; return true }
        count += length
        continue
      }
      if (child.tagName === 'BR') {
        if ('filler' in child.dataset) { if (offset <= count) { result = { node: parent, offset: index }; return true }; continue }
        if (offset === count) { result = { node: parent, offset: index }; return true }
        count += 1
        if (offset === count && index === children.length - 1) { result = { node: parent, offset: index + 1 }; return true }
        continue
      }
      if (walk(child)) return true
    }
    return false
  }
  walk(element)
  return result ?? { node: element, offset: element.childNodes.length }
}
