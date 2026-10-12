import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, type Editor } from '../src/editor'
import { parseBlocks, serialize, blockRuns } from '../src/markdown'
import { fromMarkdown, indentBlocks, renumber, toggleCallout, turnInto } from '../src/document'
import { fromTSV, tableRows, editTable } from '../src/table'
import { readBlock, renderBlock, pointAt, offsetIn } from '../src/render'

let editor: Editor | undefined, host: HTMLElement | undefined
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options }); editor.selectRange(0)
  return editor
}
function key(key: string, modifiers: KeyboardEventInit = {}) { host!.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })) }
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges(); vi.useRealTimers() })

describe('nesting', () => {
  it('indents under a parent and lifts an empty nested bullet before leaving the list', () => {
    const e = setup('- parent\n- child')
    e.selectRange(e.value.length); key('Tab')
    expect(e.value).toBe('- parent\n  - child')
    expect(parseBlocks(e.value)[1]).toMatchObject({ depth: 1, indent: 2 })
    key('Tab', { shiftKey: true }); expect(e.value).toBe('- parent\n- child')
    expect(indentBlocks(fromMarkdown('- first'), { anchor: 0, focus: 0 }, 1)).toBeNull()
  })
  it('renumbers siblings independently of children and resets after paragraphs', () => {
    expect(serialize(renumber(parseBlocks('3. a\n   1. child\n9. b\n\nBreak\n\n5. c')))).toBe('3. a\n   1. child\n4. b\n\nBreak\n\n5. c')
  })
})

describe('callouts and equations', () => {
  it('folds and opens callouts without changing their body', () => {
    const blocks = fromMarkdown('> [!warning] Title\n> Body')
    expect(blocks[0]).toMatchObject({ kind: 'callout', callout: 'warning', folded: false })
    const folded = toggleCallout(blocks, 0)!.blocks
    expect(serialize(folded)).toBe('> [!warning]- Title\n> Body')
    const node = document.createElement('div'); renderBlock(node, folded[0], null)
    expect(node.hasAttribute('data-folded')).toBe(true)
    expect(readBlock(node)).toBe(serialize(folded))
    expect(serialize(toggleCallout(folded, 0, true)!.blocks)).toBe(serialize(blocks))
  })
  it('draws equations through the product callback and reveals their source for editing', () => {
    const draw = vi.fn((element: HTMLElement, tex: string) => { element.textContent = `Math: ${tex}` })
    const e = setup('An $x^2$ equation\n\n$$\ny = x\n$$', { drawEquation: draw })
    expect(draw).toHaveBeenCalledWith(expect.any(HTMLElement), 'x^2', false)
    expect(draw).toHaveBeenCalledWith(expect.any(HTMLElement), 'y = x', true)
    e.selectRange(5); document.dispatchEvent(new Event('selectionchange'))
    expect(host!.children[0].querySelector('[data-atom="equation"]')).toBeNull()
    expect(e.value).toBe('An $x^2$ equation\n\n$$\ny = x\n$$')
    expect(blockRuns(parseBlocks('==light==')[0]).some(run => run.highlight)).toBe(true)
  })
})

describe('tables', () => {
  const source = '| Name | Value |\n| --- | --- |\n| Milk | 2 |'
  it('keeps every source character while editing cell by cell, including escaped pipes', () => {
    const e = setup(source)
    expect(host!.querySelectorAll('[data-cell]')).toHaveLength(4)
    expect(readBlock(host!.children[0] as HTMLElement)).toBe(source)
    const cells = tableRows(source).flat()
    for (const cell of cells) {
      const p = pointAt(host!.children[0] as HTMLElement, cell.from)
      expect(offsetIn(host!.children[0] as HTMLElement, p.node, p.offset)).toBe(cell.from)
    }
    expect(tableRows('| a\\|b | c |\n| --- | --- |')[0].map(c => c.text)).toEqual(['a\\|b', 'c'])
    e.selectRange(cells[0].from); key('Tab')
    expect(e.selection()).toEqual({ start: cells[1].from, end: cells[1].from })
    key('Enter'); expect(parseBlocks(e.value).map(b => b.kind)).toEqual(['table'])
    expect(host!.children).toHaveLength(2)
    e.undo(); expect(e.value).toBe(source)
  })
  it('adds and removes rows and columns while preserving the header', () => {
    const block = parseBlocks(source)[0]
    expect(tableRows(editTable(block, 'add-row', 0, 0))).toHaveLength(3)
    expect(tableRows(editTable(block, 'delete-row', 0, 0))).toHaveLength(2)
    expect(tableRows(editTable(block, 'add-column', 0, 0))[0]).toHaveLength(3)
    expect(fromTSV('Name\tValue\nMilk\t2')).toBe(source)
  })
  it('keeps table cells read-only and prevents deleting source separators at an edge', () => {
    const e = setup(source)
    const cell = tableRows(source)[0][0]
    e.selectRange(cell.from)
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })
    host!.dispatchEvent(event); expect(event.defaultPrevented).toBe(true)
    e.readOnly = true
    expect([...host!.querySelectorAll<HTMLElement>('[data-cell]')].every(cell => cell.contentEditable === 'false')).toBe(true)
  })
})

