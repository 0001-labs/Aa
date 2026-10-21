import { describe, expect, it } from 'vite-plus/test'
import { anchorThreads, applyEdit, commentsLabel, countThreads, initialOf, mapRange, mentionQuery, mentionsIn, movedThreads, personColour, relativeTime, relocate, sortThreads, textChange, threadsAt, type AnchoredThread, type CommentThread } from '../src/comments'

const ann = { id: 'ann', name: 'Ann' }, bo = { id: 'bo', name: 'Bo Ek' }
const thread = (id: string, from: number, to: number, quote: string, extra: Partial<CommentThread> = {}): CommentThread => ({ id, from, to, quote, comments: [{ id: `${id}c`, author: ann, body: 'Hm', createdAt: 1 }], createdAt: 1, updatedAt: 1, ...extra })

describe('mapRange', () => {
  const range = { from: 10, to: 20 }
  it('moves with words put in or taken out before it, and at its start', () => {
    expect(mapRange(range, { start: 2, end: 2, text: 'abc' })).toEqual({ from: 13, to: 23 })
    expect(mapRange(range, { start: 2, end: 6, text: '' })).toEqual({ from: 6, to: 16 })
    expect(mapRange(range, { start: 10, end: 10, text: 'xy' })).toEqual({ from: 12, to: 22 })
    expect(mapRange(range, { start: 5, end: 10, text: 'z' })).toEqual({ from: 6, to: 16 })
  })
  it('stays as it is for words put in after it, and at its end', () => {
    expect(mapRange(range, { start: 25, end: 30, text: 'abc' })).toEqual(range)
    expect(mapRange(range, { start: 20, end: 22, text: 'xy' })).toEqual(range)
  })
  it('goes on with words typed at its end, as a bold word does', () => {
    expect(mapRange(range, { start: 20, end: 20, text: 'xy' })).toEqual({ from: 10, to: 22 })
  })
  it('grows and shrinks with words changed inside it', () => {
    expect(mapRange(range, { start: 12, end: 12, text: 'abc' })).toEqual({ from: 10, to: 23 })
    expect(mapRange(range, { start: 12, end: 15, text: '' })).toEqual({ from: 10, to: 17 })
    expect(mapRange(range, { start: 12, end: 15, text: 'ab' })).toEqual({ from: 10, to: 19 })
  })
  it('is cut back at an end an edit runs over, the words put in left out', () => {
    expect(mapRange(range, { start: 5, end: 15, text: 'ab' })).toEqual({ from: 7, to: 12 })
    expect(mapRange(range, { start: 15, end: 25, text: 'ab' })).toEqual({ from: 10, to: 15 })
  })
  it('is gone when an edit runs over all of it', () => {
    expect(mapRange(range, { start: 10, end: 20, text: '' })).toBeNull()
    expect(mapRange(range, { start: 5, end: 25, text: 'new words' })).toBeNull()
    expect(mapRange(range, { start: 10, end: 20, text: 'other' })).toBeNull()
  })
})

describe('applyEdit and relocate', () => {
  it('follows typing through the text, reading the quote again', () => {
    const before = 'one two three', after = 'one tiny two three'
    const [moved] = applyEdit([thread('a', 4, 7, 'two')], textChange(before, after), after)
    expect(moved).toMatchObject({ from: 9, to: 12, quote: 'two', orphaned: false })
    const grown = applyEdit([thread('a', 4, 7, 'two')], textChange('one two three', 'one twoo three'), 'one twoo three')[0]
    expect(grown).toMatchObject({ from: 4, to: 8, quote: 'twoo' })
  })
  it('orphans a thread whose words are gone, and keeps it orphaned', () => {
    const gone = applyEdit([thread('a', 4, 7, 'two')], { start: 4, end: 7, text: '' }, 'one  three')
    expect(gone[0].orphaned).toBe(true)
    expect(applyEdit(gone, { start: 0, end: 0, text: 'x' }, 'xone  three')[0]).toMatchObject({ from: 4, orphaned: true })
  })
  it('places a stored thread where its words are, or nearest to where it was', () => {
    expect(relocate({ from: 4, to: 7, quote: 'two' }, 'one two three')).toEqual({ from: 4, to: 7 })
    expect(relocate({ from: 4, to: 7, quote: 'two' }, 'zero one two three')).toEqual({ from: 9, to: 12 })
    expect(relocate({ from: 20, to: 23, quote: 'two' }, 'two one two three')).toEqual({ from: 8, to: 11 })
    expect(relocate({ from: 4, to: 7, quote: 'two' }, 'one three')).toBeNull()
    expect(relocate({ from: 4, to: 4, quote: '' }, 'one three')).toBeNull()
  })
  it('anchors the store’s threads and reports those that moved', () => {
    const stored = [thread('a', 4, 7, 'two'), thread('b', 40, 45, 'gone?')]
    const placed = anchorThreads(stored, 'zero one two three')
    expect(placed[0]).toMatchObject({ from: 9, to: 12, orphaned: false })
    expect(placed[1].orphaned).toBe(true)
    expect(movedThreads(stored, placed)).toEqual([{ id: 'a', from: 9, to: 12, quote: 'two' }])
  })
})

