import type { Block } from './markdown'
import type { Pos } from './document'

export type Snapshot = { blocks: Block[]; anchor: Pos; focus: Pos }

/**
 * Undo as a stack of whole documents, which are small. Letters typed one
 * after another within a moment are one step, so undo takes back the word,
 * not the letter.
 */
export class History {
  private past: Snapshot[] = []
  private future: Snapshot[] = []
  private lastKind: 'type' | 'edit' | null = null
  private lastTime = 0
  private lastBlock = -1

  constructor(initial: Snapshot) { this.past.push(initial) }

  get current(): Snapshot { return this.past[this.past.length - 1] }

  reset(snapshot: Snapshot) {
    this.past = [snapshot]
    this.future = []
    this.lastKind = null
  }

  record(snapshot: Snapshot, kind: 'type' | 'edit', now = Date.now()) {
    const joins = kind === 'type' && this.lastKind === 'type' && now - this.lastTime < 700 && snapshot.focus.block === this.lastBlock
    if (joins) this.past[this.past.length - 1] = snapshot
    else this.past.push(snapshot)
    this.future = []
    this.lastKind = kind
    this.lastTime = now
    this.lastBlock = snapshot.focus.block
  }

  undo(): Snapshot | null {
    if (this.past.length < 2) return null
    this.future.push(this.past.pop()!)
    this.lastKind = null
    return this.current
  }

  redo(): Snapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(next)
    this.lastKind = null
    return next
  }
}
