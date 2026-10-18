import type { Block } from './markdown'
import type { Pos } from './document'

export type Snapshot = { blocks: Block[]; anchor: Pos; focus: Pos }

/** Letters typed, letters deleted, or anything else, which is always a step of its own. */
export type ChangeKind = 'type' | 'delete' | 'edit'

/**
 * Undo as a stack of whole documents, which are small. Letters typed one
 * after another within a moment are one step, so undo takes back the word,
 * not the letter; deleting is a step apart from typing, and a space after a
 * word begins a new step. Undo puts the caret where the change it took back
 * was, not where the caret stood after the step before.
 */
export class History {
  private past: Snapshot[] = []
  private future: Snapshot[] = []
  private lastKind: ChangeKind | null = null
  private lastTime = 0
  private lastBlock = -1

  constructor(initial: Snapshot) { this.past.push(initial) }

  get current(): Snapshot { return this.past[this.past.length - 1] }

  reset(snapshot: Snapshot) {
    this.past = [snapshot]
    this.future = []
    this.lastKind = null
  }

  record(snapshot: Snapshot, kind: ChangeKind, now = Date.now()) {
    const joins = kind !== 'edit' && kind === this.lastKind && now - this.lastTime < 700 && snapshot.focus.block === this.lastBlock && !(kind === 'type' && endsWord(snapshot))
    if (joins) this.past[this.past.length - 1] = snapshot
    else this.past.push(snapshot)
    this.future = []
    this.lastKind = kind
    this.lastTime = now
    this.lastBlock = snapshot.focus.block
  }

  undo(): Snapshot | null {
    if (this.past.length < 2) return null
    const undone = this.past.pop()!
    this.future.push(undone)
    this.lastKind = null
    const caret = changeEnd(this.current.blocks, undone.blocks)
    return caret ? { ...this.current, anchor: caret, focus: caret } : this.current
  }

  redo(): Snapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(next)
    this.lastKind = null
    return next
  }
}

/** Whether the letter just typed is a space following a word. */
const endsWord = ({ blocks, focus }: Snapshot) => {
  const text = blocks[focus.block]?.source ?? ''
  return /\s/.test(text[focus.offset - 1] ?? '') && /\S/.test(text[focus.offset - 2] ?? '')
}

const same = (a: Block, b: Block) => a === b || (a.kind === b.kind && a.source === b.source)

/** Where, in `blocks`, the part that differs from `other` ends; null when nothing differs. */
export function changeEnd(blocks: readonly Block[], other: readonly Block[]): Pos | null {
  let start = 0
  while (start < blocks.length && start < other.length && same(blocks[start], other[start])) start++
  if (start === blocks.length && start === other.length) return null
  let end = blocks.length, otherEnd = other.length
  while (end > start && otherEnd > start && same(blocks[end - 1], other[otherEnd - 1])) { end--; otherEnd-- }
  // Whole blocks were added: the caret goes where they stood.
  if (end === start) return start > 0 ? { block: start - 1, offset: blocks[start - 1].source.length } : { block: 0, offset: 0 }
  const text = blocks[end - 1].source
  if (otherEnd === start) return { block: end - 1, offset: text.length }
  const otherText = other[otherEnd - 1].source
  // Within one block the common start counts once, so the common end cannot reach into it.
  let prefix = 0
  if (end - 1 === start && otherEnd - 1 === start) while (prefix < text.length && prefix < otherText.length && text[prefix] === otherText[prefix]) prefix++
  let suffix = 0
  const limit = Math.min(text.length, otherText.length) - prefix
  while (suffix < limit && text[text.length - 1 - suffix] === otherText[otherText.length - 1 - suffix]) suffix++
  return { block: end - 1, offset: text.length - suffix }
}
