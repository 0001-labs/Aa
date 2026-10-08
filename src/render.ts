/**
 * A block drawn from its source, and read back from the screen. Every
 * character of the source is in the DOM as text, syntax included; syntax
 * that is not being edited is not displayed, so the caret passes over it as
 * if it were not there, and the text still reads straight back.
 */

import { blockRuns, type Block } from './markdown'

/** Which part of a block the selection is in, in its own offsets; null when the selection is elsewhere. */
export type Reveal = { from: number; to: number } | null

/** The key of what a reveal shows: which groups, and whether the block is active. Same key, same drawing. */
export function revealKey(block: Block, reveal: Reveal): string {
  if (!reveal) return ''
  const groups: string[] = []
  for (const run of blockRuns(block)) {
    if (run.kind !== 'syntax' || !run.group) continue
    const key = `${run.group[0]}-${run.group[1]}`
    if (reveal.from <= run.group[1] && reveal.to >= run.group[0] && !groups.includes(key)) groups.push(key)
  }
  return `on:${groups.join(',')}`
}

export function renderBlock(element: HTMLElement, block: Block, reveal: Reveal) {
  element.className = 'aa-block'
  element.dataset.kind = block.kind
  if (block.level) element.dataset.level = String(block.level)
  else delete element.dataset.level
  if (block.checked === undefined) delete element.dataset.checked
  else element.dataset.checked = block.checked ? 'true' : 'false'
  element.toggleAttribute('data-active', !!reveal)
  element.dataset.reveal = revealKey(block, reveal)

  const fragment = document.createDocumentFragment()
  let visible = false
  let lastBreak = false
  for (const run of blockRuns(block)) {
    lastBreak = run.kind === 'break'
    if (run.kind === 'break') { fragment.append(document.createElement('br')); continue }
    const text = block.source.slice(run.from, run.to)
    if (!text) continue
    if (run.kind === 'syntax') {
      const span = document.createElement('span')
      span.className = 'aa-syntax'
      const shown = run.prefix ? !!reveal : !!reveal && !!run.group && reveal.from <= run.group[1] && reveal.to >= run.group[0]
      if (!shown) span.setAttribute('data-hidden', '')
      else visible = true
      span.textContent = text
      fragment.append(span)
      continue
    }
    visible = true
    const node = run.href ? document.createElement('a') : document.createElement('span')
    if (node instanceof HTMLAnchorElement) { node.href = run.href!; node.className = 'aa-link'; node.rel = 'noopener' }
    if (run.bold) node.classList.add('aa-b')
    if (run.italic) node.classList.add('aa-i')
    if (run.strike) node.classList.add('aa-s')
    if (run.code) node.classList.add('aa-c')
    node.textContent = text
    fragment.append(node)
  }
  // A block with no line to stand on gets one: an empty block, one ending on
  // a line break, or one whose every character is hidden syntax.
  if (!visible || lastBreak) {
    const filler = document.createElement('br')
    filler.dataset.filler = ''
    fragment.append(filler)
  }
  element.replaceChildren(fragment)
}

/** The block's source, read back from whatever the browser left in it. */
export function readBlock(element: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) { out += (child.textContent ?? '').replace(/ /g, ' '); continue }
      if (!(child instanceof HTMLElement)) continue
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
  let count = 0
  let result: { node: Node; offset: number } | null = null
  const walk = (parent: Node): boolean => {
    const children = Array.from(parent.childNodes)
    for (let index = 0; index < children.length; index++) {
      const child = children[index]
      if (child.nodeType === Node.TEXT_NODE) {
        const length = (child.textContent ?? '').length
        if (!isHidden(child) && offset >= count && offset <= count + length) { result = { node: child, offset: offset - count }; return true }
        count += length
        continue
      }
      if (!(child instanceof HTMLElement)) continue
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
