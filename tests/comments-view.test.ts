import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { memoryCommentStore, type MemoryCommentStore } from '../src/comments-memory'
import type { CommentThread } from '../src/comments'

const ann = { id: 'ann', name: 'Ann' }, bo = { id: 'bo', name: 'Bo' }
const TEXT = 'One two three\n\nFour five six'
const threads = (): CommentThread[] => [
  { id: 't1', from: 4, to: 7, quote: 'two', comments: [{ id: 'c1', author: bo, body: 'Why two?', createdAt: 1000 }], createdAt: 1000, updatedAt: 1000 },
  { id: 't2', from: 15, to: 19, quote: 'Four', comments: [{ id: 'c2', author: ann, body: 'Done', createdAt: 2000 }], createdAt: 2000, updatedAt: 2000, resolvedAt: 3000, resolvedBy: ann },
]
let editor: Editor | undefined, host: HTMLElement | undefined, store: MemoryCommentStore | undefined
function setup(options: Partial<Parameters<typeof memoryCommentStore>[0]> = {}, value = TEXT) {
  host = document.createElement('div'); document.body.append(host)
  store = memoryCommentStore({ me: ann, people: [ann, bo], threads: threads(), ...options })
  editor = createEditor(host, { value, comments: store, toolbar: true })
  return editor
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const popover = () => document.querySelector<HTMLElement>('.aa-comments[data-mode="popover"]')
const marks = () => Array.from(host!.querySelectorAll<HTMLElement>('[data-comment]'))
const enter = (field: HTMLTextAreaElement) => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
afterEach(() => { editor?.destroy(); host?.remove(); document.querySelectorAll('.aa-comments, .aa-controls').forEach(node => node.remove()); editor = undefined; host = undefined; store = undefined; window.getSelection()?.removeAllRanges(); vi.useRealTimers() })

describe('comments in the text', () => {
  it('marks the open threads’ words, not the resolved ones', () => {
    setup()
    expect(marks().map(span => span.textContent)).toEqual(['two'])
    expect(marks()[0].getAttribute('data-comment')).toBe('t1')
    expect(marks()[0].classList.contains('aa-comment')).toBe(true)
    expect(editor!.comments!.threads.map(thread => thread.id)).toEqual(['t1', 't2'])
  })
  it('keeps a thread on its words as the text before, inside and around it changes', () => {
    const e = setup()
    e.replace(0, 0, 'Zero ')
    expect(e.comments!.threads[0]).toMatchObject({ from: 9, to: 12, quote: 'two', orphaned: false })
    expect(marks()[0].textContent).toBe('two')
    e.replace(12, 12, 'ish')
    expect(e.comments!.threads[0]).toMatchObject({ from: 9, to: 15, quote: 'twoish' })
    e.replace(9, 15, 'gone')
    expect(e.comments!.threads[0].orphaned).toBe(true)
    expect(marks()).toEqual([])
  })
  it('finds an orphaned thread’s words again when they come back, or when the document arrives after the threads', () => {
    const e = setup({}, '')
    expect(e.comments!.threads[0].orphaned).toBe(true)
    e.value = TEXT
    expect(e.comments!.threads[0]).toMatchObject({ from: 4, to: 7, orphaned: false })
    e.replace(4, 7, '')
    expect(e.comments!.threads[0].orphaned).toBe(true)
    e.undo()
    expect(e.comments!.threads[0]).toMatchObject({ from: 4, to: 7, quote: 'two', orphaned: false })
  })
  it('gives the moved anchors to the store a moment after the typing', async () => {
    vi.useFakeTimers()
    const e = setup()
    e.replace(0, 0, 'Zero ')
    expect(store!.threads[0].from).toBe(4)
    await vi.advanceTimersByTimeAsync(900)
    expect(store!.threads[0]).toMatchObject({ from: 9, to: 12 })
  })
  it('places a thread the store moved where its words are, and orphans one whose words are gone', () => {
    const e = setup()
    store!.put({ ...threads()[0], id: 't3', from: 0, to: 3, quote: 'six' })
    expect(e.comments!.threads.find(thread => thread.id === 't3')).toMatchObject({ from: 25, to: 28, orphaned: false })
    store!.put({ ...threads()[0], id: 't4', from: 0, to: 3, quote: 'nowhere' })
    expect(e.comments!.threads.find(thread => thread.id === 't4')?.orphaned).toBe(true)
  })
})

describe('the popover', () => {
  it('opens on a press on the words and shows who wrote what', () => {
    setup()
    expect(popover()).toBeNull()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const open = popover()!
    expect(open).not.toBeNull()
    expect(open.getAttribute('role')).toBe('dialog')
    // The words stand right over the popover, so it does not name them; the thread's own row, with Resolve, stands above the comments.
    expect(open.querySelector('.aa-thread-quote')).toBeNull()
    const head = open.querySelector('.aa-thread > .aa-thread-head')!
    expect(head.querySelector('[aria-label="Resolve"]')).not.toBeNull()
    expect(head.nextElementSibling?.classList.contains('aa-comment-entry')).toBe(true)
    expect(open.querySelector('.aa-comment-author')?.textContent).toBe('Bo')
    expect(open.querySelector('.aa-comment-body')?.textContent).toBe('Why two?')
    expect(open.querySelector('.aa-avatar')?.textContent).toBe('B')
    expect(marks()[0].classList.contains('aa-comment--open')).toBe(true)
  })
  it('steps to the next and the previous open thread when there are more', () => {
    setup({ threads: [...threads(), { ...threads()[0], id: 't3', from: 20, to: 24, quote: 'five', comments: [{ id: 'c3', author: bo, body: 'Five?', createdAt: 3000 }] }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector('.aa-comment-body')?.textContent).toBe('Why two?')
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Next comment"]')!.click()
    expect(popover()!.querySelector('.aa-comment-body')?.textContent).toBe('Five?')
    expect(editor!.selection()).toEqual({ start: 20, end: 20 })
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Next comment"]')!.click()
    expect(popover()!.querySelector('.aa-comment-body')?.textContent).toBe('Why two?')
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Previous comment"]')!.click()
    expect(popover()!.querySelector('.aa-comment-body')?.textContent).toBe('Five?')
  })
  it('offers no stepping with one open thread', () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector('[aria-label="Next comment"]')).toBeNull()
  })
  it('opens when the caret comes into the words, and closes when it leaves', () => {
    const e = setup()
    e.selectRange(5); host!.dispatchEvent(new Event('aa-selectionchange'))
    expect(popover()).not.toBeNull()
    e.selectRange(1); host!.dispatchEvent(new Event('aa-selectionchange'))
    expect(popover()).toBeNull()
  })
  it('replies with Enter, and shows the reply once the store has it', async () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    expect(field.placeholder).toBe('Reply')
    field.value = 'Because one is taken'; field.dispatchEvent(new Event('input', { bubbles: true }))
    enter(field)
    await tick()
    expect(store!.threads[0].comments.map(comment => comment.body)).toEqual(['Why two?', 'Because one is taken'])
    expect(popover()!.querySelectorAll('.aa-comment-entry')).toHaveLength(2)
    expect(popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!.value).toBe('')
  })
  it('resolves a thread, taking its mark away, and reopens it', async () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Resolve"]')!.click()
    await tick()
    expect(store!.threads[0].resolvedAt).toBeTypeOf('number')
    expect(marks()).toEqual([])
    expect(popover()).toBeNull()
    editor!.comments!.open('t1')
    expect(popover()!.querySelector('.aa-thread-resolved')?.textContent).toBe('Resolved by Ann.')
    popover()!.querySelector<HTMLButtonElement>('.aa-thread-reopen')!.click()
    await tick()
    expect(store!.threads[0].resolvedAt).toBeUndefined()
    expect(marks().map(span => span.textContent)).toEqual(['two'])
  })
  it('starts a thread on the selected words, from the toolbar too', async () => {
    const e = setup()
    e.selectRange(20, 24)
    expect(document.querySelector('aa-toolbar [aria-label="Comment"]')).not.toBeNull()
    expect(e.comments!.start()).toBe(true)
    expect(marks().some(span => span.getAttribute('data-comment') === 'draft')).toBe(true)
    expect(popover()!.querySelector('.aa-thread-quote')).toBeNull()
    expect(popover()!.querySelector('[aria-label="Close"]')).toBeNull()
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    expect(field.placeholder).toBe('Add a comment')
    field.value = 'Five what?'; field.dispatchEvent(new Event('input', { bubbles: true }))
    enter(field)
    await tick()
    const added = store!.threads.find(thread => thread.quote === 'five')!
    expect(added).toMatchObject({ from: 20, to: 24 })
    expect(added.comments[0]).toMatchObject({ author: ann, body: 'Five what?' })
    expect(popover()!.querySelector('.aa-comment-body')?.textContent).toBe('Five what?')
    expect(marks().map(span => span.getAttribute('data-comment'))).toEqual(['t1', added.id])
  })
  it('refuses to start with nothing selected, or with nobody to write as', () => {
    const e = setup()
    e.selectRange(3)
    expect(e.comments!.start()).toBe(false)
    e.destroy(); host!.remove()
    const quiet = setup({ me: undefined })
    quiet.selectRange(0, 3)
    expect(quiet.comments!.start()).toBe(false)
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector('.aa-composer')).toBeNull()
    expect(popover()!.querySelector('[aria-label="Resolve"]')).toBeNull()
  })
  it('offers the people after @ and writes the chosen name', async () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    field.value = 'Ask @b'; field.setSelectionRange(6, 6); field.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    const menu = document.querySelector('.aa-comments-people')!
    expect(Array.from(menu.querySelectorAll('button')).map(row => row.textContent)).toEqual(['BBo'])
    enter(field)
    expect(field.value).toBe('Ask @Bo ')
    expect(document.querySelector('.aa-comments-people')).toBeNull()
    enter(field)
    await tick()
    expect(store!.threads[0].comments[1]).toMatchObject({ body: 'Ask @Bo', mentions: [bo] })
    expect(popover()!.querySelector('.aa-comment-mention')?.textContent).toBe('@Bo')
  })
  it('closes on Escape, the caret going back to the words, and tells a refused write', async () => {
    const e = setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    popover()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(popover()).toBeNull()
    expect(e.selection()).toEqual({ start: 7, end: 7 })
    store!.reply = async () => { throw new Error('Not allowed here') }
    e.comments!.open('t1')
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    field.value = 'x'; enter(field)
    await tick()
    expect(popover()!.querySelector('.aa-comments-error')?.textContent).toBe('Not allowed here')
  })
  it('draws an internal note on its own ground, marked Internal', () => {
    setup({ threads: [{ ...threads()[0], comments: [threads()[0].comments[0], { id: 'c9', author: ann, body: 'For us only', createdAt: 2000, internal: true }] }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const [theirs, note] = popover()!.querySelectorAll('.aa-comment-entry')
    expect(theirs.classList.contains('aa-comment-entry--internal')).toBe(false)
    expect(note.classList.contains('aa-comment-entry--internal')).toBe(true)
    expect(note.querySelector('.aa-comment-internal')?.textContent).toBe('Internal')
  })
  it('edits your own comment and deletes your own thread after a second press', async () => {
    setup({ threads: [{ ...threads()[0], comments: [{ id: 'c1', author: ann, body: 'Mine', createdAt: 1 }] }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    popover()!.querySelector<HTMLButtonElement>('.aa-comment-edit')!.click()
    const field = popover()!.querySelector<HTMLTextAreaElement>('[data-edit="c1"]')!
    expect(popover()!.querySelector('.aa-comment-time')?.textContent).toContain('Editing')
    field.value = 'Mine, changed'; enter(field)
    await tick()
    expect(store!.threads[0].comments[0]).toMatchObject({ body: 'Mine, changed' })
    expect(popover()!.querySelector('.aa-comment-time')?.textContent).toContain('Edited')
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Delete thread"]')!.click()
    expect(store!.threads).toHaveLength(1)
    popover()!.querySelector<HTMLButtonElement>('.aa-thread-delete')!.click()
    await tick()
    expect(store!.threads).toHaveLength(0)
    expect(popover()).toBeNull()
  })
})

describe('reactions', () => {
  it('shows each comment’s reactions with their counts, gives one from the sixteen, and takes it back', async () => {
    setup({ threads: [{ ...threads()[0], comments: [{ id: 'c1', author: bo, body: 'Why two?', createdAt: 1000, reactions: [{ emoji: '👍', count: 2, reacted: false, names: ['Cy', 'Di'] }] }] }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const chip = popover()!.querySelector<HTMLButtonElement>('.aa-reaction')!
    expect(chip.textContent).toBe('👍2')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(chip.title).toBe('Cy, Di')
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Add reaction"]')!.click()
    const picker = document.querySelector('.aa-reaction-picker')!
    expect(picker.querySelectorAll('button')).toHaveLength(16)
    picker.querySelector<HTMLButtonElement>('[aria-label="React with 🎉"]')!.click()
    await tick()
    expect(document.querySelector('.aa-reaction-picker')).toBeNull()
    const chips = Array.from(popover()!.querySelectorAll<HTMLButtonElement>('.aa-reaction'))
    expect(chips.map(each => [each.textContent, each.getAttribute('aria-pressed')])).toEqual([['👍2', 'false'], ['🎉1', 'true']])
    chips[0].click()
    await tick()
    expect(popover()!.querySelectorAll('.aa-reaction')[0].textContent).toBe('👍3')
    expect(popover()!.querySelectorAll('.aa-reaction')[0].getAttribute('aria-pressed')).toBe('true')
    popover()!.querySelectorAll<HTMLButtonElement>('.aa-reaction')[1].click()
    await tick()
    expect(popover()!.querySelectorAll('.aa-reaction')).toHaveLength(1)
  })
  it('sends nothing for an empty comment', async () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    field.value = '   '; enter(field)
    await tick()
    expect(store!.threads[0].comments).toHaveLength(1)
    await expect(store!.reply('t1', ' ', [])).rejects.toThrow('Write a comment')
  })
})

describe('a long thread', () => {
  it('carries its count as a title in a popover once it is long, and a small one none', () => {
    const body = 'A reply long enough to take a few lines of the popover, as a real discussion does when it goes on.'
    const comments = [1, 2, 3, 4, 5].map(n => ({ id: `c${n}`, author: n % 2 ? bo : ann, body, createdAt: n }))
    setup({ threads: [{ ...threads()[0], comments }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector('.aa-thread-title')?.textContent).toBe('5 comments')
    expect(popover()!.querySelector('.aa-thread')!.hasAttribute('data-titled')).toBe(true)
  })
  it('leaves a small thread untitled, even with three short comments', () => {
    const comments = [1, 2, 3].map(n => ({ id: `c${n}`, author: bo, body: 'Yes', createdAt: n }))
    setup({ threads: [{ ...threads()[0], comments }] })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector('.aa-thread-title')).toBeNull()
  })
})

describe('mentions in the field', () => {
  it('colours a person once named, on a copy of the words behind the field', () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    field.value = '@'; field.setSelectionRange(1, 1); field.dispatchEvent(new Event('input', { bubbles: true }))
    return tick().then(() => {
      const option = Array.from(document.querySelectorAll<HTMLButtonElement>('.aa-comments-people button')).find(button => button.textContent?.includes('Bo'))!
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); option.click()
      const named = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
      expect(named.value).toBe('@Bo ')
      expect(named.hasAttribute('data-mentions')).toBe(true)
      expect(popover()!.querySelector('.aa-composer-backdrop .aa-comment-mention')?.textContent).toBe('@Bo')
      named.setSelectionRange(3, 3)
      named.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
      expect(named.value).toBe(' ')
      expect(named.hasAttribute('data-mentions')).toBe(false)
    })
  })
})

describe('asking AI from the field', () => {
  it('offers AI in the empty field where the product answers, and puts the answer in as the draft', async () => {
    host = document.createElement('div'); document.body.append(host)
    store = memoryCommentStore({ me: ann, people: [ann, bo], threads: threads() })
    const asked: { said: string; text: string; before: string }[] = []
    editor = createEditor(host, { value: TEXT, comments: store, prompt: async (said, context) => { asked.push({ said, text: context.text, before: context.before ?? '' }); return 'Two is the count of the words.' } })
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
    expect(field.placeholder).toBe('Press space for AI, or reply')
    field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(field.hasAttribute('data-asking')).toBe(true)
    expect(field.placeholder).toBe('Ask AI about these words')
    field.value = 'Why two?'; enter(field)
    expect(popover()!.querySelector('.aa-composer-thinking[data-aa-glisten]')?.textContent).toBe('Thinking…')
    expect(field.closest<HTMLElement>('.aa-composer-field')!.hidden).toBe(true)
    await tick()
    expect(popover()!.querySelector('.aa-composer-thinking')).toBeNull()
    expect(asked).toEqual([{ said: 'Why two?', text: 'two', before: 'Bo: Why two?' }])
    expect(field.value).toBe('Two is the count of the words.')
    expect(field.hasAttribute('data-asking')).toBe(false)
    expect(store!.threads[0].comments).toHaveLength(1)
  })
  it('speaks the reply on Space where the browser can listen, and sends what was heard on Enter', async () => {
    let speech: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null; started: boolean } | null = null
    class Speech { lang = ''; continuous = false; interimResults = false; onresult = null; onend = null; onerror = null; started = false
      constructor() { speech = this as never }
      start() { this.started = true } stop() { (this as never as { onend?: () => void }).onend?.() } abort() { this.stop() } }
    vi.stubGlobal('webkitSpeechRecognition', Speech)
    try {
      setup()
      marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const field = popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!
      expect(field.placeholder).toBe('Press space to speak, or reply')
      field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      expect(speech!.started).toBe(true)
      // The prompt's breathing dot, with Listening… after it until words come.
      const backdrop = () => popover()!.querySelector('.aa-composer-backdrop')!
      expect(backdrop().querySelector('.aa-prompt-caret')).not.toBeNull()
      expect(backdrop().querySelector('.aa-composer-listening')?.textContent).toBe('Listening…')
      speech!.onresult!({ resultIndex: 0, results: [Object.assign([{ transcript: 'Yes, two' }], { isFinal: true })] })
      expect(field.value).toBe('Yes, two')
      expect(backdrop().textContent).toBe('Yes, two')
      expect(backdrop().querySelector('.aa-prompt-caret[data-after]')).not.toBeNull()
      enter(field)
      await tick()
      expect(store!.threads[0].comments.at(-1)).toMatchObject({ body: 'Yes, two' })
    } finally { vi.unstubAllGlobals() }
  })
  it('says only the words without a prompt', () => {
    setup()
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(popover()!.querySelector<HTMLTextAreaElement>('.aa-composer textarea')!.placeholder).toBe('Reply')
  })
})

describe('the panel', () => {
  it('lists every thread, open ones first, the resolved under their heading, and counts them', () => {
    const panel = document.createElement('aside'); document.body.append(panel)
    setup({ panel })
    expect(panel.classList.contains('aa-comments')).toBe(true)
    expect(panel.dataset.mode).toBe('panel')
    // Design system 1's text tabs, a state each with its count; the chosen one is listed and marked in the text.
    const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map(tab => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['Open 1', 'true'], ['Resolved 1', 'false']])
    expect(Array.from(panel.querySelectorAll<HTMLElement>('.aa-thread')).map(thread => thread.dataset.thread)).toEqual(['t1'])
    expect(panel.querySelector('.aa-thread-count')?.textContent).toBe('1')
    expect(marks().map(span => span.textContent)).toEqual(['two'])
    tabs[1].click()
    expect(Array.from(panel.querySelectorAll<HTMLElement>('.aa-thread')).map(thread => thread.dataset.thread)).toEqual(['t2'])
    expect(panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Resolved 1')
    expect(marks().map(span => span.textContent)).toEqual(['Four'])
    expect(marks()[0].classList.contains('aa-comment--resolved')).toBe(true)
    panel.querySelector<HTMLButtonElement>('[data-tab="open"]')!.click()
    expect(popover()).toBeNull()
    panel.querySelector<HTMLButtonElement>('[data-thread="t1"] .aa-thread-head')!.click()
    expect(panel.querySelector('[data-thread="t1"]')?.hasAttribute('data-open')).toBe(true)
    expect(panel.querySelector('[data-thread="t1"] .aa-composer')).not.toBeNull()
    expect(editor!.selection()).toEqual({ start: 4, end: 7 })
    panel.remove()
  })
  it('marks what is unread, and reads it once opened', async () => {
    const panel = document.createElement('aside'); document.body.append(panel)
    setup({ panel })
    expect(panel.querySelector('[data-thread="t1"]')?.hasAttribute('data-unread')).toBe(true)
    expect(marks()[0].classList.contains('aa-comment--unread')).toBe(true)
    editor!.comments!.open('t1')
    await tick()
    expect(panel.querySelector('[data-thread="t1"]')?.hasAttribute('data-unread')).toBe(false)
    panel.remove()
  })
  it('follows a thread opened from the text onto its tab', () => {
    const panel = document.createElement('aside'); document.body.append(panel)
    setup({ panel })
    editor!.comments!.open('t2')
    expect(panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Resolved 1')
    expect(panel.querySelector('[data-thread="t2"]')?.hasAttribute('data-open')).toBe(true)
    panel.remove()
  })
})
