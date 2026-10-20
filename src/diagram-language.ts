/**
 * Aa's diagrams: boxes and lines drawn on Design system 1's squares.
 *
 * A diagram is written, not drawn, so it lives in writing like any other
 * words: a fenced ```diagram block in a document, a note or a block of
 * writing on a list. Aa draws it in place (`diagram.ts`); this file only
 * reads it and lays it out, with nothing of the page, so a server can count
 * a diagram's squares too.
 * Everything in it stands on the grid. A box is a whole number of squares, a
 * label takes one row, a group's boxes stack edge to edge, and a line between
 * two groups runs from the centre of one to the centre of the other, turning
 * only on a grid line.
 *
 *     # A continuous loop
 *
 *     Spec/docs @ 0 3
 *       Figma
 *       Notion
 *       Convex
 *
 *     [Ideas] @ 6 3
 *
 *     Development @ 6 6
 *       Agents
 *
 *     Ideas -- Development
 *
 * `# words` is the title, on the first row. A line at the left edge starts a
 * group and names it; the lines indented under it (or written `- Box`) are its
 * boxes. `[Box]` is a group that is one box with no name above it. `@ x y`
 * places a group, in squares from the top left, and a pale accent after the
 * name (`light-green`, `light-blue`, `pink`, `yellow`, `orange`, `red`, or
 * `white`, the plainest: white in the dark and the paper's pale grey in the
 * light) fills its boxes in that colour. A colour as a box's last word fills
 * that box alone, over its group's (`Google sign-in light-green`), so a row of
 * groups side by side reads as a table of states; a box that is only a
 * colour's name keeps it as its words. `A -- B` joins two groups or boxes by name, `A -> B`
 * ends in an arrow, `A <-> B` in two, and `A -> B -> C` joins each to the
 * next. `Group.Box` names one box where two groups share a name. A line
 * starting `//` is left out.
 *
 * Every box is an item cell, four squares across and one down, or a wider
 * item of whole items, as a board draws one sized by hand: `w8` makes a
 * group's boxes two items across, `w12` three, and a width between whole
 * items keeps the one under it, so `w6` is still an item's width. Every group
 * a line reaches stands on the grid two squares at a time, on a column or
 * halfway across one: its place across is taken to the nearest even square,
 * so two groups side by side stand two squares apart and the line between
 * them is two squares long. A group no line reaches keeps the square it
 * names, so chips in a row can stand a square apart, as a legend's do; and so
 * does a group placed on a post-it, since the post-it is the frame it is set
 * in.
 *
 * `{Ship}` is a post-it: a square frame that holds whatever groups are placed
 * on it, its name one square in from its top left corner. It is twelve
 * squares a side unless `w8` makes it eight (`h8` says the same), always a
 * whole number of columns, and a colour fills it the way it fills boxes.
 *
 * A group with no `@` takes the next column along with one left free after the
 * last, starting again two rows under the tallest once the row is full.
 *
 * `(2026-10)` is a month: a day a square, seven across from Monday as a
 * calendar has them, its weeks one under the other, and its name, the words
 * written before it, on the row above. A line under it that starts with a
 * colour gives the days that wear it, `pink 1 5 8 12` or `yellow 2-6`; a
 * line of seven words names the days, Monday first, on a row of their own
 * over the weeks.
 *
 *     10月 (2026-10) @ 0 3
 *       月 火 水 木 金 土 日
 *       pink 1 5 8 12 15
 *       yellow 2 9 16
 *
 * `(30x8)` is a grid of squares, thirty across and eight down, for whatever
 * is counted a square at a time: its name on the row above, as a month's is.
 * A colour's line under it gives the squares that wear it, by column and
 * then row from one: `pink 3` is the whole third column, `pink 3-5` three
 * columns, `light-green 8:1-2` the first two squares of the eighth, and a
 * later line colours over an earlier one. A line of as many words as it has
 * columns names them on a row over the squares, each in a box of its own as
 * a calendar's days are; a column whose squares wear nothing is named
 * faintly, as a day with nothing on it is. A line of as many words as it has
 * rows names those in a column before them, in the condensed face a
 * calendar's hours wear; one word more names the lines instead, each word on
 * its line from the squares' top edge to their foot, as the hours of a day
 * stand on theirs (`09` to `17` for eight hours).
 *
 *     September (30x8) @ 0 2
 *       1 2 3 … 30
 *       09 10 11 12 13 14 15 16
 *       pink 1-4 7-11
 *       light-green 8:1-2 9
 *
 * `(chart 12x6)` is a line chart, its plot twelve squares across and six
 * down, drawn as if with a marker on the paper. Under it, a line of words
 * names the points along its foot (the first under the left edge, the last
 * under the right), a line of numbers gives the values its lines stand on,
 * from the foot up (`0 10 20`, always the line after the names, ruled across the plot; without one it runs
 * from nought to its highest value), and a colour's line gives one series,
 * a value a point from left to right (`orange 3.4 3.8 6 11 17.9`), its last
 * value written at its end. The values' names stand in a column before the
 * plot and the last values in two after it, and the whole stands on a card a
 * square wider all round, its name inside its top corner, as Anthropic's
 * charts do.
 *
 *     Extreme scenario (chart 12x6) @ 0 2
 *       2026 2030
 *       0 10 20
 *       orange 3.4 3.8 6 11 17.9
 *       light-blue 5.4 5 4.2 4 3.9
 *
 * `marker` inside a grid's or a month's brackets, `(30x8 marker)` or
 * `(2026-10 marker)`, colours its squares in with a marker, a few short
 * strokes laid over one another, rather than as chips.
 *
 * A column's name longer than three letters slants up and to the right from
 * its square, so a grid of states (an app a column, a feature a row) stays a
 * square a cell whatever its columns are called (`gridHeadRows`).
 *
 * A line comes into a group's name at the middle of the name, not of the
 * group, to the nearest half square: the drawing measures each name and hands
 * its width over (`measure`), since only it knows the typeface.
 */

