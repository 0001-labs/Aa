/**
 * A block drawn from its source, and read back from the screen. Every
 * character of the source is in the DOM as text, syntax included; syntax is
 * never displayed, while writing either, so the caret passes over it as if it
 * were not there, and the text still reads straight back.
 */

import { blockRuns, fencedAtom, DEFAULT_ATOMS, type AtomSyntax, type Block, type Run } from './markdown'
import { tableAlignments, tableRows, tableWidths } from './table'
import { word } from './words'
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

export function atomElement(name: string, source: string, document: Document = globalThis.document): HTMLElement {
  const element = document.createElement('span')
  element.className = 'aa-atom'
  element.contentEditable = 'false'
  element.dataset.atom = name
  element.dataset.source = source
  return element
}

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1
const isAtom = (node: Node): boolean => isElement(node) && node.classList.contains('aa-atom')

/** Which part of a block the selection is in, in its own offsets; null when the selection is elsewhere. */
export type Reveal = { from: number; to: number } | null

const touches = (reveal: Reveal, from: number, to: number) => !!reveal && reveal.from <= to && reveal.to >= from

/** How much of an address reads before the rest is folded away. */
const ADDRESS_LENGTH = 56

/**
 * How a link whose words are its own address reads: without `https://`,
 * `www.` or a closing slash, and cut short at a word near `ADDRESS_LENGTH`.
 * The letters stay in the page and in the document; the caret entering the
 * link brings them all back, so nothing is out of reach of editing.
 */
