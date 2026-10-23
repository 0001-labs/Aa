import { describe, expect, it } from 'vitest'
import { changeCommentSource, hasCommentSource, exportMarkdown, readCommentSource, writeCommentSource, moveCommentText } from '../src/comments-markdown'
const at = '2026-10-23T07:00:00Z'
const add = (source = 'Ship the new editor on Friday.', from = 5, to = 19) => changeCommentSource(source, 'Jo4712', { type: 'add', from, to, body: 'Check **keyboard** first.\nAnd touch.' }, at)

describe('comment source', () => {
  it('round trips exact prose, IDv1 people and multiline bodies; clean download strips all comment data', () => {
    const source = add(), doc = readCommentSource(source)
    expect(doc.diagnostics).toEqual([])
    expect(doc.markdown).toBe('Ship the new editor on Friday.')
    expect(doc.threads[0].comments[0].author).toBe('Jo4712')
    expect(doc.anchors[doc.threads[0].id]).toEqual({ from: 5, to: 19 })
    expect(writeCommentSource(doc)).toBe(source)
    expect(exportMarkdown(source)).toBe(doc.markdown)
    expect(exportMarkdown(add('α\n\n😀 café\n', 3, 10))).toBe('α\n\n😀 café\n')
  })
  it('supports overlapping threads, replies, resolving, reopening and author checks', () => {
    let source = add()
    source = changeCommentSource(source, 'An1234', { type: 'add', from: 9, to: 25, body: 'Overlap' }, at)
    let doc = readCommentSource(source)
    const t = doc.threads[0].id, c = doc.threads[0].comments[0].id
    expect(Object.values(doc.anchors)).toEqual([{ from: 5, to: 19 }, { from: 9, to: 25 }])
    source = changeCommentSource(source, 'An1234', { type: 'reply', thread: t, body: 'Yes.' }, at)
    source = changeCommentSource(source, 'An1234', { type: 'resolve', thread: t }, at)
    expect(() => changeCommentSource(source, 'Jo4712', { type: 'reply', thread: t, body: 'No' })).toThrow('Reopen')
    expect(() => changeCommentSource(source, 'An1234', { type: 'edit', comment: c, body: 'Forged' })).toThrow('author')
    expect(() => changeCommentSource(source, 'An1234', { type: 'remove', thread: t })).toThrow('author')
    source = changeCommentSource(source, 'Jo4712', { type: 'reopen', thread: t }, at)
    doc = readCommentSource(source)
    expect(doc.threads[0].comments).toHaveLength(2)
    expect(doc.threads[0].status).toBe('open')
  })
  it('leaves code examples and escaped markers alone', () => {
    const sample = '<!--aa:start Ab12Cd-->literal<!--aa:end Ab12Cd-->'
    for (const s of ['`'+sample+'`', '```md\n'+sample+'\n```', '    '+sample, '\\<!--aa:start Ab12Cd-->']) expect(exportMarkdown(s)).toBe(s)
    const example = '````markdown\n' + add() + '\n````'
    expect(exportMarkdown(example)).toBe(example)
    expect(hasCommentSource(example)).toBe(false)
    expect(hasCommentSource(add())).toBe(true)
    const nested = '<columns>\n<column>\nHello\n</column>\n</columns>'
    expect(() => add(nested, nested.indexOf('Hello'), nested.indexOf('Hello') + 5)).toThrow('nested')
    expect(() => add('`hello`', 1, 4)).toThrow('prose')
  })
  it('safely carries fences in comment bodies', () => {
    const source = changeCommentSource('Words', 'Jo4712', { type: 'add', from: 0, to: 5, body: 'Example:\n```js\nalert(1)\n```' }, at)
    expect(readCommentSource(source).diagnostics).toEqual([])
    expect(exportMarkdown(source)).toBe('Words')
  })
  it('preserves orphan threads without guessing another identical quote', () => {
    const doc = readCommentSource(add('same and same', 0, 4))
    const moved = moveCommentText(doc, ' and same')
    expect(moved.anchors).toEqual({})
    const source = writeCommentSource(moved)
    expect(readCommentSource(source).threads[0].quote).toBe('same')
    expect(readCommentSource(source).anchors).toEqual({})
    expect(exportMarkdown(source)).toBe(' and same')
  })
  it('fails closed on malformed or future comment metadata', () => {
    for (const source of ['Text\n\n```aa-comments v2\nsecret\n```', 'Text\n\n```aa-comments v1\nthreads: bad\n```', add()+'\nOther text', '```aa-comments v1\nthreads: &x [*x]\n```']) {
      expect(readCommentSource(source).diagnostics.length).toBeGreaterThan(0)
      expect(() => exportMarkdown(source)).toThrow()
      expect(() => changeCommentSource(source, 'Jo4712', { type: 'add', from: 0, to: 1, body: 'x' })).toThrow()
    }
    expect(() => changeCommentSource('Text', 'not-id', { type: 'add', from: 0, to: 1, body: 'x' })).toThrow('IDv1')
  })
})
