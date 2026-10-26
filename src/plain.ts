import { breatheDot, canDictate, dictate } from './prompt'
import { paintSelection } from './selection'
import { drawStyles } from './styles'
import { word } from './words'

export type PlainEditorOptions = {
  value?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  /** What the empty field says. With `speak`, where the browser can listen, it says "Press space to speak, or …". */
  placeholder?: string
  /**
   * Space in the empty field listens, as a comment's reply does: the words
   * heard are written in as they come, the caret a breathing dot after them;
   * Escape stops, and any other key stops listening and types on.
   */
  speak?: boolean
}

/** A single plain-text block, with native editing and Aa's rounded selection. */
export function createPlainEditor(host: HTMLElement, options: PlainEditorOptions = {}) {
  // Made in the host's own document, so the editor works in a frame too.
  const doc = host.ownerDocument
  drawStyles(host)
  const block = doc.createElement('div')
  block.className = 'aa-block'
  block.contentEditable = options.readOnly ? 'false' : 'plaintext-only'
  block.spellcheck = false
  block.textContent = options.value ?? host.textContent ?? ''
  host.classList.add('aa', 'aa-plain')
  host.setAttribute('role', 'textbox')
  host.setAttribute('aria-multiline', 'true')
  host.replaceChildren(block)
  const speaks = !!options.speak && canDictate()
  const lower = options.placeholder ? `${options.placeholder.charAt(0).toLowerCase()}${options.placeholder.slice(1)}` : word('write')
  const offered = speaks ? word('Press space to speak, or {action}', { action: lower }) : options.placeholder ?? ''
  if (options.placeholder) host.setAttribute('aria-label', options.placeholder)
  const value = () => block.innerText
  // The placeholder stands in the block while it has no words (a dot listening has none).
  const empty = () => host.toggleAttribute('data-empty', !value().trim())
  const say = (placeholder: string) => { if (placeholder) block.dataset.placeholder = placeholder; else delete block.dataset.placeholder }
  say(offered); empty()

  // Listening, the caret is the prompt's breathing dot after the words heard, uneditable and without words of its own.
  let speaking: { stop(): void; abort(): void } | null = null
  const listen = () => {
    const before = value().trim()
    const dot = Object.assign(doc.createElement('span'), { className: 'aa-prompt-caret', contentEditable: 'false' })
    dot.setAttribute('aria-hidden', 'true')
    let breath: ReturnType<typeof breatheDot> | null = null
    speaking = dictate({
      lang: doc.documentElement.lang || navigator.language,
      heard: heard => {
        const words = `${before}${before && heard ? ' ' : ''}${heard}`
        dot.toggleAttribute('data-after', !!words)
        block.replaceChildren(words, dot); empty()
        options.onChange?.(words)
      },
      audio: () => { void breath?.followVoice?.() },
      end: failure => {
        speaking = null; breath?.stop(); dot.remove()
        delete host.dataset.listening; say(failure ?? offered); empty()
        // The caret goes after the words heard, so writing goes on from there.
        const selection = doc.getSelection()
        if (doc.activeElement === block && selection) { selection.selectAllChildren(block); selection.collapseToEnd() }
      },
    })
    if (!speaking) return
    host.dataset.listening = ''; say(word('Listening…'))
    block.append(dot)
    breath = breatheDot(dot, doc.defaultView!)
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    if (speaking) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); speaking.abort(); return }
      speaking.stop()
      return
    }
    if (event.key === ' ' && speaks && !value().trim() && !event.metaKey && !event.ctrlKey && !event.altKey && block.isContentEditable) { event.preventDefault(); listen() }
  }
  const input = () => { empty(); options.onChange?.(value()) }
  const blur = () => speaking?.stop()
  const focus = () => block.focus({ preventScroll: true })
  const click = (event: MouseEvent) => { if (event.target === host) focus() }
  block.addEventListener('input', input)
  block.addEventListener('keydown', keydown)
  block.addEventListener('blur', blur)
  host.addEventListener('click', click)
  const stopSelection = paintSelection(host)
  return {
    element: host,
    get value() { return value() },
    set value(words: string) { if (value() !== words) { block.textContent = words; empty() } },
    get readOnly() { return block.contentEditable === 'false' },
    set readOnly(readOnly: boolean) {
      const editable = readOnly ? 'false' : 'plaintext-only'
      if (block.contentEditable !== editable) block.contentEditable = editable
    },
    /** Whether it is listening now. */
    get listening() { return !!speaking },
    focus,
    destroy() {
      speaking?.abort()
      stopSelection()
      block.removeEventListener('input', input)
      block.removeEventListener('keydown', keydown)
      block.removeEventListener('blur', blur)
      host.removeEventListener('click', click)
    },
  }
}
