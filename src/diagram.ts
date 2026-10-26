/**
 * Diagrams, Aa's optional entry (`@0001-labs/aa/diagram`): boxes and lines
 * on Design system 1's squares, drawn by hand on a board and kept as words.
 * The words are `diagram-language.ts`, which servers and agents read; this
 * draws them.
 *
 * - `<aa-diagram source="[Ideas]&#10;[Agents] @ 0 3&#10;Ideas -> Agents"></aa-diagram>`
 * - `<aa-diagram>…the source as text…</aa-diagram>`
 * - `element.source = "…"`
 *
 * `defineAaDiagram()` defines the element, under a product's own name too
 * (`defineAaDiagram('ezo-diagram')`), and `diagramAtom` gives an editor
 * fenced ```diagram blocks drawn in place and changed there by hand, with a
 * toolbar button and a slash command that start one.
 *
 * It sizes itself in squares (`--diagram-columns`, `--diagram-rows` on the
 * host), so whatever holds it can reserve its rows before it has drawn. Once
 * drawn it measures its names and lays the diagram out again with their
 * widths, so a line into a name meets the name's middle; again when the
 * typeface arrives, since a fallback's names are another width.
 *
 * Its measures are Design system 1's (`--ds-grid-unit`), or a product's own
 * through `--aa-diagram-unit`, `--aa-diagram-stroke`, `--aa-diagram-ink`,
 * `--aa-diagram-cell`, `--aa-diagram-radius` and `--aa-diagram-paper`.
 *
 * Nothing here touches the page until an element is made, so the language it
 * carries can be read on a server too.
 */

import { layoutDiagram, type Diagram, type DiagramChart, type DiagramDay, type DiagramSegment } from './diagram-language'
import type { Atom } from './editor'
import { defineAaDiagramBoard, type AaDiagramBoardElement } from './diagram-board'
import styles from './diagram.css?inline'
import { word } from './words'

export * from './diagram-language'
export * from './diagram-edit'
export { AaDiagramBoardElement, defineAaDiagramBoard } from './diagram-board'

// The marker's drawing loads only once a diagram holds a chart or squares
// coloured in with it, so the many pages that draw diagrams without one never carry it.
type MarkerInk = typeof import('./marker')
type MarkerLayer = import('./marker').MarkerLayer
let markerInk: MarkerInk | undefined
let markerLoading: Promise<MarkerInk> | undefined

/**
 * The arrow's two strokes, in squares back from the tip and out to each side:
 * each four pixels long (a fifth of a square) at 35 degrees to the line, a
 * small point on the line's end rather than a head of its own.
 */
const ARROW_LENGTH = 0.2
const ARROW_ANGLE = (35 * Math.PI) / 180
const ARROW_BACK = ARROW_LENGTH * Math.cos(ARROW_ANGLE)
const ARROW_SIDE = ARROW_LENGTH * Math.sin(ARROW_ANGLE)

/** A square in a chart's drawing: twenty units, as a square is twenty pixels at the base scale. */
const UNIT = 20
/** A marker line's width in units: five pixels at the base scale, as Anthropic's lines are. */
const MARKER_WIDTH = 5

const Base = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement
let sheet: CSSStyleSheet | undefined

export class AaDiagramElement extends Base {
  static observedAttributes = ['source', 'wrap', 'data-editing']

  #source: string | undefined
  #changed = true
  #queued = false
  #style: HTMLStyleElement | null = null
  #diagram: Diagram = layoutDiagram('')
  /** Each name's width in squares, as last measured here. */
  #widths = new Map<string, number>()
  /** The squares across the diagram's holder has, where it wraps. */
  #room: number | undefined
  #resize: ResizeObserver | undefined
  /** How round a line's turns are, in squares: a cell's corner radius in a rounded shape, none in the square one. */
  #bend = 0
  /** Settles once the diagram has drawn what it was last given. */
  updateComplete: Promise<boolean> = Promise.resolve(true)

