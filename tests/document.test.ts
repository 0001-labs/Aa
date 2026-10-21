import { describe, expect, it } from 'vite-plus/test'
import { fromMarkdown, toMarkdown, replaceRange, splitAt, liftPrefix, joinWithPrevious, joinWithNext, wrapSelection, toggleBox, sliceMarkdown, select, turnInto, duplicateBlocks, deleteBlocks, moveBlocks } from '../src/document'
import { History, changeEnd } from '../src/history'

const doc = (text: string) => fromMarkdown(text)
const at = (block: number, offset: number) => ({ block, offset })

describe('whole blocks', () => {
  it('moves and duplicates a reversed range, and preserves its neighbours', () => {
    const blocks = doc('a\n\nb\n\nc\n\nd')
    const range = select(blocks, 2, 1)
    expect(moveBlocks(blocks, range, -1)!.blocks.map(b => b.source)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveBlocks(blocks, range, 1)!.blocks.map(b => b.source)).toEqual(['a', 'd', 'b', 'c'])
    expect(duplicateBlocks(blocks, range).blocks.map(b => b.source)).toEqual(['a', 'b', 'c', 'b', 'c', 'd'])
    expect(moveBlocks(blocks, select(blocks, 0), -1)).toBeNull()
    expect(deleteBlocks(blocks, range).blocks.map(b => b.source)).toEqual(['a', 'd'])
    expect(deleteBlocks(blocks, select(blocks, 0, 3)).blocks).toMatchObject([{ kind: 'paragraph', source: '' }])
  })
  it('changes kinds without retaining old prefixes or code fences', () => {
    expect(toMarkdown(turnInto(doc('## Milk\n\n> Bread\n> Tea'), { anchor: 0, focus: 1 }, 'numbered').blocks)).toBe('1. Milk\n2. Bread\n2. Tea')
    expect(toMarkdown(turnInto(doc('```ts\nhello\nworld\n```'), { anchor: 0, focus: 0 }, 'paragraph').blocks)).toBe('hello\nworld')
    expect(turnInto(doc('- [x] milk'), { anchor: 0, focus: 0 }, 'todo').blocks[0].source).toBe('- [ ] milk')
  })
  it('formats each selected block while keeping list prefixes outside the mark', () => {
    const blocks = doc('one\n\n- two\n- three')
    const wrapped = wrapSelection(blocks, at(0, 1), at(2, 5), '**')!
    expect(toMarkdown(wrapped.blocks)).toBe('o**ne**\n\n- **two**\n- **thr**ee')
    expect(toMarkdown(wrapSelection(wrapped.blocks, wrapped.anchor, wrapped.focus, '**')!.blocks)).toBe(toMarkdown(blocks))
  })
})

describe('replaceRange', () => {
  it('types into a block', () => {
    const { blocks, caret } = replaceRange(doc('ab'), at(0, 1), at(0, 1), 'X')
    expect(toMarkdown(blocks)).toBe('aXb')
    expect(caret).toEqual(at(0, 2))
  })
  it('reads the block again: a bullet typed at the start is a bullet', () => {
    const { blocks } = replaceRange(doc('milk'), at(0, 0), at(0, 0), '- ')
    expect(blocks[0]).toMatchObject({ kind: 'bullet', source: '- milk' })
  })
  it('splits into blocks when the text asks', () => {
    const { blocks, caret } = replaceRange(doc('ab'), at(0, 1), at(0, 1), '\n\n')
    expect(blocks.map(b => b.source)).toEqual(['a', 'b'])
    expect(caret).toEqual(at(1, 0))
  })
  it('joins across blocks and keeps the ones outside', () => {
    const { blocks, caret } = replaceRange(doc('one\n\ntwo\n\nthree\n\nfour'), at(1, 1), at(2, 2), '')
    expect(blocks.map(b => b.source)).toEqual(['one', 'tree', 'four'])
    expect(caret).toEqual(at(1, 1))
  })
  it('pastes Markdown into blocks', () => {
    const { blocks, caret } = replaceRange(doc(''), at(0, 0), at(0, 0), '# T\n\n- a\n- b')
    expect(blocks.map(b => b.kind)).toEqual(['heading', 'bullet', 'bullet'])
    expect(caret).toEqual(at(2, 3))
  })
})

