/**
 * A diagram's board: a diagram drawn in an editor and changed where it
 * stands, by hand. Its words are never shown: the caret come into its block,
 * a press or Tab gives the board the keys, and it rules its squares under
 * the drawing. Its row of tools (Design system 1's Context bar) stands in the
 * middle of the board's last square while the diagram is hovered or in use and
 * the writing can be changed, with one colour picker for the pale accents, a Select-faced menu in the top
 * layer.
 *
 * Everything is carried on Drag's grid engine (`src/vendor/drag/grid.ts`), a
 * whole square at a time: a group pressed and carried lands on other
 * squares; the grip of what is chosen sizes it, a box in whole items and a
 * post-it in whole columns; a box or a post-it carried out of the tools lands
 * where it is let go (pressed, it lands on a free square), and is named at
 * once; with Line or Arrow pressed, a line runs from the box pressed to the
 * box let go over. A click on a box (an item to a person) or a post-it (a
 * note) writes in it where it stands, as a double press or Enter does.
 *
 * The keys reach all of it: Tab and Shift-Tab choose each group, box and
 * line in turn, the arrows move what is chosen a square (Shift four), Alt
 * and the arrows size it, Enter names it, L or A joins it to another (Tab to
 * the one to join, Enter), I and N add an item or a note, Delete takes it
 * away, Escape lets it go, and the arrows with nothing chosen give the caret
 * back to the writing.
 *
 * Every change is written back as the words a person would write
 * (`diagram-edit.ts`) and handed to the editor in `aa-atom-change`, so the
 * document stays Markdown and undo takes a change back as one step. The
 * editor draws a block again after every change, so the board keeps what it
 * was doing (what is chosen, a name being written) for its block, and takes
 * the keys back when it is drawn again.
 */

import { DIAGRAM_COLORS, diagramFenceWrapped, diagramWraps, layoutDiagram, type Diagram, type DiagramColor, type DiagramGroup } from './diagram-language'
import { addGroup, addJoin, colorTarget, deleteTarget, freeName, joinKind, moveGroup, referenceOf, renameTarget, resizeGroup, type DiagramTarget } from './diagram-edit'
import { openPrompt, type OpenPrompt } from './prompt'
import { createGrid, type GridController, type GridGesture, type GridPoint, type GridPress } from './vendor/drag/grid'
import styles from './diagram-board.css?inline'
import boxIcon from './icons/box.svg?raw'
import noteIcon from './icons/note.svg?raw'
import connectIcon from './icons/connect.svg?raw'
import arrowIcon from './icons/right.svg?raw'
import deleteIcon from './icons/delete.svg?raw'
import wrapIcon from './icons/column.svg?raw'

/** Choosing and carrying, or drawing lines from box to box. */
type Mode = 'choose' | 'line' | 'arrow'
type Rect = { x: number; y: number; w: number; h: number }
type State = { block: number; mode: Mode; target: DiagramTarget | null; renaming: DiagramTarget | null; active: boolean; keep: boolean; said: string }

const COLOR_NAMES: Record<DiagramColor, string> = { 'light-green': 'Green', 'light-blue': 'Blue', pink: 'Pink', yellow: 'Yellow', orange: 'Orange', red: 'Red', white: 'White' }
const CHIPS: Record<DiagramColor, string> = {
  'light-green': 'var(--ds-apple-green, var(--apple-green, #99ff73))',
  'light-blue': 'var(--ds-zenith-blue, var(--zenith-blue, #ccccff))',
  pink: 'var(--ds-pink, var(--pink, #f5aad1))',
  yellow: 'var(--ds-yellow, var(--yellow, #eaff00))',
  orange: 'var(--ds-orange, var(--orange, #fec20d))',
  red: 'var(--ds-tuned-red, var(--tuned-red, #ff5f5f))',
  white: 'light-dark(var(--ds-slate-light, #e6e6e6), var(--ds-white, #fff))',
}
/** What a group is called when it is chosen, for a screen reader. */
const KIND_NAMES: Record<DiagramGroup['kind'], string> = { box: 'item', stack: 'group', 'post-it': 'note', month: 'month', grid: 'grid', chart: 'chart' }
/** How near a line a press takes it, in squares. */
const NEAR_LINE = 0.3
/** How long a group let go takes to settle onto its squares, in milliseconds: Drag's shortest drop. */
const SETTLE = 330
/** A box added stands an item across and a square down; a post-it two items a side. */
const SIZES = { box: { w: 4, h: 1 }, 'post-it': { w: 8, h: 8 } } as const
const HELP = 'Tab chooses each item and line. Arrows move what is chosen, Alt and arrows size it, Enter or a click writes in it, L or A joins it to another, I adds an item, N a note, Delete takes it away.'

/** What each editor's boards are doing, by the editor's element: a block is drawn again after each change. */
const states = new WeakMap<Element, State>()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const svgMask = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
const same = (a: DiagramTarget | null, b: DiagramTarget | null) => JSON.stringify(a) === JSON.stringify(b)

/** One live region for every board, so what a change did is said even as the board is drawn again. */
let liveRegion: HTMLElement | undefined
function say(message: string) {
  if (!message || typeof document === 'undefined') return
  if (!liveRegion?.isConnected) {
    liveRegion = document.createElement('div')
    liveRegion.setAttribute('aria-live', 'polite')
    liveRegion.setAttribute('aria-atomic', 'true')
    Object.assign(liveRegion.style, { position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: '0', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: '0' })
    document.body.append(liveRegion)
  }
  liveRegion.textContent = message
}

const Base = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement

