// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { diagramBlockRows, diagramFenceWrapped, diagramFences, diagramListColumns, diagramWraps, isDiagramBlock, layoutDiagram, writingLineRows } from '../src/diagram-language'
import { defineAaDiagram } from '../src/diagram'

defineAaDiagram()

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const LOOP = `# A continuous loop

Spec/docs @ 0 3
  Figma
  Notion
  Convex

[Ideas] @ 6 3

Development @ 6 6
  Agents

Ideas -- Development`

/** Every box an item cell, every group on the grid two squares at a time. */
test('the continuous loop stands two squares apart, its boxes item cells', () => {
  const diagram = layoutDiagram(LOOP)
  expect(diagram.labels).toEqual([
    { text: 'A continuous loop', x: 0, y: 0, w: 10, title: true },
    { text: 'Spec/docs', x: 0, y: 3, w: 4 },
    // Written at six, it stands at six: half a column over, two squares from its neighbour.
    { text: 'Development', x: 6, y: 6, w: 4 },
  ])
  expect(diagram.boxes).toEqual([
    // Stacked boxes share their edges, as a board's cells do.
    { text: 'Figma', x: 0, y: 4, w: 4, shared: { bottom: true } },
    { text: 'Notion', x: 0, y: 5, w: 4, shared: { top: true, bottom: true } },
    { text: 'Convex', x: 0, y: 6, w: 4, shared: { top: true } },
    { text: 'Ideas', x: 6, y: 3, w: 4 },
    { text: 'Agents', x: 6, y: 7, w: 4 },
  ])
  // Straight down the middle of the column they share, from the box's lower
  // edge to the top of the group's name.
  expect(diagram.lines).toEqual([{ segments: [{ x1: 8, y1: 4, x2: 8, y2: 6 }], arrow: false }])
  expect(diagram.columns).toBe(10)
  expect(diagram.rows).toBe(8)
  expect(diagram.unread).toEqual([])
})

test('groups with no place go along the row two squares apart, then under the tallest', () => {
  const diagram = layoutDiagram('One\n  a\n  b\nTwo\n  c\nThree\n  d')
  expect(diagram.labels.map(({ x, y }) => [x, y])).toEqual([[0, 0], [6, 0], [0, 5]])
})

test('side by side is joined straight across the middle of the rows they share', () => {
  // Between one-row boxes it runs through the middle of their row, not along their tops.
  const diagram = layoutDiagram('[Paragraph] @ 0 0\n[Text block] @ 8 0\nParagraph -> Text block')
  expect(diagram.lines).toEqual([{ segments: [{ x1: 4, y1: 0.5, x2: 8, y2: 0.5 }], arrow: true }])
  expect(layoutDiagram('Left @ 0 0\n  a\n  b\n  c\nRight @ 8 0\n  d\n  e\n  f\nLeft -- Right').lines[0].segments).toEqual([{ x1: 4, y1: 2, x2: 8, y2: 2 }])
})

/** A line leaves and meets a box at its centre, and turns only on a grid line. */
test('a line comes into a name at the name\'s middle, to the half square, and lines out of one box share a stem', () => {
  const source = `[Site] @ 0 3 w5
[Mirror] @ 7 3 orange
Products @ 0 8 light-green
  Vases
  Poster
Rentals @ 7 8 light-blue
  Pictures
Site <-> Mirror
Site -> Products
Site -> Rentals`
  // Without a measure the drawing cannot know a name's width: the group's middle.
  expect(layoutDiagram(source).lines[2].segments).toEqual([{ x1: 2, y1: 4, x2: 2, y2: 8 }])
  const widths: Record<string, number> = { Products: 2.95, Rentals: 2.4 }
  const lines = layoutDiagram(source, text => widths[text]).lines
  // Straight down, the whole line moves over to the middle of the name…
  expect(lines[2].segments).toEqual([{ x1: 1.5, y1: 4, x2: 1.5, y2: 8 }])
  // …and the other line down out of the same box leaves from that stem,
  // turns halfway, and drops onto the middle of its own name.
  expect(lines[3].segments).toEqual([
    { x1: 1.5, y1: 4, x2: 1.5, y2: 6 },
    { x1: 1.5, y1: 6, x2: 9, y2: 6 },
    { x1: 9, y1: 6, x2: 9, y2: 8 },
  ])
  // A name longer than its group is met over the group, never past it.
  expect(layoutDiagram(source, () => 12).lines[2].segments[0].x2).toBe(3.5)
  // A line up out of a group leaves from its name's middle.
  expect(layoutDiagram('Notes @ 0 4\n  a\n[Top] @ 0 0\nNotes -> Top', () => 2).lines[0].segments).toEqual([{ x1: 1, y1: 4, x2: 1, y2: 1 }])
})

