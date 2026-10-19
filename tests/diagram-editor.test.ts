import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, imageAtom, type Editor } from '../src/editor'
import { readBlock } from '../src/render'
import { diagramAtom, DIAGRAM_START, type AaDiagramElement, type AaDiagramBoardElement } from '../src/diagram'

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, atoms: [imageAtom, diagramAtom], ...options })
  return editor
}
const blockElements = () => Array.from(host!.children) as HTMLElement[]
/** The drawing a block holds, on its board. */
const drawingIn = (element: Element) => element.querySelector<AaDiagramBoardElement>('aa-diagram-board')?.querySelector('aa-diagram') as AaDiagramElement | null
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; document.querySelectorAll('aa-toolbar').forEach(node => node.remove()); window.getSelection()?.removeAllRanges() })

const SOURCE = 'Above\n\n```diagram\n[A]\n[B] @ 0 3\nA -> B\n```\n\nBelow'

describe('a diagram in the editor', () => {
  it('is drawn in place of its fence, and reads back as it was written', () => {
    const e = setup(SOURCE)
    const block = blockElements()[1]
    expect(block.hasAttribute('data-drawn')).toBe(true)
    expect(block.dataset.fence).toBe('diagram')
    expect(drawingIn(block)?.source).toBe('[A]\n[B] @ 0 3\nA -> B')
    // The drawing stays in the page, so a product's own rules for its element reach it.
    expect(drawingIn(block)?.parentElement?.localName).toBe('aa-diagram-board')
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
    expect(drawingIn(preview)?.source).toBe('[A]\n[B] @ 0 3\nA -> B')
    expect(readBlock(block)).toBe('```diagram\n[A]\n[B] @ 0 3\nA -> B\n```')
    expect(e.selection()).toEqual({ start: SOURCE.indexOf('[B]'), end: SOURCE.indexOf('[B]') })
  })
  it('stays code while its fence is still open, and other fences stay code', () => {
    for (const value of ['```diagram\n[A]', '```js\nlet a\n```']) {
      setup(value)
      expect(blockElements()[0].hasAttribute('data-drawn')).toBe(false)
      expect(host!.querySelector('aa-diagram-board')).toBeNull()
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

describe('drawing on a diagram\'s board', () => {
  const board = () => host!.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
  const part = <T extends Element>(selector: string) => board().shadowRoot!.querySelector<T>(selector)!
  // A square is twenty pixels and the paper starts at the page's corner here, so a square's middle is at 20n + 10.
  const pointer = (type: string, x: number, y: number) => part('.paper').dispatchEvent(new PointerEvent(type, { clientX: x * 20 + 10, clientY: y * 20 + 10, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, composed: true, cancelable: true }))
  const key = (key: string, target: Element = board()) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }))
  const tool = (label: string) => part<HTMLButtonElement>(`.tools button[aria-label^="${label}"]`).click()

  it('moves a group a square at a time and writes its place, as one step to undo', () => {
    const e = setup(SOURCE)
    pointer('pointerdown', 1, 0)
    pointer('pointermove', 5, 0)
    pointer('pointerup', 5, 0)
    expect(e.value).toBe(SOURCE.replace('[A]', '[A] @ 4 0'))
    expect(board().hasAttribute('data-active')).toBe(true)
    e.undo()
    expect(e.value).toBe(SOURCE)
  })

  it('places a box on the square pressed and names it there', async () => {
    const e = setup(SOURCE)
    pointer('pointerdown', 8, 8); pointer('pointerup', 8, 8)
    tool('Box')
    pointer('pointerdown', 10, 6)
    expect(e.value).toContain('[B] @ 0 3\n[Box] @ 10 6\nA -> B')
    await Promise.resolve()
    const field = part<HTMLInputElement>('.rename')
    expect(field.hidden).toBe(false)
    expect(field.value).toBe('Box')
    field.value = 'Ship'
    key('Enter', field)
    expect(e.value).toContain('[Ship] @ 10 6')
  })

  it('draws an arrow from the box pressed to the box let go over', () => {
    const e = setup(SOURCE)
    pointer('pointerdown', 8, 8); pointer('pointerup', 8, 8)
    tool('Line')
    pointer('pointerdown', 1, 3)
    pointer('pointermove', 1, 0)
    pointer('pointerup', 1, 0)
    expect(e.value).toContain('A -> B\nB -- A\n```')
  })

  it('colours what is chosen, and takes a group away with its lines', () => {
    const e = setup(SOURCE)
    pointer('pointerdown', 1, 3); pointer('pointerup', 1, 3)
    part<HTMLButtonElement>('.tools button[aria-label="Pink"]').click()
    expect(e.value).toContain('[B] @ 0 3 pink')
    key('Backspace')
    expect(e.value).toBe('Above\n\n```diagram\n[A]\n```\n\nBelow')
  })

  it('keeps its keys and presses from the writing around it', () => {
    const e = setup(SOURCE)
    pointer('pointerdown', 1, 0); pointer('pointerup', 1, 0)
    key('a')
    expect(e.value).toBe(SOURCE)
    expect(board().dataset.tool).toBe('arrow')
    expect(blockElements()[1].hasAttribute('data-drawn')).toBe(true)
  })

  it('draws, and only draws, in an editor that is read only', () => {
    const e = setup(SOURCE, { readOnly: true })
    expect(board().hasAttribute('data-aa-interactive')).toBe(false)
    pointer('pointerdown', 1, 0); pointer('pointermove', 5, 0); pointer('pointerup', 5, 0)
    expect(e.value).toBe(SOURCE)
    expect(board().hasAttribute('data-active')).toBe(false)
  })
})

describe('a diagram just started', () => {
  it('shows its board\'s tools under its words', () => {
    const e = setup('', { toolbar: true })
    e.selectRange(0)
    ;(document.querySelector('aa-toolbar button[aria-label="Diagram"]') as HTMLButtonElement).click()
    const board = host!.querySelector<AaDiagramBoardElement>('.aa-atom[data-preview] aa-diagram-board')!
    expect(board.hasAttribute('data-active')).toBe(true)
    expect(board.shadowRoot!.querySelectorAll('.tools button').length).toBeGreaterThan(10)
  })
})