describe('controls, decorations and media', () => {
  it('filters slash commands and runs one as a single undoable edit', () => {
    const e = setup('/head', { toolbar: true })
    e.selectRange(e.value.length)
    e.replace(e.value.length, e.value.length, 'ing 2')
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    expect(menu.querySelector('button')?.textContent).toBe('Heading 2')
    key('Enter'); expect(e.value).toBe('## ')
    e.undo(); expect(e.value).toBe('/heading 2')
  })
  it('exposes product commands and cleans up all controls on destroy', () => {
    const action = vi.fn()
    const e = setup('/', { commands: [{ id: 'mention', icon: 'mention', label: 'Mention', run: action }] })
    e.selectRange(1); e.replace(1, 1, 'mention')
    key('Enter'); expect(action).toHaveBeenCalledWith(e)
    e.destroy(); expect(document.querySelector('.aa-menu')).toBeNull()
    expect(document.querySelector('.aa-find')).toBeNull()
  })
  it('decorates offsets across blocks and keeps find and comment layers separate', () => {
    const e = setup('Hello\n\nHello')
    e.decorate([{ from: 1, to: 4, className: 'comment' }])
    e.decorate([{ from: 7, to: 12, className: 'match' }], 'find')
    expect(host!.querySelector('.comment')?.textContent).toBe('ell')
    expect(host!.querySelector('.match')?.textContent).toBe('Hello')
    expect(e.value).toBe('Hello\n\nHello')
    expect(e.find('hello')).toEqual([{ start: 0, end: 5 }, { start: 7, end: 12 }])
    expect(e.stats()).toEqual({ words: 2, characters: 12, blocks: 2 })
    e.decorate([], 'find'); expect(host!.querySelector('.comment')).not.toBeNull()
  })
  it('routes files to the product, draws audio by extension, and edits the caption source', () => {
    const files = vi.fn()
    const e = setup('![Song](https://example.com/song.mp3)', { onFiles: files })
    e.insertFile(new File(['sound'], 'song.mp3'))
    expect(files).toHaveBeenCalledWith([expect.any(File)])
    expect(host!.querySelector('audio')).not.toBeNull()
    const caption = host!.querySelector('.aa-caption') as HTMLElement
    caption.textContent = 'New caption'
    caption.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(e.value).toBe('![New caption](https://example.com/song.mp3)')
    e.undo(); expect(e.value).toBe('![Song](https://example.com/song.mp3)')
  })
})

it('one-column tables and toggle headings keep their Markdown', () => {
  expect(parseBlocks('| Name |\n| --- |\n| Aa |')[0].kind).toBe('table')
  const toggle = parseBlocks('> [!note]- ## Title\n> Body')[0]
  expect(toggle).toMatchObject({ kind: 'callout', folded: true, level: 2 })
})

it('peer carets at empty and final offsets do not change the source', () => {
  const ed = setup('Words')
  ed.decorate([{ from: 5, to: 5, className: 'aa-peer-selection', label: 'Peer' }])
  expect(host!.querySelector('.aa-peer-caret')?.getAttribute('data-label')).toBe('Peer')
  expect(readBlock(host!.firstElementChild as HTMLElement)).toBe('Words')
  ed.value = ''; ed.decorate([{ from: 0, to: 0, className: 'aa-peer-selection', label: 'Peer' }])
  expect(host!.querySelector('.aa-peer-caret')).not.toBeNull()
  expect(ed.value).toBe('')
})