test('a pale accent after a name colours its boxes, and a group called by a colour keeps its name', () => {
  const diagram = layoutDiagram('User @ 0 3 w6 Light-Green\n  Jo4712\n  Mo1234\n[Alone] pink\nPink @ 0 9\n  p\n[Yellow]')
  expect(diagram.boxes.map(box => box.color)).toEqual(['light-green', 'light-green', 'pink', undefined, undefined])
  expect(diagram.boxes[0]).toMatchObject({ text: 'Jo4712', x: 0, y: 4, w: 4 })
  expect(diagram.labels.map(label => label.text)).toEqual(['User', 'Pink'])
  expect(diagram.boxes.map(box => box.text)).toEqual(['Jo4712', 'Mo1234', 'Alone', 'p', 'Yellow'])
  expect(diagram.unread).toEqual([])
  // After a place, a colour tints a stack that has no name.
  const stack = layoutDiagram('@ 0 4 light-green\n  Buy milk')
  expect(stack.labels).toEqual([])
  expect(stack.boxes).toEqual([{ text: 'Buy milk', x: 0, y: 4, w: 4, color: 'light-green' }])
})

test('a post-it is a square frame with its name a square in, holding the groups placed on it', () => {
  const diagram = layoutDiagram('{Ship} @ 0 0 pink\n  not a box\nProducts @ 7 1\n  Ezo\nDeployment @ 1 7\n  Cloudflare\nProducts -> Deployment\n{Square} @ 14 0 w6')
  // A post-it is whole columns, placed and sized, so six squares is eight.
  expect(diagram.postIts).toEqual([
    { text: 'Ship', x: 0, y: 0, w: 12, h: 12, color: 'pink' },
    { text: 'Square', x: 16, y: 0, w: 8, h: 8 },
  ])
  expect(diagram.labels[0]).toEqual({ text: 'Ship', x: 1, y: 1, w: 10 })
  expect(diagram.boxes.map(box => box.text)).toEqual(['Ezo', 'Cloudflare'])
  // A group placed on a post-it keeps the square it names, set in the frame.
  expect(diagram.boxes.map(box => box.x)).toEqual([7, 1])
  expect(diagram.lines[0].segments.at(-1)).toEqual({ x1: 3, y1: 5, x2: 3, y2: 7 })
  expect([diagram.columns, diagram.rows]).toEqual([24, 12])
  // Always square: a height alone sets both sides, and one beside a width is the width.
  expect(layoutDiagram('{Old} @ 0 0 h10').postIts[0]).toMatchObject({ w: 12, h: 12 })
  expect(layoutDiagram('{Both} @ 0 0 w8 h4').postIts[0]).toMatchObject({ w: 8, h: 8 })
  // Boxes are placed on a post-it, not written under it.
  expect(diagram.unread).toEqual([2])
})

test('anything else turns halfway down, every run along the grid', () => {
  const diagram = layoutDiagram('[A] @ 0 0\n[B] @ 8 4\nA -- B')
  expect(diagram.lines[0].segments).toEqual([
    { x1: 2, y1: 1, x2: 2, y2: 3 },
    { x1: 2, y1: 3, x2: 10, y2: 3 },
    { x1: 10, y1: 3, x2: 10, y2: 4 },
  ])
})

