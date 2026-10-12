import { createEditor, type Editor, type EditorOptions } from './editor'

/**
 * `<aa-editor>`: the editor as an element, in the page's own DOM so the
 * page's type and colours reach it. `value` is the Markdown; `input` fires
 * on every change the person makes.
 */
export class AaEditorElement extends (typeof HTMLElement === 'undefined' ? class {} as typeof HTMLElement : HTMLElement) {
  static observedAttributes = ['readonly', 'placeholder']
  #editor: Editor | null = null
  #pending: string | null = null
  /** Set before connection; custom actions, files and equation drawing stay with the product. */
  #options: EditorOptions = {}
  get options(): EditorOptions { return this.#options }
  set options(value: EditorOptions) { this.#options = value }

  constructor() {
    super()
    // Properties supplied before registration shadow prototype accessors.
    // Replay them after upgrade so the configured callbacks reach the editor.
    for (const name of ['options', 'value', 'readOnly'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(this, name)
      if (!descriptor) continue
      Reflect.deleteProperty(this, name)
      Reflect.set(this, name, descriptor.value)
    }
  }

  connectedCallback() {
    if (this.#editor) return
    this.#editor = createEditor(this, {
      ...this.options,
      value: this.#pending ?? this.getAttribute('value') ?? '',
      readOnly: this.hasAttribute('readonly'),
      placeholder: this.getAttribute('placeholder') ?? '',
      toolbar: this.options.toolbar ?? this.hasAttribute('toolbar'),
      onChange: value => { this.options.onChange?.(value); this.dispatchEvent(new Event('input', { bubbles: true })) },
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
  get editor() { return this.#editor }
}

export function defineAaEditor(tag = 'aa-editor') {
  if (!customElements.get(tag)) customElements.define(tag, AaEditorElement)
}
