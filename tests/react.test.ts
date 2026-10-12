import { createElement, createRef, act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { AaEditor, type AaEditorRef } from '../src/react'

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
})