test('wrapping lays a wide diagram out again in strips that fit its room, as writing wraps', () => {
  const source = '[A] @ 0 0\n[B] @ 6 0\n[C] @ 12 2\n{Note} @ 20 0 w8\n[D] @ 21 2\nA -> B\nB -> C'
  expect(layoutDiagram(source, undefined, { room: 40 }).groups.map(group => [group.x, group.y])).toEqual(layoutDiagram(source).groups.map(group => [group.x, group.y]))
  const wrapped = layoutDiagram(source, undefined, { room: 16 })
  // A and B and C fit sixteen squares; the post-it starts a strip of its own, two rows under, carrying what stands on it.
  expect(wrapped.groups.map(group => [group.x, group.y])).toEqual([[0, 0], [6, 0], [12, 2], [0, 5], [1, 7]])
  expect(wrapped.columns).toBe(16)
  expect(wrapped.lines).toHaveLength(2)
  expect(diagramWraps('```diagram wrap')).toBe(true)
  expect(diagramWraps('```diagram')).toBe(false)
  expect(diagramFenceWrapped('```diagram', true)).toBe('```diagram wrap')
  expect(diagramFenceWrapped('```diagram wrap', false)).toBe('```diagram')
  expect(isDiagramBlock('```diagram wrap\n[A]\n```')).toBe(true)
  expect(diagramFences('```diagram wrap\n[A]\n```')).toEqual([{ start: 0, end: 2 }])
})

test('a box is whole items across, as a board sizes it', () => {
  const diagram = layoutDiagram('[One]\n[Two] @ 0 2 w8\nWide @ 0 4 w12\n  Box\n[Between] @ 0 7 w11\n[Past] @ 0 9 w99')
  expect(diagram.boxes.map(box => [box.text, box.w])).toEqual([['One', 4], ['Two', 8], ['Box', 12], ['Between', 8], ['Past', 40]])
  expect(diagram.labels[0]).toMatchObject({ text: 'Wide', w: 12 })
  expect(diagram.columns).toBe(40)
})

test('widths, back arrows, chains, qualified names and lines it cannot read', () => {
  const diagram = layoutDiagram('In @ 0 0 w6\n  Same\nOut @ 8 0\n  Same\nIn.Same <- Out.Same\n[X] @ 0 4\n[Y] @ 0 6\nX -> Y -> Nowhere\n@ 6 4\n  Unnamed')
  expect(diagram.boxes[0]).toEqual({ text: 'Same', x: 0, y: 1, w: 4 })
  // Side by side, touching, they share the edge between them.
  expect(layoutDiagram('[A] @ 0 0\n[B] @ 4 0').boxes.map(box => box.shared)).toEqual([{ right: true }, { left: true }])
  expect(diagram.lines[0]).toEqual({ segments: [{ x1: 8, y1: 1.5, x2: 4, y2: 1.5 }], arrow: true })
  expect(diagram.lines).toHaveLength(2)
  expect(diagram.unread).toEqual([8])
  // `@ x y` alone is a stack with no name above it.
  expect(diagram.boxes.at(-1)).toEqual({ text: 'Unnamed', x: 6, y: 4, w: 4 })
})

