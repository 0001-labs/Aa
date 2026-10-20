import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('never shows its words: the caret come into it gives its board the keys', () => {
    const e = setup(SOURCE)
    e.selectRange(SOURCE.indexOf('[B]'))
    const block = blockElements()[1]
    const board = block.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
    expect(block.hasAttribute('data-drawn')).toBe(true)
    expect(block.querySelector('.aa-c')).toBeNull()
    expect(block.textContent).not.toContain('[A]')
    expect(readBlock(block)).toBe('```diagram\n[A]\n[B] @ 0 3\nA -> B\n```')
    expect(document.activeElement).toBe(board)
    expect(board.hasAttribute('data-active')).toBe(true)
    expect(e.value).toBe(SOURCE)
  })
  it('gives the keys back to the writing after it or before it', () => {
    const e = setup(SOURCE)
    e.selectRange(SOURCE.indexOf('[B]'))
    const board = () => host!.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }))
    expect(e.selection()).toEqual({ start: SOURCE.indexOf('Below'), end: SOURCE.indexOf('Below') })
    e.selectRange(SOURCE.indexOf('[B]'))
    expect(document.activeElement).toBe(board())
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true, cancelable: true }))
    expect(e.selection()).toEqual({ start: 'Above'.length, end: 'Above'.length })
    e.selectRange(SOURCE.indexOf('[B]'))
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }))
    expect(e.selection()).toEqual({ start: SOURCE.indexOf('Below'), end: SOURCE.indexOf('Below') })
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
  // Diagram stands on the touch bar; with a pointer it is the slash menu's.
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })))
  afterEach(() => vi.unstubAllGlobals())
  const press = (label: string) => (document.querySelector(`aa-toolbar button[aria-label="${label}"]`) as HTMLButtonElement).click()
  it('takes an empty block from the toolbar, its board taking the keys at once', () => {
    const e = setup('', { toolbar: true })
    e.selectRange(0)
    press('Diagram')
    expect(e.value).toBe(DIAGRAM_START)
    expect(blockElements()[0].hasAttribute('data-drawn')).toBe(true)
    const board = host!.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
    expect(document.activeElement).toBe(board)
    expect(board.hasAttribute('data-active')).toBe(true)
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
  const pointer = (type: string, x: number, y: number, target: Element = part('.paper')) => target.dispatchEvent(new PointerEvent(type, { clientX: x * 20 + 10, clientY: y * 20 + 10, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, composed: true, cancelable: true }))
  const press = (x: number, y: number) => { pointer('pointerdown', x, y); pointer('pointerup', x, y) }
  /** A press carried from one square to another; the click a drop swallows is over once the task is. */
  const drag = async (from: [number, number], to: [number, number], target?: Element) => {
    pointer('pointerdown', ...from, target)
    pointer('pointermove', ...to)
    pointer('pointerup', ...to)
    await new Promise(resolve => setTimeout(resolve))
  }
  const key = (key: string, options: KeyboardEventInit = {}, target: Element = board()) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...options }))
  const tool = (label: string) => part<HTMLButtonElement>(`.tools button[aria-label^="${label}"]`)
  const nextTask = () => new Promise(resolve => setTimeout(resolve))

  it('carries a group with the pointer, settles it on whole squares and writes its place, as one step to undo', async () => {
    const e = setup(SOURCE)
    await drawingIn(blockElements()[1])!.updateComplete
    pointer('pointerdown', 1, 0)
    pointer('pointermove', 5.25, 0.25)
    // Carried, the box follows the pointer by transform alone, and its ring stands where it will land.
    const box = drawingIn(blockElements()[1])!.shadowRoot!.querySelector<HTMLElement>('.box')!
    expect(box.style.transform).toBe('translate(85px, 5px)')
    expect(part<HTMLElement>('.ring').style.getPropertyValue('--x')).toBe('4')
    pointer('pointerup', 5.25, 0.25)
    // It settles onto its squares, then is written there.
    expect(box.style.transform).toBe('translate(80px, 0px)')
    expect(e.value).toBe(SOURCE)
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(e.value).toBe(SOURCE.replace('[A]', '[A] @ 4 0'))
    expect(board().hasAttribute('data-active')).toBe(true)
    expect(document.activeElement).toBe(board())
    e.undo()
    expect(e.value).toBe(SOURCE)
  })

  it('puts a box carried out of the tools where it is let go, and names it there', async () => {
    const e = setup(SOURCE)
    press(8, 8)
    // Let go over the paper: it is twenty squares by ten here.
    part<HTMLElement>('.paper').getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 200 })
    await drag([0, -2], [10, 6], tool('Box'))
    expect(e.value).toContain('[B] @ 0 3\n[Box] @ 9 6\nA -> B')
    await Promise.resolve()
    const field = part<HTMLInputElement>('.rename')
    expect(field.hidden).toBe(false)
    expect(field.value).toBe('Box')
    field.value = 'Ship'
    key('Enter', {}, field)
    expect(e.value).toContain('[Ship] @ 9 6')
    // One step names it, one put it there.
    e.undo()
    expect(e.value).toContain('[Box] @ 9 6')
    e.undo()
    expect(e.value).toBe(SOURCE)
  })

  it('puts a box pressed in the tools on a free square, beside what is chosen', () => {
    const e = setup(SOURCE)
    press(1, 3)
    tool('Box').click()
    expect(e.value).toContain('[B] @ 0 3\n[Box] @ 6 3\n')
    key('Escape', {}, part('.rename'))
    key('Escape')
    tool('Post-it').click()
    expect(e.value).toContain('[Box] @ 6 3\n{Note} @ 0 5 w8\n')
  })

  it('draws a line from the box pressed to the box let go over, and makes it an arrow', async () => {
    const e = setup(SOURCE)
    press(8, 8)
    tool('Line').click()
    expect(tool('Line').getAttribute('aria-pressed')).toBe('true')
    await drag([1, 3], [1, 0])
    expect(e.value).toContain('A -> B\nB -- A\n```')
    expect(tool('Line').getAttribute('aria-pressed')).toBe('true')
    tool('Arrow').click()
    expect(e.value).toContain('A -> B\nB -> A\n```')
    expect(board().dataset.mode).toBe('choose')
  })

  it('sizes a box by its grip in whole items', async () => {
    const e = setup(SOURCE)
    press(1, 0)
    const grip = part<HTMLElement>('.grip')
    expect(grip.hidden).toBe(false)
    await drag([4, 0], [9, 0], grip)
    expect(e.value).toBe(SOURCE.replace('[A]', '[A] w8'))
  })

  it('colours what is chosen, and takes a group away with its lines', () => {
    const e = setup(SOURCE)
    press(1, 3)
    // One colour tool opens the colours; choosing one closes them.
    expect(part<HTMLElement>('.colors').hidden).toBe(true)
    tool('Colour').click()
    expect(part<HTMLElement>('.colors').hidden).toBe(false)
    part<HTMLButtonElement>('.colors button[aria-label="Pink"]').click()
    expect(e.value).toContain('[B] @ 0 3 pink')
    expect(part<HTMLElement>('.colors').hidden).toBe(true)
    expect(tool('Colour').disabled).toBe(false)
    expect(part<HTMLButtonElement>('.colors button[aria-label="Pink"]').getAttribute('aria-checked')).toBe('true')
    key('Backspace')
    expect(e.value).toBe('Above\n\n```diagram\n[A]\n```\n\nBelow')
  })

  it('reaches everything from the keys, one step of undo for each change', async () => {
    const three = 'Above\n\n```diagram\n[A]\n[B] @ 0 3\n[C] @ 8 0\nA -> B\n```\n\nBelow'
    const e = setup(three)
    e.selectRange(three.indexOf('[B]'))
    expect(document.activeElement).toBe(board())
    // Tab chooses each in turn: the groups as written, then the lines.
    key('Tab'); key('Tab'); key('Tab'); key('Tab')
    key('Delete')
    expect(e.value).toBe(three.replace('\nA -> B', ''))
    e.undo()
    key('Tab')
    key('ArrowRight', { shiftKey: true })
    expect(e.value).toContain('\n[A] @ 4 0\n')
    key('ArrowDown')
    expect(e.value).toContain('\n[A] @ 4 1\n')
    key('ArrowRight', { altKey: true })
    expect(e.value).toContain('\n[A] @ 4 1 w8\n')
    e.undo(); e.undo(); e.undo()
    expect(e.value).toBe(three)
    // L joins what is chosen to the one Tab reaches, Enter draws it.
    key('Escape')
    key('Tab')
    key('l')
    key('Tab'); key('Tab')
    key('Enter')
    expect(e.value).toContain('A -> B\nA -- C\n```')
    // Enter names what is chosen.
    key('Tab', { shiftKey: true })
    key('Tab', { shiftKey: true })
    key('Enter')
    await Promise.resolve()
    const field = part<HTMLInputElement>('.rename')
    expect(field.value).toBe('C')
    field.value = 'Sea'
    key('Enter', {}, field)
    expect(e.value).toContain('[Sea] @ 8 0\nA -> B\nA -- Sea')
    await nextTask()
    // B adds a box on a free square, named at once.
    key('Escape'); key('b')
    expect(e.value).toContain('[Box] @ 0 5')
  })

  it('fits the width it is read in when wrapping is on, written on its fence, one step to undo', () => {
    const e = setup(SOURCE)
    press(8, 8)
    expect(tool('Fit the width').getAttribute('aria-pressed')).toBe('false')
    tool('Fit the width').click()
    expect(e.value).toBe(SOURCE.replace('```diagram\n', '```diagram wrap\n'))
    expect(blockElements()[1].hasAttribute('data-drawn')).toBe(true)
    expect(drawingIn(blockElements()[1])!.hasAttribute('wrap')).toBe(true)
    expect(tool('Fit the width').getAttribute('aria-pressed')).toBe('true')
    tool('Fit the width').click()
    expect(e.value).toBe(SOURCE)
    e.undo()
    expect(e.value).toBe(SOURCE.replace('```diagram\n', '```diagram wrap\n'))
  })

  it('keeps its keys and presses from the writing around it', () => {
    const e = setup(SOURCE)
    press(8, 8)
    key('a')
    expect(e.value).toBe(SOURCE)
    expect(board().dataset.mode).toBe('arrow')
    key('Escape')
    expect(board().dataset.mode).toBe('choose')
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
  it('shows its board\'s tools', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const e = setup('', { toolbar: true })
    e.selectRange(0)
    vi.unstubAllGlobals()
    ;(document.querySelector('aa-toolbar button[aria-label="Diagram"]') as HTMLButtonElement).click()
    const board = host!.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
    expect(board.hasAttribute('data-active')).toBe(true)
    // Box, post-it, line, arrow, the colour and delete; the colours themselves are in the colour's menu.
    expect([...board.shadowRoot!.querySelectorAll('.tools button')].map(button => button.getAttribute('aria-label'))).toEqual(['Box (B)', 'Post-it (P)', 'Line (L)', 'Arrow (A)', 'Colour', 'Fit the width', 'Delete'])
    expect(board.shadowRoot!.querySelectorAll('.colors button').length).toBe(8)
    expect(e.value).toBe(DIAGRAM_START)
  })
})