export class AaDiagramBoardElement extends Base {
  /** The fenced block as written: its fences, kept as they are, and the diagram between them. */
  #open = '```diagram'
  #close = '```'
  #source = ''
  #layout: Diagram = layoutDiagram('')
  #drawing: (HTMLElement & { source?: string }) | null = null
  #paper!: HTMLElement
  #ring!: HTMLElement
  #aim!: HTMLElement
  #grip!: HTMLElement
  #ghost!: HTMLElement
  #lines!: SVGSVGElement
  #rename!: HTMLInputElement
  #tools!: HTMLElement
  #colors!: HTMLElement
  #probe!: HTMLElement
  #buttons!: { box: HTMLButtonElement; postIt: HTMLButtonElement; line: HTMLButtonElement; arrow: HTMLButtonElement; color: HTMLButtonElement; colors: HTMLButtonElement[]; wrap: HTMLButtonElement; delete: HTMLButtonElement }
  #state: State = { block: -1, mode: 'choose', target: null, renaming: null, active: false, keep: false, said: '' }
  #grid: GridController | null = null
  #asking: OpenPrompt | null = null
  /** A gesture drawing on the board's own layer: what is chosen is not drawn over it. */
  #carrying = false
  #stop: (() => void)[] = []

  /** The block's whole source, fences included, and the element the diagram is drawn with. */
  set block(value: { source: string; tag: string }) {
    const lines = value.source.replace(/\r\n?/g, '\n').split('\n')
    this.#open = lines[0] ?? '```diagram'
    this.#close = lines.length > 1 ? lines[lines.length - 1] : '```'
    this.#source = lines.slice(1, -1).join('\n')
    this.#layout = layoutDiagram(this.#source)
    if (!this.shadowRoot) this.#build(value.tag)
    this.#drawing!.toggleAttribute('wrap', diagramWraps(this.#open))
    this.#drawing!.source = this.#source
  }

