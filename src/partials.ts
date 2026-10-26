import type { Atom, Editor } from './editor'
import './vendor/ds1/2-core/ds-button'
import './vendor/ds1/2-core/ds-input'
import './vendor/ds1/3-unit/ds-select'
import './vendor/ds1/4-page/ds-overlay'
import overlayStyles from './vendor/ds1/4-page/styles/ds-overlay.css?inline'

export { BUTTON_STATES, BUTTON_PARTIAL, readButtonPartial, writeButtonPartial, type ButtonState, type ButtonPartial } from './button-partial'
import { BUTTON_STATES, BUTTON_PARTIAL, readButtonPartial, writeButtonPartial, paintButton, type ButtonState, type ButtonPartial } from './button-partial'
import { word } from './words'

/** A real component used as an illustration. The wrapper edits even a disabled specimen. */
export function buttonPartialAtom(canWrite: () => boolean): Atom {
  return { ...BUTTON_PARTIAL, draw(element, source) {
    let value = readButtonPartial(source)!
    element.classList.add('aa-partial')
    element.setAttribute('data-aa-interactive', '')
    const face = document.createElement('ds-button')
    face.inert = true
    face.setAttribute('aria-hidden', 'true')
    paintButton(face, value)
    element.append(face)
    let disposePanel: (() => void) | undefined
    const accessibility = () => {
      element.tabIndex = canWrite() ? 0 : -1
      element.setAttribute('role', canWrite() ? 'button' : 'img')
      element.setAttribute('aria-label', word(canWrite() ? 'Edit button: {label}, {state}' : 'Button: {label}, {state}', { label: value.label, state: value.state }))
    }
    accessibility()
    // Initial drawing precedes mounting the block. Observe permission changes on its editor.
    const observer = new MutationObserver(accessibility)
    queueMicrotask(() => { if (element.isConnected) observer.observe(element.closest('.aa-block')!, { attributes: true, attributeFilter: ['data-readonly'] }) })
    const open = () => {
      if (!canWrite() || disposePanel) return
      const doc = element.ownerDocument
      // The library's bundled JS and Sync 1 snapshot both carry the source-owned frame.
      if (!doc.querySelector('style[data-aa-partial-overlay]')) {
        const style = doc.createElement('style'); style.dataset.aaPartialOverlay = ''; style.textContent = overlayStyles; doc.head.append(style)
      }
      const overlay = doc.createElement('ds-overlay')
      overlay.type = 'popover'; overlay.closeOnOutside = true; overlay.returnFocus = () => element
      overlay.setAttribute('data-aa-interactive', '')
      const rect = element.getBoundingClientRect()
      overlay.anchor = { x: rect.left, y: rect.bottom }
      const dialog = doc.createElement('dialog'); dialog.className = 'aa-partial-properties'; dialog.setAttribute('aria-label', word('Edit button'))
      const label = doc.createElement('ds-input'); label.labelText = word('Label'); label.value = value.label; label.setAttribute('aria-label', word('Button label'))
      const stateLabel = doc.createElement('label'); stateLabel.textContent = word('State')
      const select = doc.createElement('ds-select'), state = doc.createElement('select'); state.setAttribute('aria-label', word('Button state'))
      for (const name of BUTTON_STATES) { const option = doc.createElement('option'); option.value = name; option.textContent = name[0].toUpperCase() + name.slice(1); state.append(option) }
      state.value = value.state; select.append(state); stateLabel.append(select)
      const actions = doc.createElement('div'); actions.className = 'aa-partial-actions'
      const cancel = doc.createElement('ds-button'); cancel.textContent = word('Cancel')
      const apply = doc.createElement('ds-button'); apply.textContent = word('Apply'); apply.primary = true
      const preview = doc.createElement('ds-button'); preview.inert = true; preview.setAttribute('aria-hidden', 'true'); paintButton(preview, value)
      const draft = (): ButtonPartial => ({ label: label.value, state: state.value as ButtonState })
      const refresh = () => paintButton(preview, draft())
      label.addEventListener('input', refresh); state.addEventListener('change', refresh)
      const close = () => { overlay.close(); overlay.remove(); disposePanel = undefined }
      disposePanel = close
      cancel.addEventListener('click', close)
      apply.addEventListener('click', () => {
        if (!canWrite()) { close(); return }
        const next = writeButtonPartial(draft())
        close()
        if (next !== source) {
          value = draft(); source = next; paintButton(face, value); accessibility()
          element.dispatchEvent(new CustomEvent('aa-atom-source', { bubbles: true, detail: { source: next } }))
        }
      })
      overlay.addEventListener('ds-close-request', event => { event.preventDefault(); close() })
      actions.append(cancel, apply); dialog.append(label, stateLabel, preview, actions); overlay.append(dialog)
      ;(element.closest('dialog') ?? doc.body).append(overlay)
      void overlay.show({ immediate: true }).then(() => { if (overlay.isConnected) label.focus() })
    }
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open() })
    element.addEventListener('keydown', event => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && canWrite()) {
        event.preventDefault(); event.stopPropagation(); element.dispatchEvent(new CustomEvent('aa-atom-source', { bubbles: true, detail: { source: '' } }))
      }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open() }
    })
    return () => { observer.disconnect(); disposePanel?.() }
  } }
}