test('a month stands a day a square, seven across from Monday, under its name and its days\' names', () => {
  // October 2026 starts on a Thursday and runs over five weeks.
  const diagram = layoutDiagram('10月 (2026-10) @ 0 3\n  月 火 水 木 金 土 日\n  pink 1 5 8\n  yellow 2, 9\n  light-blue 13-14')
  expect(diagram.labels).toEqual([{ text: '10月', x: 0, y: 3, w: 7 }])
  expect(diagram.boxes).toEqual([])
  const names = diagram.days.filter(day => day.name)
  expect(names.map(day => [day.text, day.x, day.y])).toEqual([['月', 0, 4], ['火', 1, 4], ['水', 2, 4], ['木', 3, 4], ['金', 4, 4], ['土', 5, 4], ['日', 6, 4]])
  const days = diagram.days.filter(day => !day.name)
  expect(days).toHaveLength(31)
  // The first on Thursday's square of the first week, the fifth back on Monday's, the last on Saturday's.
  expect(days[0]).toEqual({ text: '1', x: 3, y: 5, color: 'pink', shared: { right: true, bottom: true } })
  expect(days[4]).toEqual({ text: '5', x: 0, y: 6, color: 'pink' })
  expect(days[30]).toEqual({ text: '31', x: 5, y: 9 })
  // A day with no colour says nothing but its number; a run of days wears its colour whole.
  expect(days[2]).toEqual({ text: '3', x: 5, y: 5 })
  expect(days.filter(day => day.color === 'yellow').map(day => day.text)).toEqual(['2', '9'])
  expect(days.filter(day => day.color === 'light-blue').map(day => [day.text, day.shared])).toEqual([['13', { right: true }], ['14', { left: true }]])
  expect([diagram.columns, diagram.rows]).toEqual([7, 10])
  expect(diagram.unread).toEqual([])
})

test('a month needs no name, keeps its week beside a legend, and is reached by its name', () => {
  // February 2027 starts on a Monday: four weeks and nothing over.
  const bare = layoutDiagram('(2027-02)')
  expect(bare.labels).toEqual([])
  expect(bare.days).toHaveLength(28)
  expect([bare.days[0].x, bare.days[0].y, bare.columns, bare.rows]).toEqual([0, 0, 7, 4])
  // A leap year's February has its twenty-ninth.
  expect(layoutDiagram('(2028-2)').days.at(-1)).toEqual({ text: '29', x: 1, y: 4 })
  // A week and a square, then an item cell: the app's twelve squares.
  const beside = layoutDiagram('October (2026-10) @ 0 0\n  pink 1\n[Burnable] @ 8 1 pink\nBurnable -> October')
  expect(beside.columns).toBe(12)
  expect(beside.boxes[0]).toEqual({ text: 'Burnable', x: 8, y: 1, w: 4, color: 'pink' })
  expect(beside.lines[0].segments).toEqual([{ x1: 8, y1: 1.5, x2: 7, y2: 1.5 }])
  // What is written under a month and is neither a colour's days nor the days' names is left out.
  expect(layoutDiagram('(2026-10)\n  Monday\n  pink one').unread).toEqual([2, 3])
  // A month that is none is a name like any other.
  expect(layoutDiagram('Plan (2026-13)\n  a').labels[0].text).toBe('Plan (2026-13)')
})

