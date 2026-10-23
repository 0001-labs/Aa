import type { Editor, EditorOptions } from './editor'
import type { CommentStore, CommentThread, CommentPerson } from './comments'
import { changeCommentSource, commentSourceOffset, commentTextOffset, exportMarkdown, moveCommentText, readCommentSource, writeCommentSource, type CommentAction } from './comments-markdown'

export type SourceCommentsOptions = {
  /** An IDv1 account code. Omit for read-only comments. The host authenticates this person. */
  me?: CommentPerson
  people?: readonly CommentPerson[]
  panel?: HTMLElement
}

/** Project source onto prose, keeping comment metadata outside contenteditable. */
export function createSourceEditor(host: HTMLElement, options: EditorOptions, create: (host: HTMLElement, options: EditorOptions) => Editor): Editor {
  if (options.comments) throw Error('Choose sourceComments or an external comments store, not both.')
  const config = options.sourceComments ?? {}
  let source = options.value ?? '', parsed = readCommentSource(source)
  if (parsed.diagnostics.length) throw Error(parsed.diagnostics.join(' '))
  let core: Editor
  let past = [source], future: string[] = []
  let lastTyped = 0
  let stopped = false
  const listeners = new Set<(threads: readonly CommentThread[]) => void>()
  const person = (id: string) => [config.me, ...(config.people ?? [])].find(p => p?.id === id) ?? { id, name: id }
  const threads = (): CommentThread[] => parsed.threads.map(t => ({
    id: t.id, quote: parsed.anchors[t.id] ? parsed.markdown.slice(parsed.anchors[t.id].from, parsed.anchors[t.id].to) : t.quote,
    from: parsed.anchors[t.id]?.from ?? -1, to: parsed.anchors[t.id]?.to ?? -1,
    orphaned: !parsed.anchors[t.id],
    createdAt: Date.parse(t.comments[0].created), updatedAt: Math.max(...t.comments.map(c => Date.parse(c.edited ?? c.created))),
    ...(t.status === 'resolved' ? { resolvedAt: Date.parse(t.resolved!), resolvedBy: person(t.resolvedBy!) } : {}),
    canDelete: t.comments[0].author === config.me?.id,
    comments: t.comments.map(c => ({ id: c.id, author: person(c.author), body: c.body, createdAt: Date.parse(c.created),
      ...(c.edited ? { editedAt: Date.parse(c.edited) } : {}), mentions: c.mentions?.map(person),
      reactions: Object.entries(c.reactions ?? {}).filter(([, voters]) => voters.length).map(([emoji, voters]) => ({ emoji, count: voters.length, reacted: voters.includes(config.me?.id ?? ''), names: voters.map(id => person(id).name) })),
    })),
  }))
  const publish = () => { for (const receive of listeners) receive(threads()) }
  const record = (next: string, typed = false) => {
    if (next === source) return
    source = next; parsed = readCommentSource(source)
    const now = Date.now()
    if (typed && lastTyped && now - lastTyped < 700 && past.length > 1) past[past.length - 1] = source
    else past.push(source)
    lastTyped = typed ? now : 0; future = []
    publish(); options.onChange?.(source)
  }
  const action = async (operation: CommentAction) => {
    if (stopped || core.readOnly || !config.me) throw Error('Comments are read only.')
    const next = changeCommentSource(source, config.me.id, operation)
    record(next)
    // Comment-only changes also reach source-based persistence/collaboration listeners.
    host.dispatchEvent(new Event('aa-change'))
  }
  const store: CommentStore = {
    me: config.me, panel: config.panel,
    subscribe(receive) { listeners.add(receive); receive(threads()); return () => { listeners.delete(receive) } },
    people(query) { return [config.me, ...(config.people ?? [])].filter((p): p is CommentPerson => !!p && p.name.toLowerCase().includes(query.toLowerCase())) },
    add(range, body) { return action({ type: 'add', from: range.from, to: range.to, body }) },
    reply(thread, body) { return action({ type: 'reply', thread, body }) },
    edit(comment, body) { return action({ type: 'edit', comment, body }) },
    resolve(thread, resolved) { return action({ type: resolved ? 'resolve' : 'reopen', thread }) },
    remove(thread) { return action({ type: 'remove', thread }) },
    react(comment, emoji) { return action({ type: 'react', comment, emoji }) },
  }
  core = create(host, { ...options, sourceComments: undefined, comments: store, value: parsed.markdown,
    onChange(markdown) {
      const typed = Math.abs(markdown.length - parsed.markdown.length) === 1 && !/\s$/.test(markdown)
      record(writeCommentSource(moveCommentText(parsed, markdown)), typed)
    },
  })
  // Existing editor parsing normalizes block separators. Adopt its projection only on a real edit.
  const restore = (next: string) => {
    source = next; parsed = readCommentSource(next); core.value = parsed.markdown; publish()
    options.onChange?.(source); host.dispatchEvent(new Event('aa-change'))
  }
  const undo = () => { if (core.readOnly || past.length < 2) return false; future.push(past.pop()!); lastTyped = 0; restore(past[past.length - 1]); return true }
  const redo = () => { if (core.readOnly || !future.length) return false; const next = future.pop()!; past.push(next); lastTyped = 0; restore(next); return true }
  core.setHistoryProvider({ undo, redo })
  // The view's change handler sees the text event after onChange. Refresh from canonical anchors last.
  const changed = () => publish()
  host.addEventListener('aa-change', changed)
  const sourceAt = (at: number, after = true) => commentSourceOffset(parsed, at, after)
  const textAt = (at: number) => commentTextOffset(parsed, at)
  const methods: Partial<Editor> = {
    exportMarkdown: () => exportMarkdown(source),
    undo, redo,
    selection() { const s = core.selection(); return s && { start: sourceAt(s.start), end: sourceAt(s.end, s.start === s.end) } },
    selectRange(start, end = start) { core.selectRange(textAt(start), textAt(end)) },
    replace(start, end, text) {
      if (core.readOnly) return
      // Public replacements address the full source, including CLI-created metadata.
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw Error('Invalid source range.')
      const next = source.slice(0, start) + text + source.slice(end)
      const read = readCommentSource(next)
      if (read.diagnostics.length) throw Error(read.diagnostics.join(' '))
      if (read.markdown === parsed.markdown || /aa-comments|<!--aa:/.test(text)) {
        core.value = read.markdown; record(next); host.dispatchEvent(new Event('aa-change')); return
      }
      core.replace(textAt(start), textAt(end), text)
    },
    rangeOf(start, end) { return core.rangeOf(textAt(start), textAt(end)) },
    find(query, sensitive) { return core.find(query, sensitive).map(s => ({ start: sourceAt(s.start), end: sourceAt(s.end, false) })) },
    activeBlock() { const b = core.activeBlock(); return b && { ...b, start: sourceAt(b.start), end: sourceAt(b.end, false) } },
    decorate(ranges, layer) { core.decorate(ranges.map(r => ({ ...r, from: textAt(r.from), to: textAt(r.to) })), layer) },
    transaction(fn) { core.transaction(fn) },
    setHistoryProvider(provider) {
      if (provider) throw Error('Source comments require revision-checked document writes; the Yjs text adapter is not supported yet.')
      core.setHistoryProvider({ undo, redo })
    },
    destroy() { stopped = true; host.removeEventListener('aa-change', changed); listeners.clear(); core.destroy() },
  }
  return new Proxy(core, {
    get(target, key) {
      if (key === 'value') return source
      if (key in methods) return Reflect.get(methods, key)
      if (key === 'comments') {
        const c = target.comments
        return c && { open: c.open, start: c.start, close: c.close, get threads() { return c.threads.map(t => ({ ...t, from: t.orphaned ? -1 : sourceAt(t.from), to: t.orphaned ? -1 : sourceAt(t.to, false) })) } }
      }
      return Reflect.get(target, key)
    },
    set(target, key, value) {
      if (key !== 'value') return Reflect.set(target, key, value)
      if (value === source) return true
      const next = readCommentSource(value)
      if (next.diagnostics.length) throw Error(next.diagnostics.join(' '))
      source = value; parsed = next; core.value = next.markdown
      past = [source]; future = []; lastTyped = 0; publish(); return true
    },
  })
}
