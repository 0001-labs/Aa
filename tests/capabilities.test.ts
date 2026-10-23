import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineAaEditor, type AaEditorElement } from '../src/element'
import { createEditor, type Editor } from '../src/editor'
import { parseBlocks, serialize, blockRuns } from '../src/markdown'
import { fromMarkdown, indentBlocks, renumber, toggleCallout, turnInto } from '../src/document'
import { fromTSV, tableAlignments, tableRows, editTable } from '../src/table'
import { readBlock, renderBlock, pointAt, offsetIn } from '../src/render'

let editor: Editor | undefined, host: HTMLElement | undefined
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options }); editor.selectRange(0)
  return editor
}
function key(key: string, modifiers: KeyboardEventInit = {}) { host!.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })) }
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges(); vi.useRealTimers(); vi.unstubAllGlobals() })

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
  it('initializes an editor containing the playground tip callout', () => {
    const value = '# Aa\n\n> [!tip] A callout\n> Its body stays Markdown.'
    const e = setup(value)
    expect(e.value).toBe(value)
    expect(host!.textContent).toContain('Its body stays Markdown.')
    expect((host!.querySelector('[data-callout="tip"]') as HTMLElement).style.getPropertyValue('--aa-callout-icon')).toContain('data:image/svg+xml')
  })

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
  it('selects cell contents first and preserves whole-table selection on repeated Select all', () => {
    const e = setup('| Name | Value |\n| --- | --- |\n| Milk | 2 |')
    e.selectRange(35); key('a', mod)
    expect(e.selection()).toEqual({ start: 33, end: 37 })
    key('a', mod)
    expect(e.selection()).toEqual({ start: 0, end: e.value.length })
  })
  it('pastes a spreadsheet range into existing table cells', () => {
    const e = setup('| Name | Value |\n| --- | --- |\n| Milk | 2 |')
    e.selectRange(33, 37)
    const data = new DataTransfer(); data.setData('text/plain', 'Coffee\t4\nWater\t5')
    host!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    expect(e.value).toBe('| Name | Value |\n| --- | --- |\n| Coffee | 4 |\n| Water | 5 |')
    e.undo(); expect(e.value).toBe('| Name | Value |\n| --- | --- |\n| Milk | 2 |')
  })

  const source = '| Name | Value |\n| --- | --- |\n| Milk | 2 |'
  it('keeps a typed trailing space visible with the caret after it in its table cell', () => {
    const e = setup(source)
    const cell = tableRows(source)[1][0]
    e.selectRange(cell.to)
    e.replace(cell.to, cell.to, ' ')
    expect(tableRows(e.value)[1][0].text).toBe('Milk ')
    const current = host!.querySelectorAll<HTMLElement>('[data-cell]')[2]
    expect(current.lastElementChild!.textContent).toBe('Milk ')
    const caret = pointAt(host!.children[0] as HTMLElement, cell.to + 1)
    expect(current.contains(caret.node)).toBe(true)
    e.replace(cell.to + 1, cell.to + 1, 'and honey')
    expect(tableRows(e.value)[1][0].text).toBe('Milk and honey')
  })
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
  it.each(['2', ''])('Enter in the final cell adds a row, focuses its first cell and undoes (%s)', value => {
    const table = `| Name | Value |\n| :--- | ---: |\n| Milk | ${value} |`
    const e = setup(table + '\n\nAfter')
    const end = tableRows(table).at(-1)!.at(-1)!.to
    e.selectRange(end); key('Enter')
    expect(e.value).toBe(table + '\n|  |  |\n\nAfter')
    const first = tableRows(parseBlocks(e.value)[0].source).at(-1)![0].from
    expect(e.selection()).toEqual({ start: first, end: first })
    e.undo(); expect(e.value).toBe(table + '\n\nAfter')
    e.redo(); expect(e.value).toBe(table + '\n|  |  |\n\nAfter')
  })
  it('keeps Shift+Enter as a way out and ignores Enter during composition or read-only editing', () => {
    const e = setup(source)
    const end = tableRows(source).at(-1)!.at(-1)!.to
    e.selectRange(end); key('Enter', { isComposing: true }); expect(e.value).toBe(source)
    e.readOnly = true; key('Enter'); expect(e.value).toBe(source)
    e.readOnly = false; e.selectRange(end); key('Enter', { shiftKey: true })
    expect(host!.children).toHaveLength(2)
    expect(tableRows(parseBlocks(e.value)[0].source)).toHaveLength(2)
  })
  it('adds and removes rows and columns while preserving the header', () => {
    const block = parseBlocks(source)[0]
    expect(tableRows(editTable(block, 'add-row', 0, 0))).toHaveLength(3)
    expect(tableRows(editTable(block, 'delete-row', 0, 0))).toHaveLength(2)
    expect(tableRows(editTable(block, 'add-column', 0, 0))[0]).toHaveLength(3)
    expect(fromTSV('Name\tValue\nMilk\t2')).toBe(source)
  })
  it('reads and keeps each column\'s alignment, setting numbers to the end', () => {
    const aligned = '| Name | Count |\n| :--- | ---: |\n| Milk | 2 |'
    expect(tableAlignments(aligned)).toEqual(['start', 'end'])
    expect(tableAlignments(source)).toEqual([null, null])
    const block = parseBlocks(aligned)[0]
    expect(editTable(block, 'add-row', 0, 0).split('\n')[1]).toBe('| :--- | ---: |')
    expect(editTable(block, 'add-column', 0, 0).split('\n')[1]).toBe('| :--- | --- | ---: |')
    expect(editTable(block, 'delete-column', 0, 0).split('\n')[1]).toBe('| ---: |')
    setup(aligned)
    expect([...host!.querySelectorAll<HTMLElement>('[data-cell]')].map(cell => cell.dataset.align)).toEqual(['start', 'end', 'start', 'end'])
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
  it('keeps the creation toolbar available at a collapsed touch caret', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    setup('Phone typing', { toolbar: true })
    host!.dispatchEvent(new Event('aa-selectionchange'))
    vi.advanceTimersByTime(140)
    const toolbar = document.querySelector('.aa-toolbar') as HTMLElement
    expect(toolbar.hidden).toBe(false)
    expect(toolbar.hasAttribute('data-docked')).toBe(true)
    expect(toolbar.querySelector('[aria-label="Add a block"]')).toBeNull()
    // Touch reaches the block commands, moving blocks among them, from the toolbar.
    ;(toolbar.querySelector('[aria-label="Block commands"]') as HTMLButtonElement).click()
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    expect(menu.querySelector('[data-command="up"]')).not.toBeNull()
    // The caret stays in its block, which the commands act on: a block selected on touch would wear the system's handles.
    expect(host!.children[0].hasAttribute('data-selected')).toBe(false)
  })

  it('inserts a block of a kind from the touch toolbar\'s sheet', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const e = setup('Hello', { toolbar: true })
    e.selectRange(5)
    host!.dispatchEvent(new Event('aa-selectionchange'))
    vi.advanceTimersByTime(140)
    const toolbar = document.querySelector('.aa-toolbar') as HTMLElement
    expect(toolbar.firstElementChild?.getAttribute('aria-label')).toBe('Insert block')
    ;(toolbar.firstElementChild as HTMLButtonElement).click()
    const sheet = document.querySelector('dialog.aa-sheet') as HTMLDialogElement
    expect(sheet.classList.contains('ds-overlay--sheet')).toBe(true)
    expect(sheet.querySelector('.aa-sheet-title')!.textContent).toBe('Insert block')
    expect(sheet.querySelector('[data-command="h2"] .aa-sheet-key')!.textContent).toBe('##')
    ;(sheet.querySelector('[data-command="h2"]') as HTMLButtonElement).click()
    await vi.advanceTimersByTimeAsync(500)
    expect(e.value.startsWith('Hello\n\n## ')).toBe(true)
    expect(e.selection()).toEqual({ start: 10, end: 10 })
    expect(document.querySelector('dialog.aa-sheet')).toBeNull()
  })

  it("draws the toolbar as Design system 1's context bar, a toolbar that leaves the focus in the writing", () => {
    setup('Words', { toolbar: true })
    const toolbar = document.querySelector('aa-toolbar') as HTMLElement
    expect(toolbar.classList.contains('ds-context')).toBe(true)
    expect(toolbar.classList.contains('ds-context--bar')).toBe(true)
    expect(toolbar.getAttribute('role')).toBe('toolbar')
    const buttons = [...toolbar.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => button.classList.contains('ds-context__item--icon') && !button.hasAttribute('role'))).toBe(true)
  })

  it('keeps caption Select all and paste inside the caption', () => {
    const e = setup('![Sample](/sample.png)')
    const caption = host!.querySelector('.aa-caption') as HTMLElement
    caption.focus()
    const range = document.createRange(); range.selectNodeContents(caption)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
    caption.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ...mod, bubbles: true, cancelable: true }))
    expect(window.getSelection()!.toString()).toBe('Sample')
    const data = new DataTransfer(); data.setData('text/plain', 'New caption')
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    caption.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(e.value).toBe('![Sample](/sample.png)')
  })
  it('never makes captions editable while drawing a read-only editor', () => {
    setup('![Sample](/sample.png)', { readOnly: true })
    expect((host!.querySelector('.aa-caption') as HTMLElement).contentEditable).toBe('false')
  })

  it('edits a link through a URL field without exposing Markdown', () => {
    const e = setup('Alpha beta', { toolbar: true }); e.selectRange(6, 10)
    e.format('link')
    expect(e.value).toBe('Alpha beta')
    const input = document.querySelector<HTMLInputElement>('[aria-label="Link URL"]')!
    input.value = 'https://ezo.gs'
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(e.value).toBe('Alpha [beta](https://ezo.gs)')
    expect([...host!.querySelectorAll('.aa-syntax')].every(node => node.hasAttribute('data-hidden'))).toBe(true)
  })
  it('edits an existing link destination and cancels without changing Markdown', () => {
    const e = setup('[Words](https://old.example)', { toolbar: true }); e.selectRange(2)
    e.format('link')
    const input = document.querySelector<HTMLInputElement>('[aria-label="Link URL"]')!
    expect(input.value).toBe('https://old.example')
    input.value = 'https://new.example'
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(e.value).toBe('[Words](https://new.example)')
    e.selectRange(2); e.format('link')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(e.value).toBe('[Words](https://new.example)')
    expect(input.closest('form')!.hidden).toBe(true)
  })
  it('keeps block menus open when selecting a block scrolls it into view', () => {
    setup('Alpha beta', { toolbar: true })
    key('/', mod)
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    window.dispatchEvent(new Event('scroll'))
    expect(menu.hidden).toBe(false)
  })

  it('offers Columns in the slash menu, an atom of the editor\'s own', () => {
    const e = setup('/col', { toolbar: true })
    e.selectRange(e.value.length)
    e.replace(e.value.length, e.value.length, 'umns')
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    expect([...menu.querySelectorAll('button')].map(button => button.textContent)).toContain('Columns')
  })
  it('opens no block menu with menus off', () => {
    setup('Alpha beta', { toolbar: true, menus: false })
    key('/', mod)
    expect((document.querySelector('.aa-menu') as HTMLElement | null)?.hidden ?? true).toBe(true)
  })

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
  // The caret wears the person's initial, drawn over it as an avatar, never as text in the line.
  expect(host!.querySelector('.aa-peer-caret')?.getAttribute('data-initial')).toBe('P')
  expect(readBlock(host!.firstElementChild as HTMLElement)).toBe('Words')
  ed.value = ''; ed.decorate([{ from: 0, to: 0, className: 'aa-peer-selection', label: 'Peer' }])
  expect(host!.querySelector('.aa-peer-caret')).not.toBeNull()
  expect(ed.value).toBe('')
})

