import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, imageAtom, type Editor } from '../src/editor'
import { diagramAtom, type AaDiagramBoardElement } from '../src/diagram'
import type { PromptContext } from '../src/prompt'

let editor: Editor | undefined, host: HTMLElement | undefined
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; document.querySelectorAll('.aa-prompt, .aa-glisten').forEach(node => node.remove()); delete (globalThis as Record<string, unknown>).SpeechRecognition })

function setup(value: string, prompt?: (said: string, context: PromptContext) => Promise<string>) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, prompt, atoms: [imageAtom, diagramAtom] })
  return editor
}
const key = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }))
const field = () => document.querySelector<HTMLElement>('.aa-prompt')
const settle = () => new Promise(resolve => setTimeout(resolve))

describe('asking AI', () => {
  it('opens a prompt with Space in an empty block, and puts the answer in its place as one step to undo', async () => {
    let asked: [string, PromptContext] | undefined
    let answer!: (text: string) => void
    const e = setup('# Plan\n\nShip on Friday.\n\n# Later\n\nNothing', (said, context) => { asked = [said, context]; return new Promise(resolve => { answer = resolve }) })
    e.selectRange('# Plan\n\nShip on Friday.'.length)
    key(host!.children[1], 'Enter')
    const value = e.value
    key(host!.children[2], ' ')
    expect(e.value).toBe(value)
    expect(field()).not.toBeNull()
    field()!.textContent = 'Say why'
    key(field()!, 'Enter')
    expect(field()!.hasAttribute('data-loading')).toBe(true)
    // What it is about is its section, from the heading over it to the next.
    expect(asked![0]).toBe('Say why')
    expect(asked![1]).toMatchObject({ kind: 'writing', text: '# Plan\n\nShip on Friday.' })
    answer('Because the **launch** is Monday.')
    await settle()
    expect(field()).toBeNull()
    expect(e.value).toBe('# Plan\n\nShip on Friday.\n\nBecause the **launch** is Monday.\n\n# Later\n\nNothing')
    e.undo()
    expect(e.value).toBe(value)
  })

  it('is a space as ever without a product to ask, and Escape puts a prompt away', () => {
    const e = setup('')
    e.selectRange(0)
    document.dispatchEvent(new Event('selectionchange'))
    expect((host!.children[0] as HTMLElement).dataset.placeholder).toBe('Type / for commands')
    expect(key(host!.children[0], ' ')).toBe(true)
    expect(field()).toBeNull()
    editor!.destroy(); host!.remove()
    const f = setup('', async () => 'never')
    f.selectRange(0)
    document.dispatchEvent(new Event('selectionchange'))
    expect((host!.children[0] as HTMLElement).dataset.placeholder).toBe('Press ‘space’ for AI or ‘/’ for commands')
    key(host!.children[0], ' ')
    key(field()!, 'Escape')
    expect(field()).toBeNull()
    expect(f.value).toBe('')
  })

  it('listens with Space twice, the words heard in italics', () => {
    class Speech extends EventTarget {
      static last: Speech
      lang = ''; continuous = false; interimResults = false
      onresult: ((event: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null
      constructor() { super(); Speech.last = this }
      start() {} stop() { this.onend?.() } abort() {}
    }
    ;(globalThis as Record<string, unknown>).SpeechRecognition = Speech
    const e = setup('', async () => 'Heard')
    e.selectRange(0)
    key(host!.children[0], ' ')
    key(field()!, ' ')
    expect(field()!.hasAttribute('data-listening')).toBe(true)
    const result = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal })
    Speech.last.onresult!({ resultIndex: 0, results: [result('write a plan', false)] })
    expect(field()!.querySelector('i.aa-prompt-heard')!.textContent).toBe('write a plan')
    Speech.last.onresult!({ resultIndex: 0, results: [result('write a plan for Friday', true)] })
    expect(field()!.querySelector('i')!.textContent).toBe('write a plan for Friday')
    expect(field()!.querySelector('.aa-prompt-heard')).toBeNull()
    // Listening, the caret is a dot; once it stops, the caret again.
    expect(document.querySelector('.aa-prompt-caret')).not.toBeNull()
    Speech.last.stop()
    expect(document.querySelector('.aa-prompt-caret')).toBeNull()
    expect(field()!.hasAttribute('data-listening')).toBe(false)
  })

  it('draws on a diagram from its board, the answer the diagram written again', async () => {
    const source = 'Above\n\n```diagram\n[A]\n```\n\nBelow'
    const asked = vi.fn(async (_said: string, context: PromptContext) => `${context.text}\n[B] @ 6 0\nA -> B`)
    const e = setup(source, asked)
    const board = host!.querySelector<AaDiagramBoardElement>('aa-diagram-board')!
    board.focus()
    key(board, ' ')
    field()!.textContent = 'Add what follows'
    key(field()!, 'Enter')
    await settle()
    expect(asked).toHaveBeenCalledWith('Add what follows', expect.objectContaining({ kind: 'diagram', text: '[A]' }))
    expect(e.value).toBe('Above\n\n```diagram\n[A]\n[B] @ 6 0\nA -> B\n```\n\nBelow')
  })
})
