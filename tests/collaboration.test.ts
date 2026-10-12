import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createEditor, type Editor } from '../src/editor'
import { connectCollaboration, type Collaboration, type CollaborationTransport } from '../src/collaboration'
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import schema from '../convex/schema'

const hosts: HTMLElement[] = [], editors: Editor[] = [], connections: Collaboration[] = []
afterEach(() => { connections.forEach(c => c.destroy()); editors.forEach(e => e.destroy()); hosts.forEach(h => h.remove()); hosts.length = editors.length = connections.length = 0; window.getSelection()?.removeAllRanges() })
function editor(value: string) { const host = document.createElement('div'); document.body.append(host); hosts.push(host); const e = createEditor(host, { value, menus: false }); editors.push(e); return e }
function relay() {
  const doc = new Y.Doc(), listeners = new Set<(update: Uint8Array) => void>()
  let initialized = false, online = true, broken = false
  const publish = () => { const update = Y.encodeStateAsUpdate(doc); listeners.forEach(listener => listener(update)) }
  const transport: CollaborationTransport = {
    initialize: async markdown => { if (!initialized) { doc.getText('markdown').insert(0, markdown); initialized = true }; return Y.encodeStateAsUpdate(doc) },
    subscribe: receive => { listeners.add(receive); return () => listeners.delete(receive) },
    send: async update => { if (broken) throw new Error('Connection lost'); Y.applyUpdate(doc, update); if (online) publish() },
  }
  return { transport, publish, pause: () => { online = false }, resume: () => { online = true; publish() }, break: () => { broken = true }, restore: () => { broken = false }, value: () => doc.getText('markdown').toString() }
}
function connect(e: Editor, transport: CollaborationTransport, id: string, onError?: (error: unknown) => void) { const c = connectCollaboration(e, transport, { id, onError }); connections.push(c); return c }

describe('collaboration', () => {
  it('initializes once and converges after concurrent edits delivered twice', async () => {
    const shared = relay(), a = editor('start'), b = editor('ignored local draft')
    const ca = connect(a, shared.transport, 'a'), cb = connect(b, shared.transport, 'b')
    await Promise.all([ca.ready, cb.ready]); expect(b.value).toBe('start')
    shared.pause()
    a.replace(5, 5, ' first'); b.replace(5, 5, ' second')
    await Promise.all([ca.flush(), cb.flush()]); shared.resume(); shared.publish()
    expect(a.value).toBe(b.value); expect(a.value).toContain('first'); expect(a.value).toContain('second')
    expect(a.value).toBe(shared.value())
  })
  it('undoes only local edits while preserving another editor’s changes', async () => {
    const shared = relay(), a = editor('start'), b = editor('start')
    const ca = connect(a, shared.transport, 'a'), cb = connect(b, shared.transport, 'b')
    await Promise.all([ca.ready, cb.ready])
    a.replace(5, 5, ' first'); await ca.flush()
    b.replace(b.value.length, b.value.length, ' second'); await cb.flush()
    expect(a.undo()).toBe(true); await ca.flush()
    expect(a.value).toBe('start second'); expect(b.value).toBe(a.value)
    expect(a.redo()).toBe(true); await ca.flush(); expect(b.value).toContain('first')
  })
  it('restores persisted unsent updates after the editor is destroyed', async () => {
    const shared = relay(), a = editor('start')
    let saved: Uint8Array[] = []
    const transport = { ...shared.transport, loadPending: () => saved, savePending: (updates: readonly Uint8Array[]) => { saved = updates.map(update => new Uint8Array(update)) } }
    const ca = connect(a, transport, 'a'); await ca.ready
    shared.break(); a.replace(5, 5, ' offline'); await expect(ca.flush()).rejects.toThrow()
    expect(saved).toHaveLength(1); ca.destroy()
    shared.restore(); const b = editor('start'), cb = connect(b, transport, 'b'); await cb.ready; await cb.flush()
    expect(b.value).toBe('start offline'); expect(shared.value()).toBe(b.value); expect(saved).toEqual([])
  })
  it('retains failed updates for explicit retry and restores read-only on initialization failure', async () => {
    const shared = relay(), a = editor('start'), errors = vi.fn()
    const ca = connect(a, shared.transport, 'a', errors); await ca.ready
    shared.break(); a.replace(5, 5, ' offline')
    await expect(ca.flush()).rejects.toThrow('Connection lost')
    expect(ca.pending).toBe(1)
    shared.restore(); await ca.retry(); expect(ca.pending).toBe(0); expect(shared.value()).toBe(a.value)
    const b = editor('draft'), failed = connect(b, { ...shared.transport, initialize: async () => { throw new Error('Access denied') } }, 'b', errors)
    await expect(failed.ready).rejects.toThrow('Access denied'); expect(b.readOnly).toBe(false)
  })
})

const modules = {
  '../convex/collaboration.ts': () => import('../convex/collaboration'),
  '../convex/_generated/server.ts': () => import('../convex/_generated/server'),
}
const init = makeFunctionReference<'mutation', { key: string; markdown: string }, ArrayBuffer>('collaboration:initialize')
const get = makeFunctionReference<'query', { key: string }, ArrayBuffer | null>('collaboration:get')
const append = makeFunctionReference<'mutation', { key: string; update: ArrayBuffer }, string>('collaboration:append')

describe('Convex component', () => {
  it('atomically initializes a note once and persists idempotent Yjs updates', async () => {
    const t = convexTest(schema, modules)
    const state = await t.mutation(init, { key: 'note-1', markdown: 'Hello' })
    const again = await t.mutation(init, { key: 'note-1', markdown: 'Another draft' })
    expect(new Uint8Array(again)).toEqual(new Uint8Array(state))
    const doc = new Y.Doc(); Y.applyUpdate(doc, new Uint8Array(state))
    doc.getText('markdown').insert(5, ' world')
    const update = new Uint8Array(Y.encodeStateAsUpdate(doc)).buffer
    expect(await t.mutation(append, { key: 'note-1', update })).toBe('Hello world')
    expect(await t.mutation(append, { key: 'note-1', update })).toBe('Hello world')
    const restored = new Y.Doc(); Y.applyUpdate(restored, new Uint8Array((await t.query(get, { key: 'note-1' }))!))
    expect(restored.getText('markdown').toString()).toBe('Hello world')
    doc.destroy(); restored.destroy()
  })
  it('rejects invalid and oversized updates without changing the note', async () => {
    const t = convexTest(schema, modules)
    const before = await t.mutation(init, { key: 'note-1', markdown: 'Keep this' })
    await expect(t.mutation(append, { key: 'note-1', update: new Uint8Array([255]).buffer })).rejects.toThrow('Invalid document update')
    await expect(t.mutation(append, { key: 'note-1', update: new ArrayBuffer(600000) })).rejects.toThrow('Update is too large')
    expect(await t.query(get, { key: 'note-1' })).toEqual(before)
  })
})
