/**
 * Writer mode: the editor in a frame of its own, for a page where words are
 * written, then kept or dropped: a bar of formatting that always shows, Save
 * and Cancel under the words, and a draft kept while they are neither. Closing
 * the page is not Cancel: the draft is there next time.
 *
 * The saved words stay the product's. Aa asks for them to be kept through
 * `onSave`, and holds a draft of what is not saved yet in the `drafts` store,
 * this browser's own storage unless the product gives another.
 */
import { createEditor, type Editor, type EditorOptions } from './editor'
import { button, inserting, insertBlock, isCoarse, kinds, type Command, type ToolbarAction } from './controls'
import { blockRuns } from './markdown'
import type { TurnKind } from './document'
import { icons } from './icons'
import { openSheet } from './sheet'
import { word } from './words'

/** Where drafts are kept, by the key a document has. Reads and writes are at once, so the first frame shows the draft. */
export type DraftStore = { load(key: string): string | null; save(key: string, value: string): void; clear(key: string): void }

/** Drafts in this browser's own storage, which can be missing or full: a draft is then only lost, never in the way. */
export const localDrafts: DraftStore = {
  load(key) { try { return localStorage.getItem(`aa-draft:${key}`) } catch { return null } },
  save(key, value) { try { localStorage.setItem(`aa-draft:${key}`, value) } catch { /* The words stay in the editor. */ } },
  clear(key) { try { localStorage.removeItem(`aa-draft:${key}`) } catch { /* Nothing to clear. */ } },
}

/** `saved`: the words are the saved ones. `draft`: they are not, and are held as a draft where there is a key. */
export type WriterState = 'saved' | 'draft' | 'saving' | 'failed'

export type WriterOptions = Omit<EditorOptions, 'toolbar'> & {
  /** What this document's draft is kept under. Without one, words not saved go with the page. */
  draft?: string
  drafts?: DraftStore
  /** Keep the words. A failure, thrown or rejected, leaves them and the draft as they are, to try again. */
  onSave?(value: string): void | Promise<void>
  /** Cancel was pressed: the words are the saved ones again and the draft is gone. */
  onCancel?(): void
  onState?(state: WriterState): void
  /** A product's own buttons, at the end of the bar. */
  actions?: readonly ToolbarAction[]
}

export type Writer = {
  readonly editor: Editor
  /** The frame, in `host`. */
  readonly element: HTMLElement
  /** The words as they stand. */
  value: string
  /** The words last saved. Set it when they change elsewhere: words being written stay, and stay a draft. */
  saved: string
  readonly dirty: boolean
  readonly state: WriterState
  readOnly: boolean
  /** Keep the words, as Save does. True once they are kept. */
  save(): Promise<boolean>
  /** Go back to the saved words and drop the draft, as Cancel does. */
  cancel(): void
  destroy(): void
}

/** How long after the last key a draft is written. Leaving the page writes it at once. */
const DRAFT_DELAY = 400

type Row = { id: string; label: string; icon: string; run(): void }

const chevron = (document: Document) => {
  const picture = document.createElement('span')
  picture.className = 'aa-icon aa-writer-chevron'
  picture.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent((icons['./icons/chevron-down.svg'] ?? '').replace(/currentColor/g, 'black'))}")`
  return picture
}

