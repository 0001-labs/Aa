/** Portable comment source. No DOM, filesystem, or authenticated identity. */
import { parseDocument, stringify } from 'yaml'
import { codeCandidate, isCodeOf } from './vendor/idv1/shapes'
import { mapRange, textChange } from './comments'

export type SourceComment = {
  id: string; author: string; created: string; body: string; edited?: string
  mentions?: string[]; reactions?: Record<string, string[]>
}
export type SourceThread = {
  id: string; quote: string; status: 'open' | 'resolved'; comments: SourceComment[]
  resolved?: string; resolvedBy?: string
}
export type SourceAnchor = { from: number; to: number }
type Span = { from: number; to: number; metadata?: boolean }
export type CommentDocument = {
  markdown: string; threads: SourceThread[]; anchors: Record<string, SourceAnchor>
  diagnostics: string[]; spans: Span[]
}
const marker = /<!--aa:(start|end) ([A-Za-z0-9]{6})-->/g
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(value) && Number.isFinite(Date.parse(value))
const account = (value: unknown): value is string => typeof value === 'string' && isCodeOf('account', value)
const item = (value: unknown): value is string => typeof value === 'string' && isCodeOf('item', value)
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)

function validate(value: unknown): SourceThread[] {
  if (!object(value) || !Array.isArray(value.threads) || value.threads.length > 10000) throw Error('Expected threads array (at most 10000 threads).')
  const ids = new Set<string>()
  const unique = (id: unknown) => { if (!item(id) || ids.has(id)) throw Error('Thread and comment IDs must be unique IDv1 item codes.'); ids.add(id) }
  for (const t of value.threads) {
    if (!object(t)) throw Error('Invalid thread.')
    unique(t.id)
    if (typeof t.quote !== 'string' || !['open', 'resolved'].includes(t.status) || !Array.isArray(t.comments) || !t.comments.length) throw Error('Invalid thread fields.')
    if (t.status === 'resolved' && (!date(t.resolved) || !account(t.resolvedBy))) throw Error('Resolved threads need resolved and resolvedBy.')
    for (const c of t.comments) {
      if (!object(c)) throw Error('Invalid comment.')
      unique(c.id)
      if (!account(c.author) || !date(c.created) || typeof c.body !== 'string' || !c.body.trim() || (c.edited !== undefined && !date(c.edited))) throw Error('Invalid comment author, date or body.')
      if (c.mentions !== undefined && (!Array.isArray(c.mentions) || !c.mentions.every(account))) throw Error('Invalid mentions.')
      if (c.reactions !== undefined && (!object(c.reactions) || !Object.values(c.reactions).every(v => Array.isArray(v) && v.every(account)))) throw Error('Invalid reactions.')
    }
  }
  return value.threads as SourceThread[]
}

/** Code fences and code spans are examples, never executable comment syntax. */
function scan(source: string) {
  const fences: (Span & { info: string; body: string; closed: boolean })[] = []
  const protectedSpans: Span[] = []
  const lines = [...source.matchAll(/[^\n]*(?:\n|$)/g)].filter(m => m[0])
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line[0])
    if (!open) continue
    const start = line.index!, bodyStart = start + line[0].length
    let j = i + 1
    for (; j < lines.length; j++) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*(?:\r?\n)?$/.exec(lines[j][0])
      if (close && close[1][0] === open[1][0] && close[1].length >= open[1].length) break
    }
    const closed = j < lines.length, end = closed ? lines[j].index! + lines[j][0].length : source.length
    fences.push({ from: start, to: end, info: open[2].trim(), body: source.slice(bodyStart, closed ? lines[j].index : end), closed })
    protectedSpans.push({ from: start, to: end }); i = j
  }
  for (const line of lines) if (/^(?: {4}|\t)/.test(line[0])) protectedSpans.push({ from: line.index!, to: line.index! + line[0].length })
  const protectedAt = (at: number) => protectedSpans.some(s => at >= s.from && at < s.to)
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '`' || protectedAt(i) || source[i - 1] === '\\') continue
    let n = 1; while (source[i + n] === '`') n++
    let end = i + n
    while ((end = source.indexOf('`'.repeat(n), end)) >= 0) {
      if (!protectedAt(end) && source[end - 1] !== '`' && source[end + n] !== '`') break
      end += n
    }
    if (end >= 0) { protectedSpans.push({ from: i, to: end + n }); i = end + n - 1 } else i += n - 1
  }
  return { fences, protectedAt }
}