it('preserves options assigned before the custom element is registered', () => {
  // On touch the bar carries Image or file; with a pointer it is the slash menu's.
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const node = document.createElement('aa-editor') as AaEditorElement
  node.options = { toolbar: true, onFiles: vi.fn() }
  node.value = 'Before registration'
  document.body.append(node)
  defineAaEditor()
  expect(node.value).toBe('Before registration')
  expect([...document.querySelectorAll('.aa-toolbar button')].some(button => button.getAttribute('aria-label') === 'Image or file')).toBe(true)
  node.remove()
  vi.unstubAllGlobals()
})

describe('the bar over selected words', () => {
  it('underlines with ⌘U and the bar, as one mark to take off again', () => {
    const e = setup('Hello world', { toolbar: true })
    e.selectRange(0, 5); key('u', mod)
    expect(e.value).toBe('<u>Hello</u> world')
    expect(host!.querySelector('.aa-u')?.textContent).toBe('Hello')
    e.format('underline'); expect(e.value).toBe('Hello world')
  })
  it('colours words, changes the colour and takes it off, never nesting it', () => {
    const e = setup('Hello world', { toolbar: true })
    e.selectRange(0, 5); e.color('red')
    expect(e.value).toBe('<span color="red">Hello</span> world')
    expect((host!.querySelector('[data-color="red"]') as HTMLElement).textContent).toBe('Hello')
    e.color('blue'); expect(e.value).toBe('<span color="blue">Hello</span> world')
    e.color(null); expect(e.value).toBe('Hello world')
    e.undo(); expect(e.value).toBe('<span color="blue">Hello</span> world')
  })
  it('lays the colour, the marks and Comment out in that order, and opens the colours from the bar', () => {
    setup('Words', { toolbar: true, comments: { subscribe: () => () => {}, me: () => null } })
    const toolbar = document.querySelector('.aa-toolbar') as HTMLElement
    expect([...toolbar.querySelectorAll('button')].map(button => button.dataset.action))
      .toEqual(['color', 'bold', 'italic', 'underline', 'strike', 'link', 'code', 'equation', 'comment'])
    ;(toolbar.querySelector('[data-action="color"]') as HTMLButtonElement).click()
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    expect([...menu.querySelectorAll('.aa-menu-list button')].map(row => row.getAttribute('aria-label'))).toEqual(['Default', 'Grey', 'Red', 'Orange', 'Green', 'Blue', 'Purple'])
    expect(menu.querySelector('[data-command="color-red"] .aa-icon')?.getAttribute('data-color')).toBe('red')
  })
  it('scrolls the slash menu\'s commands and keeps Close under them', () => {
    setup('Alpha', { toolbar: true })
    key('/', mod)
    const menu = document.querySelector('.aa-menu') as HTMLElement
    expect(menu.lastElementChild?.getAttribute('data-command')).toBe('close')
    expect(menu.lastElementChild?.textContent).toBe('Closeesc')
    ;(menu.lastElementChild as HTMLButtonElement).click()
    expect(menu.hidden).toBe(true)
  })
})

