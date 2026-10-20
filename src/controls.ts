import type { Editor, EditorOptions } from './editor'
import { turnInto as turnBlocks, type TurnKind } from './document'
import { createDragging } from './drag'
import { openSheet, type SheetGroup } from './sheet'

import { icons } from './icons'
import { TEXT_COLORS } from './markdown'
import { initTooltips } from './ds1/0-face/tooltips'
/** A button on the bar over selected words; `shortcut` is named in its tooltip (⌘B). */
export type ToolbarAction = { id: string; label: string; icon: string; shortcut?: string; run(editor: Editor): void }
/** `ink`: one of the text colours its row's mark is drawn in. */
export type Command = ToolbarAction & { keywords?: string; ink?: string; enabled?(editor: Editor): boolean }
const kinds: { kind: TurnKind; label: string; icon: string }[] = [
  { kind: 'paragraph', label: 'Text', icon: 'text' }, { kind: 'h1', label: 'Heading 1', icon: 'h1' },
  { kind: 'h2', label: 'Heading 2', icon: 'h2' }, { kind: 'h3', label: 'Heading 3', icon: 'h3' },
  { kind: 'todo', label: 'To-do', icon: 'todo' }, { kind: 'bullet', label: 'Bulleted list', icon: 'bullet' },
  { kind: 'numbered', label: 'Numbered list', icon: 'numbered' }, { kind: 'quote', label: 'Quote', icon: 'quote' },
  { kind: 'code', label: 'Code', icon: 'code-block' }, { kind: 'divider', label: 'Divider', icon: 'divider' },
  { kind: 'callout', label: 'Callout', icon: 'callout' }, { kind: 'toggle', label: 'Toggle', icon: 'toggle' },
  { kind: 'toggle-h1', label: 'Toggle heading 1', icon: 'h1' }, { kind: 'toggle-h2', label: 'Toggle heading 2', icon: 'h2' }, { kind: 'toggle-h3', label: 'Toggle heading 3', icon: 'h3' },
  { kind: 'table', label: 'Table', icon: 'table' }, { kind: 'equation', label: 'Equation', icon: 'equation' },
]
/** The Markdown that writes a kind, shown at its row's end in a sheet. */
const keys: Partial<Record<TurnKind, string>> = { h1: '#', h2: '##', h3: '###', todo: '[ ]', bullet: '-', numbered: '1.', quote: '>', code: '```', divider: '---', callout: '> [!', table: '|', equation: '$$' }
function button(label: string, icon: string, action: () => void, text = false, shortcut?: string): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'; node.setAttribute('aria-label', label)
  // An icon alone is named by Design system 1's tooltip, with its shortcut; a row with words needs none.
  if (!text) node.dataset.tooltip = shortcut ? `${label} ${shortcut}` : label
  const picture = document.createElement('span')
  picture.className = 'aa-icon'
  const svg = icons[`./icons/${icon}.svg`]
  if (svg) picture.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, 'black'))}")`
  node.append(picture)
  if (text) { const name = document.createElement('span'); name.textContent = label; node.append(name) }
  node.addEventListener('pointerdown', event => event.preventDefault())
  node.addEventListener('click', action)
  return node
}
export class AaToolbarElement extends (typeof HTMLElement === 'undefined' ? class {} as typeof HTMLElement : HTMLElement) {
  editor: Editor | null = null
  actions: readonly ToolbarAction[] = []
  /** A second row under the cells: the field that asks AI about the selected words. */
  below: HTMLElement | null = null
  // Drawn as Design system 1's context bar (ds1/context.css), each cell an icon
  // one square. A formatting bar that leaves the caret in the writing is a
  // toolbar, not a menu: it opens without the focus, and Tab reaches its buttons.
  connectedCallback() { this.classList.add('ds-context', 'ds-context--bar'); this.setAttribute('role', 'toolbar'); this.setAttribute('aria-label', 'Text formatting'); this.refresh() }
  refresh() {
    this.replaceChildren(...this.actions.map(action => {
      const node = button(action.label, action.icon, () => { if (this.editor && !this.editor.readOnly) action.run(this.editor) }, false, action.shortcut)
      node.classList.add('note-menu-row', 'ds-context__item--icon'); node.dataset.action = action.id
      return node
    }))
    if (this.below) this.append(this.below)
  }
}
export function defineAaToolbar() { if (!customElements.get('aa-toolbar')) customElements.define('aa-toolbar', AaToolbarElement) }