export function readCommentSource(source: string): CommentDocument {
  const { fences, protectedAt } = scan(source)
  const spans: Span[] = [], diagnostics: string[] = []
  let threads: SourceThread[] = []
  const metadata = fences.filter(f => /^aa-comments(?:\s|$)/.test(f.info))
  for (const f of metadata) {
    if (metadata.length > 1) { diagnostics.push('Multiple aa-comments blocks.'); break }
    if (f.info !== 'aa-comments v1') { diagnostics.push('Unsupported aa-comments version.'); continue }
    if (!f.closed || source.slice(f.to).trim()) { diagnostics.push('The aa-comments block must be closed and last.'); continue }
    try {
      if (f.body.length > 2_000_000) throw Error('Comment metadata exceeds 2 MB.')
      const doc = parseDocument(f.body, { schema: 'core', uniqueKeys: true })
      // YAML's core schema excludes implicit timestamp conversion. No custom tags or aliases.
      if (doc.errors.length || doc.warnings.length) throw Error('Invalid comment YAML.')
      threads = validate(doc.toJS({ maxAliasCount: 0 }))
      const before = source.slice(0, f.from)
      const separator = before.endsWith('\r\n\r\n') ? 4 : before.endsWith('\n\n') ? 2 : 0
      spans.push({ from: f.from - separator, to: f.to, metadata: true })
    } catch (error) { diagnostics.push(String(error instanceof Error ? error.message : error)); threads = [] }
  }
  const points = new Map<string, { start: Span[]; end: Span[] }>()
  for (const m of source.matchAll(marker)) {
    if (protectedAt(m.index!) || source[m.index! - 1] === '\\' || !item(m[2])) continue
    const span = { from: m.index!, to: m.index! + m[0].length }
    spans.push(span)
    const pair = points.get(m[2]) ?? { start: [], end: [] }
    pair[m[1] as 'start' | 'end'].push(span); points.set(m[2], pair)
  }
  spans.sort((a, b) => a.from - b.from)
  const toText = (at: number) => at - spans.reduce((n, s) => n + Math.max(0, Math.min(at, s.to) - s.from), 0)
  const anchors: Record<string, SourceAnchor> = Object.create(null)
  for (const t of threads) {
    const p = points.get(t.id)
    if (p?.start.length === 1 && p.end.length === 1 && p.start[0].to < p.end[0].from) anchors[t.id] = { from: toText(p.start[0].to), to: toText(p.end[0].from) }
    else if (p && (p.start.length > 1 || p.end.length > 1)) diagnostics.push(`Duplicate anchors for ${t.id}.`)
  }
  let markdown = '', at = 0
  for (const s of spans) { markdown += source.slice(at, s.from); at = s.to }
  markdown += source.slice(at)
  return { markdown, threads, anchors, diagnostics, spans }
}

/** Source offsets remain the public editor contract. Projection excludes comment data. */
export function commentTextOffset(doc: CommentDocument, at: number): number {
  return at - doc.spans.reduce((n, s) => n + Math.max(0, Math.min(at, s.to) - s.from), 0)
}
export function commentSourceOffset(doc: CommentDocument, at: number, after = true): number {
  let result = at
  for (const s of doc.spans) if (s.from < result || (after && !s.metadata && s.from === result)) result += s.to - s.from
  return result
}

