/**
 * The editor: one editable element a block, each drawn from the document and
 * read back from the screen after every change, the way Notion's blocks are.
 * The browser types, spells and composes; Aa owns Enter, Backspace at an
 * edge, paste, marks, undo and the caret's way between blocks.
 */

import { IMAGE, EQUATION, fencedAtom, parseBlocks, readColumns, readPicture, readTabs, serialize, writeColumns, writePicture, writeTabs, type AtomSyntax, type Block, type TextColor, type CalloutColor, type Tab } from './markdown'
import { fromMarkdown, toMarkdown, replaceRange, splitAt, liftPrefix, joinWithPrevious, joinWithNext, wrapSelection, colorSelection, toggleBox, sliceMarkdown, order, comparePos, select, turnInto, moveBlocks, duplicateBlocks, deleteBlocks, type BlockSelection, type TurnKind, type Pos } from './document'
import { History, type ChangeKind, type Snapshot } from './history'
import { renderBlock, readBlock, offsetIn, pointAt, revealKey, atomElement, type Reveal, type Decoration } from './render'
import { indentBlocks, renumber, toggleCallout, setCallout } from './document'
import { editTable, fromTSV, tableAlignments, tableRows, writeTable, type TableAction } from './table'
import { createControls, type Command, type ToolbarAction } from './controls'
import { paintSelection } from './selection'
import { selectAcrossBlocks } from './span'
import { createCorrection, type Corrector } from './correction'
import { shimmer } from './shimmer'
import { icons } from './icons'
import { createTableOfContents } from './table-of-contents'
import { buttonPartialAtom, createPartialPicker } from './partials'
import { changedWords, createMarks, onlyBox, type AiChange, type Marks } from './marks'
import { openPrompt, glisten, PROMPT_HERE, type OpenPrompt, type PromptAnswer, type Prompter } from './prompt'
import { createCommentsView, type CommentsView } from './comments-view'
import type { AnchoredThread, CommentStore } from './comments'

/**
 * An atom the editor reads and draws: what it is in the text, and how it is
 * drawn into the element Aa gives it. What `draw` returns is called once the
 * atom leaves the page, to stop whatever it started.
 */
export type Atom = AtomSyntax & {
  draw?(element: HTMLElement, source: string): void | (() => void)
  /** A block that starts one, offered in the toolbar and the slash menu: its name, icon and first source. */
  insert?: { label: string; icon: string; source: string; keywords?: string; preview?(element: HTMLElement, context: { input: 'pointer' | 'keyboard' }): void | (() => void) }
}

/** The narrowest a picture is sized to, in squares. */
const PICTURE_MIN = 4

/** One square in pixels where it is drawn, at the page's scale. */
function squareIn(element: HTMLElement): number {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--aa-unit, 20px)'
  element.append(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()
  return width || 20
}

/**
 * The grip on a picture's end edge: pulled, the picture is a whole number of squares wide, from four
 * to as many as its line holds, and let go, its width is written into its Markdown as one step to undo
 * (`aa-atom-source`, handed to the editor). A double press gives the picture back its own size.
 */
function pictureGrip(element: HTMLElement, alt: string, src: string, width: number | null) {
  const grip = document.createElement('span')
  grip.className = 'aa-picture-grip'
  grip.setAttribute('data-aa-interactive', '')
  grip.setAttribute('role', 'separator')
  grip.setAttribute('aria-orientation', 'vertical')
  grip.setAttribute('aria-label', 'Picture width')
  grip.contentEditable = 'false'
  const write = (squares: number | null) => element.dispatchEvent(new CustomEvent('aa-atom-source', { bubbles: true, detail: { source: writePicture(alt, src, squares) } }))
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0 || element.closest('.aa-block')?.getAttribute('data-readonly') === 'true') return
    event.preventDefault(); event.stopPropagation()
    const unit = squareIn(element)
    const start = event.clientX, from = element.getBoundingClientRect().width
    const line = (element.closest('.aa-block') as HTMLElement | null)?.clientWidth ?? from
    const most = Math.max(PICTURE_MIN, Math.floor(line / unit))
    let squares = Math.round(from / unit)
    grip.setPointerCapture(event.pointerId)
    element.setAttribute('data-sizing', '')
    const move = (moved: PointerEvent) => {
      squares = Math.min(most, Math.max(PICTURE_MIN, Math.round((from + moved.clientX - start) / unit)))
      element.style.setProperty('--aa-picture-width', String(squares))
      element.setAttribute('data-width', String(squares))
    }
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up)
      element.removeAttribute('data-sizing')
      if (squares !== width) write(squares)
    }
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up)
  })
  grip.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); if (width !== null) write(null) })
  element.append(grip)
}

/**
 * A drawn picture made sizable: as wide as its Markdown says in squares (`![caption](address "w12")`),
 * or its own size up to sixteen, with the grip that sizes it. For a product's own picture atom too.
 */
export function sizePicture(element: HTMLElement, source: string) {
  const { alt, src, width } = readPicture(source)
  if (width) { element.dataset.width = String(width); element.style.setProperty('--aa-picture-width', String(width)) }
  pictureGrip(element, alt, src, width)
}