export function addressFold(run: Run, text: string): { shown: number; end: number; more: boolean } | null {
  if (!run.href || run.code || /\s/.test(text)) return null
  const lead = /^(?:https?:\/\/(?:www\.)?|www\.)/.exec(text)?.[0].length ?? 0
  if (!lead || lead === text.length) return null
  const last = text.endsWith('/') ? text.length - 1 : text.length
  if (last - lead <= ADDRESS_LENGTH) return { shown: lead, end: last, more: false }
  const near = text.slice(lead, lead + ADDRESS_LENGTH).search(/[-_/.?&=#][^-_/.?&=#]*$/)
  return { shown: lead, end: lead + (near > ADDRESS_LENGTH / 2 ? near : ADDRESS_LENGTH), more: true }
}

/**
 * The key of what a reveal changes in a block's drawing: which atoms show their
 * source, and whether the caret is in a callout's body. Same key, same drawing:
 * delimiters are never shown, so the caret crossing bold redraws nothing.
 */
export function revealKey(block: Block, reveal: Reveal, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): string {
  // A block an atom draws whole (a diagram) is drawn the same wherever the caret is.
  if (!reveal || fencedAtom(block, atoms)) return ''
  const groups: string[] = []
  let addresses = 0
  for (const run of blockRuns(block, atoms)) {
    // Counted, not placed, so typing in an address does not count as a new one.
    if (run.kind === 'text' && addressFold(run, block.source.slice(run.from, run.to)) && ++addresses && touches(reveal, run.from, run.to)) groups.push(`address ${addresses}`)
    if (run.kind !== 'atom' || !run.group) continue
    if (reveal.from <= run.group[1] && reveal.to >= run.group[0]) groups.push(`${run.group[0]}-${run.group[1]}`)
  }
  const body = block.kind === 'callout' && block.source.includes('\n') && reveal.to > block.source.indexOf('\n')
  return groups.length || body ? `on:${groups.join(',')}${body ? ':body' : ''}` : ''
}

const pictureOf = (name: string) => `url("data:image/svg+xml,${encodeURIComponent((icons[`./icons/${name}.svg`] ?? '').replace(/currentColor/g, 'black'))}")`

/** What a run's element looks like, kept beside it to tell a word typed from a look changed. */
const lookOf = (run: Run) => `${run.href ?? ''}|${run.title ?? ''}|${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.strike ? 's' : ''}${run.underline ? 'u' : ''}${run.code ? 'c' : ''}${run.highlight ? 'h' : ''}|${run.color ?? ''}|${run.background ?? ''}`
const looks = new WeakMap<Node, string>()

/** A run of words as its element, decorated. */
function wordsOf(document: Document, run: Run, text: string, decorations: readonly Decoration[], base = 0, fold: ReturnType<typeof addressFold> = null): HTMLElement {
  const node = run.href ? document.createElement('a') : document.createElement('span')
  if (run.href) { (node as HTMLAnchorElement).href = run.href; node.className = 'aa-link'; (node as HTMLAnchorElement).rel = 'noopener'; node.title = run.title ?? run.href }
  if (run.bold) node.classList.add('aa-b')
  if (run.italic) node.classList.add('aa-i')
  if (run.strike) node.classList.add('aa-s')
  if (run.underline) node.classList.add('aa-u')
  if (run.color) node.dataset.color = run.color
  if (run.background) { node.classList.add('aa-bg'); node.dataset.fill = run.background }
  if (run.code) { node.classList.add('aa-c'); node.spellcheck = false }
  if (run.highlight) node.classList.add('aa-highlight')
  node.textContent = text
  looks.set(node, lookOf(run))
  decorateNode(node, base + run.from, decorations)
  // Words a layer has marked keep all their letters, so the mark stays on what it was put on.
  if (fold && node.childNodes.length === 1 && node.firstChild!.nodeType === 3) {
    node.replaceChildren(hiddenSyntax(document, text.slice(0, fold.shown)), text.slice(fold.shown, fold.end))
    if (fold.end < text.length) node.append(hiddenSyntax(document, text.slice(fold.end)))
    node.toggleAttribute('data-more', fold.more)
  }
  return node
}

function hiddenSyntax(document: Document, text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'aa-syntax'
  span.setAttribute('data-hidden', '')
  span.textContent = text
  return span
}

/**
 * Whether a block's element already shows `block`, the browser having typed
 * the same words into it: same runs, same looks, same letters, and nothing
 * that sets the block apart changed. Then nothing is drawn, so the text
 * nodes, the caret, the spelling marks and a phone's keyboard all stay.
 */
export function stillShows(element: HTMLElement, was: Block, block: Block, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS): boolean {
  if (block.kind !== was.kind || block.kind === 'table' || block.kind === 'callout' || block.prefix !== was.prefix || block.level !== was.level || block.checked !== was.checked || block.number !== was.number || block.depth !== was.depth) return false
  if (block.kind === 'heading' && !block.source.slice(block.prefix).trim() !== !was.source.slice(was.prefix).trim()) return false
  if (block.kind === 'code' && !!fencedAtom(block, atoms) !== !!fencedAtom(was, atoms)) return false
  let child = element.firstChild as ChildNode | null
  let visible = false, lastBreak = false
  for (const run of blockRuns(block, atoms)) {
    lastBreak = run.kind === 'break'
    if (run.kind === 'atom') return false
    if (run.kind === 'break') {
      if (!child || (child as HTMLElement).tagName !== 'BR' || !('line' in (child as HTMLElement).dataset)) return false
      child = child.nextSibling
      continue
    }
    const text = block.source.slice(run.from, run.to)
    if (!text) continue
    if (run.kind === 'text') visible = true
    // A folded address is drawn in parts, and stands as it is while the words beside it are typed.
    const folded = run.kind === 'text' && !!(child as HTMLElement | null)?.querySelector?.(':scope > .aa-syntax')
    if (!child || (folded ? child.textContent !== text : child.childNodes.length !== 1 || child.firstChild!.nodeType !== 3 || (child.firstChild as Text).data !== text)) return false
    if (run.kind === 'syntax' ? !(child as HTMLElement).classList?.contains('aa-syntax') : looks.get(child) !== lookOf(run)) return false
    child = child.nextSibling
  }
  if (!visible || lastBreak) return !!child && (child as HTMLElement).tagName === 'BR' && 'filler' in (child as HTMLElement).dataset && !child.nextSibling
  return !child
}

export function renderBlock(element: HTMLElement, block: Block, reveal: Reveal, atoms: readonly AtomSyntax[] = DEFAULT_ATOMS, draw: AtomDrawer = drawAtomAsText, decorations: readonly Decoration[] = []) {
  const document = element.ownerDocument
  if (draw === drawAtomAsText) draw = (name, source) => { const atom = atomElement(name, source, document); atom.textContent = source; return atom }
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
    // Notion's box: its emoji drawn before the words by the sheet (`data-icon`), a
    // picture from `--aa-callout-picture`, its fill from `data-fill`. A type word
    // alone is a Markdown alert, with the type's icon from the library.
    const picture = block.box && block.icon && /^https?:\/\//i.test(block.icon) ? block.icon : undefined
    element.toggleAttribute('data-box', !!block.box)
    if (block.box && block.icon && !picture) element.dataset.icon = block.icon
    else delete element.dataset.icon
    element.toggleAttribute('data-picture', !!picture)
    if (picture) element.style.setProperty('--aa-callout-picture', `url("${picture.replace(/["\\\s]/g, char => encodeURIComponent(char))}")`)
    else element.style.removeProperty('--aa-callout-picture')
    if (block.box && block.color) element.dataset.fill = block.color
    else delete element.dataset.fill
    if (block.box) element.style.removeProperty('--aa-callout-icon')
    else {
      const icon = icons[`./icons/${block.folded ? 'toggle' : block.callout === 'tip' ? 'check' : block.callout === 'warning' || block.callout === 'caution' ? 'callout' : 'note'}.svg`]
      element.style.setProperty('--aa-callout-icon', `url("data:image/svg+xml,${encodeURIComponent(icon.replace(/currentColor/g, 'black'))}")`)
    }
    element.dataset.callout = block.callout
    element.toggleAttribute('data-folded', !!block.folded)
    element.toggleAttribute('data-body-active', !!reveal && reveal.to > block.source.indexOf('\n') && block.source.includes('\n'))
  } else {
    delete element.dataset.callout
    delete element.dataset.icon
    delete element.dataset.fill
    element.removeAttribute('data-box')
    element.removeAttribute('data-picture')
    element.style.removeProperty('--aa-callout-picture')
    element.removeAttribute('data-folded')
    element.removeAttribute('data-body-active')
  }
  if (block.kind === 'table') { renderTable(element, block, reveal, decorations, atoms); renderCarets(element, decorations); return }
  // A fenced block an atom draws (a diagram) is that drawing, the caret in it
  // or not: its words are never shown, and it is changed where it is drawn.
  const fenced = fencedAtom(block, atoms)
  element.toggleAttribute('data-drawn', !!fenced || block.kind === 'columns' || block.kind === 'tabs' || block.kind === 'toc')
  if (fenced) element.dataset.fence = fenced.name
  else delete element.dataset.fence
  // A code block's copy button is drawn by the sheet in its first square, so the text in the block stays the text alone.
  if (block.kind === 'code' && !fenced) {
    element.style.setProperty('--aa-copy-icon', pictureOf('copy'))
    element.style.setProperty('--aa-copied-icon', pictureOf('check'))
  } else {
    element.style.removeProperty('--aa-copy-icon')
    element.style.removeProperty('--aa-copied-icon')
  }

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
    if (run.kind === 'break') { const line = document.createElement('br'); line.dataset.line = ''; destination.append(line); continue }
    const text = block.source.slice(run.from, run.to)
    if (!text) continue
    if (run.kind === 'atom') {
      if (run.group && reveal && !fenced && reveal.from <= run.to && reveal.to >= run.from) destination.append(document.createTextNode(text))
      else destination.append(kept.get(`${run.atom}\u0000${text}`)?.shift() ?? draw(run.atom!, text))
      visible = true
      continue
    }
    if (run.kind === 'syntax') { destination.append(hiddenSyntax(document, text)); continue }
    visible = true
    destination.append(wordsOf(document, run, text, decorations, 0, touches(reveal, run.from, run.to) ? null : addressFold(run, text)))
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
  const document = node.ownerDocument
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
  const document = element.ownerDocument
  for (const caret of decorations.filter(range => range.from === range.to && range.from >= 0 && range.from <= readBlock(element).length)) {
    const marker = document.createElement('span'); marker.className = `${caret.className} aa-peer-caret`; marker.contentEditable = 'false'; marker.dataset.label = caret.label ?? ''; if (caret.label) marker.dataset.initial = initialOf(caret.label); marker.title = caret.label ?? ''
    const point = pointAt(element, caret.from)
    const range = document.createRange(); range.setStart(point.node, point.offset); range.collapse(true); range.insertNode(marker)
  }
}

function renderTable(element: HTMLElement, block: Block, reveal: Reveal, decorations: readonly Decoration[], atoms: readonly AtomSyntax[]) {
  const document = element.ownerDocument
  element.contentEditable = 'false'
  const rows = tableRows(block.source), alignments = tableAlignments(block.source), widths = tableWidths(block.source)
  // Columns with widths of their own stand at them; without, they share the line.
  if (widths.some(width => width !== null)) element.style.setProperty('--aa-table-columns', widths.map(width => width === null ? 'minmax(0, 1fr)' : `calc(${width} * var(--aa-unit))`).join(' '))
  else element.style.removeProperty('--aa-table-columns')
  // Without widths the columns share the table in whole squares, the last taking what is left.
  const columns = Math.max(1, rows[0]?.length ?? 1)
  element.style.setProperty('--aa-table-auto', `${columns > 1 ? `repeat(${columns - 1}, round(down, calc(100% / ${columns}), var(--aa-unit))) ` : ''}minmax(0, 1fr)`)
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
      // A cell's words are Markdown as any writing is; only a pipe of its own is not read as a cell's edge.
      const content = document.createElement('span')
      for (const run of blockRuns({ kind: 'paragraph', source: cell.text, prefix: 0 }, atoms)) {
        const text = cell.text.slice(run.from, run.to)
        if (!text) continue
        if (run.kind === 'syntax') content.append(hiddenSyntax(document, text))
        else if (run.kind === 'text') content.append(wordsOf(document, run, text, decorations, cell.from, touches(reveal, cell.from + run.from, cell.from + run.to) ? null : addressFold(run, text)))
        else content.append(document.createTextNode(text))
      }
      if (!cell.text) { const br = document.createElement('br'); br.dataset.filler = ''; content.append(br) }
      // Before the words, which `pointAt` looks for last in the cell.
      if (row === 0) {
        const handle = document.createElement('span')
        handle.className = 'ds-table-column-resize'
        handle.contentEditable = 'false'
        handle.tabIndex = 0
        handle.setAttribute('data-aa-interactive', '')
        handle.setAttribute('role', 'separator')
        handle.setAttribute('aria-orientation', 'vertical')
        handle.setAttribute('aria-label', word('Column width'))
        node.append(handle)
      }
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
  // Aa's own line breaks are marked. A bare one is the browser's, left to hold the
  // line open when the last letter goes, and counts only once words stand after it.
  let breaks = 0, hidden = ''
  const settle = () => { out += '\n'.repeat(breaks) + hidden; breaks = 0; hidden = '' }
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (!text) continue
        // Hidden syntax is not something standing after a break: bold's last letter gone leaves the browser's break between its stars.
        if (breaks && isHidden(child)) { hidden += text; continue }
        settle()
        out += text.replace(/\u00a0/g, ' ')
        continue
      }
      if (!(isElement(child))) continue
      if (isAtom(child)) { settle(); out += child.dataset.source ?? ''; continue }
      if (child.tagName === 'BR') {
        if ('filler' in child.dataset) settle()
        else if ('line' in child.dataset) { settle(); out += '\n' }
        else breaks++
        continue
      }
      if (/^(DIV|P)$/.test(child.tagName) && out && !out.endsWith('\n')) out += '\n'
      walk(child)
    }
  }
  walk(element)
  breaks = Math.max(0, breaks - 1)
  settle()
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
  // Siblings walked in place: a paragraph of thousands of runs has no need of an array of them, and the caret is read on every key.
  const walk = (parent: Node): boolean => {
    let index = 0
    for (let child = parent.firstChild; child; child = child.nextSibling, index++) {
      if (parent === node && index === nodeOffset) { found = count; return true }
      if (child === node && child.nodeType === Node.TEXT_NODE) { found = count + nodeOffset; return true }
      if (child.nodeType === Node.TEXT_NODE) { count += (child as Text).length; continue }
      if (!(isElement(child))) continue
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
    if (parent === node && nodeOffset >= index) { found = count; return true }
    return false
  }
  if (node === element || element.contains(node)) walk(element)
  return found < 0 ? count : found
}

/** The DOM point for an offset into a block's source, in text that is displayed. */
export function pointAt(element: HTMLElement, offset: number): { node: Node; offset: number } {
  const document = element.ownerDocument
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
      if (!(isElement(child))) continue
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
