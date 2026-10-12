import type { Editor, EditorOptions } from './editor'
import type { TurnKind } from './document'
import { parseBlocks } from './markdown'

import { icons } from './icons'
export type ToolbarAction = { id: string; label: string; icon: string; run(editor: Editor): void }
export type Command = ToolbarAction & { keywords?: string; enabled?(editor: Editor): boolean }
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
function button(label: string, icon: string, action: () => void, text = false): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'; node.title = label; node.setAttribute('aria-label', label)
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
  connectedCallback() { this.setAttribute('role', 'toolbar'); this.setAttribute('aria-label', 'Text formatting'); this.refresh() }
  refresh() {
    this.replaceChildren(...this.actions.map(action => button(action.label, action.icon, () => { if (this.editor && !this.editor.readOnly) action.run(this.editor) })))
  }
}
export function defineAaToolbar() { if (!customElements.get('aa-toolbar')) customElements.define('aa-toolbar', AaToolbarElement) }

export function createControls(editor: Editor, options: EditorOptions): () => void {
  defineAaToolbar()
  const host = editor.element
  const toolbar = document.createElement('aa-toolbar') as AaToolbarElement
  toolbar.className = 'aa-controls aa-toolbar'; toolbar.hidden = true; toolbar.editor = editor
  let saved: { start: number; end: number } | null = null
  const restore = () => { if (saved) editor.selectRange(saved.start, saved.end) }
  const marks = ['bold', 'italic', 'strike', 'code', 'link', 'equation'] as const
  toolbar.actions = [...marks.map(mark => ({ id: mark, icon: mark, label: { bold: 'Bold', italic: 'Italic', strike: 'Strikethrough', code: 'Code', link: 'Link', equation: 'Equation' }[mark], run: () => { restore(); editor.format(mark) } })),
    { id: 'turn', icon: 'text', label: 'Turn into', run: () => { restore(); const active = editor.activeBlock(); if (active) open(kinds.map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => editor.turnInto(kind.kind) })), toolbar.getBoundingClientRect()) } },
    ...(Array.isArray(options.toolbar) ? options.toolbar : []).map(action => ({ ...action, run: () => { restore(); action.run(editor) } })),
  ]
  if (options.onFiles) toolbar.actions = [...toolbar.actions, { id: 'image', label: 'Image or file', icon: 'image', run: () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true
    input.addEventListener('change', () => { restore(); options.onFiles?.(Array.from(input.files ?? [])) }, { once: true }); input.click()
  } }]
  toolbar.refresh()
  if (options.toolbar) document.body.append(toolbar)

  const menu = document.createElement('div')
  menu.className = 'aa-controls aa-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Block commands')
  const grip = document.createElement('div')
  grip.className = 'aa-controls aa-grip'; grip.hidden = true
  const dropLine = document.createElement('div'); dropLine.className = 'aa-drop-line'; dropLine.hidden = true
  const findBar = document.createElement('div'); findBar.className = 'aa-controls aa-find'; findBar.hidden = true; findBar.setAttribute('role', 'search')
  document.body.append(menu, grip, dropLine, findBar)
  let hovered = -1, active = 0, choices: readonly Command[] = [], slash: { from: number; to: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let drag = -1, destination = -1, disposed = false
  const moveMenu = (rect: DOMRect) => {
    const size = 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--sf')) || 1)
    menu.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - 8 * size))}px`
    menu.style.top = `${Math.max(0, Math.min(rect.bottom, window.innerHeight - Math.min(choices.length, 12) * size))}px`
  }
  const close = () => { menu.hidden = true; slash = null; menu.replaceChildren(); host.removeAttribute('aria-controls') }
  const run = (command: Command) => {
    if (editor.readOnly) return
    const query = slash
    close()
    editor.transaction(() => { if (query) editor.replace(query.from, query.to, ''); command.run(editor) })
    toolbar.hidden = true
  }
  const paint = () => {
    menu.replaceChildren(...choices.map((command, index) => {
      const node = button(command.label, command.icon, () => run(command), true)
      node.setAttribute('role', 'menuitem'); node.tabIndex = index === active ? 0 : -1
      node.toggleAttribute('data-current', index === active)
      return node
    }))
    if (!choices.length) { const empty = document.createElement('span'); empty.className = 'aa-menu-empty'; empty.textContent = 'No matching commands'; menu.append(empty) }
  }
  function open(commands: readonly Command[], rect: DOMRect) {
    choices = commands.filter(command => command.enabled?.(editor) !== false)
    active = 0; menu.hidden = false; paint(); moveMenu(rect)
  }
  const builtin: Command[] = kinds.map(kind => ({ id: kind.kind, label: kind.label, icon: kind.icon, run: () => editor.turnInto(kind.kind) }))
  if (options.onFiles) builtin.push({ id: 'image', label: 'Image or file', icon: 'image', run: () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true
    input.addEventListener('change', () => Array.from(input.files ?? []).forEach(file => editor.insertFile(file)), { once: true }); input.click()
  } })
  const blockMenu = () => {
    if (hovered < 0) return
    if (editor.activeBlock()?.index !== hovered || editor.activeBlock()?.block.kind !== 'table') editor.selectBlocks(hovered)
    const commands: Command[] = [
      ...builtin, { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', run: () => editor.blockAction('duplicate') },
      { id: 'delete', label: 'Delete', icon: 'delete', run: () => editor.blockAction('delete') },
      { id: 'up', label: 'Move up', icon: 'up', run: () => editor.blockAction('up') },
      { id: 'down', label: 'Move down', icon: 'down', run: () => editor.blockAction('down') },
      { id: 'indent', label: 'Indent', icon: 'indent', run: () => editor.indent(1), enabled: e => e.activeBlock()?.block.kind === 'bullet' },
      { id: 'outdent', label: 'Outdent', icon: 'outdent', run: () => editor.indent(-1), enabled: e => e.activeBlock()?.block.kind === 'bullet' },
      ...(['add-row', 'delete-row', 'add-column', 'delete-column'] as const).map(action => ({ id: action, label: action.replace('-', ' '), icon: 'table', enabled: (e: Editor) => e.activeBlock()?.block.kind === 'table', run: () => editor.table(action) })),
      ...(options.blockCommands ?? []),
    ]
    const count = editor.stats()
    commands.push({ id: 'count', label: `${count.words} words, ${count.characters} characters`, icon: 'text', run: () => {} })
    slash = null
    open(commands, grip.getBoundingClientRect())
  }
  const handle = button('Block menu', 'handle', blockMenu)
  handle.draggable = true
  handle.addEventListener('dragstart', event => {
    drag = hovered; event.dataTransfer?.setData('application/x-aa-block', String(drag)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  })
  handle.addEventListener('dragend', () => { drag = -1; dropLine.hidden = true })
  grip.append(handle, button('Add a block', 'plus', () => {
    editor.selectBlocks(hovered)
    const block = editor.activeBlock(); if (!block) return
    editor.replace(block.end, block.end, '\n\n/'); updateCommands()
  }))
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
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      const viewport = window.visualViewport
      toolbar.dataset.docked = ''
      toolbar.style.top = `${(viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - toolbar.getBoundingClientRect().height}px`
      toolbar.style.left = '0px'
    } else {
      delete toolbar.dataset.docked
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect?.() ?? host.getBoundingClientRect()
      toolbar.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - toolbar.getBoundingClientRect().width))}px`
      toolbar.style.top = `${Math.max(0, rect.top - toolbar.getBoundingClientRect().height)}px`
    }
  }
  const selectionChanged = () => {
    clearTimeout(timer)
    const selection = editor.selection()
    if (!selection || selection.start === selection.end || editor.readOnly) { toolbar.hidden = true; return }
    saved = selection
    timer = setTimeout(() => { if (!disposed && options.toolbar && !editor.readOnly) { toolbar.hidden = false; positionToolbar() } }, 140)
  }
  const hover = (event: MouseEvent) => {
    if (editor.readOnly || options.menus === false) return
    const block = (event.target as HTMLElement).closest('.aa-block') as HTMLElement | null
    if (!block || block.parentElement !== host) return
    hovered = Array.from(host.children).indexOf(block)
    const rect = block.getBoundingClientRect(), size = 20 * (parseFloat(getComputedStyle(host).getPropertyValue('--sf')) || 1)
    grip.style.left = `${Math.max(0, rect.left - 2 * size)}px`; grip.style.top = `${rect.top}px`; grip.hidden = false
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
    if (mod && event.key === '/') { event.preventDefault(); event.stopImmediatePropagation(); hovered = editor.activeBlock()?.index ?? -1; blockMenu(); return }
    if (menu.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation(); if (choices.length) active = (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length; paint(); return
    }
    if (event.key === 'Enter' && choices[active]) { event.preventDefault(); event.stopImmediatePropagation(); run(choices[active]) }
  }
  menu.addEventListener('keydown', keyboard)
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node) && !grip.contains(event.target as Node)) close(); if (!host.contains(event.target as Node) && !toolbar.contains(event.target as Node)) toolbar.hidden = true }
  const dragOver = (event: DragEvent) => {
    if (editor.readOnly) return
    if (drag < 0 && !Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
    const block = (event.target as HTMLElement).closest('.aa-block') as HTMLElement | null
    if (!block || block.parentElement !== host) return
    event.preventDefault()
    const rect = block.getBoundingClientRect(), below = event.clientY > rect.top + rect.height / 2
    destination = Array.from(host.children).indexOf(block) + (below ? 1 : 0)
    dropLine.style.left = `${rect.left}px`; dropLine.style.top = `${below ? rect.bottom : rect.top}px`; dropLine.style.width = `${rect.width}px`; dropLine.hidden = false
  }
  const drop = (event: DragEvent) => {
    dropLine.hidden = true
    if (drag < 0 && destination >= 0 && !editor.readOnly && event.dataTransfer?.files.length && options.onFiles) {
      event.preventDefault(); event.stopImmediatePropagation()
      const blocks = parseBlocks(editor.value)
      const at = destination < blocks.length ? blocks[destination].start : editor.value.length
      editor.selectRange(at, at)
      options.onFiles(Array.from(event.dataTransfer.files)); destination = -1; return
    }
    if (drag < 0 || destination < 0 || editor.readOnly) return
    event.preventDefault(); event.stopImmediatePropagation()
    editor.moveBlock(drag, destination > drag ? destination - 1 : destination)
    drag = -1; destination = -1
  }
  const changed = () => { updateCommands(); refreshFind(); if (editor.readOnly) { toolbar.hidden = true; grip.hidden = true } }
  const contextMenu = (event: MouseEvent) => { const block = (event.target as HTMLElement).closest('.aa-block'); if (block?.getAttribute('data-kind') !== 'table' || editor.readOnly || options.menus === false) return; event.preventDefault(); hovered = Array.from(host.children).indexOf(block); blockMenu(); menu.style.left = `${event.clientX}px`; menu.style.top = `${event.clientY}px` }
  const viewport = () => { positionToolbar(); grip.hidden = true; if (!menu.hidden) close() }
  host.addEventListener('aa-selectionchange', selectionChanged)
  host.addEventListener('aa-change', changed)
  host.addEventListener('mousemove', hover)
  host.addEventListener('contextmenu', contextMenu)
  host.addEventListener('keydown', keyboard, true)
  host.addEventListener('dragover', dragOver)
  host.addEventListener('drop', drop, true)
  document.addEventListener('pointerdown', outside)
  window.addEventListener('resize', viewport)
  window.addEventListener('scroll', viewport, true)
  window.visualViewport?.addEventListener('resize', viewport)
  return () => {
    disposed = true; clearTimeout(timer)
    toolbar.remove(); menu.remove(); grip.remove(); dropLine.remove(); findBar.remove()
    host.removeEventListener('aa-selectionchange', selectionChanged); host.removeEventListener('aa-change', changed)
    host.removeEventListener('mousemove', hover); host.removeEventListener('keydown', keyboard, true)
    host.removeEventListener('contextmenu', contextMenu)
    host.removeEventListener('dragover', dragOver); host.removeEventListener('drop', drop, true)
    document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', viewport); window.removeEventListener('scroll', viewport, true)
    window.visualViewport?.removeEventListener('resize', viewport)
  }
}
