import { mutation, query } from './_generated/server'
import { v, ConvexError } from 'convex/values'
import * as Y from 'yjs'

// This component API is called only from the parent app's authenticated wrappers.
// The parent checks read/write access to the note before invoking any operation.
const LIMIT = 512 * 1024
function keyOf(key: string) { if (!key || key.length > 200) throw new ConvexError('Invalid document key'); return key }
function bytes(update: Uint8Array): ArrayBuffer { return new Uint8Array(update).buffer }
export const get = query({
  args: { key: v.string() }, returns: v.union(v.bytes(), v.null()),
  handler: async (ctx, { key }) => {
    const document = await ctx.db.query('documents').withIndex('by_key', q => q.eq('key', keyOf(key))).unique()
    return document?.state ?? null
  },
})
export const initialize = mutation({
  args: { key: v.string(), markdown: v.string() }, returns: v.bytes(),
  handler: async (ctx, { key, markdown }) => {
    keyOf(key)
    const document = await ctx.db.query('documents').withIndex('by_key', q => q.eq('key', key)).unique()
    if (document) return document.state
    if (new TextEncoder().encode(markdown).length > LIMIT / 2) throw new ConvexError('Document is too large')
    const doc = new Y.Doc()
    try {
      doc.getText('markdown').insert(0, markdown)
      const state = bytes(Y.encodeStateAsUpdate(doc))
      await ctx.db.insert('documents', { key, state })
      return state
    } finally { doc.destroy() }
  },
})
export const append = mutation({
  args: { key: v.string(), update: v.bytes() }, returns: v.string(),
  handler: async (ctx, { key, update }) => {
    keyOf(key)
    if (update.byteLength > LIMIT) throw new ConvexError('Update is too large')
    const document = await ctx.db.query('documents').withIndex('by_key', q => q.eq('key', key)).unique()
    if (!document) throw new ConvexError('Document is not initialized')
    const doc = new Y.Doc()
    try {
      try { Y.applyUpdate(doc, new Uint8Array(document.state)); Y.applyUpdate(doc, new Uint8Array(update)) } catch { throw new ConvexError('Invalid document update') }
      const markdown = doc.getText('markdown').toString()
      const state = bytes(Y.encodeStateAsUpdate(doc))
      if (state.byteLength > LIMIT) throw new ConvexError('Document is too large')
      await ctx.db.patch(document._id, { state })
      // The parent can store these words on its note in this same transaction.
      return markdown
    } finally { doc.destroy() }
  },
})