describe('the thread model', () => {
  const placed: AnchoredThread[] = [
    { ...thread('late', 30, 35, 'late'), orphaned: false },
    { ...thread('done', 2, 5, 'done', { resolvedAt: 5 }), orphaned: false },
    { ...thread('lost', 10, 12, 'lost'), orphaned: true },
    { ...thread('early', 1, 8, 'early'), orphaned: false },
  ]
  it('sorts open threads first in the order of the text, orphaned after them, resolved last', () => {
    expect(sortThreads(placed).map(each => each.id)).toEqual(['early', 'late', 'lost', 'done'])
  })
  it('finds the open threads the caret stands in, their ends included', () => {
    expect(threadsAt(placed, 8).map(each => each.id)).toEqual(['early'])
    expect(threadsAt(placed, 3).map(each => each.id)).toEqual(['early'])
    expect(threadsAt(placed, 11)).toEqual([])
    expect(threadsAt(placed, 20)).toEqual([])
  })
  it('counts and labels as Link does', () => {
    expect(countThreads(placed)).toEqual({ open: 3, resolved: 1 })
    expect(commentsLabel(0, 0)).toBe('Comments')
    expect(commentsLabel(1, 0)).toBe('1 comment')
    expect(commentsLabel(3, 1)).toBe('3 comments · 1 resolved')
  })
  it('finds the people named in a body, the longest names first', () => {
    const jo = { id: 'jo', name: 'Jo' }, joann = { id: 'joann', name: 'Jo Ann' }
    expect(mentionsIn('Ask @Jo Ann and @Bo Ek about it', [jo, joann, bo, ann])).toEqual([joann, bo])
    expect(mentionsIn('Nobody here', [jo])).toEqual([])
  })
  it('reads the @ and the letters after it before the caret', () => {
    expect(mentionQuery('Ask @an', 7)).toEqual({ start: 4, query: 'an' })
    expect(mentionQuery('Ask @', 5)).toEqual({ start: 4, query: '' })
    expect(mentionQuery('mail@an', 7)).toBeNull()
    expect(mentionQuery('Ask @an now', 11)).toBeNull()
  })
  it('tells when in Design system 1’s words', () => {
    const now = new Date('2026-10-20T12:00:00').getTime()
    expect(relativeTime(now - 10_000, now)).toBe('now')
    expect(relativeTime(now - 3 * 60_000, now)).toBe('3 minutes ago')
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 hours ago')
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('yesterday')
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago')
    expect(relativeTime(now - 30 * 86_400_000, now, 'en-GB')).toBe('20 Sept')
    expect(relativeTime(new Date('2025-03-02T12:00:00').getTime(), now, 'en-GB')).toBe('2 Mar 2025')
  })
  it('draws a person by their initial, in one colour wherever they stand', () => {
    expect(initialOf('ann')).toBe('A')
    expect(initialOf('高橋 由紀')).toBe('高橋')
    expect(personColour(ann)).toBe(personColour({ ...ann, name: 'Other' }))
    expect(personColour({ ...ann, colour: 'red' })).toBe('red')
  })
})