test('a grid stands as many squares across and down as it says, its columns named over it and its rows before it', () => {
  const diagram = layoutDiagram('Hours (5x3) @ 0 2\n  Mon Tue Wed Thu Fri\n  09 10 11\n  pink 1-2 4\n  light-green 1:1-2 2 4:1\n  light-blue 5')
  expect(diagram.labels).toEqual([{ text: 'Hours', x: 0, y: 2, w: 6 }])
  expect(diagram.boxes).toEqual([])
  // The rows' names take a column of their own before the squares; every column here wears a colour but the third, named faintly.
  const names = diagram.days.filter(day => day.name)
  expect(names.map(day => [day.text, day.x, day.y])).toEqual([['Mon', 1, 3], ['Tue', 2, 3], ['Thu', 4, 3], ['Fri', 5, 3], ['09', 0, 4], ['10', 0, 5], ['11', 0, 6]])
  expect(diagram.days.find(day => day.text === 'Wed')).toEqual({ text: 'Wed', x: 3, y: 3, head: true, shared: { left: true } })
  expect(diagram.days.find(day => day.text === 'Mon')).toEqual({ text: 'Mon', x: 1, y: 3, name: true, head: true })
  // A column's name is in a box of its own, a row's in the condensed face.
  expect(names.map(day => [!!day.head, !!day.row, !!day.edge])).toEqual([[true, false, false], [true, false, false], [true, false, false], [true, false, false], [false, true, false], [false, true, false], [false, true, false]])
  // A later line colours over an earlier one: the first column is two green over one pink, the second green whole.
  const squares = diagram.days.filter(day => day.color)
  const worn = (x: number) => squares.filter(day => day.x === x).map(day => day.color)
  expect(worn(1)).toEqual(['light-green', 'light-green', 'pink'])
  expect(worn(2)).toEqual(['light-green', 'light-green', 'light-green'])
  expect(worn(3)).toEqual([])
  expect(worn(4)).toEqual(['light-green', 'pink', 'pink'])
  expect(worn(5)).toEqual(['light-blue', 'light-blue', 'light-blue'])
  // A square says nothing, and shares its edges with the coloured squares beside it.
  expect(squares.find(day => day.x === 1 && day.y === 4)).toEqual({ text: '', x: 1, y: 4, color: 'light-green', shared: { right: true, bottom: true } })
  expect(squares.find(day => day.x === 4 && day.y === 5)).toEqual({ text: '', x: 4, y: 5, color: 'pink', shared: { top: true, right: true, bottom: true } })
  expect([diagram.columns, diagram.rows]).toEqual([6, 7])
  expect(diagram.unread).toEqual([])
})

test('a grid needs no names, keeps to its own squares, and is a name like any other when it is none', () => {
  const bare = layoutDiagram('(3x2)\n  yellow 2:2 9 3:1-7')
  expect(bare.labels).toEqual([])
  // A column or a row past its edge is left out; a span running over it stops at the edge.
  expect(bare.days).toEqual([{ text: '', x: 1, y: 1, color: 'yellow', shared: { right: true } }, { text: '', x: 2, y: 0, color: 'yellow', shared: { bottom: true } }, { text: '', x: 2, y: 1, color: 'yellow', shared: { top: true, left: true } }])
  expect([bare.columns, bare.rows]).toEqual([3, 2])
  // Thirty days of eight hours, the hours named: thirty-one squares across, the name and the days over the eight rows.
  const month = layoutDiagram(`September (30x8) @ 0 2\n  ${Array.from({ length: 30 }, (_, day) => day + 1).join(' ')}\n  09 10 11 12 13 14 15 16\n  pink 1-4\n  light-green 8:1-2`)
  expect([month.columns, month.rows]).toEqual([31, 12])
  expect(month.days.filter(day => day.color === 'pink')).toHaveLength(32)
  expect(month.days.filter(day => day.color === 'light-green').map(day => [day.x, day.y])).toEqual([[8, 4], [8, 5]])
  expect(diagramListColumns('```diagram\n(30x8)\n```')).toBe(8)
  expect(writingLineRows('```diagram\nHours (30x8)\n  pink 1\n```')).toBe(9)
  // Squares across and squares down each as many words: the first such line names the columns, the next the rows.
  const square = layoutDiagram('(2x2)\n  a b\n  c d\n  pink 1')
  expect(square.days.filter(day => !day.color).map(day => [day.text, day.x, day.y, !!day.name])).toEqual([['a', 1, 0, true], ['b', 2, 0, false], ['c', 0, 1, true], ['d', 0, 2, true]])
  // One word more than its rows names the lines, each on its line from the squares' top edge to their foot, and the grid is a row taller for the last.
  const hours = layoutDiagram('(2x3) @ 0 0\n  a b\n  09 10 11 12\n  white 1\n  pink 2:1')
  expect(hours.days.filter(day => day.row).map(day => [day.text, day.x, day.y, !!day.edge])).toEqual([['09', 0, 1, true], ['10', 0, 2, true], ['11', 0, 3, true], ['12', 0, 4, true]])
  expect([hours.columns, hours.rows]).toEqual([3, 5])
  // White is a colour like the others.
  expect(hours.days.filter(day => day.color === 'white').map(day => [day.x, day.y])).toEqual([[1, 1], [1, 2], [1, 3]])
  expect(layoutDiagram('[Weekend] white').boxes[0]).toEqual({ text: 'Weekend', x: 0, y: 0, w: 4, color: 'white' })
  // What is neither a colour's squares nor names is left out, and a grid of no squares is a name.
  expect(layoutDiagram('(3x4)\n  one\n  pink first').unread).toEqual([2, 3])
  expect(layoutDiagram('Plan (0x4)\n  a').labels[0].text).toBe('Plan (0x4)')
})