export function createWriter(host: HTMLElement, options: WriterOptions = {}): Writer {
  const { draft: key, drafts = localDrafts, onSave, onCancel, onState, actions = [], onChange, ...editing } = options
  const document = host.ownerDocument, window = document.defaultView!
  let saved = options.value ?? ''
  const held = key ? drafts.load(key) : null
  const restored = held !== null && held !== saved

  const element = document.createElement('div'); element.className = 'aa-writer'
  const frame = document.createElement('div'); frame.className = 'aa-writer-frame'
  const bar = document.createElement('div'); bar.className = 'aa-writer-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', word('Text formatting'))
  const page = document.createElement('div'); page.className = 'aa-writer-page'
  const foot = document.createElement('div'); foot.className = 'aa-writer-foot'
  frame.append(bar, page); element.append(frame, foot); host.append(element)

  let state: WriterState = restored ? 'draft' : 'saved'
  let timer: ReturnType<typeof setTimeout> | undefined
  let written = false, destroyed = false
  const editor = createEditor(page, {
    ...editing, value: restored ? held! : saved, toolbar: false,
    onChange: value => { onChange?.(value); changed() },
  })

  const said = document.createElement('span'); said.className = 'aa-writer-state'; said.setAttribute('aria-live', 'polite')
  const say = (english: string) => { said.textContent = english && word(english) }
  const saveButton = button('Save', 'check', () => { void save() }, true); saveButton.classList.add('aa-writer-save')
  saveButton.querySelector('.aa-icon')?.remove()
  const cancelButton = button('Cancel', 'close', () => cancel(), true); cancelButton.classList.add('aa-writer-cancel')
  cancelButton.querySelector('.aa-icon')?.remove()
  foot.append(saveButton, cancelButton, said)

  const dirty = () => editor.value !== saved
  const show = (next: WriterState, words: string) => {
    const moved = next !== state
    state = next
    element.dataset.state = next
    saveButton.disabled = next === 'saving' || !dirty() || editor.readOnly
    cancelButton.disabled = next === 'saving' || editor.readOnly
    say(words)
    if (moved) onState?.(next)
  }
  const writeDraft = () => {
    clearTimeout(timer); timer = undefined
    if (!key || destroyed) return
    if (dirty()) { drafts.save(key, editor.value); written = true; show('draft', 'Draft saved') }
    else if (written || restored) { drafts.clear(key); written = false }
  }
  const changed = () => {
    if (!dirty()) { clearTimeout(timer); timer = undefined; if (key) drafts.clear(key); written = false; show('saved', ''); return }
    show('draft', key ? 'Draft' : 'Not saved yet')
    clearTimeout(timer); timer = setTimeout(writeDraft, DRAFT_DELAY)
  }
  const save = async () => {
    if (destroyed || state === 'saving' || !dirty() || editor.readOnly) return false
    const value = editor.value
    show('saving', 'Saving…')
    try { await onSave?.(value) }
    catch { if (!destroyed) { show('failed', 'Not saved'); saveButton.disabled = false } return false }
    // Closed while it was being kept: the draft of these words has done its work.
    if (destroyed) { if (key && drafts.load(key) === value) drafts.clear(key); return true }
    saved = value
    // Words written while they were being kept are the next draft.
    if (dirty()) { state = 'draft'; show('draft', key ? 'Draft' : 'Not saved yet'); clearTimeout(timer); timer = setTimeout(writeDraft, DRAFT_DELAY) }
    else { clearTimeout(timer); timer = undefined; if (key) drafts.clear(key); written = false; show('saved', 'Saved') }
    return true
  }
  const cancel = () => {
    if (state === 'saving') return
    clearTimeout(timer); timer = undefined
    if (key) drafts.clear(key)
    written = false
    if (dirty()) editor.value = saved
    show('saved', '')
    onCancel?.()
  }

  // ----- the bar -----
  let lastSelection: { start: number; end: number } | null = null
  /** Puts the selection back where a menu's focus took it from, or at the end of words never touched. */
  const here = () => { if (!editor.selection()) { const at = lastSelection ?? { start: editor.value.length, end: editor.value.length }; editor.selectRange(at.start, at.end) } }
  const act = (run: () => void) => () => { if (!editor.readOnly) { here(); run() } }
  const overlay = host.closest('dialog') ?? document.body
  let openMenu: { panel: HTMLElement; anchor: HTMLElement } | null = null
  const closeMenu = () => { if (!openMenu) return; openMenu.panel.remove(); openMenu.anchor.setAttribute('aria-expanded', 'false'); openMenu = null }
  const menu = (anchor: HTMLElement, title: string, rows: readonly Row[], keyboard: boolean) => {
    if (openMenu?.anchor === anchor) { closeMenu(); return }
    closeMenu()
    if (isCoarse(window)) { openSheet({ title: word(title), groups: [{ rows }], root: overlay, nonModal: true, onClose: chosen => { if (chosen) here() } }); return }
    const panel = document.createElement('div'); panel.className = 'aa-controls aa-menu aa-writer-menu'
    panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', word(title))
    const list = document.createElement('div'); list.className = 'aa-menu-list'; list.setAttribute('role', 'none')
    for (const row of rows) {
      const node = button(row.label, row.icon, () => { closeMenu(); act(row.run)() }, true)
      node.classList.add('note-menu-row'); node.setAttribute('role', 'menuitem'); node.dataset.command = row.id; node.tabIndex = -1
      list.append(node)
    }
    panel.append(list); overlay.append(panel)
    const box = anchor.getBoundingClientRect()
    panel.style.left = `${Math.round(box.left)}px`; panel.style.top = `${Math.round(box.bottom)}px`
    const width = panel.getBoundingClientRect().width
    if (box.left + width > window.innerWidth) panel.style.left = `${Math.round(Math.max(0, window.innerWidth - width))}px`
    anchor.setAttribute('aria-expanded', 'true')
    openMenu = { panel, anchor }
    if (keyboard) list.querySelector('button')?.focus()
    panel.addEventListener('keydown', event => {
      const items = [...list.querySelectorAll('button')], at = items.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); anchor.focus() }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }
    })
  }
  const opening = (id: string, label: string, icon: string, rows: () => readonly Row[]) => {
    const node: HTMLButtonElement = button(label, icon, event => menu(node, label, rows(), event.detail === 0))
    node.dataset.action = id; node.classList.add('aa-writer-opens'); node.setAttribute('aria-haspopup', 'menu'); node.setAttribute('aria-expanded', 'false')
    node.append(chevron(document))
    return node
  }
  const pressing = (id: string, label: string, icon: string, run: () => void, shortcut?: string) => {
    const node = button(label, icon, act(run), false, shortcut)
    node.dataset.action = id
    return node
  }
  const turning = (only: readonly TurnKind[]): Row[] => kinds.filter(kind => only.includes(kind.kind)).map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => editor.turnInto(kind.kind) }))
  const inserts = (): Row[] => {
    const blocks = kinds.filter(kind => (['quote', 'code', 'table', 'divider', 'callout', 'toggle', 'equation'] as TurnKind[]).includes(kind.kind))
      .map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => insertBlock(editor, kind.kind) }))
    const commands: Command[] = [...(options.atoms ?? []).map(inserting).filter((command): command is Command => !!command), ...(options.commands ?? [])]
    return [...blocks, ...commands.map(command => ({ id: command.id, label: command.label, icon: command.icon, run: () => command.run(editor) }))]
  }
  const group = (...nodes: HTMLElement[]) => { const part = document.createElement('span'); part.className = 'aa-writer-group'; part.append(...nodes); return part }
  const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true
  picker.addEventListener('change', () => { const files = [...picker.files ?? []]; picker.value = ''; if (files.length) { here(); options.onFiles?.(files) } })
  bar.append(
    group(opening('style', 'Text style', 'text', () => turning(['paragraph', 'h1', 'h2', 'h3']))),
    group(
      pressing('bold', 'Bold', 'bold', () => editor.format('bold'), '⌘B'),
      pressing('italic', 'Italic', 'italic', () => editor.format('italic'), '⌘I'),
      opening('marks', 'More formatting', 'underline', () => [
        { id: 'underline', label: 'Underline', icon: 'underline', run: () => editor.format('underline') },
        { id: 'strike', label: 'Strikethrough', icon: 'strike', run: () => editor.format('strike') },
        { id: 'code', label: 'Code', icon: 'code', run: () => editor.format('code') },
        { id: 'highlight', label: 'Highlight', icon: 'background', run: () => editor.format('highlight') },
      ]),
    ),
    group(opening('lists', 'Lists', 'bullet', () => turning(['bullet', 'numbered', 'todo']))),
    group(
      pressing('link', 'Link', 'link', () => editor.format('link'), '⌘K'),
      ...(options.onFiles ? [pressing('picture', 'Add picture or file', 'image', () => picker.click())] : []),
      opening('insert', 'Insert block', 'plus', inserts),
    ),
  )
  if (actions.length) {
    const end = group(...actions.map(action => pressing(action.id, action.label, action.icon, () => action.run(editor), action.shortcut)))
    end.classList.add('aa-writer-end'); bar.append(end)
  }
  bar.append(picker)

  const markAt = (name: 'bold' | 'italic') => {
    const selection = editor.selection(), block = editor.activeBlock()
    if (!selection || !block) return false
    const start = selection.start - block.start, end = selection.end - block.start
    return blockRuns(block.block).some(run => run.kind === 'text' && !!run[name] && run.from <= start && run.to >= end && (start < end ? run.from < end : run.from < start || start === 0))
  }
  const refreshBar = () => {
    if (editor.selection()) lastSelection = editor.selection()
    for (const name of ['bold', 'italic'] as const) bar.querySelector(`[data-action="${name}"]`)?.setAttribute('aria-pressed', String(markAt(name)))
  }

  const outside = (event: PointerEvent) => { if (openMenu && !openMenu.panel.contains(event.target as Node) && !openMenu.anchor.contains(event.target as Node)) closeMenu() }
  const keys = (event: KeyboardEvent) => {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
    if (!mod || event.isComposing || !(event.key === 'Enter' || event.key.toLowerCase() === 's')) return
    event.preventDefault(); event.stopPropagation(); void save()
  }
  const leave = () => { if (timer !== undefined) writeDraft() }
  const hidden = () => { if (document.visibilityState === 'hidden') leave() }
  page.addEventListener('aa-selectionchange', refreshBar)
  page.addEventListener('aa-change', refreshBar)
  element.addEventListener('keydown', keys, true)
  document.addEventListener('pointerdown', outside)
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('pagehide', leave)

  const setReadOnly = (value: boolean) => { editor.readOnly = value; element.toggleAttribute('data-read-only', value); show(state, said.textContent ? said.textContent : '') }
  element.toggleAttribute('data-read-only', !!options.readOnly)
  element.dataset.state = state
  show(state, restored ? 'Draft restored' : '')

  return {
    editor, element,
    get value() { return editor.value },
    set value(value) { editor.value = value; changed() },
    get saved() { return saved },
    set saved(value) {
      if (value === saved) return
      const untouched = !dirty()
      saved = value
      if (untouched) editor.value = value
      changed()
    },
    get dirty() { return dirty() },
    get state() { return state },
    get readOnly() { return editor.readOnly },
    set readOnly(value) { setReadOnly(value) },
    save, cancel,
    destroy() {
      if (destroyed) return
      leave()
      destroyed = true; clearTimeout(timer); closeMenu()
      page.removeEventListener('aa-selectionchange', refreshBar); page.removeEventListener('aa-change', refreshBar)
      element.removeEventListener('keydown', keys, true)
      document.removeEventListener('pointerdown', outside); document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', leave)
      editor.destroy(); element.remove()
    },
  }
}
