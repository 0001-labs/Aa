import * as Y from 'yjs'
import type { Editor } from './editor'

export type PeerSelection = { id: string; label: string; anchor: Uint8Array; focus: Uint8Array }
/** Convex supplies one atomic initialization, a reactive state query, and an append mutation. */
export type CollaborationTransport = {
  initialize(markdown: string): Promise<Uint8Array>
  subscribe(receive: (state: Uint8Array) => void): () => void
  send(update: Uint8Array): Promise<void>
  loadPending?(): readonly Uint8Array[]
  savePending?(updates: readonly Uint8Array[]): void
  publishSelection?(selection: PeerSelection | null): Promise<void>
  subscribeSelections?(receive: (peers: readonly PeerSelection[]) => void): () => void
}
export type CollaborationOptions = { id: string; label?: string; onError?(error: unknown): void }
export type Collaboration = { ready: Promise<void>; flush(): Promise<void>; retry(): Promise<void>; destroy(): void; readonly pending: number }
const LOCAL = Symbol('local'), REMOTE = Symbol('remote')

/** The smallest source replacement needed to mirror a Markdown edit into Y.Text. */
export function textChange(before: string, after: string): { start: number; end: number; text: string } {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let end = before.length, tail = after.length
  while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail-- }
  return { start, end, text: after.slice(start, tail) }
}

export function connectCollaboration(editor: Editor, transport: CollaborationTransport, options: CollaborationOptions): Collaboration {
  const doc = new Y.Doc(), text = doc.getText('markdown')
  const undo = new Y.UndoManager(text, { trackedOrigins: new Set([LOCAL]), captureTimeout: 700 })
  let stopped = false, applying = false, initialized = false, sending: Promise<void> | null = null
  const updates: Uint8Array[] = [], waiting: Uint8Array[] = []
  const originalReadOnly = editor.readOnly
  editor.readOnly = true
  const fail = (error: unknown) => options.onError?.(error)
  const persist = () => { try { transport.savePending?.(updates) } catch (error) { fail(error) } }
  const syncEditor = () => {
    if (!initialized || stopped) return
    const selection = editor.selection()
    const anchor = selection ? Y.createRelativePositionFromTypeIndex(text, Math.min(selection.start, text.length)) : null
    const focus = selection ? Y.createRelativePositionFromTypeIndex(text, Math.min(selection.end, text.length)) : null
    applying = true
    try {
      editor.value = text.toString()
      if (anchor && focus) {
        const a = Y.createAbsolutePositionFromRelativePosition(anchor, doc), b = Y.createAbsolutePositionFromRelativePosition(focus, doc)
        if (a && b) editor.selectRange(a.index, b.index)
      }
    } finally { applying = false }
  }
  const flush = async () => {
    if (sending) return sending
    sending = (async () => {
      while (updates.length && !stopped) {
        const update = updates[0]
        await transport.send(update)
        updates.shift(); persist()
      }
    })()
    try { await sending } finally { sending = null }
  }
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (stopped) return
    if (origin !== REMOTE) { updates.push(update); persist(); void flush().catch(fail) }
  }
  doc.on('update', onUpdate)
  const receive = (state: Uint8Array) => {
    if (stopped) return
    if (!initialized) { waiting.push(state); return }
    // Capture relative positions before applying remote edits.
    const selection = editor.selection()
    const anchor = selection ? Y.createRelativePositionFromTypeIndex(text, Math.min(selection.start, text.length)) : null
    const focus = selection ? Y.createRelativePositionFromTypeIndex(text, Math.min(selection.end, text.length)) : null
    try {
      Y.applyUpdate(doc, state, REMOTE)
      applying = true
      editor.value = text.toString()
      if (anchor && focus) {
        const a = Y.createAbsolutePositionFromRelativePosition(anchor, doc), b = Y.createAbsolutePositionFromRelativePosition(focus, doc)
        if (a && b) editor.selectRange(a.index, b.index)
      }
    } catch (error) { fail(error) } finally { applying = false }
  }
  const stop = transport.subscribe(receive)
  const local = (event: Event) => {
    if (applying || !initialized || stopped) return
    const change = textChange(text.toString(), editor.value)
    // A correction is a step of its own to undo, apart from the typing around it.
    const correction = (event as CustomEvent<{ correction?: boolean } | null>).detail?.correction
    if (correction) undo.stopCapturing()
    doc.transact(() => { if (change.end > change.start) text.delete(change.start, change.end - change.start); if (change.text) text.insert(change.start, change.text) }, LOCAL)
    if (correction) undo.stopCapturing()
  }
  const publish = () => {
    if (!initialized || stopped || applying || !transport.publishSelection) return
    const selection = editor.selection()
    const peer = selection ? { id: options.id, label: options.label ?? options.id,
      anchor: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, Math.min(selection.start, text.length))),
      focus: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, Math.min(selection.end, text.length))),
    } : null
    void transport.publishSelection(peer).catch(fail)
  }
  const stopSelections = transport.subscribeSelections?.(peers => {
    if (stopped || !initialized) return
    const ranges = peers.filter(peer => peer.id !== options.id).flatMap(peer => {
      try {
        const anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(peer.anchor), doc)
        const focus = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(peer.focus), doc)
        if (!anchor || !focus) return []
        return [{ from: Math.min(anchor.index, focus.index), to: Math.max(anchor.index, focus.index), className: 'aa-peer-selection', label: peer.label }]
      } catch { return [] }
    })
    editor.decorate(ranges, 'presence')
  }) ?? (() => {})
  editor.element.addEventListener('aa-change', local)
  editor.element.addEventListener('aa-selectionchange', publish)
  const ready = transport.initialize(editor.value).then(state => {
    if (stopped) return
    Y.applyUpdate(doc, state, REMOTE)
    for (const state of waiting) Y.applyUpdate(doc, state, REMOTE)
    waiting.length = 0
    for (const update of transport.loadPending?.() ?? []) { Y.applyUpdate(doc, update, REMOTE); updates.push(update) }
    initialized = true
    if (updates.length) void flush().catch(fail)
    syncEditor(); editor.readOnly = originalReadOnly
    editor.setHistoryProvider({ undo: () => { if (!undo.undoStack.length) return false; undo.undo(); syncEditor(); return true }, redo: () => { if (!undo.redoStack.length) return false; undo.redo(); syncEditor(); return true } })
  }).catch(error => { editor.readOnly = originalReadOnly; fail(error); throw error })
  return {
    ready, flush, retry: flush, get pending() { return updates.length },
    destroy() {
      stopped = true; stop(); stopSelections()
      editor.element.removeEventListener('aa-change', local); editor.element.removeEventListener('aa-selectionchange', publish)
      editor.setHistoryProvider(null); editor.decorate([], 'presence'); editor.readOnly = originalReadOnly
      void transport.publishSelection?.(null).catch(fail)
      undo.destroy(); doc.destroy()
    },
  }
}
