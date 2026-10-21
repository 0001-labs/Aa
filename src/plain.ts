import { paintSelection } from './selection'

export type PlainEditorOptions = {
  value?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}

/** A single plain-text block, with native editing and Aa's rounded selection. */
export function createPlainEditor(host: HTMLElement, options: PlainEditorOptions = {}) {
  // Made in the host's own document, so the editor works in a frame too.
  const block = host.ownerDocument.createElement('div')
  block.className = 'aa-block'
  block.contentEditable = options.readOnly ? 'false' : 'plaintext-only'
  block.spellcheck = false
  block.textContent = options.value ?? host.textContent ?? ''
  host.classList.add('aa', 'aa-plain')
  host.setAttribute('role', 'textbox')
  host.setAttribute('aria-multiline', 'true')
  host.replaceChildren(block)
  const input = () => options.onChange?.(block.innerText)
  const focus = () => block.focus({ preventScroll: true })
  const click = (event: MouseEvent) => { if (event.target === host) focus() }
  block.addEventListener('input', input)
  host.addEventListener('click', click)
  const stopSelection = paintSelection(host)
  return {
    element: host,
    get value() { return block.innerText },
    set value(value: string) { if (block.innerText !== value) block.textContent = value },
    get readOnly() { return block.contentEditable === 'false' },
    set readOnly(value: boolean) {
      const editable = value ? 'false' : 'plaintext-only'
      if (block.contentEditable !== editable) block.contentEditable = editable
    },
    focus,
    destroy() {
      stopSelection()
      block.removeEventListener('input', input)
      host.removeEventListener('click', click)
    },
  }
}