/** A picture drawn as itself, as wide as its Markdown says in squares, or its own size up to sixteen. */
export const imageAtom: Atom = {
  ...IMAGE,
  draw(element, source) {
    const { alt, src } = readPicture(source)
    const extension = src.split(/[?#]/)[0].split('.').pop()?.toLowerCase()
    if (/^data:(audio|video)\//.test(src) || (extension && /^(mp4|webm|mov|mp3|wav|ogg|m4a)$/.test(extension))) {
      const media = document.createElement(/^data:video\//.test(src) || /^(mp4|webm|mov)$/.test(extension ?? '') ? 'video' : 'audio')
      media.src = src; media.controls = true; media.preload = 'metadata'
      media.setAttribute('aria-label', alt)
      element.append(media)
    } else {
      const image = document.createElement('img')
      image.src = src; image.alt = alt; image.loading = 'lazy'; image.draggable = false
      element.append(image)
      sizePicture(element, source)
    }
    const caption = document.createElement('span'); caption.className = 'aa-caption'; caption.textContent = alt; caption.contentEditable = 'true'; caption.dataset.placeholder = 'Add a caption'; element.append(caption)
  },
}

export type EditorOptions = {
  value?: string
  readOnly?: boolean
  placeholder?: string
  /**
   * What an empty block shows while the caret is in it, so the slash menu is
   * found without a button beside the block: "Press space for AI or / for commands" where the product answers prompts, "Type / for commands" otherwise, unless set,
   * nothing for ''. Never without menus or in a read-only editor.
   */
  blockPlaceholder?: string
  /** Called after every change the person made, and every correction, with the document as Markdown. */
  onChange?: (value: string) => void
  /** The atoms to read and draw; a picture unless told otherwise. */
  atoms?: readonly Atom[]
  /** Inline DS1 illustrations, inserted with @button. Opt in for documentation. */
  partials?: boolean
  /** Files pasted or dropped into the editor. Without it, they are ignored. */
  onFiles?: (files: File[]) => void
  toolbar?: boolean | readonly ToolbarAction[]
  commands?: readonly Command[]
  blockCommands?: readonly Command[]
  menus?: boolean
  /** Same-flow block shuffling by pointer, keyboard and block commands. Defaults to true. */
  reordering?: boolean
  /** Side/column destinations and external file-drop placement. Defaults to true; paste stays available. */
  placing?: boolean
  drawEquation?: (element: HTMLElement, source: string, display: boolean) => void | (() => void)
  /**
   * Corrects the person's words as they write, in place: Aa sends a block's
   * Markdown once its words rest and puts the answer in, one step to undo.
   * The product makes the call; without it, nothing is corrected.
   */
  correct?: Corrector
  /**
   * Asks AI where the words are: Space in an empty block opens a prompt in a
   * live colour (Space twice listens instead), Enter sends it, and the
   * answer, Markdown, takes the empty block's place as one step to undo. A
   * diagram's board asks it too, for its words written again. The product
   * makes the call; without it, Space is a space.
   */
  prompt?: Prompter
  /** Whether `correct` starts on; `editor.correcting` turns it on and off. */
  correcting?: boolean
  /**
   * Comments on ranges of the text (`src/comments.ts`): the product's store
   * of threads, people and permissions. Aa marks the commented words, keeps
   * the anchors right as the text changes, and draws the threads in a popover
   * at the words or in the store's `panel`. Without it, nothing is commented.
   */
  comments?: CommentStore
}

/** The comments from outside: open a thread, start one on the selection, close what is open. */
export type EditorComments = {
  open(threadId: string): void
  start(): boolean
  close(): boolean
  readonly threads: readonly AnchoredThread[]
}

export type Editor = {
  readonly element: HTMLElement
  value: string
  readOnly: boolean
  placeholder: string
  focus(): void
  blur(): void
  /** Where the selection is, as offsets into `value`; null when it is not in the editor. */
  selection(): { start: number; end: number } | null
  /** Put `text` in place of `value`'s characters from `start` to `end`, the caret after it, as one step to undo. */
  replace(start: number, end: number, text: string): void
  undo(): boolean
  redo(): boolean
  activeBlock(): { index: number; start: number; end: number; block: Block } | null
  selectBlocks(anchor: number, focus?: number): void
  format(mark: 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'link' | 'equation' | 'highlight'): void
  /** Write the selected words in one of `TEXT_COLORS` (`<span color="red">`), or in the text's own colour with `null`. */
  color(color: TextColor | null): void
  turnInto(kind: TurnKind): void
  blockAction(action: 'delete' | 'duplicate' | 'up' | 'down'): void
  /** Move `count` blocks from `from` so the first stands at `to` once they have left; they stay selected, the editor focused. */
  moveBlock(from: number, to: number, count?: number): void
  /** Runtime movement switches; disabling either cancels an active gesture. */
  reordering: boolean
  placing: boolean
  indent(direction: -1 | 1): void
  toggle(open?: boolean): void
  /**
   * Give the callout the caret is in (or the one at `index`) an icon, an emoji
   * or a picture's address (null takes it away), or a colour of `CALLOUT_COLORS`
   * (null the default grey): its brackets are written again, one step to undo.
   */
  callout(head: { icon?: string | null; color?: CalloutColor | null }, index?: number): void
  table(action: TableAction): void
  insertFile(file: File): void
  decorate(ranges: readonly Decoration[], layer?: string): void
  stats(): { words: number; characters: number; blocks: number }
  find(query: string, caseSensitive?: boolean): { start: number; end: number }[]
  selectRange(start: number, end?: number): void
  /** The words from `start` to `end`, offsets into the Markdown, as a range in the page: to stand something over them. */
  rangeOf(start: number, end: number): Range | null
  transaction(action: () => void): void
  setHistoryProvider(provider: { undo(): boolean; redo(): boolean } | null): void
  /** Whether the words are corrected as they are written; always false without `correct`. */
  correcting: boolean
  /**
   * Ask AI about the selected words, from the bar over them: the answer takes
   * their place as one step to undo, and stays selected. False with nothing
   * selected, no `prompt`, or no answer.
   */
  askAbout(said: string): Promise<boolean>
  /** The comments, where the editor has a `comments` store. */
  readonly comments?: EditorComments
  destroy(): void
}

type Selection2 = { anchor: Pos; focus: Pos }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function createEditor(host: HTMLElement, options: EditorOptions = {}): Editor {
  let blocks: Block[] = fromMarkdown(options.value ?? '')
  let readOnly = !!options.readOnly
  let reordering = options.reordering !== false, placing = options.placing !== false
  let placeholder = options.placeholder ?? ''
  // As Notion says it: Space asks AI where the product answers, / opens the commands.
  const blockPlaceholder = options.menus === false ? '' : options.blockPlaceholder ?? (options.prompt ? 'Press space for AI or / for commands' : 'Type / for commands')
  let composing = false
  let destroyed = false
  let selected: BlockSelection | null = null
  let plainPaste = false
  let decorations: readonly Decoration[] = []
  const decorationLayers = new Map<string, readonly Decoration[]>()
  let stopControls = () => {}
  let stopPartials = () => {}
  let transactionDepth = 0
  let historyProvider: { undo(): boolean; redo(): boolean } | null = null
  const contents = new Map<HTMLElement, () => void>()
  const atoms: readonly Atom[] = [...(options.atoms ?? [imageAtom]), ...(options.partials ? [buttonPartialAtom(() => !readOnly)] : []), { ...EQUATION, draw: (element, source) => options.drawEquation ? options.drawEquation(element, source.slice(1, -1), false) : void (element.textContent = source.slice(1, -1)) }, { name: 'equation-block', match: () => 0, draw: (element, source) => options.drawEquation ? options.drawEquation(element, source.replace(/^\$\$\n?|\n?\$\$$/g, ''), true) : void (element.textContent = source.replace(/^\$\$\n?|\n?\$\$$/g, '')) }, { name: 'columns', match: () => 0, draw: (element, source) => drawColumns(element, source), insert: { label: 'Columns', icon: 'column', keywords: 'side by side layout pictures images', source: writeColumns(['', '']) } }, { name: 'toc', match: () => 0, draw: element => drawContents(element), insert: { label: 'Table of contents', icon: 'bullet', keywords: 'toc outline headings navigation', source: '<table_of_contents/>' } }, { name: 'tabs', match: () => 0, draw: (element, source) => drawTabs(element, source), insert: { label: 'Tabs', icon: 'tabs', keywords: 'tab pages sections panels', source: writeTabs([{ name: 'Tab 1', content: '' }, { name: 'Tab 2', content: '' }]) } }]
  function drawContents(element: HTMLElement) {
    const update = createTableOfContents(element, () => blocks, host, index => {
      const target = elements()[index]
      if (!target) return
      target.scrollIntoView({ block: 'start', behavior: 'instant' })
      // Read-only headings can receive focus without becoming editable.
      if (readOnly) target.tabIndex = -1
      target.focus({ preventScroll: true })
      if (!readOnly) {
        const pos = { block: index, offset: blocks[index].prefix }
        setSelection(pos)
        applyReveal({ anchor: pos, focus: pos })
      }
    })
    contents.set(element, update)
    return () => { contents.delete(element) }
  }
  const updateContents = () => { for (const update of contents.values()) update() }

  /**
   * Columns (`<columns>` around a `<column>` each) side by side, each column
   * an editor of its own on the same atoms, so it is written where it stands
   * as any block is. A change in a column hands the whole block back in
   * `aa-atom-change`, one step of undo; the drawing keeps the new source, so
   * the columns and the caret in them stay as they are.
   */
  const columnEditors = new Set<Editor>()
  function drawColumns(element: HTMLElement, source: string) {
    element.classList.add('aa-columns')
    element.setAttribute('data-aa-interactive', '')
    let values = readColumns(source)
    let editors: Editor[] = []
    const changed = () => {
      const written = writeColumns(values)
      element.dataset.source = written
      element.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: written } }))
    }
    const build = () => {
      editors.forEach(editor => { columnEditors.delete(editor); editor.destroy() })
      element.querySelectorAll(':scope > .aa-column').forEach(column => column.remove())
      element.style.setProperty('--aa-columns', String(values.length))
      editors = values.map((value, index) => {
        const column = document.createElement('div')
        column.className = 'aa-column'
        element.append(column)
        const editor = createEditor(column, {
          value,
          readOnly, reordering, placing,
          atoms: options.atoms,
          partials: options.partials,
          drawEquation: options.drawEquation,
          // Files are the page's: they land on its line beside the columns, from where they are carried in.
          blockPlaceholder: '',
          onChange(next) { values[index] = next; changed() },
        })
        columnEditors.add(editor)
        return editor
      })
    }
    // A block carried out of its column, let go on another column: alone in its own, the two trade places.
    // Let go in a gap or past either end: it stands there as a column of its own, and the column it left goes
    // when nothing is left in it. Pictures are put in order sideways.
    const carry = (event: Event) => {
      const { from, slot, swap } = (event as CustomEvent<{ from: number; slot?: number; swap?: number }>).detail
      const columns = Array.from(element.querySelectorAll(':scope > .aa-column'))
      const origin = columns.indexOf((event.target as HTMLElement).closest('.aa-column') as Element)
      if (origin < 0 || !placing || readOnly) return
      event.stopPropagation()
      // Let go on another column, a block alone in its own trades places with it.
      if (swap !== undefined) {
        if (swap === origin || values[swap] === undefined || parseBlocks(values[origin]).length !== 1) return
        const next = [...values]; [next[origin], next[swap]] = [next[swap], next[origin]]
        values = next
        build()
        changed()
        return
      }
      const blocks = parseBlocks(values[origin]), block = blocks[from]
      if (!block || slot === undefined) return
      const rest = serialize(blocks.filter((_, index) => index !== from))
      // The place among the other columns, its own left out when nothing else is in it.
      const next = rest.trim() ? values.map((value, index) => (index === origin ? rest : value)) : values.filter((_, index) => index !== origin)
      next.splice(Math.max(0, Math.min(slot, next.length)), 0, block.source)
      values = next
      build()
      changed()
    }
    element.addEventListener('aa-column-carry', carry)
    build()
    return () => { element.removeEventListener('aa-column-carry', carry); editors.forEach(editor => { columnEditors.delete(editor); editor.destroy() }) }
  }
  /**
   * Tabs (`<tabs>` around a `<tab name="…">` each): a row of Design system 1's
   * text tabs over the open tab's page, an editor of its own on the same atoms,
   * so it is written where it stands. A press on the open tab's name writes it
   * anew in its place; the plus at the row's end adds a tab; Delete on a tab
   * takes it away, its words with it. Each change hands the whole block back in
   * `aa-atom-change`, one step of undo, and the drawing keeps the open tab.
   */
  function drawTabs(element: HTMLElement, source: string) {
    element.classList.add('aa-tabs')
    element.setAttribute('data-aa-interactive', '')
    let tabs: Tab[] = readTabs(source)
    let current = 0
    let page: Editor | null = null
    const row = document.createElement('div')
    row.className = 'aa-tabs-row'
    row.setAttribute('role', 'tablist')
    const panel = document.createElement('div')
    panel.className = 'aa-tab-panel'
    panel.setAttribute('role', 'tabpanel')
    element.append(row, panel)
    const changed = () => {
      const written = writeTabs(tabs)
      element.dataset.source = written
      element.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: written } }))
    }
    const buildRow = () => {
      row.replaceChildren(...tabs.map((tab, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'aa-tab'
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-selected', String(index === current))
        button.tabIndex = index === current ? 0 : -1
        button.dataset.tab = String(index)
        if (tab.icon) { const icon = document.createElement('span'); icon.className = 'aa-tab-icon'; icon.textContent = tab.icon; button.append(icon) }
        const words = document.createElement('span')
        words.className = 'aa-tab-name'
        words.textContent = tab.name || `Tab ${index + 1}`
        button.append(words)
        button.addEventListener('pointerdown', event => { if (index === current && !readOnly) event.preventDefault() })
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation()
          if (index === current && !readOnly) rename(index, button)
          else show(index, true)
        })
        return button
      }))
      if (!readOnly) {
        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'aa-tab aa-tab-add'
        add.setAttribute('aria-label', 'Add tab')
        add.dataset.tooltip = 'Add tab'
        const picture = document.createElement('span')
        picture.className = 'aa-icon'
        const svg = icons['./icons/plus.svg']
        if (svg) picture.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, 'black'))}")`
        add.append(picture)
        add.addEventListener('pointerdown', event => event.preventDefault())
        add.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation()
          tabs = [...tabs, { name: `Tab ${tabs.length + 1}`, content: '' }]
          current = tabs.length - 1
          changed(); build()
          const button = row.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`)
          if (button) rename(current, button)
        })
        row.append(add)
      }
    }
    /** The open tab's name written anew in its place: Enter keeps it, Escape leaves it as it was. */
    const rename = (index: number, button: HTMLButtonElement) => {
      const words = button.querySelector<HTMLElement>('.aa-tab-name')
      if (!words) return
      const field = document.createElement('input')
      field.type = 'text'
      field.className = 'aa-tab-field'
      field.value = tabs[index].name
      field.setAttribute('aria-label', 'Tab name')
      field.size = Math.max(1, tabs[index].name.length || 5)
      let done = false
      const finish = (keep: boolean) => {
        if (done) return
        done = true
        const name = field.value.trim()
        field.replaceWith(words)
        if (keep && name !== tabs[index].name) { tabs = tabs.map((tab, at) => at === index ? { ...tab, name } : tab); changed(); buildRow() }
        row.querySelector<HTMLButtonElement>(`[data-tab="${index}"]`)?.focus({ preventScroll: true })
      }
      field.addEventListener('input', () => { field.size = Math.max(1, field.value.length || 1) })
      field.addEventListener('keydown', event => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); finish(true) }
        if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      })
      field.addEventListener('blur', () => finish(true))
      field.addEventListener('pointerdown', event => event.stopPropagation())
      field.addEventListener('click', event => event.stopPropagation())
      words.replaceWith(field)
      field.focus(); field.select()
    }
    const show = (index: number, focus = false) => {
      current = Math.max(0, Math.min(tabs.length - 1, index))
      if (page) { columnEditors.delete(page); page.destroy(); page = null }
      panel.replaceChildren()
      buildRow()
      page = createEditor(panel, {
        value: tabs[current]?.content ?? '',
        readOnly, reordering, placing,
        atoms: options.atoms,
          partials: options.partials,
        drawEquation: options.drawEquation,
        blockPlaceholder: '',
        onChange(next) { tabs = tabs.map((tab, at) => at === current ? { ...tab, content: next } : tab); changed() },
      })
      columnEditors.add(page)
      if (focus) row.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`)?.focus({ preventScroll: true })
    }
    const build = () => show(current)
    // The row's keys: arrows step along the tabs, Enter or F2 names the open one, Delete takes it away.
    row.addEventListener('keydown', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.aa-tab[data-tab]')
      if (!button || !row.contains(button)) return
      const index = Number(button.dataset.tab)
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation()
        show((index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true)
      } else if ((event.key === 'Enter' || event.key === 'F2') && !readOnly) {
        event.preventDefault(); event.stopPropagation(); rename(index, button)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !readOnly && tabs.length > 1) {
        event.preventDefault(); event.stopPropagation()
        tabs = tabs.filter((_, at) => at !== index)
        current = Math.min(index, tabs.length - 1)
        changed(); show(current, true)
      }
    })
    build()
    return () => { if (page) { columnEditors.delete(page); page.destroy(); page = null } }
  }
  const drawn = new Map<HTMLElement, (() => void) | void>()
  const drawAtom = (name: string, source: string) => {
    const element = atomElement(name, source)
    const atom = atoms.find(candidate => candidate.name === name)
    if (atom?.draw) drawn.set(element, atom.draw(element, source))
    else element.textContent = source
    element.querySelectorAll<HTMLElement>('.aa-caption').forEach(caption => caption.contentEditable = readOnly ? 'false' : 'true')
    return element
  }
  /** Stop the atoms that are no longer on the page. */
  const sweep = (all = false) => {
    for (const [element, stop] of drawn) {
      if (!all && host.contains(element)) continue
      drawn.delete(element)
      stop?.()
    }
  }
  const draw = (element: HTMLElement, block: Block, reveal: Reveal) => {
    element.dataset.readonly = String(readOnly)
    renderBlock(element, block, reveal, atoms, drawAtom, decorationsFor(block))
  }
  /** The decorations a block shows, in its own offsets. */
  const decorationsFor = (block: Block): Decoration[] => {
    if (!decorations.length) return []
    const index = blocks.indexOf(block)
    const offset = index < 0 ? 0 : offsetOf({ block: index, offset: 0 })
    return decorations.map(range => ({ ...range, from: range.from - offset, to: range.to - offset }))
  }
  const history = new History({ blocks, anchor: { block: 0, offset: 0 }, focus: { block: 0, offset: 0 } })

  host.classList.add('aa')
  host.setAttribute('role', 'textbox')
  host.setAttribute('aria-multiline', 'true')
  /** What a screen reader is told beside the text: whether it can be changed, and the placeholder. */
  const describe = () => {
    host.setAttribute('aria-readonly', String(readOnly))
    if (placeholder) host.setAttribute('aria-placeholder', placeholder)
    else host.removeAttribute('aria-placeholder')
  }
  describe()

  const elements = () => Array.from(host.children) as HTMLElement[]

  /**
   * A block's element, drawn. Given the element it replaces, its atoms come
   * along first, so an atom drawn whole that edits itself (columns, tabs, a
   * diagram's board, the ones marked data-aa-interactive) and hands a change
   * back is kept with its editors rather than drawn anew (renderBlock keeps an
   * atom whose source is unchanged). A picture is drawn again, its grip's
   * width with it.
   */
  const makeElement = (block: Block, previous?: HTMLElement): HTMLElement => {
    const element = document.createElement('div')
    element.contentEditable = readOnly ? 'false' : 'true'
    if (previous) element.append(...Array.from(previous.querySelectorAll<HTMLElement>(':scope > .aa-atom[data-aa-interactive]')))
    draw(element, block, null)
    return element
  }

  /**
   * An empty document shows the product's placeholder; an empty paragraph
   * with the caret in it says how to reach the styles.
   */
  // The selection is read in the body, never as a default parameter: a product
  // bundling the built aa.js with Rolldown (Vite+) binds a default that calls a
  // function declared later in the same `let` to a same-named outer function,
  // and the editor throws as it draws.
  /**
   * The caret at a sentence's end in a paragraph or a bullet, as English sets
   * one: after its full stop, question or exclamation mark and one space,
   * nothing after it; or in a bullet with nothing written yet. There Space
   * asks AI to go on, where the product answers prompts.
   */
  const atSentence = (selection: Selection2 | null): boolean => {
    if (!selection || !options.prompt || readOnly || selected || composing || comparePos(selection.anchor, selection.focus) !== 0) return false
    const block = blocks[selection.focus.block]
    if (!block || selection.focus.offset !== block.source.length) return false
    if (block.kind === 'bullet' && block.source.length === block.prefix) return true
    return (block.kind === 'paragraph' || block.kind === 'bullet') && /[^\s][.!?]["”’)]? $/.test(block.source)
  }

  const showPlaceholder = (selection?: Selection2 | null) => {
    if (selection === undefined) selection = readSelection()
    const sentence = atSentence(selection) ? selection!.focus.block : -1
    const caret = selection && !selected && !readOnly && comparePos(selection.anchor, selection.focus) === 0 ? selection.focus.block : -1
    elements().forEach((element, index) => {
      const block = blocks[index]
      const text = blocks.length === 1 && !block.source && placeholder ? placeholder : index === caret && !block.source && block.kind === 'paragraph' ? blockPlaceholder : ''
      if (text) element.dataset.placeholder = text
      else if (element.dataset.placeholder !== undefined) delete element.dataset.placeholder
      // At a sentence's end, only the AI is offered, never the commands.
      if (index === sentence) element.dataset.hint = 'Press space for AI'
      else if (element.dataset.hint !== undefined) delete element.dataset.hint
    })
  }

  const renderAll = () => {
    host.replaceChildren(...blocks.map(block => makeElement(block)))
    updateContents()
    showPlaceholder()
    sweep()
  }

  /** Bring the DOM to the new blocks, touching only the blocks that changed. */
  const syncDom = (next: Block[]) => {
    const old = blocks
    const els = elements()
    let start = 0
    while (start < old.length && start < next.length && old[start] === next[start]) start++
    let endOld = old.length, endNew = next.length
    while (endOld > start && endNew > start && old[endOld - 1] === next[endNew - 1]) { endOld--; endNew-- }
    blocks = next
    // The same number of blocks changed as were there: each fresh element takes over its atoms, and the focus in one of them with its selection.
    const same = endOld - start === endNew - start
    const selection = document.getSelection()
    const focused = document.activeElement as HTMLElement | null
    const saved = same && focused && host.contains(focused) && focused.closest('.aa-atom')
      ? { focused, ...(selection?.rangeCount ? { anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset, focusNode: selection.focusNode, focusOffset: selection.focusOffset } : {}) }
      : null
    const fresh = next.slice(start, endNew).map((block, i) => makeElement(block, same ? els[start + i] : undefined))
    const anchor = els[endOld] ?? null
    for (let i = start; i < endOld; i++) els[i].remove()
    for (const element of fresh) host.insertBefore(element, anchor)
    if (saved && host.contains(saved.focused) && document.activeElement !== saved.focused) {
      saved.focused.focus({ preventScroll: true })
      if (saved.anchorNode && saved.focusNode && saved.focused.contains(saved.focusNode)) {
        try { selection!.setBaseAndExtent(saved.anchorNode, saved.anchorOffset!, saved.focusNode, saved.focusOffset!) } catch { /* the nodes moved on */ }
      }
    }
    updateContents()
    showPlaceholder()
    sweep()
    marks?.draw()
  }

  // ----- the selection -----

  const blockIndexOf = (node: Node | null): number => {
    const element = node instanceof HTMLElement ? node : node?.parentElement ?? null
    const block = element?.closest('.aa-block')
    if (!block || block.parentElement !== host) return -1
    return elements().indexOf(block as HTMLElement)
  }

  /** A caption, or an atom that edits itself where it is drawn (a diagram's board), has the keys: the caret is not the editor's. */
  const ownControl = () => !!document.activeElement?.closest?.('.aa-caption, [data-aa-interactive]')
  const readSelection = (): Selection2 | null => {
    if (ownControl()) return null
    if (selected) {
      const first = Math.min(selected.anchor, selected.focus), last = Math.max(selected.anchor, selected.focus)
      return { anchor: { block: first, offset: 0 }, focus: { block: last, offset: blocks[last].source.length } }
    }
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) return null
    const a = blockIndexOf(selection.anchorNode), f = blockIndexOf(selection.focusNode)
    if (a < 0 || f < 0) return null
    const els = elements()
    return {
      anchor: { block: a, offset: offsetIn(els[a], selection.anchorNode, selection.anchorOffset) },
      focus: { block: f, offset: offsetIn(els[f], selection.focusNode, selection.focusOffset) },
    }
  }

  let settingSelection = false
  const setSelection = (anchor: Pos, focus: Pos = anchor) => {
    const els = elements()
    const a = pointAt(els[anchor.block], Math.min(anchor.offset, blocks[anchor.block].source.length))
    const f = pointAt(els[focus.block], Math.min(focus.offset, blocks[focus.block].source.length))
    const selection = window.getSelection()
    if (!selection) return
    settingSelection = true
    try { selection.setBaseAndExtent(a.node, a.offset, f.node, f.offset) } finally { settingSelection = false }
  }

  const revealFor = (index: number, selection: Selection2 | null): Reveal => {
    if (!selection) return null
    const [a, b] = order(selection.anchor, selection.focus)
    if (index < a.block || index > b.block) return null
    return { from: index === a.block ? a.offset : 0, to: index === b.block ? b.offset : blocks[index].source.length }
  }

  /** Draw again every block whose shown syntax changed with the selection. */
  const applyReveal = (selection?: Selection2 | null) => {
    if (selection === undefined) selection = readSelection()
    if (composing) return
    const els = elements()
    let changed = false
    blocks.forEach((block, index) => {
      const reveal = revealFor(index, selection)
      if (els[index].dataset.reveal === revealKey(block, reveal, atoms)) return
      draw(els[index], block, reveal)
      changed = true
    })
    if (changed) {
      sweep()
      if (selection) setSelection(selection.anchor, selection.focus)
    }
    handToAtom(selection)
  }

  /**
   * The caret come into a block an atom draws whole and changes itself (a
   * diagram's board) is that atom's: it takes the keys, and gives them back
   * in `aa-atom-leave`.
   */
  const handToAtom = (selection: Selection2 | null) => {
    if (!selection || readOnly || selected || comparePos(selection.anchor, selection.focus) !== 0) return
    const index = selection.focus.block
    if (!fencedAtom(blocks[index], atoms)) return
    elements()[index]?.querySelector<HTMLElement>('[data-aa-interactive]')?.focus({ preventScroll: true })
  }

  // ----- offsets into the Markdown -----

  /** What stands between two blocks in the Markdown: a line break between bullets, a blank line otherwise. */
  const gap = (index: number) => blocks[index].kind === 'bullet' && blocks[index + 1]?.kind === 'bullet' ? 1 : 2
  const offsetOf = (pos: Pos) => {
    let at = 0
    for (let i = 0; i < pos.block; i++) at += blocks[i].source.length + gap(i)
    return at + pos.offset
  }
  const posOf = (offset: number): Pos => {
    let at = 0
    for (let i = 0; i < blocks.length; i++) {
      const end = at + blocks[i].source.length
      if (offset <= end || i === blocks.length - 1) return { block: i, offset: Math.max(0, Math.min(offset - at, blocks[i].source.length)) }
      // An offset between two blocks belongs to the end of the first.
      if (offset < end + gap(i)) return { block: i, offset: blocks[i].source.length }
      at = end + gap(i)
    }
    return { block: 0, offset: 0 }
  }

  // ----- changes -----

  const snapshot = (anchor: Pos, focus: Pos): Snapshot => ({ blocks, anchor, focus })

  const commit = (next: Block[], anchor: Pos, focus: Pos, kind: ChangeKind) => {
    const before = blocks, focused = host.contains(document.activeElement)
    clearBlocks()
    const numbered = renumber(next)
    const adjust = (pos: Pos) => ({ ...pos, offset: Math.max(0, pos.offset + numbered[pos.block].prefix - next[pos.block].prefix) })
    anchor = adjust(anchor); focus = adjust(focus)
    syncDom(numbered)
    setSelection(anchor, focus)
    applyReveal({ anchor, focus })
    showPlaceholder({ anchor, focus })
    keepCaretInView(focused)
    if (!transactionDepth) {
      history.record(snapshot(anchor, focus), kind)
      options.onChange?.(toMarkdown(blocks))
      host.dispatchEvent(new Event('aa-change'))
      correction?.written(before, kind !== 'edit')
    }
  }

  const restore = (state: Snapshot) => {
    const focused = host.contains(document.activeElement)
    // Undone on a diagram's board, the board keeps the keys: the change is drawn again, not opened as words.
    const onBoard = !!document.activeElement?.closest?.('[data-aa-interactive]')
    clearBlocks()
    syncDom(state.blocks)
    if (onBoard) applyReveal(null)
    else {
      setSelection(state.anchor, state.focus)
      applyReveal({ anchor: state.anchor, focus: state.focus })
      keepCaretInView(focused)
    }
    options.onChange?.(toMarkdown(blocks))
    host.dispatchEvent(new Event('aa-change'))
  }

  const undo = () => { if (readOnly) return false; correction?.undoing(); if (historyProvider) return historyProvider.undo(); const state = history.undo(); if (state) restore(state); return !!state }
  const redo = () => { if (readOnly) return false; correction?.stop(); if (historyProvider) return historyProvider.redo(); const state = history.redo(); if (state) restore(state); return !!state }

  /** The block the browser just changed, read back into the document. */
  const readBack = (element: HTMLElement) => {
    const index = elements().indexOf(element)
    if (index < 0) return
    const raw = readBlock(element)
    const text = raw.replace(/^\[\] /, '- [ ] ')
    if (text === blocks[index].source) return
    const kind: ChangeKind = text.length < blocks[index].source.length ? 'delete' : 'type'
    const selection = readSelection()
    const { blocks: next, caret } = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: blocks[index].source.length }, text)
    const within = (pos: Pos): Pos => pos.block !== index ? { ...pos, block: pos.block + (next.length - blocks.length) * (pos.block > index ? 1 : 0) } : mapOffset(next, index, caret, text, pos.offset)
    const adjust = (pos: Pos) => text !== raw && pos.block === index ? { ...pos, offset: pos.offset + text.length - raw.length } : pos
    const anchor = selection ? within(adjust(selection.anchor)) : caret
    const focus = selection ? within(adjust(selection.focus)) : caret
    commit(next, anchor, focus, kind)
  }

  /** An offset into the text a block became, as a position in the blocks it was read into. */
  const mapOffset = (next: Block[], index: number, last: Pos, text: string, offset: number): Pos => {
    let at = 0
    for (let i = index; i <= last.block; i++) {
      const length = next[i].source.length
      if (offset <= at + length) return { block: i, offset: Math.max(0, offset - at) }
      at = text.indexOf(next[i + 1]?.source ?? '', at + length)
      if (at < 0) break
    }
    return last
  }

  const insert = (selection: Selection2, text: string, kind: ChangeKind = 'edit') => {
    const { blocks: next, caret } = replaceRange(blocks, selection.anchor, selection.focus, text)
    commit(next, caret, caret, kind)
  }

  // ----- correction -----

  /**
   * A block's words corrected, put in as an edit from outside: the block is
   * drawn again in its own element and no other, the caret and focus stay
   * among the same words, it is a step of its own to undo, and the words it
   * changed shimmer once.
   */
  const shimmers = new Set<() => void>()
  const correctBlock = (index: number, source: string, shift: (offset: number) => number, changed: readonly [number, number][]) => {
    const selection = readSelection(), focused = host.contains(document.activeElement)
    const { blocks: next } = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: blocks[index].source.length }, source)
    if (next.length !== blocks.length) return
    const keep = (pos: Pos): Pos => pos.block === index ? { block: index, offset: shift(pos.offset) } : pos
    const end = { block: index, offset: next[index].source.length }
    const anchor = selection ? keep(selection.anchor) : end, focus = selection ? keep(selection.focus) : end
    blocks = next
    draw(elements()[index], blocks[index], revealFor(index, selection && { anchor, focus }))
    updateContents()
    sweep()
    // Put back only where it was drawn away, and only while the editor has the focus, which setting a selection could otherwise take.
    const touched = !!selection && Math.min(selection.anchor.block, selection.focus.block) <= index && Math.max(selection.anchor.block, selection.focus.block) >= index
    if (touched && focused) setSelection(anchor, focus)
    const stop = shimmer(elements()[index], changed)
    shimmers.add(stop); setTimeout(() => shimmers.delete(stop), 2000)
    history.record(snapshot(anchor, focus), 'edit')
    options.onChange?.(toMarkdown(blocks))
    host.dispatchEvent(new CustomEvent('aa-change', { detail: { correction: true } }))
  }
  const spellcheck = host.getAttribute('spellcheck')
  /** Correcting, the browser's own marks and suggestions are left out: the words are corrected, not underlined. */
  const markSpelling = (on: boolean) => { if (on) host.setAttribute('spellcheck', 'false'); else if (spellcheck === null) host.removeAttribute('spellcheck'); else host.setAttribute('spellcheck', spellcheck) }
  const correction = options.correct ? createCorrection({
    blocks: () => blocks,
    atoms,
    selection: readSelection,
    busy: () => readOnly || composing || destroyed || transactionDepth > 0,
    apply: correctBlock,
    value: () => toMarkdown(blocks),
  }, options.correct, options.correcting !== false) : null
  if (correction?.enabled) markSpelling(true)

  // ----- events -----

  /**
   * Backspace or Delete with the caret on a block's edge: a heading's, bullet's
   * or quote's prefix comes off first, then the block joins its neighbour. A
   * table cell's edge holds. True when the key is taken here.
   */
  const deleteAtEdge = (selection: Selection2, direction: 'backward' | 'forward'): boolean => {
    const [a, b] = order(selection.anchor, selection.focus)
    if (a.block !== b.block || a.offset !== b.offset) return false
    const block = blocks[a.block]
    if (block.kind === 'table') {
      const cell = tableRows(block.source).flat().find(cell => a.offset >= cell.from && a.offset <= cell.to)
      return !!cell && (direction === 'backward' ? a.offset === cell.from : a.offset === cell.to)
    }
    if (direction === 'backward') {
      if (a.offset <= block.prefix) {
        const change = liftPrefix(blocks, a.block)
        if (change) { commit(change.blocks, change.caret, change.caret, 'edit'); return true }
      }
      if (a.offset !== 0) return false
      const change = joinWithPrevious(blocks, a.block)
      if (change) commit(change.blocks, change.caret, change.caret, 'edit')
      return true
    }
    if (a.offset !== block.source.length) return false
    const change = joinWithNext(blocks, a.block)
    if (change) commit(change.blocks, change.caret, change.caret, 'edit')
    return true
  }

  const onBeforeInput = (event: InputEvent) => {
    if (destroyed) return
    if (readOnly) { event.preventDefault(); return }
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const type = event.inputType
    if (type === 'historyUndo') { event.preventDefault(); undo(); return }
    if (type === 'historyRedo') { event.preventDefault(); redo(); return }
    if (composing || event.isComposing) return
    const selection = readSelection()
    if (!selection) return
    if (selected && type.startsWith('insert')) { event.preventDefault(); insert(selection, event.data ?? '', 'edit'); return }
    const [a, b] = order(selection.anchor, selection.focus)
    const spanning = a.block !== b.block
    const collapsed = !spanning && a.offset === b.offset
    const block = blocks[a.block]
    // A phone's keyboard may say the Space in beforeinput alone, its keydown unnamed: it asks AI as the key does.
    if (type === 'insertText' && (event.data === ' ' || event.data === '\u00a0') && options.prompt && collapsed) {
      if (block.kind === 'paragraph' && !block.source) { event.preventDefault(); ask(a.block); return }
      if (atSentence(selection)) { event.preventDefault(); ask(a.block, true); return }
    }
    if (block.kind === 'table') {
      const cell = tableRows(block.source).flat().find(cell => a.offset >= cell.from && a.offset <= cell.to)
      if (cell && collapsed && ((type === 'deleteContentBackward' && a.offset === cell.from) || (type === 'deleteContentForward' && a.offset === cell.to))) { event.preventDefault(); return }
    }
    switch (type) {
      // Enter is handled on keydown, where Shift can be read. A line break
      // arriving here came some other way (a keyboard that composes, say) and
      // is Enter: the block is plain text to the browser, so it never says
      // insertParagraph.
      case 'insertParagraph':
      case 'insertLineBreak':
        event.preventDefault()
        enter(selection)
        return
      case 'insertFromPaste': {
        event.preventDefault()
        const text = event.dataTransfer?.getData('text/plain') ?? ''
        if (text) insert(selection, text.replace(/\r\n?/g, '\n'))
        return
      }
      case 'insertFromDrop':
        event.preventDefault()
        return
      case 'deleteContentBackward': {
        if (!collapsed) { event.preventDefault(); insert(selection, ''); return }
        if (deleteAtEdge(selection, 'backward')) event.preventDefault()
        return
      }
      case 'deleteContentForward': {
        if (!collapsed) { event.preventDefault(); insert(selection, ''); return }
        if (deleteAtEdge(selection, 'forward')) event.preventDefault()
        return
      }
      case 'deleteByCut':
        event.preventDefault()
        return
      case 'formatBold': event.preventDefault(); wrap(selection, '**'); return
      case 'formatItalic': event.preventDefault(); wrap(selection, '*'); return
      case 'formatStrikeThrough': event.preventDefault(); wrap(selection, '~~'); return
      default:
        if (!spanning) return
        event.preventDefault()
        if (type.startsWith('insert')) insert(selection, event.data ?? '', 'type')
        else if (type.startsWith('delete')) insert(selection, '')
    }
  }

  const onInput = (event: Event) => {
    if (destroyed || readOnly) return
    if (composing || (event instanceof InputEvent && event.isComposing)) return
    const caption = (event.target as HTMLElement).closest?.('.aa-caption') as HTMLElement | null
    if (caption) {
      const atom = caption.closest('.aa-atom') as HTMLElement
      const blockElement = atom.closest('.aa-block') as HTMLElement
      const index = elements().indexOf(blockElement)
      const source = atom.dataset.source ?? ''
      const nextSource = source.replace(/^!\[[^\]]*\]/, `![${(caption.textContent ?? '').replace(/\]/g, '').replace(/\n/g, ' ')}]`)
      atom.dataset.source = nextSource
      const next = [...blocks]
      next[index] = { ...blocks[index], source: readBlock(blockElement) }
      blocks = next
      updateContents()
      const pos = { block: index, offset: offsetIn(blockElement, atom, 1) }
      history.record(snapshot(pos, pos), 'type')
      options.onChange?.(toMarkdown(blocks)); host.dispatchEvent(new Event('aa-change'))
      return
    }
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
  }

  /** Enter: the block ends here and the next begins; with Shift, a line break within it. */
  const enter = (selection: Selection2, soft = false) => {
    if (blocks[selection.focus.block].kind === 'table') {
      const index = selection.focus.block
      const next = [...blocks.slice(0, index + 1), { kind: 'paragraph' as const, source: '', prefix: 0 }, ...blocks.slice(index + 1)]
      const pos = { block: index + 1, offset: 0 }
      commit(next, pos, pos, 'edit'); return
    }
    if (blocks[selection.focus.block].kind === 'callout' && !soft) { insert(selection, '\n> '); return }
    if (soft) { insert(selection, '\n'); return }
    const [a, b] = order(selection.anchor, selection.focus)
    let current = blocks, pos = a
    if (comparePos(a, b) !== 0) ({ blocks: current, caret: pos } = replaceRange(blocks, a, b, ''))
    const change = splitAt(current, pos)
    commit(change.blocks, change.caret, change.caret, 'edit')
  }

  const wrap = (selection: Selection2, delimiter: string, closing = delimiter) => {
    const wrapped = wrapSelection(blocks, selection.anchor, selection.focus, delimiter, closing)
    if (wrapped) commit(wrapped.blocks, wrapped.anchor, wrapped.focus, 'edit')
  }

  const insertLink = (selection: Selection2) => {
    const [a, b] = order(selection.anchor, selection.focus)
    if (a.block !== b.block) return
    let start = a.offset, end = b.offset, text = blocks[a.block].source.slice(start, end), url = ''
    for (const match of blocks[a.block].source.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
      if (a.offset >= match.index! && b.offset <= match.index! + match[0].length) {
        start = match.index!; end = start + match[0].length; text = match[1]; url = match[2]; break
      }
    }
    host.dispatchEvent(new CustomEvent('aa-link-request', { detail: { start: offsetOf({ block: a.block, offset: start }), end: offsetOf({ block: a.block, offset: end }), text, url } }))
  }

  const caretRect = (): DOMRect | null => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return null
    const range = selection.getRangeAt(0)
    const rects = range.getClientRects()
    if (rects.length) return rects[rects.length - 1]
    const rect = range.getBoundingClientRect()
    if (rect.height) return rect
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      const probe = document.createRange()
      probe.setStart(node, range.startOffset - 1)
      probe.setEnd(node, range.startOffset)
      const probed = probe.getClientRects()
      if (probed.length) return probed[probed.length - 1]
    }
    const element = node instanceof HTMLElement ? node : node.parentElement
    return element?.getBoundingClientRect() ?? null
  }

  /** How far a view must move to show `start`–`end`: nothing while it is in view, the start first when it does not fit. */
  const nearest = (start: number, end: number, viewStart: number, viewEnd: number) =>
    start < viewStart ? start - viewStart : end > viewEnd ? Math.min(end - viewEnd, start - viewStart) : 0

  /**
   * Keep the caret on screen after Aa moves it itself, as the browser does
   * after its own typing: each box that scrolls, then the page, moves just far
   * enough to show it, and nothing moves while it is in view. Only while the
   * editor has the focus, or had it when the change began, since a block
   * drawn again can take the focus with it.
   */
  const keepCaretInView = (focused = host.contains(document.activeElement)) => {
    if (!focused) return
    const rect = caretRect()
    const node = window.getSelection()?.focusNode
    if (!rect || !node || !host.contains(node) || (!rect.width && !rect.height && !rect.top && !rect.left)) return
    let { top, bottom, left, right } = rect
    for (let box = node instanceof HTMLElement ? node : node.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      const style = getComputedStyle(box)
      const scrollsY = /auto|scroll|overlay/.test(style.overflowY) && box.scrollHeight > box.clientHeight
      const scrollsX = /auto|scroll|overlay/.test(style.overflowX) && box.scrollWidth > box.clientWidth
      if (!scrollsY && !scrollsX) continue
      const edges = box.getBoundingClientRect()
      const viewTop = edges.top + box.clientTop, viewLeft = edges.left + box.clientLeft
      const dy = scrollsY ? nearest(top, bottom, viewTop, viewTop + box.clientHeight) : 0
      const dx = scrollsX ? nearest(left, right, viewLeft, viewLeft + box.clientWidth) : 0
      if (!dx && !dy) continue
      const fromTop = box.scrollTop, fromLeft = box.scrollLeft
      box.scrollBy({ top: dy, left: dx, behavior: 'instant' })
      top -= box.scrollTop - fromTop; bottom -= box.scrollTop - fromTop
      left -= box.scrollLeft - fromLeft; right -= box.scrollLeft - fromLeft
    }
    // The visual viewport, so a phone's keyboard does not cover the caret.
    const view = window.visualViewport
    const viewTop = view?.offsetTop ?? 0, viewLeft = view?.offsetLeft ?? 0
    const dy = nearest(top, bottom, viewTop, viewTop + (view?.height ?? window.innerHeight))
    const dx = nearest(left, right, viewLeft, viewLeft + (view?.width ?? window.innerWidth))
    if (dx || dy) window.scrollBy({ top: dy, left: dx, behavior: 'instant' })
  }

  /** Put the caret in a block at the point under `x`, on its first or last line. */
  const placeAt = (index: number, x: number, edge: 'top' | 'bottom') => {
    const element = elements()[index]
    const rect = element.getBoundingClientRect()
    const y = edge === 'top' ? rect.top + 2 : rect.bottom - 2
    let node: Node | null = null, offset = 0
    const caretPositionFromPoint = (document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint
    if (caretPositionFromPoint) { const position = caretPositionFromPoint.call(document, x, y); if (position) { node = position.offsetNode; offset = position.offset } }
    else if (document.caretRangeFromPoint) { const range = document.caretRangeFromPoint(x, y); if (range) { node = range.startContainer; offset = range.startOffset } }
    const pos: Pos = node && element.contains(node) ? { block: index, offset: offsetIn(element, node, offset) } : { block: index, offset: edge === 'top' ? startOf(index) : blocks[index].source.length }
    setSelection(pos)
    applyReveal({ anchor: pos, focus: pos })
    keepCaretInView()
  }

  /** Where writing starts in a block: after its prefix. */
  const startOf = (index: number) => {
    const block = blocks[index]
    return block.kind === 'code' || block.kind === 'divider' ? 0 : block.prefix
  }

  const clearBlocks = () => {
    selected = null
    for (const element of elements()) element.removeAttribute('data-selected')
  }
  const selectBlocks = (anchor: number, focus = anchor) => {
    selected = select(blocks, anchor, focus)
    const first = Math.min(selected.anchor, selected.focus), last = Math.max(selected.anchor, selected.focus)
    setSelection({ block: first, offset: 0 }, { block: last, offset: blocks[last].source.length })
    applyReveal()
    elements().forEach((element, index) => element.toggleAttribute('data-selected', index >= first && index <= last))
  }
  const changeBlocks = (action: 'delete' | 'duplicate' | 'up' | 'down', range: BlockSelection) => {
    if (!reordering && (action === 'up' || action === 'down')) return
    const first = Math.min(range.anchor, range.focus), last = Math.max(range.anchor, range.focus)
    const change = action === 'delete' ? deleteBlocks(blocks, range) : action === 'duplicate' ? duplicateBlocks(blocks, range) : moveBlocks(blocks, range, action === 'up' ? -1 : 1)
    if (!change) return
    commit(change.blocks, change.caret, change.caret, 'edit')
    if (action !== 'delete') selectBlocks(change.caret.block, change.caret.block + last - first)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (destroyed || readOnly || composing || event.isComposing || event.defaultPrevented) return
    const caption = (event.target as HTMLElement).closest?.('.aa-caption')
    if (caption) {
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); const range = document.createRange(); range.selectNodeContents(caption)
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
        return
      }
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); (event.target as HTMLElement).blur() }
      return
    }
    const mod = isMac ? event.metaKey : event.ctrlKey
    if (mod && !event.altKey && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
    const selection = readSelection()
    if (!selection) return
    const key = event.key.toLowerCase()
    plainPaste = false
    if (mod && event.shiftKey && key === 'v') { plainPaste = true; return }
    // Escape clears transient selection without turning it into a selected block.
    if (mod && event.shiftKey && !event.altKey && key === 'm' && comments) { event.preventDefault(); comments.start(); return }
    if (event.key === 'Escape') {
      const closed = comments?.close(), marked = !!marks?.size
      if (!closed && !marked && !selected && comparePos(selection.anchor, selection.focus) === 0) return
      event.preventDefault(); event.stopPropagation(); marks?.clear(); clearBlocks(); setSelection(selection.focus); applyReveal({ anchor: selection.focus, focus: selection.focus }); return
    }
    if (event.key === ' ' && options.prompt && !mod && !event.altKey && !event.shiftKey && !selected && comparePos(selection.anchor, selection.focus) === 0) {
      const block = blocks[selection.focus.block]
      if (block.kind === 'paragraph' && !block.source) { event.preventDefault(); ask(selection.focus.block); return }
      if (atSentence(selection)) { event.preventDefault(); ask(selection.focus.block, true); return }
    }
    // Safari sends no beforeinput for Backspace or Delete with nothing to
    // delete inside the block (at the start of an empty block, say), so the
    // keys that cross a block's edge are taken here too.
    if ((event.key === 'Backspace' || event.key === 'Delete') && !selected && !mod && !event.altKey && !event.shiftKey) {
      if (deleteAtEdge(selection, event.key === 'Backspace' ? 'backward' : 'forward')) { event.preventDefault(); return }
    }
    // ⌘A selects words, as a word processor does: the block's (a table cell's), then all of the writing. Never the blocks themselves.
    if (mod && key === 'a' && !event.altKey) {
      event.preventDefault()
      const index = selection.focus.block, block = blocks[index]
      const cell = block.kind === 'table' && !selected ? tableRows(block.source).flat().find(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to) : null
      const from = cell ? cell.from : startOf(index), to = cell ? cell.to : block.source.length
      const [a, b] = order(selection.anchor, selection.focus)
      const whole = a.block === index && b.block === index && a.offset <= from && b.offset >= to
      const last = blocks.length - 1
      const all = !!selected || whole
      clearBlocks()
      if (!all) { setSelection({ block: index, offset: from }, { block: index, offset: to }); applyReveal(); return }
      const end = { block: last, offset: blocks[last].source.length }
      setSelection({ block: 0, offset: startOf(0) }, end)
      // A table at either end cannot hold its edge as words: then all the blocks are selected instead.
      const read = readSelection(), [first, final] = read ? order(read.anchor, read.focus) : []
      if (!first || !final || first.block !== 0 || first.offset > startOf(0) || comparePos(final, end) !== 0) selectBlocks(0, last)
      else applyReveal()
      return
    }
    const range = selected ?? select(blocks, selection.anchor.block, selection.focus.block)
    const tableBlock = blocks[selection.focus.block]
    if (tableBlock.kind === 'table' && !mod && !event.shiftKey && selection.anchor.offset === selection.focus.offset && /^Arrow/.test(event.key)) {
      const rows = tableRows(tableBlock.source), cells = rows.flat()
      const index = cells.findIndex(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to)
      const cell = cells[index]
      let next: typeof cell | undefined
      if (cell && event.key === 'ArrowLeft' && selection.focus.offset === cell.from) next = cells[index - 1]
      if (cell && event.key === 'ArrowRight' && selection.focus.offset === cell.to) next = cells[index + 1]
      if (cell && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) next = cells[index + (event.key === 'ArrowUp' ? -rows[0].length : rows[0].length)]
      if (next) { event.preventDefault(); const pos = { block: selection.focus.block, offset: event.key === 'ArrowLeft' ? next.to : next.from }; elements()[pos.block].querySelectorAll<HTMLElement>('[data-cell]')[cells.indexOf(next)]?.focus(); setSelection(pos); return }
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
      const block = blocks[selection.focus.block]
      if (block.kind === 'table') {
        event.preventDefault()
        const cells = tableRows(block.source).flat()
        const current = cells.findIndex(cell => selection.focus.offset >= cell.from && selection.focus.offset <= cell.to)
        const next = cells[current + (event.shiftKey ? -1 : 1)]
        if (next) { const pos = { block: selection.focus.block, offset: next.from }; setSelection(pos); elements()[pos.block].querySelectorAll<HTMLElement>('[data-cell]')[cells.indexOf(next)]?.focus(); setSelection(pos) }
        else if (!event.shiftKey) enter(selection)
        return
      }
      if (block.kind === 'bullet') { event.preventDefault(); const change = indentBlocks(blocks, range, event.shiftKey ? -1 : 1); if (change) commit(change.blocks, change.caret, change.caret, 'edit'); return }
    }
    if (mod && event.altKey && key === 't') {
      event.preventDefault()
      let next = blocks
      for (let i = 0; i < next.length; i++) next = toggleCallout(next, i, true)?.blocks ?? next
      commit(next, selection.anchor, selection.focus, 'edit'); return
    }
    if (mod && key === 'd' && !event.altKey) { event.preventDefault(); changeBlocks('duplicate', range); return }
    if (mod && event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) { event.preventDefault(); changeBlocks(key === 'arrowup' ? 'up' : 'down', range); return }
    const digit = /^Digit[0-9]$/.test(event.code) ? Number(event.code.slice(-1)) : /^\d$/.test(key) ? Number(key) : -1
    if (mod && event.altKey && digit >= 0) {
      const kinds: TurnKind[] = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'quote', 'code']
      const kind = kinds[digit]
      if (kind) { event.preventDefault(); const change = turnInto(blocks, range, kind); commit(change.blocks, change.caret, change.caret, 'edit') }
      return
    }
    if (mod && event.key === 'Enter') {
      event.preventDefault()
      const change = toggleBox(blocks, selection.focus.block) ?? toggleCallout(blocks, selection.focus.block)
      if (change) commit(change.blocks, change.caret, change.caret, 'edit')
      return
    }
    if (selected) {
      if (key === 'backspace' || key === 'delete') { event.preventDefault(); changeBlocks('delete', selected); return }
      if (key === 'arrowup' || key === 'arrowdown') {
        event.preventDefault()
        const index = selected.focus + (key === 'arrowup' ? -1 : 1)
        selectBlocks(event.shiftKey ? selected.anchor : index, index)
        return
      }
      if (key === 'arrowleft' || key === 'arrowright' || key === 'enter') {
        event.preventDefault()
        const index = selected.focus
        clearBlocks()
        const pos = { block: index, offset: key === 'arrowright' ? blocks[index].source.length : startOf(index) }
        elements()[index].focus(); setSelection(pos); applyReveal()
        return
      }
    }
    if (!mod && !event.altKey && event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
      event.preventDefault()
      selectBlocks(selection.anchor.block, selection.focus.block + (key === 'arrowup' ? -1 : 1))
      return
    }
    if (event.key === 'Enter' && !mod && !event.altKey) { event.preventDefault(); enter(selection, event.shiftKey); return }
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'b' && !event.shiftKey) { event.preventDefault(); wrap(selection, '**'); return }
      if (key === 'i' && !event.shiftKey) { event.preventDefault(); wrap(selection, '*'); return }
      if (key === 'e' && !event.shiftKey) { event.preventDefault(); wrap(selection, '`'); return }
      if (key === 'u' && !event.shiftKey) { event.preventDefault(); wrap(selection, '<u>', '</u>'); return }
      if ((key === 'x' || key === 's') && event.shiftKey) { event.preventDefault(); wrap(selection, '~~'); return }
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        insertLink(selection)
        return
      }
      return
    }
    if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return
    if (comparePos(selection.anchor, selection.focus) !== 0) return
    const { block: index, offset } = selection.focus
    const element = elements()[index]
    if (event.key === 'ArrowLeft' && offset === 0 && index > 0) {
      event.preventDefault()
      const pos = { block: index - 1, offset: blocks[index - 1].source.length }
      setSelection(pos); applyReveal({ anchor: pos, focus: pos }); keepCaretInView()
    } else if (event.key === 'ArrowRight' && offset === blocks[index].source.length && index + 1 < blocks.length) {
      event.preventDefault()
      const pos = { block: index + 1, offset: startOf(index + 1) }
      setSelection(pos); applyReveal({ anchor: pos, focus: pos }); keepCaretInView()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const up = event.key === 'ArrowUp'
      if (up ? index === 0 : index + 1 >= blocks.length) return
      const caret = caretRect()
      const rect = element.getBoundingClientRect()
      if (!caret) return
      const line = caret.height || parseFloat(getComputedStyle(element).lineHeight) || 16
      const onEdge = up ? caret.top - rect.top < line * 0.75 : rect.bottom - caret.bottom < line * 0.75
      if (!onEdge) return
      event.preventDefault()
      placeAt(up ? index - 1 : index + 1, caret.left, up ? 'bottom' : 'top')
    }
  }

  const onCopy = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const selection = readSelection()
    if (!selection || !event.clipboardData || comparePos(selection.anchor, selection.focus) === 0) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', sliceMarkdown(blocks, selection.anchor, selection.focus))
    if (event.type === 'cut' && !readOnly) {
      if (selected) changeBlocks('delete', selected)
      else insert(selection, '')
    }
  }

  const onClick = (event: MouseEvent) => {
    clearBlocks()
    const target = event.target as HTMLElement | null
    const link = target?.closest?.('a.aa-link') as HTMLAnchorElement | null
    if (link && host.contains(link)) {
      if (event.metaKey || event.ctrlKey || readOnly) { event.preventDefault(); window.open(link.href, '_blank', 'noopener,noreferrer') }
      else event.preventDefault()
      return
    }
    const element = target?.closest?.('.aa-block') as HTMLElement | null
    if (!element || element.parentElement !== host || readOnly) return
    const index = elements().indexOf(element)
    const block = blocks[index]
    if (block.kind === 'callout') {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
      const x = event.clientX - rect.left, y = event.clientY - rect.top, padding = parseFloat(style.paddingLeft)
      if (block.box) {
        // A press on a box's icon square (the square before the words on its first line; the padding's own square without an icon) asks for its icon: the controls open the choice.
        const square = parseFloat(style.paddingTop) || padding
        if (x >= padding - square && x < padding && y >= square && y < 2 * square) {
          event.preventDefault()
          host.dispatchEvent(new CustomEvent('aa-callout-icon', { bubbles: true, detail: { index, rect: new DOMRect(rect.left + padding - square, rect.top + square, square, square) } }))
        }
        return
      }
      if (x < padding) { event.preventDefault(); const change = toggleCallout(blocks, index); if (change) commit(change.blocks, change.caret, change.caret, 'edit') }
      return
    }
    if (block.kind !== 'bullet' || block.checked === undefined) return
    const rect = element.getBoundingClientRect()
    const box = parseFloat(getComputedStyle(element).paddingLeft)
    if (event.clientX - rect.left > box) return
    event.preventDefault()
    const change = toggleBox(blocks, index)
    if (change) commit(change.blocks, change.caret, change.caret, 'edit')
  }

  /** Each block's decorations in its own offsets, only those that reach it, in one pass. */
  const shownDecorations = (): string[] => {
    let at = 0
    return blocks.map((block, index) => {
      const from = at, to = at + block.source.length
      at = to + gap(index)
      return JSON.stringify(decorations.filter(range => range.from <= to && range.to >= from).map(range => ({ ...range, from: range.from - from, to: range.to - from })))
    })
  }
  /** Draw again the blocks whose decorations are not what they were, and no others. */
  let pendingDecorations: string[] | null = null
  const redecorate = (before: string[]) => {
    pendingDecorations = null
    const selection = readSelection()
    const els = elements(), after = shownDecorations()
    let changed = false
    blocks.forEach((block, index) => {
      if (before[index] === after[index]) return
      draw(els[index], block, revealFor(index, selection))
      changed = true
    })
    if (!changed) return
    if (selection) setSelection(selection.anchor, selection.focus)
    sweep()
  }

  // A placeholder would stand over the words being composed in an empty block.
  const onCompositionStart = (event: CompositionEvent) => { composing = true; const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null; if (element) delete element.dataset.placeholder }
  const onCompositionEnd = (event: CompositionEvent) => {
    composing = false
    if ((event.target as HTMLElement).closest?.('.aa-caption')) { onInput(event); return }
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (element && element.parentElement === host) readBack(element)
    if (pendingDecorations) redecorate(pendingDecorations)
  }
  const onSelectionChange = () => { if (!destroyed && !composing && !settingSelection && !ownControl() && !(window.getSelection()?.anchorNode?.parentElement?.closest('.aa-caption'))) { applyReveal(); showPlaceholder(); host.dispatchEvent(new Event('aa-selectionchange')); correction?.moved() } }
  /**
   * An atom that edits itself where it is drawn (a diagram's board) hands
   * back its block's whole new source in `aa-atom-change`. The block is
   * written again as one step of undo, and the caret stays where it was, so
   * a diagram changed on its board is not opened as words.
   */
  const onAtomChange = (event: Event) => {
    const source = (event as CustomEvent<{ source?: unknown }>).detail?.source
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (destroyed || readOnly || typeof source !== 'string' || !element || element.parentElement !== host) return
    event.stopPropagation()
    const index = elements().indexOf(element)
    if (index < 0 || blocks[index].source === source) return
    const kept = readSelection()
    const { blocks: next } = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: blocks[index].source.length }, source)
    clearBlocks()
    syncDom(renumber(next))
    const clamp = (pos: Pos): Pos => ({ block: Math.min(pos.block, blocks.length - 1), offset: Math.min(pos.offset, blocks[Math.min(pos.block, blocks.length - 1)].source.length) })
    if (kept) { setSelection(clamp(kept.anchor), clamp(kept.focus)); applyReveal({ anchor: clamp(kept.anchor), focus: clamp(kept.focus) }) }
    const at = kept ? clamp(kept.focus) : { block: Math.min(index, blocks.length - 1), offset: 0 }
    history.record(snapshot(at, at), 'edit')
    options.onChange?.(toMarkdown(blocks))
    host.dispatchEvent(new Event('aa-change'))
  }
  /** A picture sized on its grip: its own source within its block written again, as one step of undo. */
  const onAtomSource = (event: Event) => {
    const source = (event as CustomEvent<{ source?: unknown }>).detail?.source
    const atom = (event.target as HTMLElement | null)?.closest?.('.aa-atom') as HTMLElement | null
    const element = atom?.closest('.aa-block') as HTMLElement | null
    if (destroyed || readOnly || typeof source !== 'string' || !atom || !element || element.parentElement !== host) return
    event.stopPropagation()
    const index = elements().indexOf(element)
    if (index < 0) return
    atom.dataset.source = source
    const next = [...blocks]
    next[index] = { ...blocks[index], source: readBlock(element) }
    const { blocks: drawn } = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: blocks[index].source.length }, next[index].source)
    clearBlocks()
    syncDom(renumber(drawn))
    const at = { block: index, offset: 0 }
    history.record(snapshot(at, at), 'edit')
    options.onChange?.(toMarkdown(blocks))
    host.dispatchEvent(new Event('aa-change'))
  }
  /** An atom that had the keys gives them back: the caret goes on to the start of the block after it, or back to the end of the one before. */
  const onAtomLeave = (event: Event) => {
    const forward = (event as CustomEvent<{ forward?: unknown }>).detail?.forward !== false
    const element = (event.target as HTMLElement | null)?.closest?.('.aa-block') as HTMLElement | null
    if (destroyed || !element || element.parentElement !== host) return
    event.stopPropagation()
    const index = elements().indexOf(element) + (forward ? 1 : -1)
    if (index < 0 || index >= blocks.length) return
    const pos = { block: index, offset: forward ? startOf(index) : blocks[index].source.length }
    elements()[index].focus({ preventScroll: true })
    setSelection(pos); applyReveal({ anchor: pos, focus: pos }); keepCaretInView()
  }
  // ----- asking AI -----

  let asking: OpenPrompt | null = null
  /** What the last answer changed, marked to be seen and taken back. */
  let marks: Marks | null = null
  let comments: CommentsView | null = null
  /** The blocks a prompt is about: its section, from the heading over it to the next, itself left out. */
  const sectionOf = (index: number): number[] => {
    let first = index, last = index
    while (first > 0 && blocks[first].kind !== 'heading') first--
    while (last + 1 < blocks.length && blocks[last + 1].kind !== 'heading') last++
    return Array.from({ length: last - first + 1 }, (_, at) => first + at).filter(at => at !== index && blocks[at].source.trim())
  }
  /** A prompt over an empty block; its answer takes the block's place. */
  /** Where the caret is drawn: its own box, or, where a browser gives none at a line's end, just after the last character. */
  const caretBox = (): DOMRect | undefined => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return undefined
    const range = selection.getRangeAt(0)
    const own = range.getClientRects()[0]
    if (own && own.height) return own
    const node = range.startContainer, at = range.startOffset
    if (node.nodeType !== Node.TEXT_NODE || !at) return undefined
    const last = document.createRange(); last.setStart(node, at - 1); last.setEnd(node, at)
    const box = last.getClientRects()[0]
    return box ? new DOMRect(box.right, box.top, 0, box.height) : undefined
  }
  const ask = (index: number, inline = false) => {
    const element = elements()[index], block = blocks[index], written = block.source
    // Within a paragraph the prompt goes on from the caret, after the sentence's end, as the paragraph's
    // own words would: as wide as its writing, on its lines, the first line starting at the caret and
    // the lines after it at the paragraph's edge.
    const caret = inline ? caretBox() : undefined
    const box = element.getBoundingClientRect(), style = getComputedStyle(element)
    const start = element.clientLeft + (parseFloat(style.paddingLeft) || 0), end = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0)
    const top = element.clientTop + (parseFloat(style.paddingTop) || 0), line = parseFloat(style.lineHeight) || caret?.height || 0
    const dx = caret ? caret.left - box.left - start : 0
    const dy = caret ? top + (line ? Math.max(0, Math.floor((caret.top + caret.height / 2 - box.top - top) / line)) * line : caret.top - box.top - top) : 0
    asking?.close()
    asking = openPrompt({
      place: () => { const now = element.getBoundingClientRect(); return caret ? new DOMRect(now.left + start, now.top + dy, Math.max(now.width - start - end, 80), line || caret.height) : now },
      indent: dx,
      type: element,
      placeholder: inline ? 'Ask AI or press space to speak' : undefined,
      // The block is as tall as the prompt in it, so the blocks under it move down as it grows.
      grow: height => { element.style.minHeight = height ? `${dy + height}px` : '' },
      about: () => sectionOf(blocks.indexOf(block)).map(at => elements()[at]),
      send: async (prompt, signal) => {
        const at = blocks.indexOf(block)
        const answer = await options.prompt!(prompt, {
          kind: 'writing', signal,
          text: toMarkdown(sectionOf(at).map(each => blocks[each])),
          before: toMarkdown(blocks.slice(0, at)), after: toMarkdown(blocks.slice(at + 1)),
          // The whole document, so a request about any of it (a title, a box, a diagram) can be done where it stands.
          document: toMarkdown(blocks.map(each => each === block ? { ...each, source: inline ? `${each.source}${PROMPT_HERE}` : PROMPT_HERE } : each)),
        })
        const now = blocks.indexOf(block)
        if (destroyed || readOnly || now < 0 || block.source !== (inline ? written : '')) throw new Error('Not answered')
        // The room kept for the prompt goes before the answer is drawn, so no gap is left.
        element.style.minHeight = ''
        const done = applyAnswer(now, answer, inline)
        if (!done) throw new Error('Not answered')
        elements()[Math.min(done.caret, blocks.length - 1)]?.focus({ preventScroll: true })
      },
      close: sent => {
        asking = null
        element.style.minHeight = ''
        const now = blocks.indexOf(block)
        if (sent || now < 0 || destroyed) return
        elements()[now].focus({ preventScroll: true })
        setSelection({ block: now, offset: inline ? blocks[now].source.length : 0 })
      },
    })
  }
  /**
   * The whole document as an answer has it: what changed is drawn again, the
   * rest stays the same blocks, as one change and one step to undo; the
   * caret goes where the prompt stood, after anything written there.
   */
  const applyDocument = (at: number, document: string, inline = false): { caret: number } | null => {
    const text = document.replace(/\r\n?/g, '\n')
    const here = text.indexOf(PROMPT_HERE)
    const head = here < 0 ? null : text.slice(0, here).trimEnd()
    // Within a line the marker is only taken out; on a line of its own, its line goes.
    const markdown = (here < 0 ? text : inline ? text.slice(0, here) + text.slice(here + PROMPT_HERE.length) : `${text.slice(0, here).trimEnd()}\n\n${text.slice(here + PROMPT_HERE.length).trimStart()}`).trim()
    if (markdown === toMarkdown(inline ? blocks : blocks.filter((_, index) => index !== at)).trim()) return null
    if (inline) return putIn(markdown, Math.max(0, head ? fromMarkdown(text.slice(0, here)).length - 1 : at))
    const lead = head === null ? at : head ? fromMarkdown(head).length : 0
    return putIn(markdown, Math.max(0, lead - 1))
  }

  /** A document put in for the one there, keeping the blocks it leaves as they were; what changed shimmers once. */
  const putIn = (markdown: string, caretBlock: number): { caret: number } => {
    const old = blocks
    const parsed = renumber(fromMarkdown(markdown))
    const kept = new Set<Block>()
    const next = parsed.map(each => {
      const same = old.find(was => !kept.has(was) && was.source === each.source && was.kind === each.kind && (was.depth ?? 0) === (each.depth ?? 0) && was.number === each.number)
      if (!same) return each
      kept.add(same)
      return same
    })
    const target = Math.min(caretBlock, next.length - 1)
    const pos = { block: target, offset: next[target].source.length }
    commit(next, pos, pos, 'edit')
    blocks.forEach((each, index) => {
      if (old.includes(each)) return
      const stop = shimmer(elements()[index], [[0, each.source.length]]); shimmers.add(stop); setTimeout(() => shimmers.delete(stop), 2000)
    })
    const changes = changesBetween(old, blocks)
    marks?.set(changes)
    return { caret: target }
  }

  /** The words the marked changes put in, coloured as a decoration layer of their own; nothing is drawn again unless they moved. */
  let aiShown = ''
  const colourChanges = (changes: readonly AiChange[]) => {
    const ranges: Decoration[] = []
    for (const change of changes) change.blocks.forEach((block, index) => {
      const at = blocks.indexOf(block)
      if (at < 0) return
      const start = offsetOf({ block: at, offset: 0 })
      for (const [from, to] of change.words[index] ?? []) ranges.push({ from: start + from, to: start + to, className: 'aa-ai-changed' })
    })
    const key = JSON.stringify(ranges)
    if (key === aiShown) return
    aiShown = key
    const before = pendingDecorations ?? shownDecorations()
    if (ranges.length) decorationLayers.set('ai', ranges); else decorationLayers.delete('ai')
    decorations = [...decorationLayers.values()].flat()
    if (composing) { pendingDecorations = before; return }
    redecorate(before)
  }

  /**
   * What an answer changed, run by run: between the blocks it left as they
   * were, the blocks it put in and the blocks they took the place of. The
   * prompt's own empty block is not something it took away.
   */
  const changesBetween = (old: readonly Block[], next: readonly Block[]): AiChange[] => {
    const changes: AiChange[] = []
    let from = 0
    let added: Block[] = []
    const flush = (to: number) => {
      const before = old.slice(from, to).filter(block => block.source)
      // As many blocks put in as taken out: each is a change of its own (a box ticked, a title reworded).
      if (added.length && added.length === before.length) added.forEach((block, index) => {
        const box = onlyBox(before[index].source, block.source)
        changes.push({ blocks: [block], before: [before[index]], words: [box ? [] : changedWords(before[index].source.slice(before[index].prefix), block.source.slice(block.prefix)).map(([from, to]) => [from + block.prefix, to + block.prefix] as [number, number])], box })
      })
      else if (added.length) changes.push({ blocks: added, before, words: added.map(block => block.source.trim() ? [[block.prefix, block.source.length] as [number, number]] : []) })
      added = []
    }
    for (const block of next) {
      const at = old.indexOf(block)
      if (at < from) { added.push(block); continue }
      flush(at)
      from = at + 1
    }
    flush(old.length)
    return changes
  }

  /** One change an answer made put back as it was, as one step to undo, the caret where it is; refused once its blocks have changed by hand. */
  const revertChange = (change: AiChange): boolean => {
    const first = blocks.indexOf(change.blocks[0]), count = change.blocks.length
    if (readOnly || destroyed || first < 0 || change.blocks.some((block, index) => blocks[first + index] !== block)) return false
    const last = first + count - 1
    const shift = change.before.length - count
    const kept = readSelection()
    const next = renumber([...blocks.slice(0, first), ...change.before, ...blocks.slice(last + 1)])
    const move = (pos: Pos): Pos => pos.block > last ? { ...pos, block: pos.block + shift } : pos.block >= first ? { block: Math.max(0, Math.min(first + change.before.length - 1, next.length - 1)), offset: 0 } : pos
    const anchor = kept ? move(kept.anchor) : { block: Math.min(first, next.length - 1), offset: 0 }
    const focus = kept ? move(kept.focus) : anchor
    const clamp = (pos: Pos): Pos => ({ block: Math.min(pos.block, next.length - 1), offset: Math.min(pos.offset, next[Math.min(pos.block, next.length - 1)].source.length) })
    commit(next, clamp(anchor), clamp(focus), 'edit')
    return true
  }

  /**
   * An answer put in as one change, one step to undo: its edits made where
   * the passages they name stand (each found once, before or after the
   * prompt's empty block), and its new writing in the empty block's place;
   * with nothing new, the empty block goes. What changed shimmers once, and
   * the caret stays where the prompt was.
   */
  const applyAnswer = (at: number, answer: PromptAnswer | string, inline = false): { caret: number } | null => {
    const { edits = [], insert = '', document } = typeof answer === 'string' ? { insert: answer } : answer
    if (typeof document === 'string' && document.trim()) return applyDocument(at, document, inline)
    if (inline) return null
    const once = (text: string, find: string) => { const index = text.indexOf(find); return index >= 0 && text.indexOf(find, index + 1) < 0 ? index : -1 }
    let before = toMarkdown(blocks.slice(0, at)), after = toMarkdown(blocks.slice(at + 1))
    let made = 0
    for (const { find, replace } of edits) {
      if (!find) continue
      const inBefore = once(before, find), inAfter = once(after, find)
      if (inBefore >= 0 && after.indexOf(find) < 0) { before = before.slice(0, inBefore) + replace + before.slice(inBefore + find.length); made++ }
      else if (inAfter >= 0 && before.indexOf(find) < 0) { after = after.slice(0, inAfter) + replace + after.slice(inAfter + find.length); made++ }
    }
    const middle = insert.trim()
    if (!made && !middle) return null
    // The caret goes after what was put in, or to the end of the block before the prompt.
    const lead = before.trim() ? fromMarkdown(before.trimEnd()).length : 0
    return putIn([before.trimEnd(), middle, after.trimStart()].filter(Boolean).join('\n\n'), middle ? lead + fromMarkdown(middle).length - 1 : Math.max(0, lead - 1))
  }

  /** A diagram's board asking with its words: whether the editor can, and the answer. */
  const onAtomPrompt = (event: Event) => {
    const detail = (event as CustomEvent<{ prompt?: string; text?: string; signal?: AbortSignal; available?: boolean; answer?: Promise<string> }>).detail
    if (!detail || destroyed || readOnly) return
    event.stopPropagation()
    detail.available = !!options.prompt
    if (options.prompt && detail.prompt && detail.signal) detail.answer = options.prompt(detail.prompt, { kind: 'diagram', text: detail.text ?? '', signal: detail.signal }).then(answer => typeof answer === 'string' ? answer : answer.insert ?? '')
  }
  const onPointerDown = () => clearBlocks()
  const filesOf = (data: DataTransfer | null) => Array.from(data?.files ?? [])
  // A file pasted is the product's to keep; Aa only says where it arrived.
  const onPaste = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest?.('.aa-caption')) return
    const plain = plainPaste
    plainPaste = false
    if (readOnly || destroyed) return
    const files = filesOf(event.clipboardData)
    if (files.length && options.onFiles) { event.preventDefault(); options.onFiles(files); return }
    const selection = readSelection()
    const text = event.clipboardData?.getData('text/plain')
    if (!selection || text === undefined) return
    event.preventDefault()
    const [a, b] = order(selection.anchor, selection.focus)
    const block = blocks[a.block]
    if (!plain && !selected && a.block === b.block && block.kind === 'table' && text.includes('\t')) {
      const cells = tableRows(block.source), row = cells.findIndex(row => row.some(cell => a.offset >= cell.from && a.offset <= cell.to))
      const column = row < 0 ? -1 : cells[row].findIndex(cell => a.offset >= cell.from && a.offset <= cell.to)
      if (row >= 0 && column >= 0) {
        const rows = cells.map(row => row.map(cell => cell.text))
        const pasted = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
        pasted.forEach((values, i) => { const target = rows[row + i] ?? (rows[row + i] = []); values.forEach((value, j) => { target[column + j] = value }) })
        const source = writeTable(rows, tableAlignments(block.source))
        const cell = tableRows(source)[row][column]
        const change = replaceRange(blocks, { block: a.block, offset: 0 }, { block: a.block, offset: block.source.length }, source)
        const pos = { block: a.block, offset: cell.to }
        commit(change.blocks, pos, pos, 'edit'); return
      }
    }
    if (!plain && a.block === b.block && a.offset !== b.offset && /^https?:\/\/[^\s<>]+$/i.test(text.trim())) {
      wrap(selection, '[', `](${text.trim().replace(/\(/g, '%28').replace(/\)/g, '%29')})`)
    } else insert(selection, (!plain ? fromTSV(text) : null) ?? text.replace(/\r\n?/g, '\n'))
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const files = filesOf(event.dataTransfer)
    if (!files.length || !options.onFiles || readOnly || destroyed || !placing) return
    // The caret goes where the files were let go, so they land there.
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    const index = range ? blockIndexOf(range.startContainer) : -1
    if (range && index >= 0) {
      const pos = { block: index, offset: offsetIn(elements()[index], range.startContainer, range.startOffset) }
      elements()[index].focus({ preventScroll: true })
      setSelection(pos)
    }
    options.onFiles(files)
  }

  host.addEventListener('beforeinput', onBeforeInput)
  host.addEventListener('input', onInput)
  host.addEventListener('keydown', onKeyDown)
  host.addEventListener('copy', onCopy)
  host.addEventListener('cut', onCopy)
  host.addEventListener('click', onClick)
  host.addEventListener('pointerdown', onPointerDown)
  host.addEventListener('drop', onDrop)
  host.addEventListener('paste', onPaste)
  host.addEventListener('aa-atom-change', onAtomChange)
  host.addEventListener('aa-atom-source', onAtomSource)
  host.addEventListener('aa-atom-leave', onAtomLeave)
  host.addEventListener('aa-atom-prompt', onAtomPrompt)
  host.addEventListener('compositionstart', onCompositionStart)
  host.addEventListener('compositionend', onCompositionEnd)
  document.addEventListener('selectionchange', onSelectionChange)

  marks = createMarks(host, { blocks: () => blocks, elements, revert: revertChange, shown: colourChanges })
  renderAll()
  const stopSelection = paintSelection(host)
  const stopSpanning = selectAcrossBlocks(host, () => readOnly || destroyed)

  const setReadOnly = (value: boolean) => {
    for (const editor of columnEditors) editor.readOnly = value
    if (value === readOnly) return
    readOnly = value
    describe()
    clearBlocks()
    showPlaceholder()
    correction?.stop()
    for (const element of elements()) { element.contentEditable = value || element.dataset.kind === 'table' ? 'false' : 'true'; element.dataset.readonly = String(value); element.querySelectorAll<HTMLElement>('[data-cell], .aa-caption').forEach(cell => cell.contentEditable = value ? 'false' : 'true') }
    host.dispatchEvent(new Event('aa-change'))
  }

  const editor: Editor = {
    element: host,
    get value() { return toMarkdown(blocks) },
    set value(text: string) {
      if (toMarkdown(blocks) === text) return
      // Only the blocks that changed are drawn again, so a change from
      // outside (another person, a product's own state) keeps the caret,
      // the focus and the pictures of everything it did not touch.
      const selection = host.contains(document.activeElement) ? readSelection() : null
      const old = blocks, parsed = fromMarkdown(text)
      const sameBlock = (a: Block, b: Block) => JSON.stringify(a) === JSON.stringify(b)
      let start = 0
      while (start < old.length && start < parsed.length && sameBlock(old[start], parsed[start])) start++
      let end = 0
      while (end < old.length - start && end < parsed.length - start && sameBlock(old[old.length - 1 - end], parsed[parsed.length - 1 - end])) end++
      const next = [...old.slice(0, start), ...parsed.slice(start, parsed.length - end), ...old.slice(old.length - end)]
      clearBlocks()
      syncDom(next)
      const keep = (pos: Pos): Pos => {
        const block = pos.block < start ? pos.block : pos.block >= old.length - end ? pos.block + next.length - old.length : Math.min(pos.block, next.length - 1)
        return { block, offset: Math.min(pos.offset, next[block].source.length) }
      }
      const anchor = selection ? keep(selection.anchor) : { block: 0, offset: 0 }, focus = selection ? keep(selection.focus) : anchor
      if (selection) { setSelection(anchor, focus); applyReveal({ anchor, focus }) }
      history.reset({ blocks, anchor, focus })
      comments?.changed()
    },
    get readOnly() { return readOnly },
    set readOnly(value: boolean) { setReadOnly(value) },
    get reordering() { return reordering },
    set reordering(value: boolean) {
      if (reordering === value) return
      reordering = value
      for (const child of columnEditors) child.reordering = value
      host.dispatchEvent(new Event('aa-movement-change'))
    },
    get placing() { return placing },
    set placing(value: boolean) {
      if (placing === value) return
      placing = value
      for (const child of columnEditors) child.placing = value
      host.dispatchEvent(new Event('aa-movement-change'))
    },
    get placeholder() { return placeholder },
    set placeholder(value: string) { placeholder = value; showPlaceholder(); describe() },
    focus() {
      const last = blocks.length - 1
      elements()[last]?.focus({ preventScroll: true })
      const pos = { block: last, offset: blocks[last].source.length }
      setSelection(pos)
      applyReveal({ anchor: pos, focus: pos })
    },
    blur() { (document.activeElement as HTMLElement | null)?.blur() },
    selection() {
      const selection = readSelection()
      if (!selection) return null
      const [a, b] = order(selection.anchor, selection.focus)
      return { start: offsetOf(a), end: offsetOf(b) }
    },
    replace(start, end, text) {
      if (destroyed) return
      const { blocks: next, caret } = replaceRange(blocks, posOf(Math.min(start, end)), posOf(Math.max(start, end)), text)
      commit(next, caret, caret, 'edit')
      // Written from outside, by a picker or an upload, the editor may not have the focus to show the caret in.
      if (!host.contains(document.activeElement)) { elements()[caret.block]?.focus({ preventScroll: true }); setSelection(caret) }
    },
    undo,
    redo,
    activeBlock() { const selection = readSelection(); if (!selection) return null; const index = selection.focus.block; return { index, block: blocks[index], start: offsetOf({ block: index, offset: 0 }), end: offsetOf({ block: index, offset: blocks[index].source.length }) } },
    selectBlocks,
    format(mark) { if (readOnly) return; const selection = readSelection(); if (!selection) return; if (mark === 'link') { insertLink(selection); return }; if (mark === 'underline') { wrap(selection, '<u>', '</u>'); return }; const delimiters = { bold: '**', italic: '*', strike: '~~', code: '`', link: '[', equation: '$', highlight: '==' }; wrap(selection, delimiters[mark]) },
    color(color) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const colored = colorSelection(blocks, selection.anchor, selection.focus, color); if (colored) commit(colored.blocks, colored.anchor, colored.focus, 'edit') },
    turnInto(kind) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = turnInto(blocks, selected ?? select(blocks, selection.anchor.block, selection.focus.block), kind); commit(change.blocks, change.caret, change.caret, 'edit') },
    blockAction(action) { if (readOnly) return; const selection = readSelection(); if (selection) changeBlocks(action, selected ?? select(blocks, selection.anchor.block, selection.focus.block)) },
    moveBlock(from, to, count = 1) {
      if (readOnly || !reordering || count < 1 || from < 0 || to < 0 || from + count > blocks.length || to + count > blocks.length || from === to) return
      const next = [...blocks], moved = next.splice(from, count)
      next.splice(to, 0, ...moved)
      const pos = { block: to, offset: moved[0].prefix }
      commit(next, pos, pos, 'edit')
      // The moved blocks keep the keys: ⌘⇧↑, Backspace or another drag act on them next.
      elements()[to].focus({ preventScroll: true })
      selectBlocks(to, to + count - 1)
    },
    indent(direction) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = indentBlocks(blocks, selected ?? select(blocks, selection.anchor.block, selection.focus.block), direction); if (change) commit(change.blocks, change.caret, change.caret, 'edit') },
    toggle(open) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const change = toggleCallout(blocks, selection.focus.block, open) ?? toggleBox(blocks, selection.focus.block); if (change) commit(change.blocks, change.caret, change.caret, 'edit') },
    callout(head, index) {
      if (readOnly) return
      const at = index ?? readSelection()?.focus.block ?? -1
      if (at < 0 || at >= blocks.length) return
      const change = setCallout(blocks, at, head)
      if (!change) return
      // The caret stays where it was in the block when it is there; otherwise at its words.
      const selection = readSelection()
      const keep = selection && selection.focus.block === at && selection.focus.offset >= blocks[at].prefix
      const shift = change.blocks[at].prefix - blocks[at].prefix
      const caret = keep ? { block: at, offset: selection.focus.offset + shift } : change.caret
      commit(change.blocks, caret, caret, 'edit')
    },
    table(action) { if (readOnly) return; const selection = readSelection(); if (!selection) return; const index = selection.focus.block, block = blocks[index]; if (block.kind !== 'table') return; const rows = tableRows(block.source); let row = 0, column = 0; rows.forEach((cells, r) => cells.forEach((cell, c) => { if (selection.focus.offset >= cell.from && selection.focus.offset <= cell.to) { row = r; column = c } })); const source = editTable(block, action, row, column); const change = replaceRange(blocks, { block: index, offset: 0 }, { block: index, offset: block.source.length }, source); const pos = { block: index, offset: tableRows(source)[Math.min(row, tableRows(source).length - 1)][Math.min(column, tableRows(source)[0].length - 1)].from }; commit(change.blocks, pos, pos, 'edit') },
    insertFile(file) { if (!readOnly && !destroyed) options.onFiles?.([file]) },
    decorate(ranges, layer = 'external') {
      const before = pendingDecorations ?? shownDecorations()
      decorationLayers.set(layer, ranges.map(range => ({ ...range })))
      decorations = [...decorationLayers.values()].flat()
      // A block is not drawn again under a composition, which would end it; it is drawn once the composition is done.
      if (composing) { pendingDecorations = before; return }
      redecorate(before)
    },
    stats() { const text = blocks.flatMap(block => block.kind === 'code' ? [] : [block.source.slice(block.prefix)]).join(' ').replace(/[*_~`#>|=$\[\]()]/g, ' '); const words = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).length : (text.match(/\S+/g)?.length ?? 0); return { words, characters: [...toMarkdown(blocks)].length, blocks: blocks.length } },
    find(query, caseSensitive = false) { if (!query) return []; const text = caseSensitive ? toMarkdown(blocks) : toMarkdown(blocks).toLocaleLowerCase(); const needle = caseSensitive ? query : query.toLocaleLowerCase(); const matches: { start: number; end: number }[] = []; for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + needle.length)) matches.push({ start, end: start + query.length }); return matches },
    rangeOf(start, end) {
      const a = posOf(start), b = posOf(end), els = elements()
      if (!els[a.block] || !els[b.block]) return null
      const from = pointAt(els[a.block], Math.min(a.offset, blocks[a.block].source.length)), to = pointAt(els[b.block], Math.min(b.offset, blocks[b.block].source.length))
      const range = document.createRange(); range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset)
      return range
    },
    selectRange(start, end = start) { const a = posOf(start), b = posOf(end); clearBlocks(); elements()[a.block].focus(); setSelection(a, b); applyReveal({ anchor: a, focus: b }) },
    transaction(action) {
      const before = toMarkdown(blocks)
      transactionDepth++
      try { action() } finally {
        transactionDepth--
        if (!transactionDepth && toMarkdown(blocks) !== before) {
          const selection = readSelection() ?? { anchor: { block: 0, offset: 0 }, focus: { block: 0, offset: 0 } }
          history.record(snapshot(selection.anchor, selection.focus), 'edit')
          options.onChange?.(toMarkdown(blocks)); host.dispatchEvent(new Event('aa-change'))
        }
      }
    },
    setHistoryProvider(provider) { historyProvider = provider },
    async askAbout(said) {
      const asked = said.trim()
      const selection = readSelection()
      if (!asked || !options.prompt || readOnly || destroyed || !selection || comparePos(selection.anchor, selection.focus) === 0) return false
      const [a, b] = order(selection.anchor, selection.focus)
      const start = offsetOf(a), end = offsetOf(b), value = toMarkdown(blocks)
      // The words glisten while the answer is awaited, as a prompt's section does.
      const stop = glisten(elements().slice(a.block, b.block + 1))
      try {
        const answer = await options.prompt(asked, { kind: 'writing', signal: new AbortController().signal, text: value.slice(start, end), before: value.slice(0, start), after: value.slice(end) })
        if (destroyed || readOnly || toMarkdown(blocks) !== value) return false
        const words = (typeof answer === 'string' ? answer : answer.insert ?? '').trim()
        if (!words) return false
        editor.replace(start, end, words)
        editor.selectRange(start, start + words.length)
        return true
      } finally { stop() }
    },
    get comments() { return comments ?? undefined },
    get correcting() { return !!correction?.enabled },
    set correcting(value: boolean) { if (!correction || correction.enabled === value) return; correction.enabled = value; markSpelling(value) },
    destroy() {
      destroyed = true
      correction?.stop()
      for (const stop of shimmers) stop()
      shimmers.clear()
      stopSelection()
      stopSpanning()
      stopControls()
      stopPartials()
      host.removeEventListener('beforeinput', onBeforeInput)
      host.removeEventListener('input', onInput)
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('copy', onCopy)
      host.removeEventListener('cut', onCopy)
      host.removeEventListener('click', onClick)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('drop', onDrop)
      host.removeEventListener('paste', onPaste)
      host.removeEventListener('aa-atom-change', onAtomChange)
      host.removeEventListener('aa-atom-source', onAtomSource)
      host.removeEventListener('aa-atom-leave', onAtomLeave)
      host.removeEventListener('aa-atom-prompt', onAtomPrompt)
      asking?.close()
      marks?.destroy()
      comments?.destroy()
      host.removeEventListener('compositionstart', onCompositionStart)
      host.removeEventListener('compositionend', onCompositionEnd)
      document.removeEventListener('selectionchange', onSelectionChange)
      sweep(true)
    },
  }
  if (options.comments) comments = createCommentsView(host, {
    store: options.comments,
    value: () => toMarkdown(blocks),
    selection: () => editor.selection(),
    decorate: ranges => editor.decorate(ranges, 'comments'),
    selectRange: (start, end) => editor.selectRange(start, end),
    readOnly: () => readOnly,
    prompt: options.prompt,
  })
  // The controls offer every atom the editor draws that can be inserted, its own Columns among them.
  stopControls = createControls(editor, { ...options, atoms })
  if (options.partials && options.menus !== false) stopPartials = createPartialPicker(editor)
  return editor
}