it('renders the active product command preview and cleans it on keyboard, hover and close', () => {
  const stops = [vi.fn(), vi.fn()]
  const inputs: string[] = []
  const previews = ['Alpha', 'Beta'].map((label, index) => ({
    name: label.toLowerCase(), match: () => 0,
    insert: { label: `Spec ${label}`, icon: 'text', source: label, preview: (element: HTMLElement, context: { input: 'pointer' | 'keyboard' }) => { inputs.push(context.input); element.textContent = label; return stops[index] } },
  }))
  const e = setup('/spe', { atoms: previews })
  e.selectRange(4); e.replace(4, 4, 'c')
  expect(document.querySelector('.aa-command-preview')?.textContent).toBe('Alpha')
  key('ArrowDown')
  expect(stops[0]).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.aa-command-preview')?.textContent).toBe('Beta')
  document.querySelector('[data-command="insert-alpha"]')?.dispatchEvent(new PointerEvent('pointerenter'))
  expect(stops[1]).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.aa-command-preview')?.textContent).toBe('Alpha')
  key('Escape')
  expect(document.querySelector('.aa-command-preview')).toBeNull()
  expect(stops[0]).toHaveBeenCalledTimes(2)
  expect(inputs).toEqual(['keyboard', 'keyboard', 'pointer'])
})

it('restarts an already active command preview when its row is hovered', () => {
  const preview = vi.fn((_element: HTMLElement, _context: { input: 'pointer' | 'keyboard' }) => vi.fn())
  const e = setup('/spec', { atoms: [{ name: 'spec', match: () => 0, insert: { label: 'Spec', icon: 'text', source: 'Example', preview } }] })
  e.selectRange(5); e.replace(5, 5, ' ')
  const row = document.querySelector('[data-command="insert-spec"]')!
  expect(preview).toHaveBeenLastCalledWith(expect.any(HTMLElement), { input: 'keyboard' })
  row.dispatchEvent(new PointerEvent('pointerenter'))
  expect(preview).toHaveBeenLastCalledWith(expect.any(HTMLElement), { input: 'pointer' })
  expect(preview).toHaveBeenCalledTimes(2)
})
