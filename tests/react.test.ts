import { createElement, createRef, act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vite-plus/test'
import { AaEditor, type AaEditorRef } from '../src/react'
import { memoryCommentStore } from '../src/comments-memory'

describe('React binding', () => {
  it('keeps controlled Markdown in sync and cleans up controls on unmount', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container), ref = createRef<AaEditorRef>()
    const values: string[] = []
    await act(async () => { root.render(createElement(AaEditor, { value: 'Hello', ref, toolbar: true, onChange: value => values.push(value) })) })
    expect(ref.current?.editor?.value).toBe('Hello')
    ref.current!.editor!.replace(5, 5, ' world')
    expect(values).toEqual(['Hello world'])
    await act(async () => { root.render(createElement(AaEditor, { value: 'External value', ref, readOnly: true, toolbar: true })) })
    expect(ref.current?.editor?.value).toBe('External value')
    expect(ref.current?.editor?.readOnly).toBe(true)
    await act(async () => { root.unmount() })
    expect(document.querySelector('.aa-toolbar')).toBeNull()
    container.remove()
  })
  it('passes the correct call through and turns correcting on and off', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container), ref = createRef<AaEditorRef>()
    const correct = async (text: string) => text
    await act(async () => { root.render(createElement(AaEditor, { value: 'Hello', ref, correct })) })
    expect(ref.current?.editor?.correcting).toBe(true)
    await act(async () => { root.render(createElement(AaEditor, { value: 'Hello', ref, correct, correcting: false })) })
    expect(ref.current?.editor?.correcting).toBe(false)
    await act(async () => { root.unmount() })
    container.remove()
  })
  it('passes asking AI, comments and the block placeholder to the editor, not to the element', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container), ref = createRef<AaEditorRef>()
    const comments = memoryCommentStore({ me: { id: 'me', name: 'Me' }, people: [], threads: [] })
    const prompt = async () => 'An answer'
    await act(async () => { root.render(createElement(AaEditor, { value: 'Hello', ref, prompt, comments, blockPlaceholder: 'Write' })) })
    expect(ref.current?.editor?.comments).toBeDefined()
    const element = container.firstElementChild!
    expect(element.hasAttribute('prompt')).toBe(false)
    expect(element.hasAttribute('comments')).toBe(false)
    expect(element.hasAttribute('blockPlaceholder')).toBe(false)
    await act(async () => { root.unmount() })
    container.remove()
  })
})
