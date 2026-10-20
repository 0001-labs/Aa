import { describe, expect, it } from 'vitest'
import { parseBlocks, serialize, blockRuns, codeClosed } from '../src/markdown'

describe('parseBlocks', () => {
  it('reads each kind of block with its prefix', () => {
    const blocks = parseBlocks('# Title\n\nA paragraph\nthat goes on.\n\n- one\n- [x] two\n3. three\n\n> quoted\n> still\n\n```js\nlet a\n```\n\n---\n\nlast')
    expect(blocks.map(block => block.kind)).toEqual(['heading', 'paragraph', 'bullet', 'bullet', 'bullet', 'quote', 'code', 'divider', 'paragraph'])
    expect(blocks[0]).toMatchObject({ level: 1, prefix: 2, start: 0 })
    expect(blocks[1].source).toBe('A paragraph\nthat goes on.')
    expect(blocks[3]).toMatchObject({ checked: true, prefix: 6 })
    expect(blocks[4]).toMatchObject({ number: 3, prefix: 3 })
    expect(blocks[5].source).toBe('> quoted\n> still')
    expect(blocks[6].source).toBe('```js\nlet a\n```')
    expect(codeClosed(blocks[6])).toBe(true)
    expect(blocks[8].start).toBe('# Title\n\nA paragraph\nthat goes on.\n\n- one\n- [x] two\n3. three\n\n> quoted\n> still\n\n```js\nlet a\n```\n\n---\n\n'.length)
  })
  it('keeps an open fence to the end', () => {
    const blocks = parseBlocks('```\ncode')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('code')
    expect(codeClosed(blocks[0])).toBe(false)
  })
  it('is one empty paragraph for nothing', () => {
    expect(parseBlocks('')).toEqual([{ kind: 'paragraph', source: '', prefix: 0, start: 0 }])
    expect(parseBlocks('\n\n')).toHaveLength(1)
  })
  it('needs a space after a marker', () => {
    expect(parseBlocks('#tag').map(b => b.kind)).toEqual(['paragraph'])
    expect(parseBlocks('-dash').map(b => b.kind)).toEqual(['paragraph'])
    expect(parseBlocks('- ').map(b => b.kind)).toEqual(['bullet'])
  })
  it('round-trips through serialize', () => {
    const text = '# Title\n\nPara\n\n- a\n- b\n\n> q\n\n```\nc\n```\n\n---\n\nEnd'
    const blocks = parseBlocks(text)
    expect(serialize(blocks)).toBe(text)
    expect(parseBlocks(serialize(blocks))).toEqual(blocks)
  })
})

describe('blockRuns', () => {
  const runs = (source: string) => blockRuns(parseBlocks(source)[0])
  const show = (source: string) => runs(source).map(run => `${run.kind}:${source.slice(run.from, run.to)}${run.bold ? '/b' : ''}${run.italic ? '/i' : ''}${run.code ? '/c' : ''}${run.strike ? '/s' : ''}${run.href ? `/${run.href}` : ''}`)

  it('covers the source end to end', () => {
    const source = 'a **b** `c` [d](e) ~~f~~ *g*'
    const all = runs(source)
    expect(all[0].from).toBe(0)
    expect(all[all.length - 1].to).toBe(source.length)
    for (let i = 1; i < all.length; i++) expect(all[i].from).toBe(all[i - 1].to)
  })
  it('marks bold, italic, code, strike and links', () => {
    expect(show('a **b** c')).toEqual(['text:a ', 'syntax:**', 'text:b/b', 'syntax:**', 'text: c'])
    expect(show('*i* and _i_')).toEqual(['syntax:*', 'text:i/i', 'syntax:*', 'text: and ', 'syntax:_', 'text:i/i', 'syntax:_'])
    expect(show('`x` ~~y~~')).toEqual(['syntax:`', 'text:x/c', 'syntax:`', 'text: ', 'syntax:~~', 'text:y/s', 'syntax:~~'])
    expect(show('[d](e)')).toEqual(['syntax:[', 'text:d/e', 'syntax:](e)'])
    expect(show('***both***')).toEqual(['syntax:**', 'syntax:*', 'text:both/b/i', 'syntax:*', 'syntax:**'])
  })
  it('marks underline and text colour, written as Notion writes them', () => {
    const marked = (source: string) => runs(source).map(run => `${run.kind}:${source.slice(run.from, run.to)}${run.underline ? '/u' : ''}${run.color ? `/${run.color}` : ''}${run.bold ? '/b' : ''}`)
    expect(marked('a <u>b</u>')).toEqual(['text:a ', 'syntax:<u>', 'text:b/u', 'syntax:</u>'])
    expect(marked('<span color="red">**r**</span>')).toEqual(['syntax:<span color="red">', 'syntax:**', 'text:r/red/b', 'syntax:**', 'syntax:</span>'])
    // An unknown colour, or a tag never closed, is only words.
    expect(marked('<span color="teal">t</span>')).toEqual(['text:<span color="teal">t</span>'])
    expect(marked('<u>open')).toEqual(['text:<u>open'])
  })
  it('leaves snake_case and lone stars alone', () => {
    expect(show('snake_case_name')).toEqual(['text:snake_case_name'])
    expect(show('a * b')).toEqual(['text:a * b'])
    expect(show('**unclosed')).toEqual(['text:**unclosed'])
  })
  it('links addresses by themselves', () => {
    expect(show('see https://ezo.gs/Jo4712, or www.ezo.gs.')).toEqual(['text:see ', 'text:https://ezo.gs/Jo4712/https://ezo.gs/Jo4712', 'text:, or ', 'text:www.ezo.gs/https://www.ezo.gs', 'text:.'])
  })
  it('gives a mark one group for both delimiters and prefixes none', () => {
    const [prefix, ...rest] = runs('## a **b**')
    expect(prefix).toMatchObject({ kind: 'syntax', prefix: true })
    const syntax = rest.filter(run => run.kind === 'syntax')
    expect(syntax[0].group).toEqual([5, 10])
    expect(syntax[1].group).toEqual([5, 10])
  })
  it('breaks lines and fences code', () => {
    expect(show('```ts\nlet a\n```')).toEqual(['syntax:```ts', 'break:\n', 'text:let a/c', 'break:\n', 'syntax:```'])
    expect(show('> a\n> b')).toEqual(['syntax:> ', 'text:a', 'break:\n', 'syntax:> ', 'text:b'])
  })
})