/** An edge a box shares with the box beside it, as cells on a board do. */
export type DiagramEdge = 'top' | 'right' | 'bottom' | 'left'
/** The pale accents a group's boxes can wear, by the names note colours go by. */
export const DIAGRAM_COLORS = ['light-green', 'light-blue', 'pink', 'yellow', 'orange', 'red', 'white'] as const
export type DiagramColor = typeof DIAGRAM_COLORS[number]
export type DiagramBox = { text: string; x: number; y: number; w: number; color?: DiagramColor; shared?: Partial<Record<DiagramEdge, true>> }
export type DiagramLabel = { text: string; x: number; y: number; w: number; title?: true }
/** A frame groups stand on, drawn under them, in squares like a box. */
export type DiagramPostIt = { text: string; x: number; y: number; w: number; h: number; color?: DiagramColor }
/**
 * A group as it was written, for whatever edits the diagram where it is
 * drawn: the source line it starts on and the last line under it (by number
 * from one), its name, its boxes and the line each is written on, and the
 * squares it was set on. `box` is `[Box]`, a group that is one box; `stack`
 * a name over boxes; the rest are what their brackets say.
 */
export type DiagramGroup = {
  kind: 'box' | 'stack' | 'post-it' | 'month' | 'grid' | 'chart'
  line: number
  end: number
  name?: string
  boxes: { text: string; line: number; color?: DiagramColor }[]
  x: number; y: number; w: number; h: number
  /** Whether its place is written (`@ x y`), or it took the next along. */
  placed: boolean
  color?: DiagramColor
}
/**
 * A day of a month, one square: its number, the colour it wears, and the
 * edges it shares with the coloured days beside it. `name` marks a day's
 * name, on the row over the weeks.
 */
export type DiagramDay = {
  text: string; x: number; y: number; color?: DiagramColor; name?: true; shared?: Partial<Record<DiagramEdge, true>>
  /** A grid's column's name: in a box of its own, as a calendar's day is. */
  head?: true
  /** A grid's row's name, in the condensed face. */
  row?: true
  /** A name that stands on the line over its square rather than in the square: a row's line, as an hour's. */
  edge?: true
  /** A grid's column's name too long for its square, set slanting up and to the right from the square's foot. */
  slant?: true
  /** A coloured square filled in with a marker, as Anthropic colours its squares, rather than laid as a chip. */
  marker?: true
}
/**
 * A line chart drawn as with a marker, in squares from the diagram's top
 * left: its plot, the names along its foot and up its side (each at the
 * point or line it names), and each series' points and the value at its end.
 */
export type DiagramChart = {
  x: number; y: number; w: number; h: number
  /** The card the chart is drawn on, a square in from everything it holds, its edges ruled by hand. */
  frame: { x: number; y: number; w: number; h: number }
  across: { text: string; at: number }[]
  down: { text: string; at: number }[]
  /** Each line's points, its last value, and where that value is written: beside its end, moved apart from the others so none overlap. */
  series: { color: DiagramColor; points: { x: number; y: number }[]; end: string; endAt: number }[]
}
/** A straight run between two points, in squares: halves where it meets a box's centre. */
export type DiagramSegment = { x1: number; y1: number; x2: number; y2: number }
export type DiagramLine = { segments: DiagramSegment[]; arrow: boolean }
/** Where a line is written: its source line, and the two names it joins as written there. */
export type DiagramJoin = { line: number; from: string; to: string }

export type Diagram = {
  /** Squares across and down, from the top left square to the far edge of the last. */
  columns: number
  rows: number
  labels: DiagramLabel[]
  postIts: DiagramPostIt[]
  boxes: DiagramBox[]
  days: DiagramDay[]
  charts: DiagramChart[]
  lines: DiagramLine[]
  /** Every group as written, in the order written, with the squares it stands on. */
  groups: DiagramGroup[]
  /** Where each of `lines` is written, by the same place in the list. */
  joins: DiagramJoin[]
  /** Lines of the source that said nothing the diagram understood, by number from one. */
  unread: number[]
}

type Group = {
  label?: string
  boxes: string[]
  /** The source line each box is written on. */
  boxLines: number[]
  /** The last source line the group holds. */
  end: number
  /** A box's own colour, by its place among the boxes, over the group's. */
  tints?: (DiagramColor | undefined)[]
  x?: number
  y?: number
  w: number
  /** Rows tall, for a post-it; a group is as tall as its name and boxes. */
  h?: number
  postIt?: true
  /** A month: which one, the colour each of its days wears, and the days' names when written. */
  month?: { year: number; month: number; marks: Map<number, DiagramColor>; names?: string[]; marker?: true }
  /** A grid of squares: how many across and down, the colour each wears (by `column:row`, from one), and its columns' and rows' names when written. */
  grid?: { columns: number; rows: number; marks: Map<string, DiagramColor>; across?: string[]; down?: string[]; marker?: true }
  /** A line chart: its plot's squares, the names along its foot, the values up its side, and its series. */
  chart?: { columns: number; rows: number; across?: string[]; down?: number[]; series: { color: DiagramColor; values: number[] }[] }
  color?: DiagramColor
  line: number
}
type Rect = { x: number; y: number; w: number; h: number }

/** A box is an item cell, four squares across; a post-it stands on columns this wide. */
export const DIAGRAM_BOX_WIDTH = 4
/** The widest a box or a post-it is written, in squares: ten items. */
export const DIAGRAM_MAX_WIDTH = 40
/** A group stands on the grid this many squares at a time, a column or half of one: two side by side are two squares apart. */
export const DIAGRAM_STEP = 2
/** How far across a row of groups placed in turn runs before the next row: the app's width. */
export const DIAGRAM_FLOW_COLUMNS = 12
/** A post-it is square, the app's width a side unless it says otherwise. */
export const DIAGRAM_POST_IT_SIZE = 12
/** A month is a week across, a day a square. */
export const DIAGRAM_MONTH_WIDTH = 7
const GUTTER = 2
const MAX_SQUARES = 200

