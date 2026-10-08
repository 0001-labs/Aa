import { createEditor, type Editor } from './editor'

/**
 * `<aa-editor>`: the editor as an element, in the page's own DOM so the
 * page's type and colours reach it. `value` is the Markdown; `input` fires
 * on every change the person makes.
 */
export class AaEditorElement extends HTMLElement {
  static observedAttributes = ['readonly', 'placeholder']
  #editor: Editor | null = null
  #pending: string | null = null

  connectedCallback() {
    if (this.#editor) return
    this.#editor = createEditor(this, {
      value: this.#pending ?? this.getAttribute('value') ?? '',
      readOnly: this.hasAttribute('readonly'),
      placeholder: this.getAttribute('placeholder') ?? '',
      onChange: () => this.dispatchEvent(new Event('input', { bubbles: true })),
    })
  }

  disconnectedCallback() {
    this.#pending = this.#editor?.value ?? this.#pending
    this.#editor?.destroy()
    this.#editor = null
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (!this.#editor) return
    if (name === 'readonly') this.#editor.readOnly = value !== null
    if (name === 'placeholder') this.#editor.placeholder = value ?? ''
  }

  get value(): string { return this.#editor ? this.#editor.value : this.#pending ?? this.getAttribute('value') ?? '' }
  set value(text: string) { if (this.#editor) this.#editor.value = text; else this.#pending = text }

  get readOnly(): boolean { return this.hasAttribute('readonly') }
  set readOnly(value: boolean) { this.toggleAttribute('readonly', value) }

  override focus() { this.#editor?.focus() }
  undo() { return this.#editor?.undo() ?? false }
  redo() { return this.#editor?.redo() ?? false }
}

export function defineAaEditor(tag = 'aa-editor') {
  if (!customElements.get(tag)) customElements.define(tag, AaEditorElement)
}