describe('splitAt', () => {
  it('starts a paragraph after a heading', () => {
    const { blocks, caret } = splitAt(doc('# Title'), at(0, 7))
    expect(blocks.map(b => [b.kind, b.source])).toEqual([['heading', '# Title'], ['paragraph', '']])
    expect(caret).toEqual(at(1, 0))
  })
  it('continues a bullet, numbered one on, box empty', () => {
    expect(splitAt(doc('- a'), at(0, 3)).blocks.map(b => b.source)).toEqual(['- a', '- '])
    expect(splitAt(doc('- [x] a'), at(0, 7)).blocks.map(b => b.source)).toEqual(['- [x] a', '- [ ] '])
    expect(splitAt(doc('3. a'), at(0, 4)).blocks.map(b => b.source)).toEqual(['3. a', '4. '])
    expect(splitAt(doc('- ab'), at(0, 3)).blocks.map(b => b.source)).toEqual(['- a', '- b'])
  })
  it('ends a list on an empty bullet', () => {
    const { blocks, caret } = splitAt(doc('- a\n- '), at(1, 2))
    expect(blocks.map(b => [b.kind, b.source])).toEqual([['bullet', '- a'], ['paragraph', '']])
    expect(caret).toEqual(at(1, 0))
  })
  it('keeps a quote going and leaves it on an empty line', () => {
    expect(splitAt(doc('> a'), at(0, 3)).blocks.map(b => b.source)).toEqual(['> a\n> '])
    const left = splitAt(doc('> a\n> '), at(0, 6))
    expect(left.blocks.map(b => [b.kind, b.source])).toEqual([['quote', '> a'], ['paragraph', '']])
    expect(left.caret).toEqual(at(1, 0))
  })
  it('adds a line in code and a paragraph after a closed fence', () => {
    expect(splitAt(doc('```\na\n```'), at(0, 5)).blocks.map(b => b.source)).toEqual(['```\na\n\n```'])
    expect(splitAt(doc('```\na\n```'), at(0, 9)).blocks.map(b => b.kind)).toEqual(['code', 'paragraph'])
  })
})

describe('lifting and joining', () => {
  it('lifts a heading, bullet and quote to a paragraph', () => {
    expect(liftPrefix(doc('## T'), 0)!.blocks[0]).toMatchObject({ kind: 'paragraph', source: 'T' })
    expect(liftPrefix(doc('- [ ] T'), 0)!.blocks[0]).toMatchObject({ kind: 'paragraph', source: 'T' })
    expect(liftPrefix(doc('> T'), 0)!.blocks[0]).toMatchObject({ kind: 'paragraph', source: 'T' })
    expect(liftPrefix(doc('T'), 0)).toBeNull()
  })
  it('joins with the block before, and removes a divider before', () => {
    const joined = joinWithPrevious(doc('a\n\nb'), 1)!
    expect(joined.blocks.map(b => b.source)).toEqual(['ab'])
    expect(joined.caret).toEqual(at(0, 1))
    const divider = joinWithPrevious(doc('a\n\n---\n\nb'), 2)!
    expect(divider.blocks.map(b => b.source)).toEqual(['a', 'b'])
    expect(divider.caret).toEqual(at(1, 0))
    expect(joinWithPrevious(doc('a'), 0)).toBeNull()
  })
  it('joins the next block in', () => {
    const joined = joinWithNext(doc('- a\n\nb'), 0)!
    expect(joined.blocks.map(b => b.source)).toEqual(['- ab'])
    expect(joined.caret).toEqual(at(0, 3))
  })
})

describe('marks', () => {
  it('wraps, unwraps and types empty delimiters', () => {
    const wrapped = wrapSelection(doc('ab cd'), at(0, 0), at(0, 2), '**')!
    expect(toMarkdown(wrapped.blocks)).toBe('**ab** cd')
    expect([wrapped.anchor, wrapped.focus]).toEqual([at(0, 2), at(0, 4)])
    const unwrapped = wrapSelection(wrapped.blocks, wrapped.anchor, wrapped.focus, '**')!
    expect(toMarkdown(unwrapped.blocks)).toBe('ab cd')
    const empty = wrapSelection(doc(''), at(0, 0), at(0, 0), '*')!
    expect(toMarkdown(empty.blocks)).toBe('**')
    expect(empty.anchor).toEqual(at(0, 1))
    const link = wrapSelection(doc('ezo'), at(0, 0), at(0, 3), '[', '](url)')!
    expect(toMarkdown(link.blocks)).toBe('[ezo](url)')
  })
  it('ticks a box', () => {
    expect(toMarkdown(toggleBox(doc('- [ ] a'), 0)!.blocks)).toBe('- [x] a')
    expect(toMarkdown(toggleBox(doc('- [x] a'), 0)!.blocks)).toBe('- [ ] a')
    expect(toggleBox(doc('- a'), 0)).toBeNull()
  })
  it('copies the Markdown between two places', () => {
    expect(sliceMarkdown(doc('# T\n\n- a\n- b'), at(0, 2), at(2, 3))).toBe('T\n\n- a\n- b')
    expect(sliceMarkdown(doc('abc'), at(0, 2), at(0, 1))).toBe('b')
  })
})

