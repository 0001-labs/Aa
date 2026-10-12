import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  documents: defineTable({ key: v.string(), state: v.bytes() }).index('by_key', ['key']),
})
