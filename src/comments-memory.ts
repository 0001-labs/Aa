/**
 * A comment store that keeps its threads in memory: the playground's, and a
 * product's tests'. It does what a product's backend does, in one tab: ids,
 * times, who may delete, what is unread, the people to mention.
 */

import type { Comment, CommentMove, CommentPerson, CommentRange, CommentStore, CommentThread } from './comments'

export type MemoryCommentStore = CommentStore & {
  /** The threads as they are kept. */
  readonly threads: readonly CommentThread[]
  /** A thread put in from outside, as another person's comment would arrive. */
  put(thread: CommentThread): void
}

export type MemoryCommentStoreOptions = {
  me?: CommentPerson
  people?: readonly CommentPerson[]
  threads?: readonly CommentThread[]
  panel?: HTMLElement
  /** Milliseconds each write takes, as a server's would. */
  delay?: number
  now?: () => number
}

export function memoryCommentStore(options: MemoryCommentStoreOptions = {}): MemoryCommentStore {
  const now = options.now ?? (() => Date.now())
  let threads: CommentThread[] = [...(options.threads ?? [])]
  const listeners = new Set<(threads: readonly CommentThread[]) => void>()
  let counter = 0
  const id = (prefix: string) => `${prefix}${(++counter).toString(36)}${now().toString(36).slice(-3)}`
  const me = options.me
  const seen = new Map<string, number>()
  const view = (): CommentThread[] => threads.map(thread => ({
    ...thread,
    canDelete: !!me && thread.comments[0]?.author.id === me.id,
    unread: !!me && thread.comments.some(comment => comment.author.id !== me.id && comment.createdAt > (seen.get(thread.id) ?? 0)),
  }))
  const tell = () => { const shown = view(); for (const listener of listeners) listener(shown) }
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, options.delay ?? 0))
  const writer = (): CommentPerson => { if (!me) throw new Error('Sign in to comment'); return me }
  const find = (threadId: string) => { const thread = threads.find(each => each.id === threadId); if (!thread) throw new Error('This thread is gone'); return thread }
  const replace = (next: CommentThread) => { threads = threads.map(thread => thread.id === next.id ? next : thread) }
  const store: MemoryCommentStore = {
    me,
    panel: options.panel,
    get threads() { return threads },
    put(thread) { if (threads.some(each => each.id === thread.id)) replace(thread); else threads = [...threads, thread]; tell() },
    subscribe(receive) { listeners.add(receive); receive(view()); return () => { listeners.delete(receive) } },
    async add(range: CommentRange, body: string, mentions: readonly CommentPerson[]) {
      const author = writer(); await wait()
      const at = now()
      const comment: Comment = { id: id('c'), author, body, createdAt: at, mentions: [...mentions] }
      const thread: CommentThread = { id: id('t'), ...range, comments: [comment], createdAt: at, updatedAt: at }
      threads = [...threads, thread]; seen.set(thread.id, at); tell()
      return thread.id
    },
    async reply(threadId, body, mentions) {
      const author = writer(); await wait()
      const thread = find(threadId)
      if (thread.resolvedAt) throw new Error('Reopen this thread before replying')
      const at = now()
      replace({ ...thread, comments: [...thread.comments, { id: id('c'), author, body, createdAt: at, mentions: [...mentions] }], updatedAt: at })
      seen.set(threadId, at); tell()
    },
    async edit(commentId, body) {
      const author = writer(); await wait()
      const thread = threads.find(each => each.comments.some(comment => comment.id === commentId))
      if (!thread) throw new Error('This comment is gone')
      if (!thread.comments.find(comment => comment.id === commentId && comment.author.id === author.id)) throw new Error('Only your own comments can be edited')
      replace({ ...thread, comments: thread.comments.map(comment => comment.id === commentId ? { ...comment, body, editedAt: now() } : comment), updatedAt: now() }); tell()
    },
    async resolve(threadId, resolved) {
      const person = writer(); await wait()
      const thread = find(threadId)
      replace(resolved ? { ...thread, resolvedAt: now(), resolvedBy: person, updatedAt: now() } : { ...thread, resolvedAt: undefined, resolvedBy: undefined, updatedAt: now() }); tell()
    },
    async remove(threadId) {
      const person = writer(); await wait()
      const thread = find(threadId)
      if (thread.comments[0]?.author.id !== person.id) throw new Error('Only the person who started a thread can delete it')
      threads = threads.filter(each => each.id !== threadId); tell()
    },
    async move(moves: readonly CommentMove[]) {
      await wait()
      for (const move of moves) { const thread = threads.find(each => each.id === move.id); if (thread) replace({ ...thread, from: move.from, to: move.to, quote: move.quote }) }
      tell()
    },
    async seen(threadId) { seen.set(threadId, now()); tell() },
    people(query) { const needle = query.trim().toLocaleLowerCase(); return (options.people ?? []).filter(person => !needle || person.name.toLocaleLowerCase().includes(needle)) },
  }
  return store
}
