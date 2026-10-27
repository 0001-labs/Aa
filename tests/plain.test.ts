import { describe, expect, it, vi } from 'vite-plus/test'
import { createPlainEditor } from '../src/plain'

describe('plain editor', () => {
  it('keeps sample punctuation literal and renders no formatting controls', () => {
    const host = document.createElement('div')
    const text = '# Words **and** `code`'
    const editor = createPlainEditor(host, { value: text })
    expect(host.textContent).toBe(text)
    expect(host.children).toHaveLength(1)
    expect(host.firstElementChild?.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(host.querySelector('.aa-syntax, aa-toolbar')).toBeNull()
    editor.destroy()
  })
})

it('works in another document (a frame), making its block there', () => {
  const other = document.implementation.createHTMLDocument('frame')
  const host = other.createElement('h1')
  host.textContent = 'Blue Raft'
  other.body.append(host)
  const editor = createPlainEditor(host)
  const block = host.querySelector('.aa-block')!
  expect(block.ownerDocument).toBe(other)
  expect(editor.value).toBe('Blue Raft')
  editor.destroy()
})

it('selects only a slotted field in its own document', () => {
  const frame = document.createElement('iframe'); document.body.append(frame)
  const doc = frame.contentDocument!
  const card = doc.createElement('div'); card.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>'
  const host = doc.createElement('span'); card.append(host); doc.body.append(card)
  const editor = createPlainEditor(host, { value: 'Editable card title' })
  const block = host.querySelector<HTMLElement>('.aa-block')!
  const key = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true })
  block.dispatchEvent(key)
  expect(key.defaultPrevented).toBe(true)
  expect(doc.getSelection()?.toString()).toBe('Editable card title')
  expect(editor.value).toBe('Editable card title')
  editor.destroy(); frame.remove()
})

describe('speaking into a plain field', () => {
  it('says its placeholder, listens on Space when empty, writes in what is heard and stops on another key', () => {
    let speech: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null; started: boolean } | null = null
    class Speech { lang = ''; continuous = false; interimResults = false; onresult = null; onend = null; onerror = null; started = false
      constructor() { speech = this as never }
      start() { this.started = true } stop() { (this as never as { onend?: () => void }).onend?.() } abort() { this.stop() } }
    vi.stubGlobal('webkitSpeechRecognition', Speech)
    try {
      const host = document.createElement('div'); document.body.append(host)
      const changes: string[] = []
      const editor = createPlainEditor(host, { placeholder: 'What is wrong?', speak: true, onChange: value => changes.push(value) })
      const block = host.querySelector<HTMLElement>('.aa-block')!
      expect(host.hasAttribute('data-empty')).toBe(true)
      expect(block.dataset.placeholder).toBe('Press space to speak, or what is wrong?')
      block.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      expect(speech!.started).toBe(true)
      expect(editor.listening).toBe(true)
      expect(block.dataset.placeholder).toBe('Listening…')
      expect(block.querySelector('.aa-prompt-caret')).not.toBeNull()
      speech!.onresult!({ resultIndex: 0, results: [Object.assign([{ transcript: 'The price is wrong' }], { isFinal: true })] })
      expect(block.textContent).toBe('The price is wrong')
      expect(changes.at(-1)).toBe('The price is wrong')
      expect(host.hasAttribute('data-empty')).toBe(false)
      block.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
      expect(editor.listening).toBe(false)
      expect(block.querySelector('.aa-prompt-caret')).toBeNull()
      expect(block.dataset.placeholder).toBe('Press space to speak, or what is wrong?')
      editor.destroy(); host.remove()
    } finally { vi.unstubAllGlobals() }
  })
  it('only says its placeholder where the browser cannot listen', () => {
    const host = document.createElement('div')
    createPlainEditor(host, { placeholder: 'Note', speak: true })
    expect(host.querySelector<HTMLElement>('.aa-block')!.dataset.placeholder).toBe('Note')
  })
})