describe('History', () => {
  it('joins letters typed in a moment and separates edits', () => {
    const history = new History({ blocks: doc(''), anchor: at(0, 0), focus: at(0, 0) })
    history.record({ blocks: doc('a'), anchor: at(0, 1), focus: at(0, 1) }, 'type', 1000)
    history.record({ blocks: doc('ab'), anchor: at(0, 2), focus: at(0, 2) }, 'type', 1200)
    history.record({ blocks: doc('ab\n\n'), anchor: at(1, 0), focus: at(1, 0) }, 'edit', 1300)
    expect(toMarkdown(history.undo()!.blocks)).toBe('ab')
    expect(toMarkdown(history.undo()!.blocks)).toBe('')
    expect(history.undo()).toBeNull()
    expect(toMarkdown(history.redo()!.blocks)).toBe('ab')
  })
  it('keeps deleting apart from typing and begins a step at the space after a word', () => {
    const history = new History({ blocks: doc(''), anchor: at(0, 0), focus: at(0, 0) })
    history.record({ blocks: doc('hi'), anchor: at(0, 2), focus: at(0, 2) }, 'type', 1000)
    history.record({ blocks: doc('hi '), anchor: at(0, 3), focus: at(0, 3) }, 'type', 1100)
    history.record({ blocks: doc('hi yo'), anchor: at(0, 5), focus: at(0, 5) }, 'type', 1200)
    history.record({ blocks: doc('hi y'), anchor: at(0, 4), focus: at(0, 4) }, 'delete', 1300)
    expect(toMarkdown(history.undo()!.blocks)).toBe('hi yo')
    expect(toMarkdown(history.undo()!.blocks)).toBe('hi')
    expect(toMarkdown(history.undo()!.blocks)).toBe('')
  })
  it('puts the caret where the change undone was', () => {
    const history = new History({ blocks: doc('one\n\ntwo'), anchor: at(0, 0), focus: at(0, 0) })
    history.record({ blocks: doc('one!\n\ntwo'), anchor: at(0, 4), focus: at(0, 4) }, 'type', 1000)
    history.record({ blocks: doc('one!\n\ntwo?'), anchor: at(1, 4), focus: at(1, 4) }, 'type', 1100)
    expect(history.undo()).toMatchObject({ anchor: at(1, 3), focus: at(1, 3) })
    expect(history.undo()).toMatchObject({ focus: at(0, 3) })
  })
  it('finds where two documents differ', () => {
    expect(changeEnd(doc('abc'), doc('abc'))).toBeNull()
    expect(changeEnd(doc('abcxyz'), doc('abc'))).toEqual(at(0, 6))
    expect(changeEnd(doc('aa'), doc('aaa'))).toEqual(at(0, 2))
    expect(changeEnd(doc('a\n\nc'), doc('a\n\nb\n\nc'))).toEqual(at(0, 1))
    expect(changeEnd(doc('a\n\nb\n\nc'), doc('a\n\nc'))).toEqual(at(1, 1))
  })
})

describe('line breaks', () => {
  it('keeps a break typed at the end of a block as an empty line', () => {
    const { blocks, caret } = replaceRange(doc('After'), at(0, 5), at(0, 5), '\n')
    expect(blocks.map(b => b.source)).toEqual(['After\n'])
    expect(caret).toEqual(at(0, 6))
    expect(replaceRange(doc('a\n\nb'), at(0, 0), at(0, 0), '\n').blocks.map(b => b.source)).toEqual(['\na', 'b'])
    expect(fromMarkdown('\n\nAfter\n\n').map(b => b.source)).toEqual(['After'])
  })
})

describe('Enter at an edge', () => {
  it('makes an empty block above or below', () => {
    const below = splitAt(doc('abc'), at(0, 3))
    expect(below.blocks.map(b => b.source)).toEqual(['abc', ''])
    expect(below.caret).toEqual(at(1, 0))
    const above = splitAt(doc('abc'), at(0, 0))
    expect(above.blocks.map(b => b.source)).toEqual(['', 'abc'])
    expect(above.caret).toEqual(at(1, 0))
    const empty = splitAt(doc(''), at(0, 0))
    expect(empty.blocks.map(b => b.source)).toEqual(['', ''])
    expect(empty.caret).toEqual(at(1, 0))
  })
})