/**
 * A command that starts a block an atom draws (a diagram): in place of an
 * empty block, or after the one the caret is in, the caret on its first line
 * of words so they show for writing.
 */
function inserting(atom: NonNullable<EditorOptions['atoms']>[number]): Command | null {
  const insert = atom.insert
  if (!insert) return null
  return { id: `insert-${atom.name}`, label: insert.label, icon: insert.icon, keywords: insert.keywords, run: editor => {
    const block = editor.activeBlock()
    const empty = !block || !block.block.source.trim()
    const start = block ? (empty ? block.start : block.end) : editor.value.length
    const lead = empty ? (block || !editor.value ? '' : '\n\n') : '\n\n'
    editor.replace(start, block && empty ? block.end : start, lead + insert.source)
    const line = insert.source.indexOf('\n') + 1
    editor.selectRange(start + lead.length + line)
  } }
}

/** The part of the page in view: the visual viewport, which a phone's keyboard shortens and a pinch moves, or the window. */
function visible() {
  const view = window.visualViewport
  return { top: view?.offsetTop ?? 0, left: view?.offsetLeft ?? 0, width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight }
}
/** Whether the page is worked by touch: a phone or a tablet, with no fine pointer. */
const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches
/** The editor's scale, read as its stylesheet reads it: Design system 1's --ds-sf, or the page's --sf. */
function scaleOf(host: HTMLElement): number {
  const style = getComputedStyle(host)
  return parseFloat(style.getPropertyValue('--ds-sf')) || parseFloat(style.getPropertyValue('--sf')) || 1
}
/**
 * Stands a bar across the foot of what is in view: above a phone's keyboard,
 * and clear of the home indicator (aa.css gives a docked bar --aa-safe-bottom)
 * when no keyboard is up. As wide as the view, so it is whole under a pinch.
 */
function dock(bar: HTMLElement) {
  const view = visible()
  bar.dataset.docked = ''
  bar.style.left = `${view.left}px`
  bar.style.width = `${view.width}px`
  const inset = view.height >= window.innerHeight - 1 ? parseFloat(getComputedStyle(bar).getPropertyValue('--aa-safe-bottom')) || 0 : 0
  bar.style.top = `${view.top + view.height - bar.getBoundingClientRect().height - inset}px`
}