/** A box's width in squares for the width written for it: whole items, the one under it between two, an item at the least. */
export function diagramBoxWidth(written?: number): number {
  if (written === undefined || !Number.isFinite(written)) return DIAGRAM_BOX_WIDTH
  return Math.max(DIAGRAM_BOX_WIDTH, Math.min(DIAGRAM_MAX_WIDTH, Math.floor(written / DIAGRAM_BOX_WIDTH) * DIAGRAM_BOX_WIDTH))
}

/** The nearest of a list's columns, in squares from the left: where a post-it stands. */
const onColumn = (x: number) => Math.round(x / DIAGRAM_BOX_WIDTH) * DIAGRAM_BOX_WIDTH
/** The nearest even square: where a group stands. */
const onStep = (x: number) => Math.round(x / DIAGRAM_STEP) * DIAGRAM_STEP
/** The next even square at or after a square. */
const nextStep = (x: number) => Math.ceil(x / DIAGRAM_STEP) * DIAGRAM_STEP

/** How a diagram is laid out: `room`, the squares across it may take, to wrap it into when it is wider. */
export type DiagramLayoutOptions = { room?: number }

/** A name's width in squares, as the drawing sets it, or nothing when it cannot tell. */
export type DiagramMeasure = (text: string) => number | undefined

// A fence may say more after its language: `wrap` (see `diagramWraps`).
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*diagram(?:[ \t]+[^`\n]*?)?[ \t]*$/i
const TITLE = /^#{1,4}[ \t]+(.+)$/
const COMMENT = /^\/\//
const JOIN = /[ \t]+(<->|->|<-|--)[ \t]+/
const PLACE = /[ \t]+@[ \t]*(\d{1,3})(?:[ \t]*,[ \t]*|[ \t]+)(\d{1,3})(?=[ \t]|$)/
const WIDTH = /[ \t]+w(\d{1,2})(?=[ \t]|$)/i
const COLOR = new RegExp(`[ \\t]+(${DIAGRAM_COLORS.join('|')})(?=[ \\t]|$)`, 'i')
/** A colour as a box's last word, after words of its own. */
const BOX_COLOR = new RegExp(`^(.*\\S)[ \\t]+(${DIAGRAM_COLORS.join('|')})$`, 'i')
const HEIGHT = /[ \t]+h(\d{1,2})(?=[ \t]|$)/i
const SINGLE = /^\[(.+)\]$/
const POST_IT = /^\{(.+)\}$/
const BULLET = /^[-*+][ \t]+(.*)$/
const MONTH = /(?:^|[ \t]+)\(([1-9]\d{3})-(0?[1-9]|1[0-2])(?:[ \t]+(marker))?\)(?=[ \t]|$)/i
const GRID = /(?:^|[ \t]+)\(([1-9]\d?)[x×]([1-9]\d?)(?:[ \t]+(marker))?\)(?=[ \t]|$)/i
const CHART = /(?:^|[ \t]+)\(chart[ \t]+([1-9]\d?)[x×]([1-9]\d?)\)(?=[ \t]|$)/i
const SERIES = new RegExp(`^(${DIAGRAM_COLORS.join('|')})((?:[ \\t,]+-?\\d+(?:\\.\\d+)?)+)$`, 'i')
const NUMBERS = /^-?\d+(?:\.\d+)?(?:[ \t,]+-?\d+(?:\.\d+)?)*$/
/** A chart keeps a column before its plot for the values' names, and two after it for its lines' last values. */
const CHART_BEFORE = 1
const CHART_AFTER = 2
/** A chart stands on a card a square wider than it all round, as Anthropic's do. */
const CHART_PAD = 1
const SQUARES = new RegExp(`^(${DIAGRAM_COLORS.join('|')})((?:[ \\t,]+\\d{1,2}(?:-\\d{1,2})?(?::\\d{1,2}(?:-\\d{1,2})?)?)+)$`, 'i')
/** A grid is at most this many squares a side. */
export const DIAGRAM_GRID_SIDE = 60
/**
 * The rows a grid's columns' names stand on. Names of three letters or fewer
 * fit their squares and take one row, boxed as a calendar's days are; a
 * longer name (an app, a platform) slants up and to the right at 45 degrees
 * from its square, so a column stays one square wide whatever it is called,
 * and takes as many rows as the longest name rises: about a third of a square
 * for each letter, and its own height.
 */
export function gridHeadRows(names: string[]): number {
  const longest = Math.max(0, ...names.map(name => [...name].length))
  return longest <= 3 ? 1 : Math.ceil(longest * 0.32 + 0.75)
}

const MARKS = new RegExp(`^(${DIAGRAM_COLORS.join('|')})((?:[ \\t,]+\\d{1,2}(?:-\\d{1,2})?)+)$`, 'i')

/** Where a month's first day stands in its week, from Monday, and how many days it has. */
function monthShape(year: number, month: number): { first: number; count: number } {
  return {
    first: (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7,
    count: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  }
}

/** Whether a block of writing is a diagram, fenced from its first line to its last. */
export function isDiagramBlock(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  if (lines.length < 2) return false
  const open = FENCE_OPEN.exec(lines[0])
  if (!open) return false
  const close = lines[lines.length - 1].trim()
  return close[0] === open[1][0] && /^(`{3,}|~{3,})$/.test(close) && close.length >= open[1].length
}

/**
 * Whether a fenced diagram wraps: ```` ```diagram wrap ```` lays it out again
 * to fit the room it is given, in strips one under another as lines of
 * writing wrap, so nobody scrolls sideways to read it. Unwrapped, it keeps
 * its own layout.
 */
export function diagramWraps(fence: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})[ \t]*diagram\b[^\n]*[ \t]wrap\b/i.test(fence.split('\n')[0] ?? '')
}

/** The fence's first line with wrapping turned on or off, the rest of it kept. */
export function diagramFenceWrapped(fence: string, wrap: boolean): string {
  const without = fence.replace(/[ \t]+wrap\b/i, '')
  return wrap ? `${without.trimEnd()} wrap` : without
}

/** The source inside a fenced diagram, without its fences. */
export function diagramSource(block: string): string {
  const lines = block.replace(/\r\n?/g, '\n').trim().split('\n')
  return lines.slice(1, -1).join('\n')
}

