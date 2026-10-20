import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, imageAtom, type Editor } from '../src/editor'
import { diagramAtom, type AaDiagramBoardElement } from '../src/diagram'
import type { PromptContext, Prompter } from '../src/prompt'

let editor: Editor | undefined, host: HTMLElement | undefined
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; document.querySelectorAll('.aa-prompt, .aa-glisten').forEach(node => node.remove()); delete (globalThis as Record<string, unknown>).SpeechRecognition })

function setup(value: string, prompt?: Prompter) {
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

  it('changes what is written in place when the answer edits it, and inserts nothing then', async () => {
    const value = '# Today\n\n- [x] Milk\n- [x] Bread\n- [ ] Eggs\n\nAfter'
    let asked: PromptContext | undefined
    const e = setup(value, async (_said, context) => { asked = context; return { edits: [{ find: '- [x] Milk\n- [x] Bread', replace: '- [ ] Milk\n- [ ] Bread' }], insert: '' } })
    e.selectRange(value.length)
    key(host!.children[4], 'Enter')
    const asking = e.value
    key(host!.children[5], ' ')
    field()!.textContent = 'Uncheck the boxes'
    key(field()!, 'Enter')
    await settle()
    expect(asked!.before).toBe(value)
    // The list changed where it stands, and the empty line the prompt stood on is gone: no copy.
    expect(e.value).toBe('# Today\n\n- [ ] Milk\n- [ ] Bread\n- [ ] Eggs\n\nAfter')
    e.undo()
    expect(e.value).toBe(asking)
  })

  it('takes the whole document an answer writes: a title, boxes and a diagram changed or made where they stand, one step to undo, no room left', async () => {
    const value = '# Notes\n\n- [x] Milk\n- [x] Bread\n\nEnd'
    let sent: PromptContext | undefined
    const e = setup(value, async (_said, context) => {
      sent = context
      return { document: '# A morning worth having\n\n- [ ] Milk\n- [ ] Bread\n\n```diagram\n[Shop]\n[Cook] @ 6 0\nShop -> Cook\n```\n\nEnd' }
    })
    e.selectRange(value.length)
    key(host!.children[3], 'Enter')
    const asking = e.value
    const prompt = host!.children[4] as HTMLElement
    key(prompt, ' ')
    prompt.style.minHeight = '240px'
    field()!.textContent = 'Make the title more captivating, uncheck the boxes and make a diagram of my morning'
    key(field()!, 'Enter')
    await settle()
    // The whole document went, the prompt marked where it stands.
    expect(sent!.document).toBe('# Notes\n\n- [x] Milk\n- [x] Bread\n\nEnd\n\n⟦here⟧')
    expect(e.value).toBe('# A morning worth having\n\n- [ ] Milk\n- [ ] Bread\n\n```diagram\n[Shop]\n[Cook] @ 6 0\nShop -> Cook\n```\n\nEnd')
    expect(host!.querySelector('aa-diagram-board')).not.toBeNull()
    expect([...host!.children].every(child => !(child as HTMLElement).style.minHeight)).toBe(true)
    e.undo()
    expect(e.value).toBe(asking)
  })

  it('writes new writing where the prompt stands when the whole document puts it there', async () => {
    const e = setup('One\n\nTwo', async (_said, { document }) => ({ document: document!.replace('⟦here⟧', 'Between') }))
    e.selectRange(3)
    key(host!.children[0], 'Enter')
    key(host!.children[1], ' ')
    field()!.textContent = 'Add a line'
    key(field()!, 'Enter')
    await settle()
    expect(e.value).toBe('One\n\nBetween\n\nTwo')
  })

  it('offers AI at the end of a sentence in a paragraph, and goes on from there', async () => {
    const value = 'Hello. I am here. '
    let sent: PromptContext | undefined
    const e = setup(value, async (_said, context) => { sent = context; return { document: context.document!.replace('⟦here⟧', 'And here to stay.') } })
    e.selectRange(value.length)
    document.dispatchEvent(new Event('selectionchange'))
    const block = host!.children[0] as HTMLElement
    expect(block.dataset.hint).toBe('Press space for AI')
    expect(block.dataset.placeholder).toBeUndefined()
    key(block, ' ')
    field()!.textContent = 'Say I stay'
    key(field()!, 'Enter')
    await settle()
    expect(sent!.document).toBe('Hello. I am here. ⟦here⟧')
    expect(e.value).toBe('Hello. I am here. And here to stay.')
  })

  it('offers AI at the end of a sentence in a bullet, and in a bullet with nothing written yet', async () => {
    for (const [value, written] of [['- Milk. ', '- Milk. And bread.'], ['- One\n- ', '- One\n- And bread.']] as const) {
      let sent: PromptContext | undefined
      const e = setup(value, async (_said, context) => { sent = context; return { document: context.document!.replace('⟦here⟧', 'And bread.') } })
      e.selectRange(value.length)
      document.dispatchEvent(new Event('selectionchange'))
      const block = host!.lastElementChild as HTMLElement
      expect(block.dataset.hint).toBe('Press space for AI')
      key(block, ' ')
      expect(field()!.dataset.placeholder).toBe('Ask AI or press space to speak')
      field()!.textContent = 'Add bread'
      key(field()!, 'Enter')
      await settle()
      expect(sent!.document).toBe(`${value}⟦here⟧`)
      expect(e.value).toBe(written)
      editor!.destroy(); host!.remove()
    }
  })

  it('goes on from the caret in a paragraph as its own words would: its width, on its lines, the first line at the caret', () => {
    const value = 'Hello. I am here. '
    const e = setup(value, async () => 'x')
    e.selectRange(value.length)
    document.dispatchEvent(new Event('selectionchange'))
    const block = host!.children[0] as HTMLElement
    Object.assign(block.style, { paddingLeft: '4px', paddingRight: '6px', lineHeight: '20px' })
    block.getBoundingClientRect = () => new DOMRect(100, 200, 400, 40)
    // The caret at the end of the paragraph's second line, its glyph box shorter than the line.
    const rects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([new DOMRect(330, 222, 0, 17)] as unknown as DOMRectList)
    key(block, ' ')
    rects.mockRestore()
    const prompt = field()!
    expect(prompt.dataset.placeholder).toBe('Ask AI or press space to speak')
    expect(prompt.style.left).toBe(`${100 + 4 + window.scrollX}px`)
    expect(prompt.style.width).toBe('390px')
    expect(prompt.style.top).toBe(`${200 + 20 + window.scrollY}px`)
    expect(prompt.style.textIndent).toBe('226px')
  })

  it('offers nothing mid-sentence, after two spaces, or without a product to ask', () => {
    for (const [value, prompt] of [['Hello. I am', true], ['Hello.  ', true], ['Hello. ', false]] as const) {
      const e = setup(value, prompt ? async () => 'x' : undefined)
      e.selectRange(value.length)
      document.dispatchEvent(new Event('selectionchange'))
      expect((host!.children[0] as HTMLElement).dataset.hint).toBeUndefined()
      expect(key(host!.children[0], ' ')).toBe(true)
      expect(field()).toBeNull()
      editor!.destroy(); host!.remove()
    }
    editor = undefined; host = undefined
  })

  it('marks what an answer changed, and reverts one change, its others left as they are', async () => {
    const value = '# Notes\n\n- [x] Milk\n- [x] Bread\n\nEnd'
    const e = setup(value, async () => ({ document: '# A morning worth having\n\n- [ ] Milk\n- [ ] Bread\n\nEnd' }))
    e.selectRange(value.length)
    key(host!.children[3], 'Enter')
    key(host!.children[4], ' ')
    field()!.textContent = 'Make the title more captivating and uncheck the boxes'
    key(field()!, 'Enter')
    await settle()
    // A dot for the title and one for each box.
    const kinds = [...document.querySelectorAll<HTMLElement>('.aa-ai-mark')].map(mark => mark.dataset.kind)
    expect(kinds).toEqual(['dot', 'dot', 'dot'])
    const reverts = document.querySelectorAll<HTMLButtonElement>('.aa-ai-revert')
    expect(reverts[0].getAttribute('aria-label')).toBe('Revert what AI changed here')
    reverts[0].click()
    expect(e.value).toBe('# Notes\n\n- [ ] Milk\n- [ ] Bread\n\nEnd')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(document.querySelectorAll('.aa-ai-mark')).toHaveLength(2)
    // The revert is a step of its own: undo gives the answer's title back.
    e.undo()
    expect(e.value).toBe('# A morning worth having\n\n- [ ] Milk\n- [ ] Bread\n\nEnd')
  })

  it('colours only the words an answer changed, and a box it ticked, and says nothing more: no panel', async () => {
    const value = '# Notes\n\n- [ ] Milk\n\nShip it on Friday.'
    const e = setup(value, async () => ({ document: '# Notes\n\n- [x] Milk\n\nShip it on Monday.' }))
    e.selectRange(value.length)
    key(host!.children[2], 'Enter')
    key(host!.children[3], ' ')
    field()!.textContent = 'Tick milk and make it Monday'
    key(field()!, 'Enter')
    await settle()
    const changed = [...host!.querySelectorAll('.aa-ai-changed')].map(node => node.textContent)
    expect(changed).toEqual(['Monday.'])
    expect((host!.children[1] as HTMLElement).hasAttribute('data-ai-box')).toBe(true)
    expect(document.querySelector('.aa-ai-summary')).toBeNull()
  })

  it('holds a run of blocks an answer wrote, and takes it all back from the hold', async () => {
    const e = setup('One\n\nTwo', async ({}, { document }) => ({ document: document!.replace('⟦here⟧', '- A\n- B\n- C') }))
    e.selectRange(3)
    key(host!.children[0], 'Enter')
    key(host!.children[1], ' ')
    field()!.textContent = 'List three'
    key(field()!, 'Enter')
    await settle()
    expect([...document.querySelectorAll<HTMLElement>('.aa-ai-mark')].map(mark => mark.dataset.kind)).toEqual(['section'])
    expect(document.querySelector('.aa-ai-hold')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.aa-ai-revert')!.click()
    expect(e.value).toBe('One\n\nTwo')
  })

  it('puts the marks away with Escape, and drops a mark whose block is changed by hand', async () => {
    const e = setup('One\n\nTwo', async () => ({ document: 'One more\n\nTwo' }))
    e.selectRange(3)
    key(host!.children[0], 'Enter')
    key(host!.children[1], ' ')
    field()!.textContent = 'Say more'
    key(field()!, 'Enter')
    await settle()
    expect(document.querySelectorAll('.aa-ai-mark')).toHaveLength(1)
    e.replace(0, 3, 'Uno')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(document.querySelectorAll('.aa-ai-mark')).toHaveLength(0)
    editor!.destroy(); host!.remove()
    const f = setup('One\n\nTwo', async () => ({ document: 'One more\n\nTwo' }))
    f.selectRange(3)
    key(host!.children[0], 'Enter')
    key(host!.children[1], ' ')
    field()!.textContent = 'Say more'
    key(field()!, 'Enter')
    await settle()
    f.selectRange(0)
    // Escape puts the marks away, their blue fading out first.
    expect(document.querySelectorAll('.aa-ai-mark')).toHaveLength(1)
    key(host!.children[0], 'Escape')
    expect(host!.hasAttribute('data-ai-fading')).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(document.querySelectorAll('.aa-ai-mark')).toHaveLength(0)
    expect(host!.querySelector('.aa-ai-changed')).toBeNull()
  })

  it('both edits and inserts where an answer asks for both, and keeps nothing it cannot place exactly', async () => {
    const e = setup('One\n\nTwo', async () => ({ edits: [{ find: 'One', replace: 'First' }, { find: 'Nowhere', replace: 'x' }], insert: 'Between' }))
    e.selectRange(3)
    key(host!.children[0], 'Enter')
    key(host!.children[1], ' ')
    field()!.textContent = 'Name the first, and add a line'
    key(field()!, 'Enter')
    await settle()
    expect(e.value).toBe('First\n\nBetween\n\nTwo')
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
    expect((host!.children[0] as HTMLElement).dataset.placeholder).toBe('Press space for AI or / for commands')
    key(host!.children[0], ' ')
    key(field()!, 'Escape')
    expect(field()).toBeNull()
    expect(f.value).toBe('')
  })

  it('asks and listens from a keyboard that says Space in beforeinput alone', () => {
    class Speech extends EventTarget {
      lang = ''; continuous = false; interimResults = false
      onresult: ((event: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null
      start() {} stop() {} abort() {}
    }
    ;(globalThis as Record<string, unknown>).SpeechRecognition = Speech
    const e = setup('', async () => 'Heard')
    e.selectRange(0)
    const space = () => new InputEvent('beforeinput', { inputType: 'insertText', data: ' ', bubbles: true, cancelable: true })
    const first = space(); host!.children[0].dispatchEvent(first)
    expect(first.defaultPrevented).toBe(true)
    expect(field()).not.toBeNull()
    const second = space(); field()!.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(true)
    expect(field()!.hasAttribute('data-listening')).toBe(true)
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
    // Words still arriving are locked; a selection in what was heard before stays where the person put it.
    const before = field()!.querySelector('i')!.firstChild!
    const selection = window.getSelection()!
    selection.setBaseAndExtent(before, 6, before, 10)
    Speech.last.onresult!({ resultIndex: 1, results: [result('write a plan for Friday', true), result('and', false)] })
    expect(field()!.querySelector<HTMLElement>('.aa-prompt-heard')!.contentEditable).toBe('false')
    expect([selection.anchorNode, selection.anchorOffset, selection.focusOffset]).toEqual([before, 6, 10])
    Speech.last.onresult!({ resultIndex: 1, results: [result('write a plan for Friday', true), result('and Monday', true)] })
    expect(field()!.querySelector('.aa-prompt-heard')).toBeNull()
    expect(field()!.textContent).toBe('write a plan for Friday and Monday')
    // Listening, the caret is a dot after the words heard; once it stops, the caret again.
    expect(field()!.lastElementChild!.className).toBe('aa-prompt-caret')
    expect(field()!.lastElementChild!.previousElementSibling!.textContent).toBe(' and Monday')
    Speech.last.stop()
    expect(document.querySelector('.aa-prompt-caret')).toBeNull()
    expect(field()!.hasAttribute('data-listening')).toBe(false)
  })

  it('says in plain words why it cannot listen, never failing silently', () => {
    class Speech extends EventTarget {
      static last: Speech
      started = false
      lang = ''; continuous = false; interimResults = false
      onresult: ((event: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((event: { error?: string }) => void) | null = null
      constructor() { super(); Speech.last = this }
      start() { this.started = true } stop() { this.onend?.() } abort() {}
    }
    ;(globalThis as Record<string, unknown>).SpeechRecognition = Speech
    const e = setup('', async () => 'x')
    e.selectRange(0)
    key(host!.children[0], ' ')
    key(field()!, ' ')
    // Started at once, within the key's press.
    expect(Speech.last.started).toBe(true)
    Speech.last.onerror!({ error: 'not-allowed' })
    expect(field()!.dataset.placeholder).toMatch(/microphone is blocked/)
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

describe('asking about selected words from the bar', () => {
  it('stays over the words while the field is typed in, though the page pans', () => {
    vi.useFakeTimers()
    host = document.createElement('div'); document.body.append(host)
    const e = editor = createEditor(host, { value: 'One two three', toolbar: true, prompt: async () => 'TWO' })
    // A range in the writing stands at 100, anything else (the field's selection) at 500.
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
      return new DOMRect(10, host!.contains(this.commonAncestorContainer) ? 100 : 500, 40, 20)
    })
    e.selectRange(4, 7); host.dispatchEvent(new Event('aa-selectionchange')); vi.advanceTimersByTime(200)
    const toolbar = document.querySelector('aa-toolbar') as HTMLElement
    expect(toolbar.hidden).toBe(false)
    const top = toolbar.style.top
    const input = toolbar.querySelector<HTMLInputElement>('.aa-toolbar-ask input')!
    input.focus()
    const inField = document.createRange(); inField.selectNodeContents(toolbar)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(inField)
    window.dispatchEvent(new Event('scroll'))
    expect(toolbar.style.top).toBe(top)
    vi.restoreAllMocks(); vi.useRealTimers()
  })
  it('puts the answer in the words’ place, one step to undo, and keeps it selected', async () => {
    const asked: PromptContext[] = []
    host = document.createElement('div'); document.body.append(host)
    const e = editor = createEditor(host, { value: 'One two three', toolbar: true, prompt: async (_said, context) => { asked.push(context); return 'TWO' } })
    e.selectRange(4, 7)
    expect(document.querySelector('aa-toolbar .aa-toolbar-ask input')).not.toBeNull()
    expect(await e.askAbout('Shout it')).toBe(true)
    expect(asked[0]).toMatchObject({ kind: 'writing', text: 'two', before: 'One ', after: ' three' })
    expect(e.value).toBe('One TWO three')
    expect(e.selection()).toEqual({ start: 4, end: 7 })
    e.undo()
    expect(e.value).toBe('One two three')
    e.selectRange(2)
    expect(await e.askAbout('Nothing selected')).toBe(false)
  })
})