test('aa-diagram draws a month\'s days on their squares, the coloured ones as chips', async () => {
  const element = document.createElement('aa-diagram') as HTMLElement & { source?: string; updateComplete: Promise<unknown> }
  element.source = '10月 (2026-10)\n  月 火 水 木 金 土 日\n  pink 1\n  yellow 2'
  document.body.append(element)
  await element.updateComplete
  const days = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.day')]
  expect(days).toHaveLength(38)
  expect(days.filter(day => day.hasAttribute('data-name')).map(day => day.textContent).join('')).toBe('月火水木金土日')
  const first = days.find(day => day.textContent === '1')!
  expect(first.dataset.color).toBe('pink')
  expect(first.getAttribute('style')).toBe('--x:3;--y:2;--w:1')
  expect(first.hasAttribute('data-shared-right')).toBe(true)
  expect(days.find(day => day.textContent === '3')!.dataset.color).toBeUndefined()
  expect(element.style.getPropertyValue('--diagram-columns')).toBe('7')
  const css = read('../src/diagram.css')
  expect(css).toContain(':is(.box, .post-it, .day)[data-color="pink"]')
  expect(css).toContain(':is(.box, .post-it, .day)[data-color="white"]')
  expect(css).toContain('.day[data-head]::after')
  expect(css).toMatch(/\.day\[data-row\] \{\s+font-family: var\(--ds-typeface-compressed, var\(--typeface-compressed/)
  expect(css).toMatch(/\.day\[data-edge\] \{\s+transform: translateY\(-50%\)/)
  element.remove()
})

test('aa-diagram draws each line as one stroke and its arrow as a four pixel point at 35 degrees', async () => {
  const element = document.createElement('aa-diagram') as HTMLElement & { source?: string; updateComplete: Promise<unknown> }
  element.source = '[A] @ 0 0\n[B] @ 8 4\nA -> B'
  document.body.append(element)
  await element.updateComplete
  const stroke = element.shadowRoot!.querySelectorAll('path')
  expect(stroke).toHaveLength(1)
  // Square turns in the square shape.
  expect(stroke[0].getAttribute('d')).toBe('M2,1 L2,3 L10,3 L10,4')
  const strokes = [...element.shadowRoot!.querySelectorAll('polyline')]
  expect(strokes).toHaveLength(1)
  const [left, tip, right] = strokes[0].getAttribute('points')!.split(' ').map(point => point.split(',').map(Number))
  expect(tip).toEqual([10, 4])
  for (const arm of [left, right]) {
    // A fifth of a twenty pixel square, 35 degrees off the line.
    expect(Math.hypot(arm[0] - tip[0], arm[1] - tip[1])).toBeCloseTo(0.2)
    expect(Math.atan2(Math.abs(arm[0] - tip[0]), tip[1] - arm[1]) * 180 / Math.PI).toBeCloseTo(35)
  }
  expect(element.shadowRoot!.querySelector('line')).toBeNull()
  element.remove()
})

test('a colour as a box\'s last word fills that box alone, over its group\'s', () => {
  const { boxes, unread } = layoutDiagram('Ezo @ 0 2 white\n  Google sign-in light-green\n  Apple sign-in yellow\n  Passkeys red\n  Pink\n  Sign out')
  expect(unread).toEqual([])
  expect(boxes.map(box => [box.text, box.color])).toEqual([
    ['Google sign-in', 'light-green'],
    ['Apple sign-in', 'yellow'],
    ['Passkeys', 'red'],
    // A box that is only a colour's name keeps it as its words.
    ['Pink', 'white'],
    ['Sign out', 'white'],
  ])
})

test('red is a diagram colour, filled with the palette\'s tuned red', () => {
  expect(layoutDiagram('Missing @ 0 0 red\n  Passkeys').boxes[0].color).toBe('red')
  expect(read('../src/diagram.css')).toContain('[data-color="red"] { --box-fill: var(--ds-tuned-red, var(--tuned-red, #ff5f5f)); }')
})

test('a line\'s turns are arcs as round as a cell\'s corner, never more than half a run', async () => {
  const { linePath } = await import('../src/diagram')
  const segments = [{ x1: 2, y1: 1, x2: 2, y2: 3 }, { x1: 2, y1: 3, x2: 10, y2: 3 }, { x1: 10, y1: 3, x2: 10, y2: 4 }]
  expect(linePath(segments, 0)).toBe('M2,1 L2,3 L10,3 L10,4')
  // Down then right turns anticlockwise; right then down turns clockwise, and the last run of one square holds a half-square arc at most.
  expect(linePath(segments, 0.4)).toBe('M2,1 L2,2.6 A0.4,0.4 0 0 0 2.4,3 L9.6,3 A0.4,0.4 0 0 1 10,3.4 L10,4')
  expect(linePath(segments, 2)).toBe('M2,1 L2,2 A1,1 0 0 0 3,3 L9.5,3 A0.5,0.5 0 0 1 10,3.5 L10,4')
  // The turns follow the shape, and the marks the theme, as the root's attributes change.
  expect(read('../src/diagram.ts')).toContain("shapeObserver.observe(document.documentElement, { attributes: true })")
})

test('a grid\'s long column names slant up from their squares, so a column stays one square wide', () => {
  const { days, rows, unread } = layoutDiagram('(3x2) @ 4 0\n  Ezo Consistency Link\n  light-green 1\n  red 2:1\n  yellow 3:2')
  expect(unread).toEqual([])
  const heads = days.filter(day => day.slant)
  // Consistency rises about a third of a square a letter: five rows over the squares.
  expect(heads.map(day => [day.text, day.x, day.y])).toEqual([['Ezo', 4, 4], ['Consistency', 5, 4], ['Link', 6, 4]])
  expect(days.filter(day => day.color).map(day => [day.x, day.y, day.color])).toEqual([
    [4, 5, 'light-green'], [4, 6, 'light-green'], [5, 5, 'red'], [6, 6, 'yellow'],
  ])
  expect(rows).toBe(7)
  // Names that fit their squares stay boxed on one row, as a calendar's days are.
  expect(layoutDiagram('(2x1)\n  Mo Tu').days.filter(day => day.head)).toHaveLength(2)
  expect(read('../src/diagram.css')).toContain('rotate: -45deg;')
})

test('a chart is a plot of squares, its foot named, its values ruled and its lines from left to right', () => {
  const diagram = layoutDiagram(`Extreme (chart 9x6) @ 0 2
  2026 2030
  0 10 20
  orange 3 9 18
  white 4 4.1 4.2
  light-blue 4.1 4 3.9`)
  expect(diagram.unread).toEqual([])
  const [chart] = diagram.charts
  // On a card a square in all round: a column for the values' names before the plot, two after it for the last values.
  expect(chart).toMatchObject({ x: 2, y: 5, w: 9, h: 6, frame: { x: 0, y: 2, w: 14, h: 11 } })
  expect(diagram.columns).toBe(14)
  // Its card: its name a square in, a free row, the plot and the row of the foot's names, and a square under.
  expect(diagram.rows).toBe(2 + 1 + 1 + 1 + 6 + 1 + 1)
  expect(diagram.labels[0]).toMatchObject({ text: 'Extreme', x: 1, y: 3 })
  expect(chart.across).toEqual([{ text: '2026', at: 2 }, { text: '2030', at: 11 }])
  // The values lie on whole lines of the paper when they divide its rows.
  expect(chart.down.map(name => name.at)).toEqual([11, 8, 5])
  const expected = [{ x: 2, y: 11 - 6 * 3 / 20 }, { x: 6.5, y: 11 - 6 * 9 / 20 }, { x: 11, y: 11 - 6 * 18 / 20 }]
  chart.series[0].points.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x)
    expect(point.y).toBeCloseTo(expected[index].y)
  })
  expect(chart.series[0].end).toBe('18')
  // Last values whose lines end close together are moved apart, in the order the lines end.
  const [white, blue] = chart.series.slice(1).map(series => series.endAt)
  expect(blue - white).toBeGreaterThanOrEqual(0.85 - 1e-9)
})

test('a chart with no values written runs from nought to its highest, rounded up a step', () => {
  const [chart] = layoutDiagram('(chart 4x4)\n  a b\n  pink 0 37').charts
  expect(chart.down).toEqual([])
  // 37 rounds up to 40: the line ends 37/40 of the way up.
  expect(chart.series[0].points[1].y).toBeCloseTo(chart.y + 4 * (1 - 37 / 40))
})

test('a chart\'s lines are a marker\'s strokes, the same every time they are drawn', async () => {
  const { markerStrokes } = await import('../src/marker')
  const points = [{ x: 0, y: 40 }, { x: 200, y: 20 }, { x: 400, y: 0 }]
  const strokes = markerStrokes(points, 6, 7)
  expect(strokes.length).toBeGreaterThan(2)
  expect(strokes.every(d => d.startsWith('M') && d.endsWith('Z'))).toBe(true)
  expect(markerStrokes(points, 6, 7)).toEqual(strokes)
  expect(markerStrokes(points, 6, 8)).not.toEqual(strokes)
  expect(read('../src/marker.ts')).toContain('feDisplacementMap')
})

test('a grid or a month written with marker colours its squares in with a marker, as chips that share no edges', async () => {
  const grid = layoutDiagram('(3x2 marker)\n  pink 1-2').days
  expect(grid).toHaveLength(4)
  expect(grid.every(day => day.marker && day.color === 'pink' && !day.shared)).toBe(true)
  expect(layoutDiagram('(3x2)\n  pink 1-2').days.some(day => day.marker)).toBe(false)
  expect(layoutDiagram('Oct (2026-10 marker)\n  yellow 1 2').days.filter(day => day.marker)).toHaveLength(2)
  const { markerSquare } = await import('../src/marker')
  const square = markerSquare(0, 0, 20, 3)
  expect(markerSquare(0, 0, 20, 3)).toEqual(square)
  // Laid as Anthropic lays a square: five solid strokes, the paper let through, ink over ink, and four pooled edges.
  expect(square.filter(layer => layer.tone === 'body')).toHaveLength(5)
  expect(square.filter(layer => layer.tone === 'body').every(layer => layer.opacity === 1)).toBe(true)
  expect(square.some(layer => layer.tone === 'paper')).toBe(true)
  expect(square.some(layer => layer.tone === 'pass')).toBe(true)
  expect(square.filter(layer => layer.tone === 'edge')).toHaveLength(4)
})

test('a chart\'s line is a marker\'s body with a pass along its middle and a streak toward one edge, as Anthropic lays one', async () => {
  const { markerLine, markerFrame } = await import('../src/marker')
  const line = markerLine([{ x: 0, y: 40 }, { x: 400, y: 0 }], 5, 7)
  expect(line.map(layer => [layer.tone, layer.opacity])).toEqual([['body', 0.86], ['pass', 0.3], ['pass', 0.22]])
  // Its card: four sides ruled by hand, faint.
  const frame = markerFrame(0, 0, 200, 100, 3)
  expect(frame).toHaveLength(4)
  expect(frame.every(layer => layer.opacity === 0.3)).toBe(true)
})