/**
 * Where the closed diagram fences in a block of writing start and end, by
 * line from nought, both fence lines included. An open fence with no close is
 * not a diagram yet: it is still being written.
 */
export function diagramFences(text: string): { start: number; end: number }[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fences: { start: number; end: number }[] = []
  let other: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[index])
    if (other) {
      if (fence && fence[1][0] === other[0] && fence[1].length >= other.length && !lines[index].trim().slice(fence[1].length).trim()) other = null
      continue
    }
    const open = FENCE_OPEN.exec(lines[index])
    if (open) {
      const mark = open[1]
      const end = lines.findIndex((line, at) => at > index && new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \t]*$`).test(line))
      if (end < 0) break
      fences.push({ start: index, end })
      index = end
      continue
    }
    if (fence) other = fence[1]
  }
  return fences
}

/**
 * How many rows a block of writing holds at the least: a row a line, with
 * each fenced diagram counted as the rows it is drawn on instead of its lines.
 */
export function writingLineRows(text: string): number {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let rows = lines.length
  for (const { start, end } of diagramFences(text)) {
    rows += Math.max(1, layoutDiagram(lines.slice(start + 1, end).join('\n')).rows) - (end - start + 1)
  }
  return Math.max(1, rows)
}

/**
 * How many of a list's columns (four squares each) the widest diagram in a
 * block of writing needs, or 0 when it holds none.
 */
export function diagramListColumns(text: string): number {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let squares = 0
  for (const { start, end } of diagramFences(text)) {
    squares = Math.max(squares, layoutDiagram(lines.slice(start + 1, end).join('\n')).columns)
  }
  return Math.ceil(squares / DIAGRAM_BOX_WIDTH)
}

/** How many of the board's rows a fenced diagram takes. */
export function diagramBlockRows(block: string): number {
  return Math.max(1, layoutDiagram(diagramSource(block)).rows)
}

/** How many weeks a month's days stand on. */
function monthWeeks(year: number, month: number): number {
  const { first, count } = monthShape(year, month)
  return Math.ceil((first + count) / DIAGRAM_MONTH_WIDTH)
}

const clamp = (value: number, max = MAX_SQUARES) => Math.max(0, Math.min(max, value))
const key = (name: string) => name.trim().toLowerCase()

/**
 * Read a diagram's source and set every box, label and line on the grid.
 * `measure` gives a name's width, so a line into it meets its middle.
 */
export function layoutDiagram(source: string, measure?: DiagramMeasure, options: DiagramLayoutOptions = {}): Diagram {
  const labels: DiagramLabel[] = []
  const groups: Group[] = []
  const joins: { from: string; to: string; arrow: boolean; reverse: boolean; line: number }[] = []
  const unread: number[] = []
  let title: string | undefined
  let current: Group | undefined

  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    const number = index + 1
    const text = raw.replace(/\t/g, '  ')
    const line = text.trim()
    if (!line || COMMENT.test(line)) return
    const heading = TITLE.exec(line)
    if (heading && title === undefined && !groups.length) { title = heading[1].trim(); return }
    const indented = /^\s/.test(text)
    const bullet = BULLET.exec(line)
    if ((indented || bullet) && current) {
      current.end = number
      // A post-it holds groups placed on it, not boxes written under it.
      if (current.postIt) { unread.push(number); return }
      // Under a month, a colour and the days that wear it, or the days' names.
      if (current.month) {
        const said = (bullet ? bullet[1] : line).trim()
        const marks = MARKS.exec(said)
        const names = said.split(/[ \t]+/)
        if (marks) {
          const color = marks[1].toLowerCase() as DiagramColor
          for (const span of marks[2].split(/[ \t,]+/).filter(Boolean)) {
            const [from, to = from] = span.split('-').map(Number)
            for (let day = from; day <= to; day++) current.month.marks.set(day, color)
          }
        } else if (names.length === DIAGRAM_MONTH_WIDTH && !current.month.names) current.month.names = names
        else unread.push(number)
        return
      }
      // Under a chart, a series, the values up its side, or the names along its foot.
      if (current.chart) {
        const chart = current.chart
        const said = (bullet ? bullet[1] : line).trim()
        const series = SERIES.exec(said)
        if (series) chart.series.push({ color: series[1].toLowerCase() as DiagramColor, values: series[2].split(/[ \t,]+/).filter(Boolean).map(Number) })
        // The first line that is not a series names the foot, the next the values, since both may be numbers (2026 2030, 0 10 20).
        else if (!chart.across) chart.across = said.split(/[ \t]+/)
        else if (NUMBERS.test(said) && !chart.down) chart.down = said.split(/[ \t,]+/).map(Number)
        else unread.push(number)
        return
      }
      // Under a grid, a colour and the squares that wear it, or its columns' or rows' names.
      if (current.grid) {
        const grid = current.grid
        const said = (bullet ? bullet[1] : line).trim()
        const squares = SQUARES.exec(said)
        const names = said.split(/[ \t]+/)
        if (squares) {
          const color = squares[1].toLowerCase() as DiagramColor
          for (const span of squares[2].split(/[ \t,]+/).filter(Boolean)) {
            const [across, down = `1-${grid.rows}`] = span.split(':')
            const [left, right = left] = across.split('-').map(Number)
            const [upper, lower = upper] = down.split('-').map(Number)
            for (let column = Math.max(1, left); column <= Math.min(grid.columns, right); column++) {
              for (let row = Math.max(1, upper); row <= Math.min(grid.rows, lower); row++) grid.marks.set(`${column}:${row}`, color)
            }
          }
        } else if (names.length === grid.columns && !grid.across) grid.across = names
        // As many words as rows name the rows; one more names the lines, the squares' top edge to their foot.
        else if ((names.length === grid.rows || names.length === grid.rows + 1) && !grid.down) grid.down = names
        else unread.push(number)
        return
      }
      const box = (bullet ? bullet[1] : line).trim()
      if (!box) return
      const tinted = BOX_COLOR.exec(box)
      current.boxes.push((tinted ? tinted[1] : box).replace(SINGLE, '$1'))
      current.boxLines.push(number)
      if (tinted) (current.tints ??= [])[current.boxes.length - 1] = tinted[2].toLowerCase() as DiagramColor
      return
    }
    if (JOIN.test(line)) {
      const parts = line.split(JOIN)
      for (let at = 0; at + 2 < parts.length; at += 2) {
        const op = parts[at + 1]
        const from = parts[at].trim(), to = parts[at + 2].trim()
        if (!from || !to) continue
        joins.push({ from, to, arrow: op !== '--', reverse: op === '<-', line: number })
        if (op === '<->') joins.push({ from: to, to: from, arrow: true, reverse: false, line: number })
      }
      current = undefined
      return
    }
    let name = line
    let x: number | undefined, y: number | undefined
    let w: number | undefined
    let h: number | undefined
    const place = PLACE.exec(` ${name}`)
    if (place) {
      x = clamp(Number(place[1])); y = clamp(Number(place[2]))
      name = ` ${name}`.replace(PLACE, '').trim()
    }
    const height = /^\{/.test(name) ? HEIGHT.exec(` ${name}`) : null
    if (height) {
      h = Math.max(1, Math.min(MAX_SQUARES, Number(height[1])))
      name = ` ${name}`.replace(HEIGHT, '').trim()
    }
    const width = WIDTH.exec(` ${name}`)
    if (width) {
      w = Math.max(1, Math.min(40, Number(width[1])))
      name = ` ${name}`.replace(WIDTH, '').trim()
    }
    // A colour comes after a name or a place: a group called Pink stays Pink,
    // and `@ 0 4 pink` is a pink stack with no name.
    let color: DiagramColor | undefined
    const tint = COLOR.exec(` ${name}`)
    const rest = ` ${name}`.replace(COLOR, '').trim()
    if (tint && (rest || line.split(/[ \t]/)[0].toLowerCase() !== tint[1].toLowerCase())) {
      color = tint[1].toLowerCase() as DiagramColor
      name = rest
    }
    const postIt = POST_IT.exec(name)
    const single = SINGLE.exec(name)
    // A month is a week across whatever is written for it, named by the words before it.
    const month = MONTH.exec(name)
    if (month) {
      const label = name.replace(MONTH, '').trim()
      current = { label: label || undefined, boxes: [], boxLines: [], x, y, w: DIAGRAM_MONTH_WIDTH, month: { year: Number(month[1]), month: Number(month[2]), marks: new Map(), ...(month[3] ? { marker: true as const } : {}) }, line: number, end: number }
      groups.push(current)
      return
    }
    // A chart's plot is as many squares across and down as it says, named by the words before it.
    const chart = CHART.exec(name)
    if (chart) {
      const label = name.replace(CHART, '').trim()
      const columns = Math.min(DIAGRAM_GRID_SIDE, Number(chart[1])), rows = Math.min(DIAGRAM_GRID_SIDE, Number(chart[2]))
      current = { label: label || undefined, boxes: [], boxLines: [], x, y, w: CHART_PAD + CHART_BEFORE + columns + CHART_AFTER + CHART_PAD, chart: { columns, rows, series: [] }, line: number, end: number }
      groups.push(current)
      return
    }
    // A grid is as many squares across and down as it says, named by the words before it.
    const grid = GRID.exec(name)
    if (grid) {
      const label = name.replace(GRID, '').trim()
      const columns = Math.min(DIAGRAM_GRID_SIDE, Number(grid[1])), rows = Math.min(DIAGRAM_GRID_SIDE, Number(grid[2]))
      current = { label: label || undefined, boxes: [], boxLines: [], x, y, w: columns, grid: { columns, rows, marks: new Map(), ...(grid[3] ? { marker: true as const } : {}) }, line: number, end: number }
      groups.push(current)
      return
    }
    if (!name && x === undefined) { unread.push(number); return }
    // A post-it is square, whichever side it names, and whole columns across.
    const side = Math.max(DIAGRAM_BOX_WIDTH, onColumn(w ?? h ?? DIAGRAM_POST_IT_SIZE))
    // A box is whole items across, an item's width unless it says more.
    const across = diagramBoxWidth(w)
    current = postIt
      ? { label: postIt[1].trim(), boxes: [], boxLines: [], x, y, w: side, h: side, postIt: true, color, line: number, end: number }
      : single
        ? { boxes: [single[1].trim()], boxLines: [number], x, y, w: across, color, line: number, end: number }
        : { label: name || undefined, boxes: [], boxLines: [], x, y, w: across, color, line: number, end: number }
    groups.push(current)
  })

  // Post-its stand on the columns first, so a group placed on one is known
  // before the groups are put on the columns themselves.
  const frames: Rect[] = []
  for (const group of groups) {
    if (!group.postIt || group.x === undefined || group.y === undefined) continue
    group.x = onColumn(group.x)
    frames.push({ x: group.x, y: group.y, w: group.w, h: group.h! })
  }
  const framed = (x: number, y: number) => frames.some(frame => x >= frame.x && x < frame.x + frame.w && y >= frame.y && y < frame.y + frame.h)

  // A group a line reaches stands on an even square, so the line between two
  // side by side is two squares long; one no line reaches keeps its square.
  const reached = new Set(joins.flatMap(join => [key(join.from), key(join.to)]))
  const joined = (group: Group) =>
    (group.label !== undefined && reached.has(key(group.label)))
    || group.boxes.some(box => reached.has(key(box)) || (group.label !== undefined && reached.has(key(`${group.label}.${box}`))))

  // Groups with no place of their own go along a row, two squares left
  // free between them.
  const top = title === undefined ? 0 : 3
  let cursorX = 0, cursorY = top, rowBottom = top
  const rects = new Map<Group, Rect>()
  const unplaced = new Set<Group>()
  for (const group of groups) {
    // A grid is a column wider for its rows' names, known only once its lines are read.
    if (group.grid) group.w = group.grid.columns + (group.grid.down ? 1 : 0)
    // A month is as tall as its name, its days' names and its weeks; a grid as its name, its columns' names and its rows.
    const h = group.chart
      // On its card: its name, a row free under it where the values are named (the highest stands half over it), its plot, and a row for the names along its foot.
      ? CHART_PAD + (group.label ? 1 : 0) + (group.label && group.chart.down ? 1 : 0) + group.chart.rows + 1 + CHART_PAD
      : group.month
      ? (group.label ? 1 : 0) + (group.month.names ? 1 : 0) + monthWeeks(group.month.year, group.month.month)
      : group.grid
        // A row more where its lines are named, for the half of the last name that stands under the squares.
        ? (group.label ? 1 : 0) + (group.grid.across ? gridHeadRows(group.grid.across) : 0) + group.grid.rows + (group.grid.down && group.grid.down.length > group.grid.rows ? 1 : 0)
        : group.h ?? Math.max(1, (group.label ? 1 : 0) + group.boxes.length)
    if (group.x === undefined || group.y === undefined) {
      unplaced.add(group)
      if (cursorX > 0 && cursorX + group.w > DIAGRAM_FLOW_COLUMNS) {
        cursorX = 0
        cursorY = rowBottom + GUTTER
      }
      group.x ??= cursorX
      group.y ??= cursorY
      cursorX = nextStep(group.x + group.w + GUTTER)
      rowBottom = Math.max(rowBottom, group.y + h)
    } else if (!group.postIt && !framed(group.x, group.y) && joined(group)) {
      group.x = onStep(group.x)
    }
    rects.set(group, { x: group.x, y: group.y, w: group.w, h })
  }

  if (options.room !== undefined) wrapGroups(groups, rects, options.room)

  const boxes: DiagramBox[] = []
  const days: DiagramDay[] = []
  const charts: DiagramChart[] = []
  const postIts: DiagramPostIt[] = []
  // A name reaches a group by its label or by any of its boxes; a box's own
  // name reaches that one box, so a line can leave from the middle of a stack.
  const named = new Map<string, Rect>()
  // A group whose top row is its name, by the name.
  const headed = new Map<Rect, string>()
  for (const group of groups) {
    const rect = rects.get(group)!
    if (group.postIt) {
      postIts.push(group.color ? { text: group.label!, ...rect, color: group.color } : { text: group.label!, ...rect })
      labels.push({ text: group.label!, x: rect.x + 1, y: rect.y + 1, w: Math.max(1, rect.w - 2) })
      if (!named.has(key(group.label!))) named.set(key(group.label!), rect)
      continue
    }
    // A chart's name stands on its card, a square in from the card's corner.
    if (group.chart) {
      let top = rect.y + CHART_PAD
      if (group.label) {
        labels.push({ text: group.label, x: rect.x + CHART_PAD, y: top, w: rect.w - CHART_PAD * 2 })
        if (!named.has(key(group.label))) named.set(key(group.label), rect)
        top += 1 + (group.chart.down ? 1 : 0)
      }
      charts.push({ ...chartLayout(group.chart, rect.x + CHART_PAD + CHART_BEFORE, top), frame: rect })
      continue
    }
    let y = rect.y
    if (group.label) {
      labels.push({ text: group.label, x: rect.x, y, w: rect.w })
      if (!named.has(key(group.label))) named.set(key(group.label), rect)
      headed.set(rect, group.label)
      y++
    }
    if (group.month) {
      // The days' names on their own row, then each day on its square of its week.
      if (group.month.names) {
        group.month.names.forEach((text, column) => days.push({ text, x: rect.x + column, y, name: true }))
        y++
      }
      const { first, count } = monthShape(group.month.year, group.month.month)
      for (let day = 1; day <= count; day++) {
        const at = first + day - 1
        const place = { text: String(day), x: rect.x + at % DIAGRAM_MONTH_WIDTH, y: y + Math.floor(at / DIAGRAM_MONTH_WIDTH) }
        const color = group.month.marks.get(day)
        days.push(color ? { ...place, color, ...(group.month.marker ? { marker: true as const } : {}) } : place)
      }
      continue
    }
    if (group.grid) {
      const { columns, rows, marks, across, down } = group.grid
      const left = rect.x + (down ? 1 : 0)
      // The columns' names on their own row, in the ink where a square under them wears a colour and faint where none does.
      if (across) {
        const tall = gridHeadRows(across)
        across.forEach((text, column) => {
          const worn = Array.from({ length: rows }, (_, row) => marks.has(`${column + 1}:${row + 1}`)).some(Boolean)
          // A long name slants up from the last row over its column, with no box; a short one is boxed.
          if (tall > 1) {
            days.push(worn ? { text, x: left + column, y: y + tall - 1, name: true, slant: true } : { text, x: left + column, y: y + tall - 1, slant: true })
            return
          }
          // Each box shares its left line with the box before it, so the line between two names is drawn once.
          const head: DiagramDay = worn ? { text, x: left + column, y, name: true, head: true } : { text, x: left + column, y, head: true }
          if (column > 0) head.shared = { left: true }
          days.push(head)
        })
        y += tall
      }
      // The rows' names in the column before the squares, or the lines' names each on its line, then every square that wears a colour.
      const lined = !!down && down.length > rows
      down?.forEach((text, row) => days.push(lined ? { text, x: rect.x, y: y + row, name: true, row: true, edge: true } : { text, x: rect.x, y: y + row, name: true, row: true }))
      for (let column = 1; column <= columns; column++) {
        for (let row = 1; row <= rows; row++) {
          const color = marks.get(`${column}:${row}`)
          if (color) days.push({ text: '', x: left + column - 1, y: y + row - 1, color, ...(group.grid.marker ? { marker: true as const } : {}) })
        }
      }
      continue
    }
    for (const [index, text] of group.boxes.entries()) {
      const color = group.tints?.[index] ?? group.color
      boxes.push(color ? { text, x: rect.x, y, w: rect.w, color } : { text, x: rect.x, y, w: rect.w })
      const box = { x: rect.x, y, w: rect.w, h: 1 }
      // A lone box is its group, lines and all. `Group.Box` names one box
      // when two groups hold boxes of the same name.
      if (!named.has(key(text))) named.set(key(text), group.label ? box : rect)
      if (group.label && !named.has(key(`${group.label}.${text}`))) named.set(key(`${group.label}.${text}`), box)
      y++
    }
  }

  // Boxes that touch share the edge between them, as a board's cells do: the
  // shared corners stay square and the stack reads as one block.
  const overlaps = (a: DiagramBox, b: DiagramBox) => a.x < b.x + b.w && b.x < a.x + a.w
  for (const box of boxes) {
    const shared: Partial<Record<DiagramEdge, true>> = {}
    for (const other of boxes) {
      if (other === box) continue
      if (other.y === box.y - 1 && overlaps(box, other)) shared.top = true
      if (other.y === box.y + 1 && overlaps(box, other)) shared.bottom = true
      if (other.y === box.y && other.x + other.w === box.x) shared.left = true
      if (other.y === box.y && box.x + box.w === other.x) shared.right = true
    }
    if (Object.keys(shared).length) box.shared = shared
  }

  // Coloured days that touch share their edge the same way, so a run of them
  // reads as one band.
  const marked = days.filter(day => day.color && !day.marker)
  for (const day of marked) {
    const shared: Partial<Record<DiagramEdge, true>> = {}
    for (const other of marked) {
      if (other.x === day.x && other.y === day.y - 1) shared.top = true
      if (other.x === day.x && other.y === day.y + 1) shared.bottom = true
      if (other.y === day.y && other.x === day.x - 1) shared.left = true
      if (other.y === day.y && other.x === day.x + 1) shared.right = true
    }
    if (Object.keys(shared).length) day.shared = shared
  }

  // The middle of a group's name, to the nearest half square and never past
  // the group's own edges, where the drawing has measured it.
  const nameMiddle = (rect: Rect): number | undefined => {
    const name = headed.get(rect)
    const width = name === undefined ? undefined : measure?.(name)
    if (width === undefined || !Number.isFinite(width)) return undefined
    return rect.x + Math.max(0.5, Math.min(rect.w - 0.5, Math.round(width) / 2))
  }
  const ends = joins.map(join => ({
    join,
    a: named.get(key(join.reverse ? join.to : join.from)),
    b: named.get(key(join.reverse ? join.from : join.to)),
  }))
  // A line straight down into a name leaves the shape above from over the
  // name's middle, and every other line down out of that shape leaves from
  // the same point, so they share one stem and branch where they turn.
  const stems = new Map<Rect, number>()
  for (const { a, b } of ends) {
    if (!a || !b || a === b || stems.has(a) || a.y + a.h > b.y) continue
    const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w)
    const into = nameMiddle(b)
    if (right > left && into !== undefined) stems.set(a, Math.min(right - 0.5, Math.max(left + 0.5, into)))
  }
  const lines: DiagramLine[] = []
  const written: DiagramJoin[] = []
  for (const { join, a, b } of ends) {
    if (!a || !b || a === b) { unread.push(join.line); continue }
    lines.push({ segments: route(a, b, nameMiddle, stems.get(a)), arrow: join.arrow })
    written.push({ line: join.line, from: join.from, to: join.to })
  }

  let columns = 0, rows = 0
  for (const rect of rects.values()) {
    columns = Math.max(columns, rect.x + rect.w)
    rows = Math.max(rows, rect.y + rect.h)
  }
  if (title !== undefined) {
    labels.unshift({ text: title, x: 0, y: 0, w: Math.max(columns, DIAGRAM_BOX_WIDTH), title: true })
    columns = Math.max(columns, DIAGRAM_BOX_WIDTH)
    rows = Math.max(rows, 1)
  }
  for (const line of lines) for (const s of line.segments) {
    columns = Math.max(columns, Math.ceil(Math.max(s.x1, s.x2)))
    rows = Math.max(rows, Math.ceil(Math.max(s.y1, s.y2)))
  }
  const kinds = (group: Group): DiagramGroup['kind'] => group.postIt ? 'post-it' : group.month ? 'month' : group.grid ? 'grid' : group.chart ? 'chart' : group.label === undefined ? 'box' : 'stack'
  const sources: DiagramGroup[] = groups.map(group => ({
    kind: kinds(group), line: group.line, end: group.end,
    ...(group.label === undefined ? {} : { name: group.label }),
    boxes: group.boxes.map((text, index) => {
      const color = group.tints?.[index]
      return color ? { text, line: group.boxLines[index], color } : { text, line: group.boxLines[index] }
    }),
    ...rects.get(group)!, placed: !unplaced.has(group),
    ...(group.color ? { color: group.color } : {}),
  }))
  return { columns, rows, labels, postIts, boxes, days, charts, lines, groups: sources, joins: written, unread: [...new Set(unread)].sort((p, q) => p - q) }
}

/**
 * A chart's plot from its top left square: its values up the side on the
 * lines they name (from nought to its highest value, rounded up to a ten's
 * step, when none are written), the names along its foot spread from the
 * left edge to the right, and each series a point to each value.
 */
function chartLayout(chart: NonNullable<Group['chart']>, x: number, y: number): Omit<DiagramChart, 'frame'> {
  const values = chart.series.flatMap(series => series.values).filter(Number.isFinite)
  const highest = Math.max(0, ...values)
  const step = highest > 0 ? 10 ** Math.floor(Math.log10(highest)) : 1
  const down = chart.down?.length ? [...chart.down].sort((p, q) => p - q) : [0, Math.ceil(highest / step) * step || 1]
  const low = down[0], high = down[down.length - 1] > low ? down[down.length - 1] : low + 1
  const level = (value: number) => y + chart.rows * (1 - (value - low) / (high - low))
  const along = (index: number, count: number) => x + (count > 1 ? chart.columns * index / (count - 1) : 0)
  const across = chart.across ?? []
  const name = (value: number) => String(Math.round(value * 10) / 10)
  return {
    x, y, w: chart.columns, h: chart.rows,
    across: across.map((text, index) => ({ text, at: along(index, across.length) })),
    down: (chart.down?.length ? down : []).map(value => ({ text: name(value), at: level(value) })),
    series: apart(chart.series.filter(series => series.values.length).map(series => {
      const points = series.values.map((value, index) => ({ x: along(index, series.values.length), y: level(value) }))
      return { color: series.color, points, end: name(series.values[series.values.length - 1]), endAt: points[points.length - 1].y }
    })),
  }
}

/** A line's last value is set this far, in squares, from the next at the least. */
const END_GAP = 0.85

/**
 * The lines' last values moved apart where their ends lie close, as little
 * as will do: in order down the page, each pushed below the one over it, and
 * any run pushed down together then raised back round its own middle.
 */
function apart<T extends { endAt: number }>(series: T[]): T[] {
  const order = [...series].sort((p, q) => p.endAt - q.endAt)
  const runs: { items: T[]; top: number }[] = []
  for (const item of order) {
    runs.push({ items: [item], top: item.endAt })
    // Join runs that now overlap, each run centred on the ends it holds.
    while (runs.length > 1) {
      const last = runs[runs.length - 1], before = runs[runs.length - 2]
      if (before.top + before.items.length * END_GAP <= last.top) break
      const items = [...before.items, ...last.items]
      const middle = items.reduce((sum, each) => sum + each.endAt, 0) / items.length
      runs.splice(-2, 2, { items, top: middle - (items.length - 1) * END_GAP / 2 })
    }
  }
  for (const run of runs) run.items.forEach((item, index) => { item.endAt = run.top + index * END_GAP })
  return series
}

/**
 * The middle of a span, even inside a square: a line leaves and meets a box
 * at its centre, so between two one-row boxes side by side it runs through
 * the middle of their row, not along their tops.
 */
function middle(start: number, end: number): number {
  return (start + end) / 2
}

/**
 * A line from one shape to another. Shapes side by side are joined straight
 * across the middle of the rows they share. Otherwise a line leaves the first
 * from the middle of its lower or upper edge and comes into the middle of the
 * second from above or below: straight down the columns they share when one
 * stands over the other, and turning on the grid line halfway between them
 * when it must move across. An edge that is a group's name is met at the
 * middle of the name (`name`) rather than of the group; a straight line moves
 * over to it whole, and a `stem` is where lines down out of the first leave.
 */
function route(a: Rect, b: Rect, name: (rect: Rect) => number | undefined, stem?: number): DiagramSegment[] {
  const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w)
  const upper = Math.max(a.y, b.y), lower = Math.min(a.y + a.h, b.y + b.h)
  if (lower > upper && right <= left) {
    const y = middle(upper, lower)
    return [a.x < b.x ? { x1: a.x + a.w, y1: y, x2: b.x, y2: y } : { x1: a.x, y1: y, x2: b.x + b.w, y2: y }]
  }
  if (right > left && lower > upper) return []
  const down = a.y < b.y
  const from = down ? a.y + a.h : a.y
  const to = down ? b.y : b.y + b.h
  // Only a group's top edge is its name: a line meets it going down into the
  // second, or leaving the first going up.
  const into = down ? name(b) : undefined
  const out = down ? undefined : name(a)
  const start = down ? stem : undefined
  if (right > left) {
    const x = Math.min(right - 0.5, Math.max(left + 0.5, into ?? out ?? start ?? middle(left, right)))
    return [{ x1: x, y1: from, x2: x, y2: to }]
  }
  return turning(out ?? start ?? middle(a.x, a.x + a.w), from, into ?? middle(b.x, b.x + b.w), to)
}

/**
 * Down (or up) from one point, across on the grid line halfway, and on into
 * the other, leaving out any run of no length. Where there is no row between
 * them to turn on, it turns on the first edge, so the line still arrives
 * going the way its arrow points.
 */
function turning(x1: number, from: number, x2: number, to: number): DiagramSegment[] {
  let turn = Math.round((from + to) / 2)
  if (turn === to) turn = from
  return [
    { x1, y1: from, x2: x1, y2: turn },
    { x1, y1: turn, x2, y2: turn },
    { x1: x2, y1: turn, x2, y2: to },
  ].filter(s => s.x1 !== s.x2 || s.y1 !== s.y2)
}

/**
 * Groups laid out again to fit `room` squares across, as writing wraps: they
 * are taken from left to right into strips each no wider than the room, a
 * strip keeping the places its groups have among themselves, and each strip
 * set two rows under the one before it, at the left edge. A post-it carries
 * the groups placed on it. A group wider than the room has a strip of its own.
 */
function wrapGroups(groups: Group[], rects: Map<Group, Rect>, room: number) {
  const all = groups.map(group => rects.get(group)!)
  if (!all.length || Math.max(...all.map(rect => rect.x + rect.w)) <= room) return
  const frames = groups.filter(group => group.postIt).map(group => rects.get(group)!)
  const frameOf = (rect: Rect) => frames.find(frame => frame !== rect && rect.x >= frame.x && rect.x < frame.x + frame.w && rect.y >= frame.y && rect.y < frame.y + frame.h)
  // A post-it and what stands on it move as one.
  const units = new Map<Rect, Rect[]>()
  for (const rect of all) {
    const frame = frameOf(rect) ?? rect
    units.set(frame, [...(units.get(frame) ?? []), rect])
  }
  const order = [...units.keys()].sort((a, b) => a.x - b.x || a.y - b.y)
  const strips: { start: number; units: Rect[] }[] = []
  for (const unit of order) {
    const strip = strips[strips.length - 1]
    if (strip && unit.x + unit.w - strip.start <= room) strip.units.push(unit)
    else strips.push({ start: unit.x, units: [unit] })
  }
  if (strips.length < 2) return
  let bottom = 0
  strips.forEach((strip, index) => {
    const pieces = strip.units.flatMap(unit => units.get(unit)!)
    const top = Math.min(...pieces.map(rect => rect.y))
    const dy = index ? bottom + GUTTER - top : 0
    for (const rect of pieces) { rect.x -= strip.start; rect.y += dy }
    bottom = Math.max(bottom, ...pieces.map(rect => rect.y + rect.h))
  })
}