  #build(tag: string) {
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = styles
    const part = <K extends keyof HTMLElementTagNameMap>(name: K, className: string, hidden = false) => Object.assign(document.createElement(name), { className, hidden })
    this.#probe = part('div', 'probe')
    this.#tools = part('div', 'tools')
    this.#tools.setAttribute('role', 'toolbar')
    this.#tools.setAttribute('aria-label', 'Diagram')
    // The colours open from one tool, in the top layer so nothing around the board cuts them off.
    this.#colors = part('div', 'colors', true)
    this.#colors.setAttribute('role', 'menu')
    this.#colors.setAttribute('aria-label', 'Colour')
    if ('popover' in HTMLElement.prototype) this.#colors.setAttribute('popover', 'manual')
    this.#paper = part('div', 'paper')
    this.#drawing = document.createElement(tag)
    const layer = part('div', 'layer')
    this.#ring = part('div', 'ring', true)
    this.#aim = part('div', 'ring aim', true)
    this.#grip = part('div', 'grip', true)
    this.#ghost = part('div', 'ghost-box', true)
    this.#lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.#lines.setAttribute('class', 'lines')
    this.#lines.setAttribute('aria-hidden', 'true')
    this.#rename = Object.assign(part('input', 'rename', true), { type: 'text', spellcheck: false })
    this.#rename.setAttribute('aria-label', 'Name')
    layer.append(this.#ring, this.#aim, this.#ghost, this.#lines, this.#grip, this.#rename)
    // The drawing stays in the page, slotted onto the paper, so a product's own rules for its diagram element reach it.
    this.#paper.append(document.createElement('slot'), layer)
    root.append(style, this.#probe, this.#paper, this.#tools, this.#colors)
    this.append(this.#drawing)

    const button = (label: string, run: () => void, content: HTMLElement) => {
      const node = document.createElement('button')
      node.type = 'button'; node.title = label; node.setAttribute('aria-label', label)
      node.append(content)
      node.addEventListener('click', event => { event.stopPropagation(); run() })
      return node
    }
    const icon = (svg: string) => { const node = part('span', 'icon'); node.style.setProperty('--icon', svgMask(svg)); return node }
    const gap = () => part('span', 'gap')
    const chip = (color: DiagramColor | null) => {
      const node = part('span', 'chip')
      if (color) node.style.setProperty('--chip', CHIPS[color]); else node.dataset.none = ''
      return node
    }
    this.#buttons = {
      box: button('Item (I)', () => this.#add('box'), icon(boxIcon)),
      postIt: button('Note (N)', () => this.#add('post-it'), icon(noteIcon)),
      line: button('Line (L)', () => this.#lineTool('line'), icon(connectIcon)),
      arrow: button('Arrow (A)', () => this.#lineTool('arrow'), icon(arrowIcon)),
      color: button('Colour', () => this.#pickColour(), chip(null)),
      colors: [null, ...DIAGRAM_COLORS].map(color => {
        const entry = button(color ? COLOR_NAMES[color] : 'No colour', () => { this.#closeColours(); this.#colour(color) }, chip(color))
        entry.setAttribute('role', 'menuitemradio')
        entry.append(Object.assign(document.createElement('span'), { textContent: color ? COLOR_NAMES[color] : 'No colour' }))
        return entry
      }),
      wrap: button('Fit the width', () => this.#wrap(), icon(wrapIcon)),
      delete: button('Delete', () => this.#delete(), icon(deleteIcon)),
    }
    const { box, postIt, line, arrow, color, colors } = this.#buttons
    color.setAttribute('aria-haspopup', 'menu')
    color.setAttribute('aria-expanded', 'false')
    // Delete is for a finger; a keyboard has its own key for it.
    const last = gap(); last.classList.add('for-touch'); this.#buttons.delete.classList.add('for-touch')
    this.#tools.append(box, postIt, gap(), line, arrow, gap(), color, gap(), this.#buttons.wrap, last, this.#buttons.delete)
    this.#colors.append(...colors)
    this.#drawTools()
  }

  connectedCallback() {
    const host = this.#host()
    const block = this.#blockElement()
    const editable = !!host && !!block && block.dataset.readonly !== 'true'
    this.toggleAttribute('data-editable', editable)
    this.toggleAttribute('data-aa-interactive', editable)
    if (!editable || !host || !block) return
    this.tabIndex = 0
    this.setAttribute('role', 'application')
    this.setAttribute('aria-roledescription', 'diagram')
    this.setAttribute('aria-label', 'Diagram')
    this.setAttribute('aria-description', HELP)
    const index = Array.from(host.children).indexOf(block)
    // Drawn again for the block it was working on, the board carries on where it was.
    const before = states.get(host)
    this.#state = before && before.block === index ? before : { block: index, mode: 'choose', target: null, renaming: null, active: false, keep: false, said: '' }
    states.set(host, this.#state)
    const listen = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler as EventListener, options)
      this.#stop.push(() => target.removeEventListener(type, handler as EventListener, options))
    }
    const grid = this.#grid = createGrid()
    this.#stop.push(
      grid.surface({ element: this.#paper, unit: () => this.#unit(), press: press => this.#press(press) }),
      grid.source({ element: this.#buttons.box, surface: this.#paper, press: press => this.#placing('box', press) }),
      grid.source({ element: this.#buttons.postIt, surface: this.#paper, press: press => this.#placing('post-it', press) }),
      () => grid.destroy(),
    )
    listen(this.#paper, 'pointermove', event => this.#hover(event))
    listen(this.#paper, 'pointerleave', () => this.removeAttribute('data-over'))
    listen(this.#paper, 'dblclick', event => this.#doubleClick(event))
    listen(this.#tools, 'pointerdown', event => { event.preventDefault(); event.stopPropagation(); this.#activate() })
    listen(this, 'keydown', event => this.#key(event))
    listen(this, 'focusin', () => { if (!this.#state.active && this.#editable()) { this.#state.active = true; this.#show(true) } })
    listen(this, 'focusout', event => this.#focusOut(event))
    listen(this.#rename, 'blur', () => { if (!this.#rename.hidden) this.#finishRename(true) })
    listen(this.#colors, 'pointerdown', event => { event.preventDefault(); event.stopPropagation() })
    listen(this.#colors, 'keydown', event => this.#colourKey(event))
    listen(window, 'scroll', () => this.#closeColours(), { capture: true, passive: true })
    listen(window, 'resize', () => this.#closeColours())
    // The editor reads none of what happens on the board: its keys, its typing and its pastes are the board's.
    for (const type of ['keyup', 'keypress', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'compositionstart', 'compositionupdate', 'compositionend', 'click', 'dblclick'] as const) {
      listen(this, type, event => event.stopPropagation())
    }
    if (this.#state.active) {
      this.#state.keep = false
      this.#show(true)
      if (this.#state.said) { say(this.#state.said); this.#state.said = '' }
      queueMicrotask(() => {
        if (!this.isConnected) return
        if (this.#state.renaming) this.#startRename(this.#state.renaming)
        else this.focus({ preventScroll: true })
      })
    }
  }

  disconnectedCallback() {
    this.#stop.forEach(stop => stop())
    this.#stop = []
    this.#grid = null
    this.#carrying = false
    if (!this.#state.keep) this.#asking?.close()
    this.#closeColours()
  }

  #host(): HTMLElement | null { return this.closest('.aa') as HTMLElement | null }
  #blockElement(): HTMLElement | null { return this.closest('.aa-block') as HTMLElement | null }
  #editable(): boolean { return this.hasAttribute('data-editable') && this.#blockElement()?.dataset.readonly !== 'true' }

  /** One square, in pixels, as the drawing is set. */
  #unit(): number { return this.#probe.getBoundingClientRect().width || 20 }

  #activate() {
    if (!this.#editable()) return
    const host = this.#host()
    if (host) states.set(host, this.#state)
    if (!this.#state.active) { this.#state.active = true; this.#show(true) }
    if (this.shadowRoot?.activeElement !== this.#rename) this.focus({ preventScroll: true })
  }

  #focusOut(event: FocusEvent) {
    if (this.#state.keep || this.contains(event.relatedTarget as Node | null) || event.relatedTarget === this) return
    queueMicrotask(() => {
      if (!this.isConnected || this.#state.keep || this.matches(':focus-within') || this.shadowRoot?.activeElement) return
      this.#grid?.cancel()
      this.#state.active = false
      this.#state.target = null
      this.#state.mode = 'choose'
      this.#show(false)
    })
  }

  /** The board as chosen or not: its squares and tools, what is chosen ringed. */
  #show(active: boolean) {
    this.toggleAttribute('data-active', active)
    // Drawn on, the diagram stands as written: it wraps only to be read.
    this.#drawing?.toggleAttribute('data-editing', active)
    this.dataset.mode = this.#state.mode
    this.#size(this.#layout)
    this.#drawTools()
    this.#drawChoice()
    if (!active) this.#closeColours()
  }

  /** Room for the next box beside and under the drawing, and never less than the drawing being carried. */
  #size(layout: Diagram) {
    this.style.setProperty('--board-columns', String(Math.max(layout.columns + 4, this.#layout.columns + 4, 12)))
    this.style.setProperty('--board-rows', String(Math.max(layout.rows + 3, this.#layout.rows + 3, 6)))
  }

  /** The colours, opened under their tool, or over it where the window has no room under it. */
  #pickColour() {
    if (!this.#colors.hidden) { this.#closeColours(); return }
    this.#colors.hidden = false
    this.#buttons.color.setAttribute('aria-expanded', 'true')
    try { if (this.#colors.hasAttribute('popover')) this.#colors.showPopover() } catch { /* drawn in place instead */ }
    const tool = this.#buttons.color.getBoundingClientRect(), unit = this.#unit(), height = this.#colors.offsetHeight
    // Half a square from its tool, as Design system 1's menus stand.
    this.#colors.style.left = `${Math.max(0, Math.min(tool.left, window.innerWidth - this.#colors.offsetWidth))}px`
    this.#colors.style.top = `${tool.bottom + unit / 2 + height <= window.innerHeight ? tool.bottom + unit / 2 : Math.max(0, tool.top - unit / 2 - height)}px`
    const current = this.#buttons.colors.find(entry => entry.getAttribute('aria-checked') === 'true') ?? this.#buttons.colors[0]
    if (this.matches(':focus-visible') || this.shadowRoot?.activeElement === this.#buttons.color) current.focus({ preventScroll: true })
  }

  #closeColours() {
    if (!this.#colors || this.#colors.hidden) return
    this.#colors.hidden = true
    this.#buttons.color.setAttribute('aria-expanded', 'false')
    try { if (this.#colors.matches(':popover-open')) this.#colors.hidePopover() } catch { /* never shown */ }
    if (this.shadowRoot?.activeElement && this.#colors.contains(this.shadowRoot.activeElement)) this.focus({ preventScroll: true })
  }

  /** In the colours: the arrows go up and down them, Escape closes them. */
  #colourKey(event: KeyboardEvent) {
    const entries = this.#buttons.colors
    const at = entries.indexOf(this.shadowRoot?.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.#closeColours(); return }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault(); event.stopPropagation()
    entries[(at + step + entries.length) % entries.length].focus({ preventScroll: true })
  }

  #drawTools() {
    const target = this.#state.target
    const group = target && 'group' in target ? this.#layout.groups[target.group] : undefined
    const colourable = !!group && (group.kind === 'box' || group.kind === 'stack' || group.kind === 'post-it')
    const line = target && 'join' in target ? this.#layout.lines[target.join] : undefined
    const { line: lineButton, arrow, color, colors } = this.#buttons
    // A line chosen shows what it is; otherwise what a line drawn now will be.
    lineButton.setAttribute('aria-pressed', String(line ? !line.arrow : this.#state.mode === 'line'))
    arrow.setAttribute('aria-pressed', String(line ? line.arrow : this.#state.mode === 'arrow'))
    // The colour tool wears the colour of what is chosen, and the menu checks it.
    const worn = target && 'group' in target && group ? (target.box !== undefined ? group.boxes[target.box]?.color ?? group.color : group.color) : undefined
    color.disabled = !colourable
    if (!colourable) this.#closeColours()
    const swatch = color.querySelector<HTMLElement>('.chip')!
    if (worn) { swatch.style.setProperty('--chip', CHIPS[worn]); delete swatch.dataset.none } else { swatch.style.removeProperty('--chip'); swatch.dataset.none = '' }
    colors.forEach((entry, index) => entry.setAttribute('aria-checked', String(([null, ...DIAGRAM_COLORS][index] ?? undefined) === worn)))
    this.#buttons.delete.disabled = !target
    this.#buttons.wrap.setAttribute('aria-pressed', String(diagramWraps(this.#open)))
  }

  /** Line or Arrow: a line chosen becomes one; otherwise lines are drawn from box to box until it is pressed again. */
  #lineTool(mode: 'line' | 'arrow') {
    const target = this.#state.target
    if (target && 'join' in target) {
      this.#commit(joinKind(this.#source, this.#layout, target, mode === 'arrow' ? '->' : '--'), { target }, mode === 'arrow' ? 'Made an arrow' : 'Made a line')
      return
    }
    this.#setMode(this.#state.mode === mode ? 'choose' : mode)
  }

  #setMode(mode: Mode) {
    this.#state.mode = mode
    this.dataset.mode = mode
    this.#ghost.hidden = true
    this.#drawTools()
    if (this.shadowRoot?.activeElement !== this.#rename) this.focus({ preventScroll: true })
  }

  /** A target's squares: a group's, or one box's row in its stack. */
  #rectOf(target: DiagramTarget, layout = this.#layout): Rect | null {
    if ('join' in target) return null
    const group = layout.groups[target.group]
    if (!group) return null
    if (target.box === undefined || group.kind !== 'stack') return { x: group.x, y: group.y, w: group.w, h: group.h }
    return { x: group.x, y: group.y + (group.name ? 1 : 0) + target.box, w: group.w, h: 1 }
  }

  /** The name's row of a stack, or a lone box: where a name is written over. */
  #nameRect(target: DiagramTarget): Rect | null {
    const rect = this.#rectOf(target)
    if (!rect || 'join' in target) return rect
    const group = this.#layout.groups[target.group]
    if (group.kind === 'post-it') return { x: rect.x + 1, y: rect.y + 1, w: Math.max(1, rect.w - 2), h: 1 }
    return { ...rect, h: 1 }
  }

  /** What stands at a place on the paper: a box of a stack, a group, or a line near it. */
  #hit(x: number, y: number): DiagramTarget | null {
    const inside = (rect: Rect) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
    const groups = this.#layout.groups
    // Boxes and stacks stand over the post-its they are placed on: the last written is on top, a post-it under everything.
    const order = [...groups.keys()].sort((a, b) => Number(groups[b].kind !== 'post-it') - Number(groups[a].kind !== 'post-it') || b - a)
    for (const index of order) {
      const group = groups[index]
      if (!inside(group)) continue
      if (group.kind === 'stack') {
        const row = Math.floor(y - group.y) - (group.name ? 1 : 0)
        return row >= 0 && row < group.boxes.length ? { group: index, box: row } : { group: index }
      }
      return { group: index }
    }
    for (const [index, line] of this.#layout.lines.entries()) {
      for (const s of line.segments) {
        const near = s.x1 === s.x2
          ? Math.abs(x - s.x1) < NEAR_LINE && y >= Math.min(s.y1, s.y2) - NEAR_LINE && y <= Math.max(s.y1, s.y2) + NEAR_LINE
          : Math.abs(y - s.y1) < NEAR_LINE && x >= Math.min(s.x1, s.x2) - NEAR_LINE && x <= Math.max(s.x1, s.x2) + NEAR_LINE
        if (near) return { join: index }
      }
    }
    return null
  }

  /** Everything the keys choose, in turn: each group as written, each box of a stack after its name, then the lines. */
  #things(): DiagramTarget[] {
    const things: DiagramTarget[] = []
    for (const [index, group] of this.#layout.groups.entries()) {
      things.push({ group: index })
      if (group.kind === 'stack') group.boxes.forEach((_, box) => things.push({ group: index, box }))
    }
    this.#layout.lines.forEach((_, join) => things.push({ join }))
    return things
  }

  /** What is chosen ringed, its grip where it can be sized, a chosen line drawn over in the ring's colour. */
  #drawChoice(layout = this.#layout) {
    const target = this.#state.active ? this.#state.target : null
    const rect = target ? this.#rectOf(target, layout) : null
    this.#place(this.#ring, rect)
    const group = target && 'group' in target && target.box === undefined ? layout.groups[target.group] : undefined
    const sizable = !!group && (group.kind === 'box' || group.kind === 'stack' || group.kind === 'post-it')
    this.#place(this.#grip, sizable ? rect : null)
    this.#grip.toggleAttribute('data-corner', group?.kind === 'post-it')
    if (this.#carrying) return
    this.#lines.replaceChildren()
    const join = target && 'join' in target ? layout.lines[target.join] : undefined
    if (join) this.#lines.append(this.#path(join.segments.map((s, i) => `${i ? '' : `M${s.x1},${s.y1} `}L${s.x2},${s.y2}`).join(' ')))
  }

  /** An element set on squares, or hidden. */
  #place(element: HTMLElement, rect: Rect | null) {
    element.hidden = !rect
    if (rect) for (const [name, value] of Object.entries(rect)) element.style.setProperty(`--${name}`, String(value))
  }

  /** A stroke on the board, written in squares, drawn in pixels. */
  #path(d: string): SVGPathElement {
    const unit = this.#unit()
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d.replace(/-?\d+(\.\d+)?/g, number => String(Number(number) * unit)))
    return path
  }

  #choose(target: DiagramTarget | null) {
    if (same(target, this.#state.target)) return
    this.#state.target = target
    this.#drawTools()
    this.#drawChoice()
    if (target) say(this.#describe(target))
  }

  /** What a target is, in words: a group's name and kind, or a line's two ends. */
  #describe(target: DiagramTarget): string {
    if ('join' in target) {
      const join = this.#layout.joins[target.join]
      return join ? `${join.from} to ${join.to}, ${this.#layout.lines[target.join]?.arrow ? 'arrow' : 'line'}` : ''
    }
    const group = this.#layout.groups[target.group]
    if (!group) return ''
    return `${this.#nameOf(target) ?? 'Unnamed'}, ${target.box !== undefined ? 'item' : KIND_NAMES[group.kind]}`
  }

  /** Hand the editor the block written anew; the board is drawn again with it. */
  #commit(source: string, next: Partial<Pick<State, 'target' | 'renaming' | 'mode'>> = {}, said = '', open = this.#open) {
    if (source === this.#source && open === this.#open) { Object.assign(this.#state, next); this.#drawTools(); this.#drawChoice(); return }
    Object.assign(this.#state, next, { active: true, keep: true, said })
    const block = `${open}\n${source}${source ? '\n' : ''}${this.#close}`
    this.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, composed: true, detail: { source: block } }))
    // Not taken (read only, or no editor to take it): the board stays as it was.
    if (this.isConnected) { this.#state.keep = false; this.#state.said = ''; this.#drawing!.source = this.#source; this.#drawChoice() }
  }

  /** The keys given back to the writing: the caret after the diagram, or before it where nothing follows. */
  #leave(forward: boolean) {
    this.dispatchEvent(new CustomEvent('aa-atom-leave', { bubbles: true, composed: true, detail: { forward } }))
    if (this.matches(':focus')) this.dispatchEvent(new CustomEvent('aa-atom-leave', { bubbles: true, composed: true, detail: { forward: !forward } }))
  }

  // ----- carried on Drag's grid engine -----

  /** A press on the paper: the grip sizes what is chosen; with Line or Arrow pressed an item starts a line; otherwise what is pressed is chosen, carried once it lifts, and a click on it writes its words. */
  #press({ point, target: pressed, event }: GridPress): GridGesture | null {
    if (!this.#editable()) return null
    // The press is the board's: the caret, the selection and the block's own drag stay where they were.
    event.preventDefault()
    event.stopPropagation()
    this.#activate()
    if (!this.#rename.hidden) {
      this.#finishRename(true)
      if (!this.isConnected) return null
    }
    const chosen = this.#state.target
    if (pressed?.closest('.grip') && chosen && 'group' in chosen) return this.#sizing(chosen.group)
    const hit = this.#hit(point.x, point.y)
    if (this.#state.mode !== 'choose') {
      if (hit && !('join' in hit) && referenceOf(this.#layout, hit)) return this.#joining(hit, this.#state.mode)
      this.#setMode('choose')
    }
    this.#choose(hit)
    if (!hit || !('group' in hit)) return null
    // A click writes in it at once; a press that moves (a finger held still first) carries it.
    return { ...this.#moving(hit), onClick: () => this.#startRename(hit) }
  }

  /** A gesture that draws the diagram as it would be written as it is carried, and writes it once let go. */
  #redrawing(write: (drag: { point: GridPoint; moved: GridPoint }) => string, target: DiagramTarget, said: string, attribute: string): GridGesture {
    let working = this.#source
    const settle = () => {
      this.removeAttribute(attribute)
      this.#drawing!.source = this.#source
      this.#size(this.#layout)
      this.#drawChoice()
    }
    return {
      onStart: () => this.setAttribute(attribute, ''),
      onMove: drag => {
        const next = write(drag)
        if (next === working) return
        working = next
        const layout = layoutDiagram(next)
        this.#drawing!.source = next
        this.#size(layout)
        this.#drawChoice(layout)
      },
      onDrop: () => {
        const written = working
        settle()
        this.#commit(written, { target }, said)
      },
      onCancel: settle,
    }
  }

  /**
   * A group carried as Music carries a clip on Drag: it follows the pointer
   * exactly, by transform alone, while its ring glides from square to square
   * to where it will land; let go, it settles onto those squares and is
   * written `@ x y` there. Taken back, it glides home.
   */
  #moving(target: DiagramTarget & { group: number }): GridGesture {
    const group = this.#layout.groups[target.group]
    let working = this.#source
    let landing = { x: 0, y: 0 }
    let pieces: { element: HTMLElement; transform: string }[] = []
    const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    /** Every piece of the group as drawn, carried by the same offset in pixels. */
    const carry = (x: number, y: number, settle: boolean) => {
      for (const { element, transform } of pieces) {
        element.style.transition = settle && !reduced() ? `transform ${SETTLE}ms cubic-bezier(.2, 1, .1, 1)` : 'none'
        element.style.transform = `translate(${x}px, ${y}px) ${transform}`.trim()
      }
    }
    /** Once it has settled (or at once, with less motion), the pieces are drawn where they stand by the drawing itself. */
    const after = (then: () => void) => {
      const done = () => {
        this.removeAttribute('data-moving')
        for (const { element } of pieces) { element.style.transition = ''; element.style.transform = ''; element.style.zIndex = '' }
        pieces = []
        then()
      }
      if (reduced()) done(); else setTimeout(done, SETTLE)
    }
    return {
      onStart: () => {
        this.setAttribute('data-moving', '')
        pieces = this.#piecesOf(group).map(element => {
          const transform = getComputedStyle(element).transform
          element.style.zIndex = '3'
          return { element, transform: transform === 'none' ? '' : transform }
        })
      },
      onMove: ({ point, origin, moved }) => {
        const unit = this.#unit()
        // Never past the paper's first square.
        carry(Math.max(-group.x, point.x - origin.x) * unit, Math.max(-group.y, point.y - origin.y) * unit, false)
        const next = moved.x || moved.y ? moveGroup(this.#source, this.#layout, target.group, group.x + moved.x, group.y + moved.y) : this.#source
        if (next === working) return
        working = next
        const layout = layoutDiagram(next)
        const landed = layout.groups[target.group]
        landing = landed ? { x: landed.x - group.x, y: landed.y - group.y } : { x: 0, y: 0 }
        this.#size(layout)
        this.#drawChoice(layout)
      },
      onDrop: () => {
        const written = working, unit = this.#unit()
        carry(landing.x * unit, landing.y * unit, true)
        after(() => {
          if (written === this.#source) { this.#drawChoice(); return }
          this.#commit(written, { target }, `Moved ${this.#nameOf(target) ?? ''}`.trim())
        })
      },
      onCancel: () => {
        carry(0, 0, true)
        after(() => { this.#size(this.#layout); this.#drawChoice() })
      },
    }
  }

  /** A group's pieces as the drawing draws them: its boxes and name, or a post-it and its name; never the groups placed on a post-it. */
  #piecesOf(group: DiagramGroup): HTMLElement[] {
    const root = this.#drawing?.shadowRoot
    if (!root) return []
    const at = (element: HTMLElement, name: string) => parseFloat(element.style.getPropertyValue(`--${name}`))
    return [...root.querySelectorAll<HTMLElement>('.post-it, .label, .box, .day, .chart-name')].filter(element => {
      const x = at(element, 'x'), y = at(element, 'y')
      if (group.kind === 'post-it') return element.classList.contains('post-it') ? x === group.x && y === group.y : element.classList.contains('label') && x === group.x + 1 && y === group.y + 1
      return !element.classList.contains('post-it') && x >= group.x && x < group.x + group.w && y >= group.y && y < group.y + group.h
    })
  }

  /** A box sized by its grip in whole items, a post-it by its corner in whole columns. */
  #sizing(index: number): GridGesture {
    const group = this.#layout.groups[index]
    return this.#redrawing(
      ({ point }) => resizeGroup(this.#source, this.#layout, index, group.kind === 'post-it' ? Math.max(point.x - group.x, point.y - group.y) : point.x - group.x),
      { group: index },
      `Sized ${this.#nameOf({ group: index }) ?? ''}`.trim(),
      'data-sizing',
    )
  }

  /** A line from a box to the box it is let go over, following the pointer or the keys meanwhile. */
  #joining(from: DiagramTarget, mode: 'line' | 'arrow'): GridGesture {
    const rect = this.#rectOf(from)!
    const start = { x: rect.x + rect.w / 2, y: rect.y + Math.min(rect.h, 1) / 2 }
    const name = referenceOf(this.#layout, from)!
    const over = (point: GridPoint) => {
      const hit = this.#hit(point.x, point.y)
      const end = hit && !('join' in hit) ? referenceOf(this.#layout, hit) : undefined
      return hit && end && end.toLowerCase() !== name.toLowerCase() ? hit : null
    }
    const clear = () => {
      this.#carrying = false
      this.removeAttribute('data-joining')
      this.#aim.hidden = true
      this.#drawChoice()
    }
    return {
      onStart: () => { this.#carrying = true; this.setAttribute('data-joining', '') },
      onMove: ({ point }) => {
        this.#lines.replaceChildren(this.#path(`M${start.x},${start.y} L${point.x},${point.y}`))
        const to = over(point)
        this.#place(this.#aim, to && this.#rectOf(to))
      },
      onDrop: ({ point }) => {
        clear()
        const to = over(point)
        if (!to) { this.#setMode('choose'); return }
        const end = referenceOf(this.#layout, to)!
        const source = addJoin(this.#source, name, end, mode === 'arrow' ? '->' : '--')
        const join = layoutDiagram(source).joins.length - 1
        this.#commit(source, { target: join >= 0 ? { join } : from, mode: 'choose' }, `Joined ${name} to ${end}`)
      },
      onCancel: clear,
      onClick: () => this.#choose(from),
      targets: () => this.#things().filter(thing => !('join' in thing) && over(this.#middleOf(thing))).map(thing => this.#middleOf(thing)),
      announce: (drag, phase) => {
        if (phase === 'start') return `Joining ${name}. Tab to the one to join it to, then Enter. Escape stops.`
        if (phase === 'move') { const to = over(drag.point); return to ? this.#describe(to) : 'Nothing here' }
        return phase === 'cancel' ? 'Not joined' : undefined
      },
    }
  }

  /** The middle of a target's first row: where the keys join a line to it. */
  #middleOf(target: DiagramTarget): GridPoint {
    const rect = this.#rectOf(target) ?? { x: 0, y: 0, w: 0, h: 0 }
    return { x: rect.x + rect.w / 2, y: rect.y + Math.min(rect.h, 1) / 2 }
  }

  /** A box or a post-it carried out of the tools onto the paper, landing where it is let go. */
  #placing(kind: 'box' | 'post-it', { event }: GridPress): GridGesture | null {
    if (!this.#editable()) return null
    event.preventDefault()
    const done = () => { this.#carrying = false; this.#ghost.hidden = true }
    return {
      onStart: () => { this.#activate(); this.#carrying = true },
      onMove: ({ point, inside }) => this.#place(this.#ghost, inside ? { ...this.#spotAt(kind, point), ...SIZES[kind] } : null),
      onDrop: ({ point, inside }) => { done(); if (inside) this.#add(kind, this.#spotAt(kind, point)) },
      onCancel: done,
    }
  }

  /** Where a box or a post-it held at a point lands: its middle under the pointer, a post-it on the columns. */
  #spotAt(kind: 'box' | 'post-it', point: GridPoint): GridPoint {
    const { w, h } = SIZES[kind]
    const x = Math.max(0, Math.round(point.x - w / 2))
    return { x: kind === 'post-it' ? Math.round(x / 4) * 4 : x, y: Math.max(0, kind === 'post-it' ? Math.round(point.y - h / 2) : Math.floor(point.y)) }
  }

  /** A free place for something new: beside what is chosen, else under the drawing. */
  #freeSpot(kind: 'box' | 'post-it'): GridPoint {
    const { w, h } = SIZES[kind]
    const free = (x: number, y: number) => this.#layout.groups.every(group => x + w <= group.x || x >= group.x + group.w || y + h <= group.y || y >= group.y + group.h)
    const chosen = this.#state.target && 'group' in this.#state.target ? this.#layout.groups[this.#state.target.group] : undefined
    if (chosen) {
      const x = kind === 'post-it' ? Math.ceil((chosen.x + chosen.w + 2) / 4) * 4 : chosen.x + chosen.w + 2
      if (free(x, chosen.y)) return { x, y: chosen.y }
    }
    let y = this.#layout.rows ? this.#layout.rows + 1 : 0
    while (!free(0, y)) y++
    return { x: 0, y }
  }

  /** A box or a post-it added, chosen and named at once. */
  #add(kind: 'box' | 'post-it', at = this.#freeSpot(kind)) {
    if (!this.#editable()) return
    this.#activate()
    const name = freeName(this.#layout, kind === 'box' ? 'Item' : 'Note')
    const source = addGroup(this.#source, this.#layout, kind, name, at.x, at.y)
    const index = layoutDiagram(source).groups.findIndex(group => (group.kind === 'box' ? group.boxes[0]?.text : group.name) === name)
    const target = index >= 0 ? { group: index } : null
    this.#commit(source, { target, renaming: target, mode: 'choose' }, `Added ${name}`)
  }

  /** A place on the paper under a mouse, in squares. */
  #squaresAt(event: MouseEvent): GridPoint {
    const box = this.#paper.getBoundingClientRect(), unit = this.#unit()
    return { x: (event.clientX - box.left + this.#paper.scrollLeft) / unit, y: (event.clientY - box.top) / unit }
  }

  #hover(event: PointerEvent) {
    if (this.#grid?.isDragging() || !this.#editable()) return
    const at = this.#squaresAt(event)
    const hit = this.#hit(at.x, at.y)
    this.toggleAttribute('data-over', !!hit && 'group' in hit)
  }

  #doubleClick(event: MouseEvent) {
    if (!this.#editable() || this.#state.mode !== 'choose') return
    event.preventDefault()
    const at = this.#squaresAt(event)
    const hit = this.#hit(at.x, at.y)
    if (hit && !('join' in hit)) { this.#startRename(hit); return }
    // A double press on an empty square puts a box there.
    if (!hit) this.#add('box', { x: Math.floor(at.x), y: Math.floor(at.y) })
  }

  #nameOf(target: DiagramTarget): string | undefined {
    if ('join' in target) return undefined
    const group: DiagramGroup | undefined = this.#layout.groups[target.group]
    if (!group) return undefined
    if (target.box !== undefined && group.kind === 'stack') return group.boxes[target.box]?.text
    return group.kind === 'box' ? group.boxes[0]?.text : group.name
  }

  #startRename(target: DiagramTarget) {
    const rect = this.#nameRect(target)
    const name = this.#nameOf(target)
    const group = 'group' in target ? this.#layout.groups[target.group] : undefined
    if (!rect || name === undefined || !group || group.kind === 'month' || group.kind === 'grid' || group.kind === 'chart') { this.#state.renaming = null; return }
    this.#state.renaming = target
    this.#state.target = target
    this.#place(this.#rename, rect)
    this.#rename.value = name
    this.#drawTools()
    this.#drawChoice()
    this.#rename.focus({ preventScroll: true })
    this.#rename.select()
  }

  #finishRename(keep: boolean) {
    const target = this.#state.renaming
    const value = this.#rename.value
    this.#rename.hidden = true
    this.#state.renaming = null
    if (!target) return
    if (keep && value.trim() && value.trim() !== this.#nameOf(target)) this.#commit(renameTarget(this.#source, this.#layout, target, value), { target, renaming: null }, `Named ${value.trim()}`)
    else this.focus({ preventScroll: true })
  }

  #colour(color: DiagramColor | null) {
    const target = this.#state.target
    if (target) this.#commit(colorTarget(this.#source, this.#layout, target, color), { target }, color ? COLOR_NAMES[color] : 'No colour')
  }

  /** Wrapping on or off: fitted to the width it is read in, in strips, or kept as drawn. It is written on the fence (```` ```diagram wrap ````). */
  #wrap() {
    const wraps = !diagramWraps(this.#open)
    this.#commit(this.#source, {}, wraps ? 'Fits the width' : 'Keeps its layout', diagramFenceWrapped(this.#open, wraps))
  }

  /** A prompt under the board; its answer is the diagram written again, while the drawing glistens. */
  #ask() {
    const available = { available: false } as { available: boolean }
    this.dispatchEvent(new CustomEvent('aa-atom-prompt', { bubbles: true, composed: true, detail: available }))
    if (!available.available) { say('Asking AI is not set up here'); return }
    this.#asking?.close()
    this.#asking = openPrompt({
      place: () => { const board = this.getBoundingClientRect(), tools = this.#tools.getBoundingClientRect(), unit = this.#unit(); return new DOMRect(board.left, (tools.height ? tools.bottom : this.#paper.getBoundingClientRect().bottom) + 1, board.width, unit) },
      type: this,
      // The board makes room under its tools for the prompt, so the writing under it moves down as it grows.
      grow: height => { this.style.paddingBottom = height ? `${height + 1}px` : '' },
      placeholder: 'Press space to speak',
      about: () => this.#drawing ? [this.#drawing] : [],
      send: async (prompt, signal) => {
        const detail: { prompt: string; text: string; signal: AbortSignal; answer?: Promise<string> } = { prompt, text: this.#source, signal }
        this.dispatchEvent(new CustomEvent('aa-atom-prompt', { bubbles: true, composed: true, detail }))
        const answer = (await detail.answer)?.replace(/^\s*```[^\n]*\n|\n```\s*$/g, '').trim()
        if (!answer || !this.isConnected) throw new Error('Not answered')
        this.#commit(answer, { target: null }, 'Drawn')
      },
      close: sent => { this.#asking = null; if (!sent && this.isConnected) this.focus({ preventScroll: true }) },
    })
  }

  #delete() {
    const target = this.#state.target
    if (target) this.#commit(deleteTarget(this.#source, this.#layout, target), { target: null }, `Deleted ${this.#describe(target)}`)
  }

  #key(event: KeyboardEvent) {
    const from = event.composedPath()[0]
    // Writing a name: Enter keeps it, Escape leaves the old one; every key is the field's.
    if (from === this.#rename) {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); this.#finishRename(true) }
      else if (event.key === 'Escape') { event.preventDefault(); this.#finishRename(false) }
      return
    }
    const mod = isMac ? event.metaKey : event.ctrlKey
    // Undo and redo are the editor's, which takes the board's changes back as it takes any other.
    if (mod && /^[zy]$/i.test(event.key)) return
    event.stopPropagation()
    // A key on a tool is the tool's.
    if (from !== this || !this.#editable() || event.isComposing) return
    const target = this.#state.target
    const group = target && 'group' in target ? this.#layout.groups[target.group] : undefined
    const key = event.key.toLowerCase()
    if (event.key === 'Escape') {
      event.preventDefault()
      if (this.#state.mode !== 'choose') this.#setMode('choose')
      else if (target) this.#choose(null)
      else this.#leave(true)
      return
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
      const things = this.#things()
      const at = target ? things.findIndex(thing => same(thing, target)) : -1
      const next = at < 0 ? (event.shiftKey ? things.length - 1 : 0) : at + (event.shiftKey ? -1 : 1)
      // Past the first or the last, Tab goes on to the tools and out.
      if (next < 0 || next >= things.length) return
      event.preventDefault()
      this.#choose(things[next])
      return
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && target) { event.preventDefault(); this.#delete(); return }
    if ((event.key === 'Enter' || event.key === 'F2') && target && !('join' in target)) { event.preventDefault(); this.#startRename(target); return }
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number] | undefined>)[event.key]
    if (step && !mod) {
      event.preventDefault()
      if (!target) { this.#leave(step[0] + step[1] > 0); return }
      if (!group || !('group' in target)) return
      if (event.altKey) {
        // Sized from the keys a whole item at a time: a box across, a post-it every way.
        const by = (group.kind === 'post-it' ? step[0] + step[1] : step[0]) * 4
        if (by) this.#commit(resizeGroup(this.#source, this.#layout, target.group, group.w + by), { target: { group: target.group } }, `Sized ${this.#nameOf(target) ?? ''}`.trim())
        return
      }
      const by = event.shiftKey ? 4 : 1
      this.#commit(moveGroup(this.#source, this.#layout, target.group, Math.max(0, group.x + step[0] * by), Math.max(0, group.y + step[1] * by)), { target: { group: target.group } }, `Moved ${this.#nameOf(target) ?? ''}`.trim())
      return
    }
    if (mod || event.altKey) return
    // Space asks AI to draw on it, where the editor can ask (Space twice listens).
    if (event.key === ' ' && !this.#state.renaming) { event.preventDefault(); this.#ask(); return }
    if (key === 'i' || key === 'n') { event.preventDefault(); this.#add(key === 'i' ? 'box' : 'post-it'); return }
    if (key === 'l' || key === 'a') {
      event.preventDefault()
      const mode = key === 'l' ? 'line' : 'arrow'
      // A box chosen is joined from the keys; a line chosen becomes one; with nothing chosen, lines are drawn by hand.
      if (target && !('join' in target) && referenceOf(this.#layout, target) && this.#grid) this.#grid.keyboard({ surface: this.#paper, from: this.#middleOf(target), gesture: this.#joining(target, mode) })
      else this.#lineTool(mode)
      return
    }
    if (key === 'v') { event.preventDefault(); this.#setMode('choose') }
  }
}

/** Define the board, once. */
export function defineAaDiagramBoard(): string {
  const name = 'aa-diagram-board'
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, AaDiagramBoardElement)
  return name
}

declare global {
  interface HTMLElementTagNameMap {
    'aa-diagram-board': AaDiagramBoardElement
  }
}