  get source(): string | undefined { return this.#source }
  set source(value: string | undefined) {
    if (value === this.#source) return
    this.#source = value
    this.#changed = true
    this.requestUpdate()
  }

  /** The diagram as last laid out. */
  get diagram(): Diagram { return this.#diagram }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (name === 'source') this.source = value ?? undefined
    else if (old !== value) { this.#changed = true; this.requestUpdate() }
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' })
      try {
        sheet ??= new CSSStyleSheet()
        if (!sheet.cssRules.length) sheet.replaceSync(styles)
        root.adoptedStyleSheets = [sheet]
      } catch {
        this.#style = document.createElement('style')
        this.#style.textContent = styles
      }
    }
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img')
    // Written between the tags, the source is read once and kept. Its indent
    // in the page is taken off, since indenting is how a box is written.
    if (this.#source === undefined && this.textContent?.trim()) this.source = dedent(this.textContent)
    void document.fonts?.ready.then(() => { if (this.isConnected) this.requestUpdate() })
    shapeWatchers.add(this)
    watchShape()
    // The holder's width is the room a wrapping diagram fits, and says whether one that does not wrap fits the window.
    if (typeof ResizeObserver !== 'undefined' && this.parentElement) {
      this.#resize ??= new ResizeObserver(() => this.requestUpdate())
      this.#resize.observe(this.parentElement)
    }
    this.requestUpdate()
  }

  disconnectedCallback() {
    shapeWatchers.delete(this)
    this.#resize?.disconnect()
  }

  /** Whether it is laid out again to fit its holder: `wrap`, and not while its board is drawing on it. */
  #wraps(): boolean { return this.hasAttribute('wrap') && !this.hasAttribute('data-editing') }

  /** Draw again once the current task is done; many asks make one drawing. */
  requestUpdate() {
    if (this.#queued) return
    this.#queued = true
    this.updateComplete = new Promise(resolve => queueMicrotask(() => {
      this.#queued = false
      if (this.isConnected && this.shadowRoot) this.#update()
      resolve(!this.#queued)
    }))
  }

  /** The interface's shape changed: a line's turns follow the cells' corners. */
  shapeChanged() { this.requestUpdate() }

  #layout() {
    this.#diagram = layoutDiagram(this.#source ?? '', text => this.#widths.get(text), this.#wraps() && this.#room ? { room: this.#room } : {})
  }

  #update() {
    if (this.#changed) {
      this.#changed = false
      this.#layout()
      this.style.setProperty('--diagram-columns', String(this.#diagram.columns))
      this.style.setProperty('--diagram-rows', String(this.#diagram.rows))
      const words = [...this.#diagram.labels.map(label => label.text), ...this.#diagram.boxes.map(box => box.text)]
      this.setAttribute('aria-label', words.join(', ') || word('Diagram'))
    }
    this.shadowRoot!.replaceChildren(...(this.#style ? [this.#style] : []), ...this.#render())
    this.#measure()
  }

  #measure() {
    const root = this.shadowRoot!
    // A marker's passes multiply on light paper, as ink does; on dark paper that would turn them black, so they lie over it plainly.
    // The scheme is read as every colour is chosen, through light-dark(): the host's caret colour is black in the light and white in the dark.
    this.toggleAttribute('data-dark', isLight(getComputedStyle(this).caretColor))
    // A name's width only moves a line when it crosses a whole square, so
    // only then is the diagram laid out again; that settles in one pass.
    const names = [...root.querySelectorAll<HTMLElement>('.label > span')]
    // A name or a box is one square tall, whichever the diagram has.
    const unit = root.querySelector<HTMLElement>('.label, .box')?.getBoundingClientRect().height ?? 0
    if (!unit) return
    // A turn is as round as a cell's corner, the radius the product hands in.
    // Wider than the window, it cannot reach past its holder on both sides: it stands at its holder's edge and scrolls sideways itself.
    const width = this.#diagram.columns * unit
    const holder = this.parentElement?.getBoundingClientRect()
    const narrow = !this.hasAttribute('data-editing') && !!holder && width > holder.width && width - holder.width > 2 * Math.min(holder.left, window.innerWidth - holder.right)
    this.toggleAttribute('data-narrow', narrow)
    const room = holder && holder.width ? Math.max(4, Math.floor(holder.width / unit)) : undefined
    if (this.#wraps() && room !== this.#room) {
      this.#room = room
      this.#changed = true
      this.requestUpdate()
    } else this.#room = room
    const bend = (parseFloat(getComputedStyle(this).getPropertyValue('--aa-diagram-radius')) || 0) / unit
    if (Math.abs(bend - this.#bend) > 0.01) {
      this.#bend = bend
      this.requestUpdate()
    }
    const widths = new Map(names.map(name => [name.textContent ?? '', name.getBoundingClientRect().width / unit]))
    const moved = [...widths].some(([text, width]) => Math.round(width) !== Math.round(this.#widths.get(text) ?? NaN))
    if (!moved) return
    this.#widths = widths
    this.#layout()
    this.requestUpdate()
  }

  /** A chart's ink, once the marker's drawing has loaded; its names stand meanwhile. */
  #chartInk(charts: DiagramChart[], inked: DiagramDay[], columns: number, rows: number): Node[] {
    if (markerInk) return [markup(chartInk(markerInk, charts, inked, columns, rows))]
    markerLoading ??= import('./marker').then(ink => (markerInk = ink))
    void markerLoading.then(() => { if (this.isConnected) this.requestUpdate() })
    return []
  }

  #render(): Node[] {
    const { columns, rows, labels, postIts, boxes, days, charts, lines } = this.#diagram
    const inked = days.filter(day => day.marker)
    const place = (x: number, y: number, w: number) => `--x:${x};--y:${y};--w:${w}`
    const shared = (edges: DiagramDay['shared']) => ({ 'data-shared-top': !!edges?.top, 'data-shared-right': !!edges?.right, 'data-shared-bottom': !!edges?.bottom, 'data-shared-left': !!edges?.left })
    const nodes: Node[] = []
    for (const postIt of postIts) nodes.push(element('div', 'post-it', { part: 'post-it', style: `${place(postIt.x, postIt.y, postIt.w)};--h:${postIt.h}`, 'data-color': postIt.color }))
    // One stroke from end to end, so its turns are joined corners rather
    // than two caps laid over each other, rounded as the cells are.
    const strokes = lines.map(line => {
      const last = line.segments[line.segments.length - 1]
      return last ? `<path d="${linePath(line.segments, this.#bend)}" vector-effect="non-scaling-stroke"></path>${line.arrow ? arrow(last) : ''}` : ''
    }).join('')
    nodes.push(markup(`<svg class="lines" viewBox="0 0 ${Math.max(columns, 1)} ${Math.max(rows, 1)}" preserveAspectRatio="none" aria-hidden="true">${strokes}</svg>`))
    if (charts.length || inked.length) nodes.push(...this.#chartInk(charts, inked, columns, rows))
    for (const chart of charts) nodes.push(...chartNames(chart))
    for (const label of labels) nodes.push(element('div', 'label', { part: label.title ? 'title' : 'label', style: place(label.x, label.y, label.w) }, element('span', '', {}, label.text)))
    for (const box of boxes) nodes.push(element('div', 'box', { part: 'box', style: place(box.x, box.y, box.w), 'data-color': box.color, ...shared(box.shared) }, element('span', '', {}, box.text)))
    for (const day of days) {
      nodes.push(element('div', 'day', {
        part: 'day', style: place(day.x, day.y, 1), 'data-color': day.color,
        'data-name': !!day.name, 'data-head': !!day.head, 'data-row': !!day.row, 'data-edge': !!day.edge, 'data-slant': !!day.slant, 'data-marker': !!day.marker,
        ...shared(day.shared),
      }, day.text))
    }
    return nodes
  }
}

/** An element with its attributes (left off when false or unset) and its words or children. */
function element(tag: string, className: string, attributes: Record<string, string | boolean | undefined>, content?: string | Node): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    node.setAttribute(name, value === true ? '' : value)
  }
  if (typeof content === 'string') node.textContent = content
  else if (content) node.append(content)
  return node
}

/** A drawing written as markup, of numbers and names Aa chose, never of what was written. */
function markup(source: string): Node {
  const template = document.createElement('template')
  template.innerHTML = source
  return template.content.firstElementChild ?? document.createTextNode('')
}

/**
 * Every chart's ink in one drawing over the whole diagram, in units of
 * twenty to the square so the grain and the wander keep their size as the
 * page scales, built as Anthropic builds its charts: each chart's card ruled
 * by hand, faint; plain hairlines on the values it names; the squares
 * coloured in with a marker; then each series as a marker's line. Everything
 * is seeded by its place, so it is drawn the same way every time.
 */
function chartInk({ MARKER_FILTERS, markerSquare, markerFrame, markerLine }: MarkerInk, charts: DiagramChart[], inked: DiagramDay[], columns: number, rows: number): string {
  const tinted = (color?: string) => color ? ` data-color="${color}"` : ''
  return `<svg class="chart-ink" viewBox="0 0 ${columns * UNIT} ${rows * UNIT}" aria-hidden="true">
    <defs>${MARKER_FILTERS}</defs>
    ${charts.map((chart, index) => `<g class="chart-frame" filter="url(#aa-marker-rule)">${markerFrame(chart.frame.x * UNIT, chart.frame.y * UNIT, chart.frame.w * UNIT, chart.frame.h * UNIT, 501 + index * 97).map(markerPath).join('')}</g>`).join('')}
    <g class="chart-rules">${charts.flatMap(chart => chart.down.map(name => `<line x1="${chart.x * UNIT}" x2="${(chart.x + chart.w) * UNIT}" y1="${name.at * UNIT}" y2="${name.at * UNIT}"></line>`)).join('')}</g>
    ${inked.map(day => `<g class="marker-fill"${tinted(day.color)} filter="url(#aa-marker-fine)">${markerSquare(day.x * UNIT, day.y * UNIT, UNIT, 9001 + day.x * 131 + day.y * 17).map(markerPath).join('')}</g>`).join('')}
    ${charts.map((chart, index) => chart.series.map((series, line) => `<g class="chart-line"${tinted(series.color)} filter="url(#aa-marker)">${markerLine(series.points.map(point => ({ x: point.x * UNIT, y: point.y * UNIT })), MARKER_WIDTH, 101 + index * 13 + line * 5).map(markerPath).join('')}</g>`).join('')).join('')}
  </svg>`
}

/** One pass of a marker's mark, filled in its tone of the mark's ink. */
function markerPath(layer: MarkerLayer): string {
  return `<path class="marker-pass" data-tone="${layer.tone}" fill-opacity="${layer.opacity}" d="${layer.d}"></path>`
}

/** A chart's words: its values' names before the plot on their lines, its points' names under it, and each line's last value at its end. */
function chartNames(chart: DiagramChart): HTMLElement[] {
  const last = chart.across.length - 1
  return [
    ...chart.down.map(name => element('div', 'chart-name', { 'data-side': 'down', style: `--x:${chart.x - 1};--y:${name.at}` }, name.text)),
    ...chart.across.map((name, index) => element('div', 'chart-name', {
      'data-side': 'across',
      'data-align': index === 0 && last > 0 ? 'start' : index === last && last > 0 ? 'end' : 'middle',
      style: `--x:${name.at};--y:${chart.y + chart.h}`,
    }, name.text)),
    ...chart.series.map(series => {
      const end = series.points[series.points.length - 1]
      return element('div', 'chart-name', { 'data-side': 'end', 'data-color': series.color, style: `--x:${end.x};--y:${series.endAt}` }, series.end)
    }),
  ]
}

/** Whether a colour is light: the probe's white says the page is in the dark scheme. */
function isLight(color: string): boolean {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
}

/** Text without the indent every line of it shares. */
function dedent(text: string): string {
  const lines = text.replace(/\t/g, '  ').split('\n')
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const indent = Math.min(...lines.filter(line => line.trim()).map(line => /^ */.exec(line)![0].length))
  return lines.map(line => line.slice(indent)).join('\n')
}

/** Every diagram on the page, told when the interface's shape or theme changes. */
const shapeWatchers = new Set<AaDiagramElement>()
let shapeObserver: MutationObserver | undefined

/** Watch the page's root once, for every diagram on it: its shape, theme, class and style. */
function watchShape() {
  if (shapeObserver || typeof MutationObserver === 'undefined') return
  shapeObserver = new MutationObserver(() => shapeWatchers.forEach(diagram => diagram.shapeChanged()))
  shapeObserver.observe(document.documentElement, { attributes: true })
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => shapeWatchers.forEach(diagram => diagram.shapeChanged()))
}

/**
 * A line through its turns, each turn an arc of `bend` squares, never more
 * than half of either run it joins so two turns close together still meet.
 * With no bend the turns are square corners, as the square shape draws them.
 */
export function linePath(segments: DiagramSegment[], bend: number): string {
  if (!segments.length) return ''
  const parts = [`M${segments[0].x1},${segments[0].y1}`]
  segments.forEach((segment, index) => {
    const next = segments[index + 1]
    const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)
    const nextLength = next ? Math.hypot(next.x2 - next.x1, next.y2 - next.y1) : 0
    const dx = Math.sign(segment.x2 - segment.x1), dy = Math.sign(segment.y2 - segment.y1)
    const ndx = next ? Math.sign(next.x2 - next.x1) : 0, ndy = next ? Math.sign(next.y2 - next.y1) : 0
    // Straight on, or no bend asked for: the run goes to its end.
    const turn = dx * ndy - dy * ndx
    const radius = next && turn ? Math.min(bend, length / 2, nextLength / 2) : 0
    if (radius <= 0) {
      parts.push(`L${segment.x2},${segment.y2}`)
      return
    }
    parts.push(`L${segment.x2 - dx * radius},${segment.y2 - dy * radius}`)
    // Down the page is +y, so a turn to the right (positive cross) sweeps clockwise.
    parts.push(`A${radius},${radius} 0 0 ${turn > 0 ? 1 : 0} ${segment.x2 + ndx * radius},${segment.y2 + ndy * radius}`)
  })
  return parts.join(' ')
}

/**
 * Two short strokes back from the end of a line, one to each side, drawn as
 * one stroke so the tip is a single mitred point the line runs into.
 */
function arrow(s: DiagramSegment): string {
  const dx = Math.sign(s.x2 - s.x1), dy = Math.sign(s.y2 - s.y1)
  const bx = s.x2 - dx * ARROW_BACK, by = s.y2 - dy * ARROW_BACK
  const ox = dy * ARROW_SIDE, oy = dx * ARROW_SIDE
  return `<polyline class="arrow" points="${bx + ox},${by + oy} ${s.x2},${s.y2} ${bx - ox},${by - oy}" vector-effect="non-scaling-stroke"></polyline>`
}

/** The name the editor's diagrams are drawn under: the last one defined. */
let diagramTag = ''

/**
 * Define the diagram element: `<aa-diagram>` unless a product names its own,
 * which may be defined beside it. Returns the name.
 */
export function defineAaDiagram(name = 'aa-diagram'): string {
  diagramTag = name
  if (typeof customElements === 'undefined' || customElements.get(name)) return name
  customElements.define(name, name === 'aa-diagram' ? AaDiagramElement : class extends AaDiagramElement {})
  return name
}

/** A first diagram to start from: two boxes and the line between them. */
export const DIAGRAM_START = '```diagram\n[Idea]\n[Plan] @ 6 0\nIdea -> Plan\n```'

/**
 * Fenced ```diagram blocks drawn in place in an editor: `atoms: [imageAtom,
 * diagramAtom]`. The drawing stands in for its words on a board
 * (`diagram-board.ts`), and its words are never shown: pressed, or with the
 * caret come into the block, it shows its squares and the tools that draw
 * on them, is changed there by hand and from the keys, and writes what is
 * drawn back as words. Its toolbar button and slash command start one.
 */
export const diagramAtom: Atom = {
  name: 'diagram',
  fence: 'diagram',
  match: () => 0,
  insert: { label: 'Diagram', icon: 'connect', keywords: 'chart boxes lines flow draw', source: DIAGRAM_START },
  draw(holder, source) {
    const board = document.createElement(defineAaDiagramBoard()) as AaDiagramBoardElement
    board.block = { source, tag: diagramTag || defineAaDiagram() }
    holder.append(board)
  },
}

declare global {
  interface HTMLElementTagNameMap {
    'aa-diagram': AaDiagramElement
  }
}
