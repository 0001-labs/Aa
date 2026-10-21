import { describe, expect, it, vi } from 'vitest'
import { createEditor } from '../src/editor'
import { besideChange, blockRuns, parseBlocks, readColumns, serialize, writeColumns } from '../src/markdown'

const source = ['<columns>', '<column>', '## Left', 'First words.', '</column>', '<column>', '- one', '- two', '</column>', '</columns>'].join('\n')

describe('columns', () => {
  it('are one block, read as Notion writes them, and written back the same', () => {
    const blocks = parseBlocks(`Before\n\n${source}\n\nAfter`)
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'columns', 'paragraph'])
    expect(readColumns(blocks[1].source)).toEqual(['## Left\nFirst words.', '- one\n- two'])
    expect(writeColumns(readColumns(source))).toBe(source)
    expect(serialize(blocks)).toBe(`Before\n\n${source}\n\nAfter`)
    // A column indented by tabs, as Notion indents them, reads without them.
    expect(readColumns('<columns>\n\t<column>\n\t\tTabbed\n\t</column>\n</columns>')).toEqual(['Tabbed'])
  })

  it('are drawn whole, never letter by letter, with no tags shown', () => {
    expect(blockRuns(parseBlocks(source)[0]).map(run => [run.kind, run.atom])).toEqual([['atom', 'columns']])
  })

  it('stand side by side, each written in an editor of its own, and an edit hands back the whole block', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const onChange = vi.fn()
    const editor = createEditor(host, { value: source, onChange })
    const drawn = host.querySelector<HTMLElement>('.aa-atom.aa-columns')!
    expect(drawn.hasAttribute('data-aa-interactive')).toBe(true)
    const columns = [...drawn.querySelectorAll<HTMLElement>(':scope > .aa-column')]
    expect(columns).toHaveLength(2)
    expect(columns[0].textContent).toContain('First words.')
    // A column's own editor changes; the document takes the columns again as one block.
    drawn.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: writeColumns(['## Left\nFirst words, edited.', '- one\n- two']) } }))
    expect(editor.value).toContain('First words, edited.')
    expect(onChange).toHaveBeenCalled()
    editor.destroy()
    host.remove()
  })

  it('keep their editors and the caret in them as a column is written in', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: writeColumns(['Left words', 'Right']) })
    const before = host.querySelector<HTMLElement>('.aa-atom.aa-columns')!
    const column = before.querySelector<HTMLElement>('.aa-column .aa-block')!
    column.focus()
    expect(document.activeElement).toBe(column)
    // The column's editor hands the block back, as it does after each keystroke: the atom and the focus in it stay.
    before.dataset.source = writeColumns(['Left words!', 'Right'])
    before.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: before.dataset.source } }))
    expect(editor.value).toBe(writeColumns(['Left words!', 'Right']))
    expect(host.querySelector('.aa-atom.aa-columns')).toBe(before)
    expect(document.activeElement).toBe(column)
    // Typed in, the same: the atom is the one drawn first.
    const block = before.querySelector<HTMLElement>('.aa-column .aa-block')!
    block.firstChild!.textContent = 'Left words!!'
    block.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(editor.value).toBe(writeColumns(['Left words!!', 'Right']))
    expect(host.querySelector('.aa-atom.aa-columns')).toBe(before)
    editor.destroy()
    host.remove()
  })

  it('put pictures in order sideways: one carried to another column\'s side stands there, the column it left gone', () => {
    const pictures = writeColumns(['![A lake](lake.jpg)', '![A cup](cup.jpg)'])
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: pictures })
    const drawn = host.querySelector<HTMLElement>('.aa-atom.aa-columns')!
    const first = drawn.querySelector<HTMLElement>(':scope > .aa-column')!
    first.dispatchEvent(new CustomEvent('aa-column-carry', { bubbles: true, detail: { from: 0, slot: 1 } }))
    expect(readColumns(parseBlocks(editor.value)[0].source)).toEqual(['![A cup](cup.jpg)', '![A lake](lake.jpg)'])
    expect(drawn.querySelectorAll(':scope > .aa-column')).toHaveLength(2)
    // One step to undo.
    editor.undo()
    expect(editor.value).toBe(pictures)
    editor.destroy()
    host.remove()
  })

  it('trade places when a picture is let go on another', () => {
    const three = writeColumns(['![A forest](forest.jpg)', '![A chair](chair.jpg)', '![Headphones](headphones.jpg)'])
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: three })
    const first = host.querySelector<HTMLElement>('.aa-atom.aa-columns > .aa-column')!
    first.dispatchEvent(new CustomEvent('aa-column-carry', { bubbles: true, detail: { from: 0, swap: 2 } }))
    expect(readColumns(parseBlocks(editor.value)[0].source)).toEqual(['![Headphones](headphones.jpg)', '![A chair](chair.jpg)', '![A forest](forest.jpg)'])
    editor.undo()
    expect(editor.value).toBe(three)
    editor.destroy()
    host.remove()
  })

  it('keep a column that still has blocks when one is carried out of it', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: writeColumns(['![A lake](lake.jpg)\n\nUnder the lake.', '![A cup](cup.jpg)']) })
    const first = host.querySelector<HTMLElement>('.aa-atom.aa-columns > .aa-column')!
    first.dispatchEvent(new CustomEvent('aa-column-carry', { bubbles: true, detail: { from: 0, slot: 1 } }))
    expect(readColumns(parseBlocks(editor.value)[0].source)).toEqual(['Under the lake.', '![A lake](lake.jpg)', '![A cup](cup.jpg)'])
    editor.destroy()
    host.remove()
  })
})

describe('placing a block beside another', () => {
  const apply = (text: string, change: { start: number; end: number; text: string } | null) =>
    change ? text.slice(0, change.start) + change.text + text.slice(change.end) : text

  it('puts two pictures side by side in columns, in the order they stand', () => {
    const text = 'Intro\n\n![a](a.png)\n\n![b](b.png)\n\nOutro'
    expect(apply(text, besideChange(text, 2, 1, 'end'))).toBe(`Intro\n\n${writeColumns(['![a](a.png)', '![b](b.png)'])}\n\nOutro`)
    expect(apply(text, besideChange(text, 1, 2, 'start'))).toBe(`Intro\n\n${writeColumns(['![a](a.png)', '![b](b.png)'])}\n\nOutro`)
  })

  it('adds a column to columns already there, and never puts columns in columns', () => {
    const text = `${writeColumns(['![a](a.png)', '![b](b.png)'])}\n\n![c](c.png)`
    expect(readColumns(parseBlocks(apply(text, besideChange(text, 1, 0, 'end')))[0].source)).toEqual(['![a](a.png)', '![b](b.png)', '![c](c.png)'])
    expect(besideChange(text, 0, 1, 'start')).toBeNull()
    expect(besideChange(text, 1, 1, 'start')).toBeNull()
  })
})