export function createControls(editor: Editor, options: EditorOptions): () => void {
  defineAaToolbar()
  initTooltips()
  const inserts = (options.atoms ?? []).map(inserting).filter((command): command is Command => !!command)
  const host = editor.element
  const toolbar = document.createElement('aa-toolbar') as AaToolbarElement
  toolbar.className = 'aa-controls aa-toolbar'; toolbar.hidden = true; toolbar.editor = editor
  let saved: { start: number; end: number } | null = null
  const restore = () => { if (saved) editor.selectRange(saved.start, saved.end) }
  // On touch the kinds are a sheet from the foot of the screen (sheet.ts), a row each with the Markdown that writes it.
  const kindRows = (run: (kind: TurnKind) => void) => kinds.map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, key: keys[kind.kind], run: () => { restore(); run(kind.kind) } }))
  const sheet = (title: string, groups: SheetGroup[]) => { toolbar.hidden = true; openSheet({ title, groups, root: overlayRoot }) }
  /** A new block of a kind: in place of the empty paragraph the caret is in, or after the block it is in, written as the kind writes an empty block. */
  const insertKind = (kind: TurnKind) => {
    const block = editor.activeBlock()
    if (!block || (block.block.kind === 'paragraph' && !block.block.source.trim())) { editor.turnInto(kind); return }
    const made = turnBlocks([{ kind: 'paragraph', source: '', prefix: 0 }], { anchor: 0, focus: 0 }, kind)
    const source = made.blocks.map(each => each.source).join('\n\n')
    if (source) { editor.replace(block.end, block.end, `\n\n${source}`); editor.selectRange(block.end + 2 + made.caret.offset); return }
    // An empty paragraph has no Markdown of its own to insert: Enter at the block's end starts one, as the key does.
    editor.selectRange(block.end)
    host.children[block.index]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  }
  // Over selected words, with a pointer, the bar is as simple as it can be, a grid five squares wide as Notion's:
  // the colour and the marks, then Comment. The kinds, what the product inserts and a picture are the slash
  // menu's; touch, with no keys for them, keeps them on its bar with the rest.
  const mark = (id: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'equation', label: string, shortcut?: string): ToolbarAction =>
    ({ id, icon: id, label, shortcut, run: () => { restore(); editor.format(id) } })
  const colors: Command[] = [{ id: 'color-default', label: 'Default', icon: 'color', run: () => editor.color(null) },
    ...TEXT_COLORS.map(color => ({ id: `color-${color}`, label: color === 'gray' ? 'Grey' : color[0].toUpperCase() + color.slice(1), icon: 'color', ink: color, run: () => editor.color(color) }))]
  toolbar.actions = [
    { id: 'color', icon: 'color', label: 'Text colour', run: () => { restore(); open(colors, (toolbar.querySelector('[data-action="color"]') ?? toolbar).getBoundingClientRect()) } },
    mark('bold', 'Bold', '⌘B'), mark('italic', 'Italic', '⌘I'), mark('underline', 'Underline', '⌘U'), mark('strike', 'Strikethrough', '⌘⇧S'),
    mark('link', 'Link', '⌘K'), mark('code', 'Code', '⌘E'), mark('equation', 'Equation'),
    // Comment on the selected words, where the product keeps comments.
    ...(options.comments ? [{ id: 'comment', icon: 'comment', label: 'Comment', shortcut: '⌘⇧M', run: () => { restore(); editor.comments?.start() } }] : []),
    ...(Array.isArray(options.toolbar) ? options.toolbar : []).map(action => ({ ...action, run: () => { restore(); action.run(editor) } })),
  ]
  const blocks: ToolbarAction[] = [
    { id: 'turn', icon: 'text', label: 'Turn into', run: () => {
      restore(); const active = editor.activeBlock(); if (!active) return
      if (coarse()) sheet('Turn into', [{ rows: kindRows(kind => editor.turnInto(kind)) }])
      else open(kinds.map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => editor.turnInto(kind.kind) })), (toolbar.querySelector('[data-action="turn"]') ?? toolbar).getBoundingClientRect())
    } },
    ...inserts.map(command => ({ ...command, run: () => { restore(); command.run(editor) } })),
    ...(options.onFiles ? [{ id: 'image', label: 'Image or file', icon: 'image', run: () => {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true
      input.addEventListener('change', () => { restore(); options.onFiles?.(Array.from(input.files ?? [])) }, { once: true }); input.click()
    } }] : []),
  ]
  if (coarse()) toolbar.actions = [...toolbar.actions, ...blocks]
  // Under the cells, where the product answers prompts, a row asks AI about the selected words, as Notion's bar does.
  if (options.prompt) {
    const ask = document.createElement('form')
    ask.className = 'aa-toolbar-ask'
    const field = document.createElement('input')
    field.type = 'text'; field.placeholder = 'Ask AI'; field.setAttribute('aria-label', 'Ask AI about the selected words'); field.autocomplete = 'off'
    ask.append(field)
    ask.addEventListener('submit', event => {
      event.preventDefault()
      const said = field.value.trim(), range = saved
      if (!said || !range || field.disabled) return
      field.disabled = true
      editor.selectRange(range.start, range.end)
      void editor.askAbout(said).then(done => { field.value = done ? '' : field.value; if (!done) field.placeholder = 'Not answered' }).catch(() => { field.placeholder = 'Not answered' }).finally(() => { field.disabled = false; setTimeout(() => { field.placeholder = 'Ask AI' }, 2000) })
    })
    field.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); field.value = ''; restore() } })
    toolbar.below = ask
  }
  // Touch has no ⌘/ and keeps its long press for selecting words: the block
  // commands, moving a block among them, are a button above the keyboard.
  // A plus first on the bar opens Insert block: the kinds, then what the product inserts (a diagram, a picture, its own commands).
  if (coarse()) toolbar.actions = [
    { id: 'insert', label: 'Insert block', icon: 'plus', run: () => { restore(); sheet('Insert block', [
      { label: 'Blocks', rows: kindRows(insertKind) },
      { label: 'More', rows: [...builtin.filter(command => !kinds.some(kind => kind.kind === command.id)), ...(options.commands ?? [])].map(command => ({ id: command.id, label: command.label, icon: command.icon, run: () => { restore(); command.run(editor) } })) },
    ]) } },
    ...toolbar.actions,
    { id: 'block', label: 'Block commands', icon: 'slash', run: () => { restore(); target = editor.activeBlock()?.index ?? -1; blockMenu(toolbar.querySelector('[data-action="block"]')?.getBoundingClientRect()) } },
    { id: 'indent', label: 'Indent', icon: 'indent', run: () => { restore(); editor.indent(1) } },
    { id: 'outdent', label: 'Outdent', icon: 'outdent', run: () => { restore(); editor.indent(-1) } },
  ]
  toolbar.refresh()
  // Floating controls must stay within a native modal's interactive subtree.
  // Outside a dialog they continue to use the document's viewport layer.
  const overlayRoot = host.closest('dialog') ?? host.ownerDocument.body
  if (options.toolbar) overlayRoot.append(toolbar)

  const menu = document.createElement('div')
  menu.className = 'aa-controls aa-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Block commands')
  // The commands scroll within the menu; Close stands under them, as Notion's menu has it.
  const list = document.createElement('div'); list.className = 'aa-menu-list'; list.setAttribute('role', 'none')
  const closeRow = button('Close', 'close', () => close(), true)
  closeRow.classList.add('note-menu-row'); closeRow.dataset.command = 'close'; closeRow.setAttribute('role', 'menuitem'); closeRow.tabIndex = -1
  closeRow.querySelector('.aa-icon')?.remove()
  const esc = document.createElement('kbd'); esc.textContent = 'esc'; closeRow.append(esc)
  const findBar = document.createElement('div'); findBar.className = 'aa-controls aa-find'; findBar.hidden = true; findBar.setAttribute('role', 'search')
  overlayRoot.append(menu, findBar)
  const linkBar = document.createElement('form')
  linkBar.className = 'aa-controls aa-find aa-link-editor'; linkBar.hidden = true
  linkBar.setAttribute('aria-label', 'Edit link')
  const linkUrl = document.createElement('input'); linkUrl.type = 'text'; linkUrl.placeholder = 'Link URL'; linkUrl.setAttribute('aria-label', 'Link URL')
  const applyLink = document.createElement('button'); applyLink.type = 'submit'; applyLink.textContent = 'Apply'
  const cancelLink = document.createElement('button'); cancelLink.type = 'button'; cancelLink.textContent = 'Cancel'
  linkBar.append(linkUrl, applyLink, cancelLink); overlayRoot.append(linkBar)
  let linkTarget: { start: number; end: number; text: string; url: string } | null = null
  const finishLink = () => { linkBar.hidden = true; if (linkTarget) editor.selectRange(linkTarget.start, linkTarget.end); linkTarget = null }
  const requestLink = (event: Event) => {
    linkTarget = (event as CustomEvent).detail
    if (!linkTarget || editor.readOnly) return
    linkUrl.value = linkTarget.url; linkBar.hidden = false; toolbar.hidden = true
    // On touch the field takes the toolbar's place above the keyboard; with a pointer it stands at the editor's top.
    if (coarse()) dock(linkBar)
    else {
      delete linkBar.dataset.docked; linkBar.style.width = ''
      const rect = host.getBoundingClientRect(), square = 20 * scaleOf(host), view = visible()
      linkBar.style.left = `${Math.max(view.left, Math.min(rect.left, view.left + view.width - 16 * square))}px`
      linkBar.style.top = `${Math.max(view.top, Math.min(rect.top, view.top + view.height - 3 * square))}px`
    }
    linkUrl.focus(); linkUrl.select()
  }
  linkBar.addEventListener('submit', event => {
    event.preventDefault()
    if (!linkTarget || editor.readOnly || !linkUrl.value.trim()) return
    const url = linkUrl.value.trim().replace(/\(/g, '%28').replace(/\)/g, '%29')
    const label = linkTarget.text || url
    editor.replace(linkTarget.start, linkTarget.end, `[${label}](${url})`)
    linkBar.hidden = true; linkTarget = null
  })
  cancelLink.addEventListener('click', finishLink)
  linkBar.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finishLink() } })
  host.addEventListener('aa-link-request', requestLink)
  let target = -1, active = 0, choices: readonly Command[] = [], slash: { from: number; to: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const moveMenu = (rect: DOMRect) => {
    // The menu is drawn before it is placed, so its height is its own: its rows up to its sixteen squares.
    const size = 20 * scaleOf(host), view = visible()
    // Four squares wide (aa.css), placed by its own size: its commands up to eight squares, and Close.
    const box = menu.getBoundingClientRect(), height = box.height || (Math.min(choices.length, 8) + 1) * size
    // Words fade over the last square only where they are cut (aa.css).
    for (const words of Array.from(list.querySelectorAll<HTMLElement>('button > span:not(.aa-icon)'))) words.toggleAttribute('data-cut', words.scrollWidth > words.clientWidth + 1)
    menu.style.left = `${Math.max(view.left, Math.min(rect.left, view.left + view.width - box.width))}px`
    // Under the block, or over it when the keyboard or the foot of the window leaves no room under it.
    const under = rect.bottom, over = rect.top - height
    const room = under + height <= view.top + view.height
    menu.style.top = `${room || over < view.top ? Math.max(view.top, Math.min(under, view.top + view.height - height)) : over}px`
  }
  const close = () => { menu.hidden = true; slash = null; list.replaceChildren(); menu.replaceChildren(); host.removeAttribute('aria-controls') }
  const run = (command: Command) => {
    if (editor.readOnly) return
    const query = slash
    close()
    editor.transaction(() => { if (query) editor.replace(query.from, query.to, ''); command.run(editor) })
    // On touch a block left selected would wear the system's handles: the caret goes to the end of what the command made.
    if (coarse()) { const range = editor.selection(); if (range && range.start !== range.end) editor.selectRange(range.end) }
    toolbar.hidden = true
  }
  const paint = () => {
    list.replaceChildren(...choices.map((command, index) => {
      const node = button(command.label, command.icon, () => run(command), true)
      if (command.ink) (node.querySelector('.aa-icon') as HTMLElement | null)?.setAttribute('data-color', command.ink)
      node.classList.add('note-menu-row'); node.dataset.command = command.id; node.setAttribute('role', 'menuitem');
      if (command.id === 'count') {
        node.lastElementChild!.textContent = command.label.split(',')[0]
        node.querySelector('.aa-icon')?.remove()
      }
      node.tabIndex = index === active ? 0 : -1
      node.toggleAttribute('data-current', index === active)
      return node
    }))
    if (!choices.length) { const empty = document.createElement('span'); empty.className = 'aa-menu-empty'; empty.textContent = 'No matching commands'; list.append(empty) }
    menu.replaceChildren(list, closeRow)
    // The row the arrows reach is scrolled into the list's view.
    const current = list.children[active] as HTMLElement | undefined
    if (current && typeof current.scrollIntoView === 'function') current.scrollIntoView({ block: 'nearest' })
  }
  function open(commands: readonly Command[], rect: DOMRect) {
    choices = commands.filter(command => command.enabled?.(editor) !== false)
    active = 0; menu.hidden = false; paint(); moveMenu(rect)
  }
  const builtin: Command[] = [...kinds.map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => editor.turnInto(kind.kind) })), ...inserts]
  if (options.onFiles) builtin.push({ id: 'image', label: 'Image or file', icon: 'image', run: () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true
    input.addEventListener('change', () => Array.from(input.files ?? []).forEach(file => editor.insertFile(file)), { once: true }); input.click()
  } })
  /** The block's commands, over the block, or at `at` (the toolbar's cell on touch, where the finger is). */
  const blockMenu = (at?: DOMRect) => {
    if (target < 0) return
    // The caret's block is the commands' block as it is; selecting it would draw the system's handles on touch. A table is never selected whole.
    const active = editor.activeBlock()
    if (active?.index !== target || (active.block.kind !== 'table' && !coarse())) editor.selectBlocks(target)
    const commands: Command[] = [
      ...builtin, { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', run: () => editor.blockAction('duplicate') },
      { id: 'delete', label: 'Delete', icon: 'delete', run: () => editor.blockAction('delete') },
      { id: 'up', label: 'Move up', icon: 'up', run: () => editor.blockAction('up') },
      { id: 'down', label: 'Move down', icon: 'down', run: () => editor.blockAction('down') },
      { id: 'indent', label: 'Indent', icon: 'indent', run: () => editor.indent(1), enabled: e => e.activeBlock()?.block.kind === 'bullet' },
      { id: 'outdent', label: 'Outdent', icon: 'outdent', run: () => editor.indent(-1), enabled: e => e.activeBlock()?.block.kind === 'bullet' },
      ...(['add-row', 'delete-row', 'add-column', 'delete-column'] as const).map(action => ({ id: action, label: action.replace('-', ' ').replace(/^./, letter => letter.toUpperCase()), icon: 'table', enabled: (e: Editor) => e.activeBlock()?.block.kind === 'table', run: () => editor.table(action) })),
      ...(options.blockCommands ?? []),
    ]
    const count = editor.stats()
    commands.push({ id: 'count', label: `${count.words} words, ${count.characters} characters`, icon: 'text', run: () => {} })
    slash = null
    open(commands, at ?? (host.children[target] ?? host).getBoundingClientRect())
  }
  const updateCommands = () => {
    if (disposed || editor.readOnly || options.menus === false) { close(); return }
    const block = editor.activeBlock(), selection = editor.selection()
    if (!block || !selection || selection.start !== selection.end || block.block.kind === 'code' || block.block.kind === 'table') return
    const before = editor.value.slice(block.start, selection.end)
    const match = /(?:^|\s)\/([^/\n]*)$/.exec(before)
    if (!match) { if (slash) close(); return }
    const query = match[1].toLocaleLowerCase()
    slash = { from: selection.end - match[1].length - 1, to: selection.end }
    const commands = [...builtin, ...(options.commands ?? [])].filter(command => `${command.label} ${command.keywords ?? ''}`.toLocaleLowerCase().includes(query))
    const rect = host.children[block.index]?.getBoundingClientRect() ?? host.getBoundingClientRect()
    open(commands, rect)
  }
  const positionToolbar = () => {
    if (toolbar.hidden) return
    if (coarse()) dock(toolbar)
    else {
      delete toolbar.dataset.docked; toolbar.style.width = ''
      // Over the selected words, measured from where they are in the Markdown: with the focus in the bar's own
      // field the page's selection is the field's, and a pinch-zoomed page pans as it is typed in.
      const words = saved ? editor.rangeOf(saved.start, saved.end) : null
      const rect = words?.getBoundingClientRect?.() ?? host.getBoundingClientRect()
      // As Design system 1's context bar: half a square above the selection, below it when there is no room.
      const box = toolbar.getBoundingClientRect(), half = (box.height + 1) / 2
      const above = rect.top - half - box.height
      toolbar.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - box.width))}px`
      toolbar.style.top = `${above >= 0 ? above : rect.bottom + half}px`
    }
  }
  const selectionChanged = () => {
    clearTimeout(timer)
    // The keys in the bar's own field: the words stay selected for it, the bar stays.
    if (toolbar.contains(document.activeElement)) return
    const selection = editor.selection()
    const mobile = coarse() && host.contains(document.activeElement)
    if (!selection || (!mobile && selection.start === selection.end) || editor.readOnly) { toolbar.hidden = true; return }
    saved = selection
    timer = setTimeout(() => { if (!disposed && options.toolbar && !editor.readOnly) { toolbar.hidden = false; positionToolbar() } }, 140)
  }
  const query = document.createElement('input'); query.placeholder = 'Find'; query.setAttribute('aria-label', 'Find')
  const replacement = document.createElement('input'); replacement.placeholder = 'Replace'; replacement.setAttribute('aria-label', 'Replace')
  const result = document.createElement('span'); result.setAttribute('aria-live', 'polite')
  let matches: { start: number; end: number }[] = [], matchIndex = -1
  const refreshFind = () => {
    if (findBar.hidden) return
    matches = editor.find(query.value)
    editor.decorate(matches.map(match => ({ from: match.start, to: match.end, className: 'aa-find-match' })), 'find')
    result.textContent = `${matches.length} matches`
    matchIndex = Math.min(matchIndex, matches.length - 1)
  }
  const nextMatch = (direction: number) => { if (!matches.length) return; matchIndex = (matchIndex + direction + matches.length) % matches.length; const match = matches[matchIndex]; editor.selectRange(match.start, match.end); result.textContent = `${matchIndex + 1} of ${matches.length}` }
  const closeFind = () => { findBar.hidden = true; editor.decorate([], 'find'); editor.focus() }
  query.addEventListener('input', refreshFind)
  findBar.append(query, replacement, button('Previous match', 'up', () => nextMatch(-1)), button('Next match', 'down', () => nextMatch(1)), button('Replace', 'text', () => {
    const match = matches[matchIndex < 0 ? 0 : matchIndex]; if (!match || editor.readOnly) return; editor.replace(match.start, match.end, replacement.value); refreshFind()
  }), button('Replace all', 'text', () => {
    if (!matches.length || editor.readOnly) return
    let value = editor.value
    for (const match of [...matches].reverse()) value = value.slice(0, match.start) + replacement.value + value.slice(match.end)
    editor.replace(0, editor.value.length, value); refreshFind()
  }), result, button('Close find', 'close', closeFind))
  findBar.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeFind() } else if (event.key === 'Enter') { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1) } })
  const keyboard = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
    if (mod && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopImmediatePropagation(); findBar.hidden = false
      const rect = host.getBoundingClientRect(); findBar.style.left = `${Math.max(0, rect.left)}px`; findBar.style.top = `${Math.max(0, rect.top)}px`; refreshFind(); query.focus(); return
    }
    if (mod && event.key === '/') { event.preventDefault(); event.stopImmediatePropagation(); target = editor.activeBlock()?.index ?? -1; blockMenu(); return }
    if (menu.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation(); if (choices.length) active = (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length; paint(); return
    }
    if (event.key === 'Enter' && choices[active]) { event.preventDefault(); event.stopImmediatePropagation(); run(choices[active]) }
  }
  menu.addEventListener('keydown', keyboard)
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close(); if (!host.contains(event.target as Node) && !toolbar.contains(event.target as Node)) toolbar.hidden = true }
  const changed = () => { updateCommands(); refreshFind(); if (editor.readOnly) { toolbar.hidden = true; linkBar.hidden = true; linkTarget = null } }
  const contextMenu = (event: MouseEvent) => { const block = (event.target as HTMLElement).closest('.aa-block'); if (block?.getAttribute('data-kind') !== 'table' || editor.readOnly || options.menus === false) return; event.preventDefault(); target = Array.from(host.children).indexOf(block); blockMenu(); menu.style.left = `${event.clientX}px`; menu.style.top = `${event.clientY}px` }
  const viewport = (event: Event) => {
    if (event.target instanceof Node && menu.contains(event.target)) return
    positionToolbar()
    if (!linkBar.hidden && 'docked' in linkBar.dataset) dock(linkBar)
    if (!menu.hidden) {
      const block = editor.activeBlock()
      const rect = block ? host.children[block.index]?.getBoundingClientRect() : null
      if (rect) moveMenu(rect)
    }
  }
  host.addEventListener('aa-selectionchange', selectionChanged)
  host.addEventListener('aa-change', changed)
  host.addEventListener('contextmenu', contextMenu)
  host.addEventListener('keydown', keyboard, true)
  document.addEventListener('pointerdown', outside)
  window.addEventListener('resize', viewport)
  window.addEventListener('scroll', viewport, true)
  window.visualViewport?.addEventListener('resize', viewport)
  window.visualViewport?.addEventListener('scroll', viewport)
  const stopDragging = createDragging(editor, options, overlayRoot)
  return () => {
    disposed = true; clearTimeout(timer); stopDragging()
    toolbar.remove(); menu.remove(); findBar.remove(); linkBar.remove(); host.removeEventListener('aa-link-request', requestLink)
    host.removeEventListener('aa-selectionchange', selectionChanged); host.removeEventListener('aa-change', changed)
    host.removeEventListener('keydown', keyboard, true)
    host.removeEventListener('contextmenu', contextMenu)
    document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', viewport); window.removeEventListener('scroll', viewport, true)
    window.visualViewport?.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('scroll', viewport)
  }
}
