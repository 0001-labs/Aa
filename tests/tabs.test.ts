import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { blockRuns, parseBlocks, readTabs, serialize, writeTabs } from '../src/markdown'

const source = ['<tabs>', '<tab name="Indgang og reception">', '## Entrance', 'A red carpet.', '</tab>', '<tab name="Scene" icon="🎤">', '- one', '- two', '</tab>', '</tabs>'].join('\n')

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options })
  return editor
}
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined })
const row = () => host!.querySelector<HTMLElement>('.aa-tabs-row')!
const tabs = () => [...row().querySelectorAll<HTMLButtonElement>('.aa-tab[data-tab]')]

describe('tabs', () => {
  it('are one block, read as columns are, and written back the same', () => {
    const blocks = parseBlocks(`Before\n\n${source}\n\nAfter`)
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'tabs', 'paragraph'])
    expect(readTabs(blocks[1].source)).toEqual([{ name: 'Indgang og reception', content: '## Entrance\nA red carpet.' }, { name: 'Scene', icon: '🎤', content: '- one\n- two' }])
    expect(writeTabs(readTabs(source))).toBe(source)
    expect(serialize(blocks)).toBe(`Before\n\n${source}\n\nAfter`)
    // A name with quotes or angle brackets is kept; tabs indented by tabs read without them.
    expect(readTabs(writeTabs([{ name: 'Say "hi" <now> & go', content: '' }]))).toEqual([{ name: 'Say "hi" <now> & go', content: '' }])
    expect(readTabs('<tabs>\n\t<tab name="A">\n\t\tTabbed\n\t</tab>\n</tabs>')).toEqual([{ name: 'A', content: 'Tabbed' }])
    expect(readTabs('<tabs>\n</tabs>')).toEqual([{ name: '', content: '' }])
    expect(blockRuns(parseBlocks(source)[0]).map(run => [run.kind, run.atom])).toEqual([['atom', 'tabs']])
  })

  it('are drawn as a row of tabs over the open tab\'s page, another tab shown when pressed', () => {
    const e = setup(source)
    const drawn = host!.querySelector<HTMLElement>('.aa-atom.aa-tabs')!
    expect(drawn.hasAttribute('data-aa-interactive')).toBe(true)
    expect(row().getAttribute('role')).toBe('tablist')
    expect(tabs().map(tab => tab.textContent)).toEqual(['Indgang og reception', '🎤Scene'])
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    expect(host!.querySelector('.aa-tab-panel')?.textContent).toContain('A red carpet.')
    expect(row().querySelector('.aa-tab-add')).not.toBeNull()
    tabs()[1].click()
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    expect(host!.querySelector('.aa-tab-panel')?.textContent).toContain('one')
    expect(e.value).toBe(source)
  })

  it('hand the whole block back when a tab is written in, named anew, added or taken away', () => {
    const onChange = vi.fn()
    const e = setup(source, { onChange })
    const drawn = host!.querySelector<HTMLElement>('.aa-atom.aa-tabs')!
    drawn.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: writeTabs([{ name: 'Indgang og reception', content: '## Entrance\nA red carpet, edited.' }, { name: 'Scene', icon: '🎤', content: '- one\n- two' }]) } }))
    expect(e.value).toContain('A red carpet, edited.')
    expect(onChange).toHaveBeenCalled()
    // The open tab pressed again takes its name: Enter keeps it.
    tabs()[0].click()
    const field = row().querySelector<HTMLInputElement>('.aa-tab-field')!
    expect(field.value).toBe('Indgang og reception')
    field.value = 'Entrance'
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(e.value).toContain('<tab name="Entrance">')
    expect(tabs()[0].textContent).toBe('Entrance')
    // The plus adds a tab after the last, open and ready to name; Escape keeps the name it was given.
    row().querySelector<HTMLButtonElement>('.aa-tab-add')!.click()
    expect(readTabs(parseBlocks(e.value)[0].source).map(tab => tab.name)).toEqual(['Entrance', 'Scene', 'Tab 3'])
    row().querySelector<HTMLInputElement>('.aa-tab-field')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true')
    // Delete on a tab takes it away, its words with it; the last tab stays.
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    expect(readTabs(parseBlocks(e.value)[0].source).map(tab => tab.name)).toEqual(['Entrance', 'Scene'])
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    expect(readTabs(parseBlocks(e.value)[0].source).map(tab => tab.name)).toEqual(['Entrance'])
    e.undo()
    expect(readTabs(parseBlocks(e.value)[0].source).map(tab => tab.name)).toEqual(['Entrance', 'Scene'])
  })

  it('read only, show their tabs with no plus and no naming', () => {
    setup(source, { readOnly: true })
    expect(row().querySelector('.aa-tab-add')).toBeNull()
    tabs()[0].click()
    expect(row().querySelector('.aa-tab-field')).toBeNull()
    tabs()[1].click()
    expect(host!.querySelector('.aa-tab-panel')?.textContent).toContain('one')
  })

  it('come from the slash menu as two empty tabs', () => {
    const e = setup('')
    e.selectRange(0)
    e.replace(0, 0, '/tabs')
    host!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(e.value).toBe(writeTabs([{ name: 'Tab 1', content: '' }, { name: 'Tab 2', content: '' }]))
  })
})
