/**
 * A diagram's board: a diagram drawn in an editor, changed where it stands.
 *
 * Chosen (pressed, or reached with Tab), the board rules its squares under
 * the drawing and shows a row of tools over it: choose and move, a box, a
 * post-it, a line and an arrow, the pale accents, delete, and the diagram's
 * words. Every change is written back as the words a person would write
 * (`diagram-edit.ts`) and handed to the editor in `aa-atom-change`, so the
 * document stays Markdown and undo takes a change back as one step.
 *
 * Moving a group carries it a square at a time and writes its `@ x y` when
 * it is let go; a double press on a box, or Enter, names it; a box or a
 * post-it lands on the square pressed and is named at once; a line runs
 * from the box pressed to the box let go over. Arrows move what is chosen a
 * square, Delete takes it away, Escape lets it go.
 *
 * The editor draws a block again after every change, so the board keeps
 * what it was doing (its tool, what is chosen, a name being written) for its
 * block, and takes the keys back when it is drawn again.
 */

import { DIAGRAM_COLORS, layoutDiagram, type Diagram, type DiagramColor, type DiagramGroup } from './diagram-language'
import { addGroup, addJoin, colorTarget, deleteTarget, freeName, moveGroup, referenceOf, renameTarget, type DiagramTarget } from './diagram-edit'
import styles from './diagram-board.css?inline'
import cursorIcon from './icons/cursor.svg?raw'
import boxIcon from './icons/box.svg?raw'
import noteIcon from './icons/note.svg?raw'
import connectIcon from './icons/connect.svg?raw'
import arrowIcon from './icons/right.svg?raw'
import deleteIcon from './icons/delete.svg?raw'
import wordsIcon from './icons/code.svg?raw'

type Tool = 'select' | 'box' | 'post-it' | 'line' | 'arrow'
type Rect = { x: number; y: number; w: number; h: number }
type State = { block: number; tool: Tool; target: DiagramTarget | null; renaming: DiagramTarget | null; active: boolean; keep: boolean }

const TOOLS: { tool: Tool; label: string; icon: string; key: string }[] = [
  { tool: 'select', label: 'Choose and move', icon: cursorIcon, key: 'v' },
  { tool: 'box', label: 'Box', icon: boxIcon, key: 'b' },
  { tool: 'post-it', label: 'Post-it', icon: noteIcon, key: 'p' },
  { tool: 'line', label: 'Line', icon: connectIcon, key: 'l' },
  { tool: 'arrow', label: 'Arrow', icon: arrowIcon, key: 'a' },
]
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
/** How near a line a press takes it, in squares. */
const NEAR_LINE = 0.3

/** What each editor's boards are doing, by the editor's element: a block is drawn again after each change. */
const states = new WeakMap<Element, State>()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const svgMask = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

const Base = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement

export class AaDiagramBoardElement extends Base {
  /** The fenced block as written: its fences, kept as they are, and the diagram between them. */
  #open = '```diagram'
  #close = '```'
  #source = ''
  #layout: Diagram = layoutDiagram('')
  #drawing: (HTMLElement & { source?: string }) | null = null
  #paper!: HTMLElement
  #layer!: HTMLElement
  #ring!: HTMLElement
  #ghost!: HTMLElement
  #lines!: SVGSVGElement
  #rename!: HTMLInputElement
  #tools!: HTMLElement
  #probe!: HTMLElement
  #state: State = { block: -1, tool: 'select', target: null, renaming: null, active: false, keep: false }
  /** A press being carried: a group moving, or a line being drawn. */
  #press: { id: number; x: number; y: number; target: DiagramTarget | null; from?: Rect; origin?: { x: number; y: number }; moved: boolean; working?: string } | null = null
  #stop: (() => void)[] = []

  /** The block's whole source, fences included, and the element the diagram is drawn with. */
  set block(value: { source: string; tag: string }) {
    const lines = value.source.replace(/\r\n?/g, '\n').split('\n')
    this.#open = lines[0] ?? '```diagram'
    this.#close = lines.length > 1 ? lines[lines.length - 1] : '```'
    this.#source = lines.slice(1, -1).join('\n')
    this.#layout = layoutDiagram(this.#source)
    if (!this.shadowRoot) this.#build(value.tag)
    this.#drawing!.source = this.#source
  }