export function writeCommentSource(doc: Pick<CommentDocument, 'markdown' | 'threads' | 'anchors'>): string {
  if (!doc.threads.length) return doc.markdown
  validate({ threads: doc.threads })
  const insertions: { at: number; text: string; order: number }[] = []
  for (const t of doc.threads) {
    const a = doc.anchors[t.id]
    if (!a || a.from < 0 || a.to <= a.from || a.to > doc.markdown.length) continue
    insertions.push({ at: a.from, text: `<!--aa:start ${t.id}-->`, order: 1 }, { at: a.to, text: `<!--aa:end ${t.id}-->`, order: 0 })
  }
  insertions.sort((a, b) => b.at - a.at || b.order - a.order || b.text.localeCompare(a.text))
  let text = doc.markdown
  for (const i of insertions) text = text.slice(0, i.at) + i.text + text.slice(i.at)
  const body = stringify({ threads: doc.threads }, { lineWidth: 0, aliasDuplicateObjects: false })
  const fence = '`'.repeat(Math.max(3, ...[...body.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${text}\n\n${fence}aa-comments v1\n${body}${fence}`
}

/** Fail closed on unreadable metadata instead of leaking it into a download. */
export function exportMarkdown(source: string): string {
  const doc = readCommentSource(source)
  if (doc.diagnostics.length) throw Error(`Cannot export Markdown: ${doc.diagnostics.join(' ')}`)
  return doc.markdown
}

export function moveCommentText(doc: CommentDocument, markdown: string): CommentDocument {
  const edit = textChange(doc.markdown, markdown), anchors: Record<string, SourceAnchor> = Object.create(null)
  const threads = doc.threads.map(t => {
    const a = doc.anchors[t.id], next = a && mapRange(a, edit)
    if (!next || next.from >= next.to) return t
    anchors[t.id] = next
    return { ...t, quote: markdown.slice(next.from, next.to) }
  })
  return { ...doc, markdown, threads, anchors }
}

export type CommentAction =
  | { type: 'add'; from: number; to: number; body: string }
  | { type: 'reply'; thread: string; body: string }
  | { type: 'edit'; comment: string; body: string }
  | { type: 'resolve'; thread: string }
  | { type: 'reopen'; thread: string }
  | { type: 'remove'; thread: string }
  | { type: 'react'; comment: string; emoji: string }

/** Local attribution only. A server must authenticate and authorize the operation. */
export function changeCommentSource(source: string, author: string, action: CommentAction, now = new Date().toISOString()): string {
  if (!account(author)) throw Error('Author must be an IDv1 account code.')
  if (!date(now)) throw Error('Invalid UTC timestamp.')
  const doc = readCommentSource(source)
  if (doc.diagnostics.length) throw Error(doc.diagnostics.join(' '))
  const used = new Set(doc.threads.flatMap(t => [t.id, ...t.comments.map(c => c.id)]))
  const id = () => { let value: string; do { value = codeCandidate('item') } while (used.has(value)); used.add(value); return value }
  const body = 'body' in action ? action.body : ''
  if ('body' in action && !body.trim()) throw Error('A comment cannot be empty.')
  const comment = (): SourceComment => ({ id: id(), author, created: now, body })
  if (action.type === 'add') {
    const { from, to } = action
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > doc.markdown.length) throw Error('Invalid comment range.')
    // Anchors cannot survive inside code or nested writing surfaces in v1.
    const { protectedAt } = scan(doc.markdown)
    if (protectedAt(from) || protectedAt(to - 1) || /<(?:columns|tabs)>/.test(doc.markdown.slice(from, to))) throw Error('Select prose outside code and nested writing surfaces.')
    const thread: SourceThread = { id: id(), quote: doc.markdown.slice(from, to), status: 'open', comments: [comment()] }
    doc.threads.push(thread); doc.anchors[thread.id] = { from, to }
  } else {
    const thread = doc.threads.find(t => 'thread' in action ? t.id === action.thread : t.comments.some(c => c.id === action.comment))
    if (!thread) throw Error('Comment or thread not found.')
    if (action.type === 'reply') { if (thread.status === 'resolved') throw Error('Reopen the thread before replying.'); thread.comments.push(comment()) }
    else if (action.type === 'resolve') { thread.status = 'resolved'; thread.resolved = now; thread.resolvedBy = author }
    else if (action.type === 'reopen') { thread.status = 'open'; delete thread.resolved; delete thread.resolvedBy }
    else if (action.type === 'remove') {
      if (thread.comments[0].author !== author) throw Error('Only the thread author may delete it.')
      doc.threads = doc.threads.filter(t => t !== thread)
    } else {
      const c = thread.comments.find(c => c.id === action.comment)!
      if (action.type === 'edit') { if (c.author !== author) throw Error('Only the author may edit a comment.'); c.body = body; c.edited = now }
      else {
        if (!action.emoji.trim() || action.emoji.length > 32) throw Error('Invalid reaction.')
        c.reactions ??= Object.create(null)
        const voters = c.reactions![action.emoji] ?? []
        c.reactions![action.emoji] = voters.includes(author) ? voters.filter(v => v !== author) : [...voters, author]
      }
    }
  }
  return writeCommentSource(doc)
}
