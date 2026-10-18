import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, imageAtom, type Editor } from '../src/editor'
import { readBlock } from '../src/render'
import { diagramAtom, DIAGRAM_START, type AaDiagramElement } from '../src/diagram'

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, atoms: [imageAtom, diagramAtom], ...options })
  return editor
}
const blockElements = () => Array.from(host!.children) as HTMLElement[]
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; document.querySelectorAll('aa-toolbar').forEach(node => node.remove()); window.getSelection()?.removeAllRanges() })

const SOURCE = 'Above\n\n```diagram\n[A]\n[B] @ 0 3\nA -> B\n```\n\nBelow'

describe('a diagram in the editor', () => {
  it('is drawn in place of its fence, and reads back as it was written', () => {
    const e = setup(SOURCE)
    const block = blockElements()[1]
    expect(block.hasAttribute('data-drawn')).toBe(true)
    expect(block.dataset.fence).toBe('diagram')
    const diagram = block.querySelector('aa-diagram') as AaDiagramElement
    expect(diagram.source).toBe('[A]\n[B] @ 0 3\nA -> B')
    expect(readBlock(block)).toBe('```diagram\n[A]\n[B] @ 0 3\nA -> B\n```')
    expect(e.value).toBe(SOURCE)
  })
  it('shows its words as code with the caret in it, the drawing under them reading back as nothing', () => {
    const e = setup(SOURCE)
    e.selectRange(SOURCE.indexOf('[B]'))
    const block = blockElements()[1]
    expect(block.hasAttribute('data-drawn')).toBe(false)
    expect(block.querySelector('.aa-c')?.textContent).toBe('[A]')
    const preview = block.querySelector<HTMLElement>('.aa-atom[data-preview]')!
    expect(preview.dataset.source).toBe('')
    expect((preview.querySelector('aa-diagram') as AaDiagramElement).source).toBe('[A]\n[B] @ 0 3\nA -> B')
    expect(readBlock(block)).toBe('```diagram\n[A]\n[B] @ 0 3\nA -> B\n```')
    expect(e.selection()).toEqual({ start: SOURCE.indexOf('[B]'), end: SOURCE.indexOf('[B]') })
  })
  it('stays code while its fence is still open, and other fences stay code', () => {
    for (const value of ['```diagram\n[A]', '```js\nlet a\n```']) {
      setup(value)
      expect(blockElements()[0].hasAttribute('data-drawn')).toBe(false)
      expect(host!.querySelector('aa-diagram')).toBeNull()
      editor!.destroy(); host!.remove()
    }
    editor = undefined; host = undefined
  })
})

describe('starting a diagram', () => {
  const press = (label: string) => (document.querySelector(`aa-toolbar button[aria-label="${label}"]`) as HTMLButtonElement).click()
  it('takes an empty block from the toolbar, the caret on its first line of words', () => {
    const e = setup('', { toolbar: true })
    e.selectRange(0)
    press('Diagram')
    expect(e.value).toBe(DIAGRAM_START)
    const first = DIAGRAM_START.indexOf('\n') + 1
    expect(e.selection()).toEqual({ start: first, end: first })
    expect(blockElements()[0].hasAttribute('data-drawn')).toBe(false)
  })
  it('comes after the block the caret is in, as one step to undo', () => {
    const e = setup('Words', { toolbar: true })
    e.selectRange(5)
    press('Diagram')
    expect(e.value).toBe(`Words\n\n${DIAGRAM_START}`)
    e.undo()
    expect(e.value).toBe('Words')
  })
  it('is a slash command too', () => {
    const e = setup('')
    e.selectRange(0)
    e.replace(0, 0, '/diag')
    host!.dispatchEvent(new Event('aa-change'))
    document.dispatchEvent(new Event('selectionchange'))
    const command = document.querySelector<HTMLButtonElement>('.aa-menu [data-command="insert-diagram"]')
    expect(command).not.toBeNull()
    command!.click()
    expect(e.value).toBe(DIAGRAM_START)
  })
})