/** Suggestions keep the caret in the sentence; DS1 owns placement and keyboard navigation. */
export function createPartialPicker(editor: Editor): () => void {
  const host = editor.element, doc = host.ownerDocument
  const menu = doc.createElement('ds-menu')
  menu.floating = true; menu.focusOnOpen = false; menu.setAttribute('aria-label', word('Button state'))
  menu.id = `aa-partials-${crypto.randomUUID()}`
  let query: { start: number; end: number } | null = null, composing = false, dismissed = ''
  const close = () => { menu.open = false; query = null }
  const rows = BUTTON_STATES.map((state, index) => {
    const row = doc.createElement('ds-button'); row.menuItem = true; row.setAttribute('role', 'option'); row.id = `${menu.id}-${index}`
    row.textContent = state[0].toUpperCase() + state.slice(1)
    row.addEventListener('click', () => {
      const at = query
      if (!at || editor.readOnly || !/^@button$/i.test(editor.value.slice(at.start, at.end))) return
      const source = writeButtonPartial({ label: 'Button', state })
      close(); editor.replace(at.start, at.end, source); editor.selectRange(at.start + source.length)
    })
    return row
  })
  menu.append(...rows)
  ;(host.closest('dialog') ?? doc.body).append(menu)
  const refresh = () => {
    if (composing) return
    const selection = editor.selection(), block = editor.activeBlock()
    if (editor.readOnly || !selection || selection.start !== selection.end || !block || ['code', 'table'].includes(block.block.kind)) { close(); return }
    const before = editor.value.slice(block.start, selection.end)
    const match = /(?:^|\s)(@button)$/i.exec(before)
    const signature = `${selection.end}:${editor.value}`
    if (!match || dismissed === signature) { close(); return }
    // Inline code and links never open a partial picker.
    const range = editor.rangeOf(selection.end - 7, selection.end)
    const parent = range?.startContainer.parentElement
    if (parent?.closest('.aa-c, code, a')) { close(); return }
    query = { start: selection.end - match[1].length, end: selection.end }
    menu.controller = host.children[block.index] as HTMLElement
    menu.anchor = range?.getBoundingClientRect?.() ?? menu.controller.getBoundingClientRect()
    if (!menu.open) menu.activeId = rows[0].id
    menu.open = true
    menu.renderNow()
  }
  menu.addEventListener('ds-menu-close', () => { dismissed = `${editor.selection()?.end}:${editor.value}`; query = null })
  const start = () => { composing = true; close() }, end = () => { composing = false; refresh() }
  host.addEventListener('aa-change', refresh); host.addEventListener('aa-selectionchange', refresh)
  host.addEventListener('compositionstart', start); host.addEventListener('compositionend', end)
  return () => {
    menu.remove(); host.removeEventListener('aa-change', refresh); host.removeEventListener('aa-selectionchange', refresh)
    host.removeEventListener('compositionstart', start); host.removeEventListener('compositionend', end)
  }
}