  #build(tag: string) {
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = styles
    this.#probe = Object.assign(document.createElement('div'), { className: 'probe' })
    this.#tools = Object.assign(document.createElement('div'), { className: 'tools' })
    this.#tools.setAttribute('role', 'toolbar')
    this.#tools.setAttribute('aria-label', 'Diagram')
    this.#paper = Object.assign(document.createElement('div'), { className: 'paper' })
    this.#drawing = document.createElement(tag)
    this.#layer = Object.assign(document.createElement('div'), { className: 'layer' })
    this.#ring = Object.assign(document.createElement('div'), { className: 'ring', hidden: true })
    this.#ghost = Object.assign(document.createElement('div'), { className: 'ghost-box', hidden: true })
    this.#lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.#lines.setAttribute('class', 'lines')
    this.#lines.setAttribute('aria-hidden', 'true')
    this.#rename = Object.assign(document.createElement('input'), { className: 'rename', hidden: true, type: 'text' })
    this.#rename.setAttribute('aria-label', 'Name')
    this.#rename.spellcheck = false
    this.#layer.append(this.#ring, this.#ghost, this.#lines, this.#rename)
    this.#paper.append(this.#drawing, this.#layer)
    root.append(style, this.#probe, this.#tools, this.#paper)
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
    this.setAttribute('aria-label', 'Diagram board')
    const index = Array.from(host.children).indexOf(block)
    // Drawn again for the block it was working on, the board carries on where it was.
    const before = states.get(host)
    this.#state = before && before.block === index ? before : { block: index, tool: 'select', target: null, renaming: null, active: false, keep: false }
    states.set(host, this.#state)
    const listen = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler as EventListener, options)
      this.#stop.push(() => target.removeEventListener(type, handler as EventListener, options))
    }
    listen(this.#paper, 'pointerdown', event => this.#down(event))
    listen(this.#paper, 'pointermove', event => this.#move(event))
    listen(this.#paper, 'pointerup', event => this.#up(event))
    listen(this.#paper, 'pointercancel', () => this.#cancel())
    listen(this.#paper, 'pointerleave', () => { if (!this.#press) this.#ghost.hidden = true })
    listen(this.#paper, 'dblclick', event => this.#doubleClick(event))
    listen(this.#tools, 'pointerdown', event => { event.preventDefault(); event.stopPropagation(); this.#activate() })
    listen(this, 'keydown', event => this.#key(event))
    listen(this, 'focusout', event => this.#focusOut(event))
    listen(this.#rename, 'blur', () => { if (!this.#rename.hidden) this.#finishRename(true) })
    // The editor reads none of what happens on the board: its keys, its typing and its pastes are the board's.
    for (const type of ['keyup', 'keypress', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'compositionstart', 'compositionupdate', 'compositionend', 'click'] as const) {
      listen(this, type, event => event.stopPropagation())
    }
    if (this.#state.active) {
      this.#state.keep = false
      this.#show(true)
      queueMicrotask(() => {
        if (!this.isConnected) return
        if (this.#state.renaming) this.#startRename(this.#state.renaming)
        else this.focus({ preventScroll: true })
      })
    } else if (this.#preview()) this.#show(true)
  }

  disconnectedCallback() {
    this.#stop.forEach(stop => stop())
    this.#stop = []
  }

  #host(): HTMLElement | null { return this.closest('.aa') as HTMLElement | null }
  /** Drawn under its words, with the caret in them: the board shows its tools at once, as a diagram just started does. */
  #preview(): boolean { return !!this.closest('.aa-atom[data-preview]') }
  #blockElement(): HTMLElement | null { return this.closest('.aa-block') as HTMLElement | null }
  #editable(): boolean { return this.hasAttribute('data-editable') && this.#blockElement()?.dataset.readonly !== 'true' }

  /** One square, in pixels, as the drawing is set. */
  #unit(): number { return this.#probe.getBoundingClientRect().width || 20 }

  /** A pointer's place on the paper, in squares. */
  #at(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = this.#paper.getBoundingClientRect(), unit = this.#unit()
    return { x: (event.clientX - box.left + this.#paper.scrollLeft) / unit, y: (event.clientY - box.top) / unit }
  }

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
      this.#state.active = false
      this.#state.target = null
      this.#state.tool = 'select'
      this.#show(this.#preview())
    })
  }

  /** The board as chosen or not: its squares and tools, what is chosen ringed. */
  #show(active: boolean) {
    this.toggleAttribute('data-active', active)
    this.dataset.tool = this.#state.tool
    this.style.setProperty('--board-columns', String(Math.max(this.#layout.columns + 4, 12)))
    this.style.setProperty('--board-rows', String(Math.max(this.#layout.rows + 3, 6)))
    this.#drawTools()
    this.#drawChoice()
  }

  #drawTools() {
    const target = this.#state.target
    const group = target && 'group' in target ? this.#layout.groups[target.group] : undefined
    const colourable = !!group && (group.kind === 'box' || group.kind === 'stack' || group.kind === 'post-it')
    const button = (label: string, run: () => void, content: HTMLElement, pressed?: boolean, enabled = true) => {
      const node = document.createElement('button')
      node.type = 'button'; node.title = label; node.setAttribute('aria-label', label)
      if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed))
      node.disabled = !enabled
      node.append(content)
      node.addEventListener('click', event => { event.stopPropagation(); run() })
      return node
    }
    const icon = (svg: string) => { const node = document.createElement('span'); node.className = 'icon'; node.style.setProperty('--icon', svgMask(svg)); return node }
    const gap = () => Object.assign(document.createElement('span'), { className: 'gap' })
    const chip = (color: DiagramColor | null) => {
      const node = document.createElement('span'); node.className = 'chip'
      if (color) node.style.setProperty('--chip', CHIPS[color]); else node.dataset.none = ''
      return node
    }
    this.#tools.replaceChildren(
      ...TOOLS.map(({ tool, label, icon: svg, key }) => button(`${label} (${key.toUpperCase()})`, () => this.#setTool(tool), icon(svg), this.#state.tool === tool)),
      gap(),
      button('No colour', () => this.#colour(null), chip(null), undefined, colourable),
      ...DIAGRAM_COLORS.map(color => button(COLOR_NAMES[color], () => this.#colour(color), chip(color), undefined, colourable)),
      gap(),
      button('Delete', () => this.#delete(), icon(deleteIcon), undefined, !!target),
      button('Words', () => this.#words(), icon(wordsIcon)),
    )
  }

  #setTool(tool: Tool) {
    this.#state.tool = tool
    this.dataset.tool = tool
    this.#ghost.hidden = true
    this.#drawTools()
    this.focus({ preventScroll: true })
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

  #drawChoice(layout = this.#layout) {
    const target = this.#state.target
    const rect = target && this.#state.active ? this.#rectOf(target, layout) : null
    this.#ring.hidden = !rect
    if (rect) for (const [name, value] of Object.entries(rect)) this.#ring.style.setProperty(`--${name}`, String(value))
    this.#lines.replaceChildren()
    const unit = this.#unit()
    const join = target && 'join' in target && this.#state.active ? layout.lines[target.join] : undefined
    if (join) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', join.segments.map((s, i) => `${i ? '' : `M${s.x1 * unit},${s.y1 * unit} `}L${s.x2 * unit},${s.y2 * unit}`).join(' '))
      this.#lines.append(path)
    }
  }

  #choose(target: DiagramTarget | null) {
    this.#state.target = target
    this.#drawTools()
    this.#drawChoice()
  }

  /** Hand the editor the block written anew; the board is drawn again with it. */
  #commit(source: string, next: Partial<Pick<State, 'target' | 'renaming' | 'tool'>> = {}) {
    if (source === this.#source) { Object.assign(this.#state, next); this.#drawTools(); this.#drawChoice(); return }
    Object.assign(this.#state, next, { active: true, keep: true })
    const block = `${this.#open}\n${source}${source ? '\n' : ''}${this.#close}`
    this.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, composed: true, detail: { source: block } }))
    // Not taken (read only, or no editor to take it): the board stays as it was.
    if (this.isConnected) { this.#state.keep = false; this.#drawing!.source = this.#source }
  }

  #down(event: PointerEvent) {
    if (!this.#editable() || (event.pointerType === 'mouse' && event.button !== 0)) return
    // The press is the board's: the caret, the selection and the block's own drag stay where they were.
    event.preventDefault()
    event.stopPropagation()
    this.#activate()
    if (!this.#rename.hidden) this.#finishRename(true)
    const at = this.#at(event)
    const hit = this.#hit(at.x, at.y)
    const tool = this.#state.tool
    if (tool === 'box' || tool === 'post-it') {
      // A post-it stands on the columns, four squares apart, as the diagram sets it.
      const x = tool === 'post-it' ? Math.max(0, Math.round(at.x / 4) * 4) : Math.floor(at.x), y = Math.floor(at.y)
      const name = freeName(this.#layout, tool === 'box' ? 'Box' : 'Note')
      const source = addGroup(this.#source, this.#layout, tool, name, x, y)
      const index = layoutDiagram(source).groups.findIndex(group => (group.kind === 'box' ? group.boxes[0]?.text : group.name) === name)
      const target = index >= 0 ? { group: index } : null
      this.#commit(source, { target, renaming: target, tool: 'select' })
      return
    }
    this.#paper.setPointerCapture?.(event.pointerId)
    if (tool === 'line' || tool === 'arrow') {
      const from = hit && !('join' in hit) ? this.#rectOf(hit) ?? undefined : undefined
      this.#press = { id: event.pointerId, x: at.x, y: at.y, target: hit, from, moved: false }
      return
    }
    this.#choose(hit)
    const group = hit && 'group' in hit ? this.#layout.groups[hit.group] : undefined
    this.#press = { id: event.pointerId, x: at.x, y: at.y, target: hit, origin: group ? { x: group.x, y: group.y } : undefined, moved: false }
    if (group) this.setAttribute('data-moving', '')
  }

  #move(event: PointerEvent) {
    const at = this.#at(event)
    if (!this.#press) {
      // Under the pointer: a box to be placed, or a hand over what can be carried.
      const placing = this.#state.tool === 'box' || this.#state.tool === 'post-it'
      this.#ghost.hidden = !placing || !this.#state.active
      if (placing) {
        const size = this.#state.tool === 'box' ? { w: 4, h: 1 } : { w: 8, h: 8 }
        for (const [name, value] of Object.entries({ x: this.#state.tool === 'post-it' ? Math.max(0, Math.round(at.x / 4) * 4) : Math.floor(at.x), y: Math.floor(at.y), ...size })) this.#ghost.style.setProperty(`--${name}`, String(value))
      }
      const hit = this.#state.tool === 'select' && this.#editable() ? this.#hit(at.x, at.y) : null
      this.toggleAttribute('data-over', !!hit && 'group' in hit)
      return
    }
    if (event.pointerId !== this.#press.id) return
    const press = this.#press
    if (press.from) {
      // A line being drawn runs from the middle of its box to the pointer.
      const unit = this.#unit()
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String((press.from.x + press.from.w / 2) * unit)); line.setAttribute('y1', String((press.from.y + press.from.h / 2) * unit))
      line.setAttribute('x2', String(at.x * unit)); line.setAttribute('y2', String(at.y * unit))
      this.#lines.replaceChildren(line)
      press.moved = true
      return
    }
    if (!press.origin || !press.target || 'join' in press.target) return
    // A group is carried a whole square at a time.
    const dx = Math.round(at.x - press.x), dy = Math.round(at.y - press.y)
    if (!dx && !dy && !press.moved) return
    press.moved = true
    const working = moveGroup(this.#source, this.#layout, press.target.group, press.origin.x + dx, press.origin.y + dy)
    if (working === press.working) return
    press.working = working
    this.#drawing!.source = working
    this.#drawChoice(layoutDiagram(working))
  }

  #up(event: PointerEvent) {
    const press = this.#press
    if (!press || event.pointerId !== press.id) return
    this.#press = null
    this.removeAttribute('data-moving')
    this.#paper.releasePointerCapture?.(event.pointerId)
    const at = this.#at(event)
    if (press.from) {
      this.#lines.replaceChildren()
      const to = this.#hit(at.x, at.y)
      const from = press.target ? referenceOf(this.#layout, press.target) : undefined
      const end = to ? referenceOf(this.#layout, to) : undefined
      if (from && end && from.toLowerCase() !== end.toLowerCase()) this.#commit(addJoin(this.#source, from, end, this.#state.tool === 'arrow' ? '->' : '--'))
      else this.#drawChoice()
      return
    }
    if (press.working && press.working !== this.#source) this.#commit(press.working, { target: press.target })
  }

  #cancel() {
    if (!this.#press) return
    this.#press = null
    this.removeAttribute('data-moving')
    this.#drawing!.source = this.#source
    this.#drawChoice()
  }

  #doubleClick(event: MouseEvent) {
    if (!this.#editable() || this.#state.tool !== 'select') return
    event.preventDefault()
    const at = this.#at(event)
    const hit = this.#hit(at.x, at.y)
    if (hit && !('join' in hit)) { this.#startRename(hit); return }
    if (hit) return
    // A double press on an empty square puts a box there.
    const name = freeName(this.#layout, 'Box')
    const source = addGroup(this.#source, this.#layout, 'box', name, Math.floor(at.x), Math.floor(at.y))
    const index = layoutDiagram(source).groups.findIndex(group => group.kind === 'box' && group.boxes[0]?.text === name)
    const target = index >= 0 ? { group: index } : null
    this.#commit(source, { target, renaming: target })
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
    for (const [key, value] of Object.entries(rect)) this.#rename.style.setProperty(`--${key}`, String(value))
    this.#rename.value = name
    this.#rename.hidden = false
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
    if (keep && value.trim() && value.trim() !== this.#nameOf(target)) this.#commit(renameTarget(this.#source, this.#layout, target, value), { target, renaming: null })
    else this.focus({ preventScroll: true })
  }

  #colour(color: DiagramColor | null) {
    const target = this.#state.target
    if (target) this.#commit(colorTarget(this.#source, this.#layout, target, color), { target })
  }

  #delete() {
    const target = this.#state.target
    if (target) this.#commit(deleteTarget(this.#source, this.#layout, target), { target: null })
  }

  /** The diagram's words: the caret into its block, which then shows them as code, the board under them. */
  #words() {
    const block = this.#blockElement()
    if (!block) return
    this.#state.active = false
    this.#state.keep = false
    block.focus({ preventScroll: true })
    window.getSelection()?.collapse(block, 0)
  }

  #key(event: KeyboardEvent) {
    // Writing a name: Enter keeps it, Escape leaves the old one; every key is the field's.
    if (event.composedPath()[0] === this.#rename) {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); this.#finishRename(true) }
      else if (event.key === 'Escape') { event.preventDefault(); this.#finishRename(false) }
      return
    }
    const mod = isMac ? event.metaKey : event.ctrlKey
    // Undo and redo are the editor's, which takes the board's changes back as it takes any other.
    if (mod && /^[zy]$/i.test(event.key)) return
    event.stopPropagation()
    if (!this.#editable() || event.isComposing) return
    const target = this.#state.target
    if (event.key === 'Escape') {
      event.preventDefault()
      if (this.#press) this.#cancel()
      else if (this.#state.tool !== 'select') this.#setTool('select')
      else if (target) this.#choose(null)
      else this.blur()
      return
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && target) { event.preventDefault(); this.#delete(); return }
    if (event.key === 'Enter' && target && !('join' in target)) { event.preventDefault(); this.#startRename(target); return }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (step && target && 'group' in target) {
      event.preventDefault()
      const group = this.#layout.groups[target.group]
      const by = event.shiftKey ? 4 : 1
      if (group) this.#commit(moveGroup(this.#source, this.#layout, target.group, Math.max(0, group.x + step[0] * by), Math.max(0, group.y + step[1] * by)), { target: { group: target.group } })
      return
    }
    if (!mod && !event.altKey) {
      const tool = TOOLS.find(each => each.key === event.key.toLowerCase())
      if (tool) { event.preventDefault(); this.#setTool(tool.tool) }
    }
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
