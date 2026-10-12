import type { ConvexClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import type { CollaborationTransport } from './collaboration'

export type ConvexCollaborationApi = {
  get: FunctionReference<'query', 'public', { key: string }, ArrayBuffer | null>
  initialize: FunctionReference<'mutation', 'public', { key: string; markdown: string }, ArrayBuffer>
  append: FunctionReference<'mutation', 'public', { key: string; update: ArrayBuffer }, string>
}
/** Pass authenticated, authorized parent-app functions, never component internals. */
export function convexTransport(client: ConvexClient, api: ConvexCollaborationApi, key: string): CollaborationTransport {
  return {
    initialize: async markdown => new Uint8Array(await client.mutation(api.initialize, { key, markdown })),
    subscribe: receive => client.onUpdate(api.get, { key }, state => { if (state) receive(new Uint8Array(state)) }),
    send: async update => { await client.mutation(api.append, { key, update: new Uint8Array(update).buffer }) },
  }
}
