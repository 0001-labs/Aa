import { describe, expect, it } from 'vitest'
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
