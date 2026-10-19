import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import { createEditor, type Editor, type EditorOptions } from '@0001-labs/aa'

export type AaEditorProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'onInput' | 'children'> & EditorOptions
export type AaEditorRef = { readonly editor: Editor | null; focus(): void; undo(): boolean; redo(): boolean }
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Controlled Markdown without replacing Aa's DOM on each React render. */
export const AaEditor = forwardRef<AaEditorRef, AaEditorProps>(function AaEditor(props, ref) {
  const { value = '', readOnly = false, placeholder = '', onChange, onFiles, atoms, toolbar, commands, blockCommands, menus, drawEquation, correct, correcting = true, ...attributes } = props
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<Editor | null>(null)
  const latest = useRef(props)
  latest.current = props
  useImperativeHandle(ref, () => ({
    get editor() { return instance.current },
    focus: () => instance.current?.focus(),
    undo: () => instance.current?.undo() ?? false,
    redo: () => instance.current?.redo() ?? false,
  }), [])
  useClientLayoutEffect(() => {
    const editor = createEditor(host.current!, {
      value: latest.current.value, readOnly: latest.current.readOnly, placeholder: latest.current.placeholder,
      atoms, toolbar, commands, blockCommands, menus, drawEquation,
      onChange: value => latest.current.onChange?.(value),
      onFiles: onFiles ? files => latest.current.onFiles?.(files) : undefined,
      correct: correct ? (text, context) => latest.current.correct!(text, context) : undefined,
      correcting: latest.current.correcting !== false,
    })
    instance.current = editor
    return () => { editor.destroy(); instance.current = null }
  }, [atoms, toolbar, commands, blockCommands, menus, drawEquation, !!onFiles, !!correct])
  useClientLayoutEffect(() => {
    const editor = instance.current
    if (!editor) return
    if (editor.value !== value) editor.value = value
    editor.readOnly = readOnly
    editor.placeholder = placeholder
    editor.correcting = correcting
  }, [value, readOnly, placeholder, correcting])
  return createElement('div', { ...attributes, ref: host })
})
