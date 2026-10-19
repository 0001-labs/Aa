/**
 * A diagram changed where it is drawn, written back as words. Every change
 * here takes a diagram's source and its layout (`layoutDiagram`), and gives
 * the source as it would be written by hand for the change: a group moved
 * has its `@ x y`, a box added is a line of its own, a line drawn between
 * two boxes is `A -> B`, and a group taken away takes its lines with it.
 * Nothing else in the source moves, so what a person wrote stays theirs.
 *
 * Nothing here touches the page, so a server can make the same changes.
 */

import { DIAGRAM_COLORS, type Diagram, type DiagramColor, type DiagramGroup } from './diagram-language'

/** What is chosen on a drawing: a group, one box of a stack, or a line. */
export type DiagramTarget = { group: number; box?: number } | { join: number }

const PLACE = /[ \t]+@[ \t]*(\d{1,3})(?:[ \t]*,[ \t]*|[ \t]+)(\d{1,3})(?=[ \t]|$)/
const WIDTH = /[ \t]+[wh](\d{1,2})(?=[ \t]|$)/gi
const COLOR = new RegExp(`[ \\t]+(${DIAGRAM_COLORS.join('|')})(?=[ \\t]|$)`, 'i')
const BOX_COLOR = new RegExp(`^(.*\\S)[ \\t]+(${DIAGRAM_COLORS.join('|')})$`, 'i')
const JOIN_SPLIT = /[ \t]+(<->|->|<-|--)[ \t]+/
const JOIN = /[ \t]+(?:<->|->|<-|--)[ \t]+/
const BOX_LINE = /^(\s*(?:[-*+][ \t]+)?)(.*)$/

const key = (name: string) => name.trim().toLowerCase()
const lines = (source: string) => source.replace(/\r\n?/g, '\n').split('\n')

/** A diagram's groups and boxes by the names lines reach them by. */
function names(diagram: Diagram): Set<string> {
  const all = new Set<string>()
  for (const group of diagram.groups) {
    if (group.name) all.add(key(group.name))
    for (const box of group.boxes) all.add(key(box.text))
  }
  return all
}

/** A name nothing in the diagram goes by yet: `Box`, then `Box 2`, `Box 3`. */
export function freeName(diagram: Diagram, base: string): string {
  const taken = names(diagram)
  if (!taken.has(key(base))) return base
  for (let count = 2; ; count++) if (!taken.has(key(`${base} ${count}`))) return `${base} ${count}`
}

/** The name a line reaches a target by: a group's name, a lone box's words, or `Stack.Box` where a box's words are not its own. */
export function referenceOf(diagram: Diagram, target: DiagramTarget): string | undefined {
  if ('join' in target) return undefined
  const group = diagram.groups[target.group]
  if (!group) return undefined
  if (target.box === undefined || group.kind === 'box') return group.name ?? group.boxes[0]?.text
  const box = group.boxes[target.box]
  if (!box) return undefined
  const twice = diagram.groups.flatMap(other => [other.name, ...other.boxes.map(each => each.text)]).filter(name => name !== undefined && key(name) === key(box.text)).length > 1
  return twice && group.name ? `${group.name}.${box.text}` : box.text
}

/** Whether a source line is a line between boxes: written at the left edge, with a join in it. */
function isJoin(raw: string): boolean {
  return !/^\s/.test(raw) && !/^[-*+][ \t]/.test(raw) && !raw.trim().startsWith('//') && JOIN.test(raw.trim())
}

type Pair = { from: string; op: string; to: string }

/** A join line as its pairs, `A -> B -> C` as `A -> B` and `B -> C`. */
function pairsOf(raw: string): Pair[] {
  const parts = raw.trim().split(JOIN_SPLIT)
  const pairs: Pair[] = []
  for (let at = 0; at + 2 < parts.length; at += 2) pairs.push({ from: parts[at].trim(), op: parts[at + 1], to: parts[at + 2].trim() })
  return pairs
}

/** Pairs as join lines: a chain kept whole where each starts where the last ended. */
function writePairs(pairs: Pair[]): string[] {
  const out: string[] = []
  let chain = ''
  let last: string | undefined
  for (const pair of pairs) {
    if (chain && last !== undefined && key(last) === key(pair.from)) chain += ` ${pair.op} ${pair.to}`
    else {
      if (chain) out.push(chain)
      chain = `${pair.from} ${pair.op} ${pair.to}`
    }
    last = pair.to
  }
  if (chain) out.push(chain)
  return out
}

/** Whether a name in a join reaches what is going: the name itself, or one of a stack's boxes by `Stack.Box`. */
function reaches(name: string, gone: Set<string>): boolean {
  const said = key(name)
  if (gone.has(said)) return true
  const dot = said.indexOf('.')
  return dot > 0 && (gone.has(said.slice(0, dot)) || gone.has(said))
}

/** The source with every pair that reaches one of these names taken out. */
function dropJoins(all: string[], gone: Set<string>): string[] {
  return all.flatMap(raw => {
    if (!isJoin(raw)) return [raw]
    const pairs = pairsOf(raw)
    const kept = pairs.filter(pair => !reaches(pair.from, gone) && !reaches(pair.to, gone))
    return kept.length === pairs.length ? [raw] : writePairs(kept)
  })
}

/** A group's first line written again: its name, place, sizes and colour. */
function header(raw: string, group: DiagramGroup, change: { name?: string; x?: number; y?: number; color?: DiagramColor | null }): string {
  // Months, grids and charts carry their own brackets: only their place is written again.
  if (group.kind === 'month' || group.kind === 'grid' || group.kind === 'chart') {
    if (change.x === undefined || change.y === undefined) return raw
    const place = ` @ ${change.x} ${change.y}`
    return PLACE.test(` ${raw}`) ? ` ${raw}`.replace(PLACE, place).slice(1) : `${raw.trimEnd()}${place}`
  }
  const sizes = (raw.match(WIDTH) ?? []).join('')
  const name = change.name ?? (group.kind === 'box' ? group.boxes[0]?.text : group.name) ?? ''
  const word = group.kind === 'box' ? `[${name}]` : group.kind === 'post-it' ? `{${name}}` : name
  const x = change.x ?? group.x, y = change.y ?? group.y
  const placed = change.x !== undefined || group.placed
  const color = change.color === null ? undefined : change.color ?? group.color
  return `${word}${placed ? ` @ ${x} ${y}` : ''}${sizes}${color ? ` ${color}` : ''}`.trim()
}

/** A box's line in a stack written again, its indent kept. */
function boxLine(raw: string, change: { name?: string; color?: DiagramColor | null }): string {
  const [, lead = '', said = ''] = BOX_LINE.exec(raw) ?? []
  const tinted = BOX_COLOR.exec(said.trim())
  const text = change.name ?? (tinted ? tinted[1] : said.trim())
  const color = change.color === null ? undefined : change.color ?? (tinted ? tinted[2].toLowerCase() : undefined)
  return `${lead}${text}${color ? ` ${color}` : ''}`
}

/** A group set on other squares: its `@ x y` written, or written again. */
export function moveGroup(source: string, diagram: Diagram, index: number, x: number, y: number): string {
  const group = diagram.groups[index]
  if (!group) return source
  const all = lines(source)
  all[group.line - 1] = header(all[group.line - 1], group, { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) })
  return all.join('\n')
}

/** A new group on a square: a lone box `[Box] @ x y`, or a post-it `{Note} @ x y w8`, after the groups already written. */
export function addGroup(source: string, diagram: Diagram, kind: 'box' | 'post-it', name: string, x: number, y: number): string {
  const all = source.trim() ? lines(source) : []
  const line = kind === 'post-it' ? `{${name}} @ ${x} ${y} w8` : `[${name}] @ ${x} ${y}`
  const after = Math.max(0, ...diagram.groups.map(group => group.end))
  // With no group yet, after the title, if there is one.
  const at = after || (all.length && /^#{1,4}[ \t]/.test(all[0].trim()) ? 1 : 0)
  all.splice(at, 0, line)
  return all.join('\n')
}

/** A line drawn from one name to another, written at the end. */
export function addJoin(source: string, from: string, to: string, op: '--' | '->' = '->'): string {
  const text = source.replace(/\s+$/, '')
  return `${text}${text ? '\n' : ''}${from} ${op} ${to}`
}

/** A group or a box called something else, and every line that reached it by its old name. */
export function renameTarget(source: string, diagram: Diagram, target: DiagramTarget, name: string): string {
  if ('join' in target) return source
  const group = diagram.groups[target.group]
  const word = name.replace(/[\n\r]+/g, ' ').replace(/[[\]{}]/g, '').trim()
  if (!group || !word) return source
  if (group.kind === 'month' || group.kind === 'grid' || group.kind === 'chart') return source
  let all = lines(source)
  let before: string | undefined
  if (target.box !== undefined && group.kind === 'stack') {
    const box = group.boxes[target.box]
    if (!box) return source
    before = box.text
    all[box.line - 1] = boxLine(all[box.line - 1], { name: word })
  } else {
    before = group.kind === 'box' ? group.boxes[0]?.text : group.name
    all[group.line - 1] = header(all[group.line - 1], group, { name: word })
  }
  if (before === undefined || key(before) === key(word)) return all.join('\n')
  // Lines that reached it by its old name reach it by the new one: `Old`, `Old.Box` and `Stack.Old`.
  const old = key(before)
  const rename = (said: string) => {
    const lower = key(said)
    if (lower === old) return word
    const dot = said.indexOf('.')
    if (dot > 0 && key(said.slice(0, dot)) === old) return `${word}${said.slice(dot)}`
    if (dot > 0 && key(said.slice(dot + 1)) === old) return `${said.slice(0, dot + 1)}${word}`
    return said
  }
  all = all.map(raw => isJoin(raw) ? writePairs(pairsOf(raw).map(pair => ({ ...pair, from: rename(pair.from), to: rename(pair.to) }))).join('\n') : raw)
  return all.join('\n')
}

/** A group or one box of a stack in a pale accent, or in none. */
export function colorTarget(source: string, diagram: Diagram, target: DiagramTarget, color: DiagramColor | null): string {
  if ('join' in target) return source
  const group = diagram.groups[target.group]
  if (!group || group.kind === 'month' || group.kind === 'grid' || group.kind === 'chart') return source
  const all = lines(source)
  if (target.box !== undefined && group.kind === 'stack') {
    const box = group.boxes[target.box]
    if (!box) return source
    all[box.line - 1] = boxLine(all[box.line - 1], { color })
  } else {
    // A colour the group's boxes wore of their own gives way to the one chosen for all of them.
    if (group.kind === 'stack') for (const box of group.boxes) if (box.color) all[box.line - 1] = boxLine(all[box.line - 1], { color: null })
    all[group.line - 1] = header(all[group.line - 1], group, { color })
  }
  return all.join('\n')
}

/** A group, a box or a line taken away; a group or a box takes the lines that reached it. */
export function deleteTarget(source: string, diagram: Diagram, target: DiagramTarget): string {
  let all = lines(source)
  if ('join' in target) {
    const join = diagram.joins[target.join]
    if (!join) return source
    const raw = all[join.line - 1]
    const pairs = pairsOf(raw)
    // The pair this line is, either way round, since `A <-> B` is drawn as two.
    const at = pairs.findIndex(pair => (key(pair.from) === key(join.from) && key(pair.to) === key(join.to)) || (key(pair.from) === key(join.to) && key(pair.to) === key(join.from)))
    if (at < 0) return source
    all.splice(join.line - 1, 1, ...writePairs(pairs.filter((_, index) => index !== at)))
    return all.join('\n')
  }
  const group = diagram.groups[target.group]
  if (!group) return source
  const gone = new Set<string>()
  if (target.box !== undefined && group.kind === 'stack') {
    const box = group.boxes[target.box]
    if (!box) return source
    gone.add(key(box.text))
    if (group.name) gone.add(key(`${group.name}.${box.text}`))
    all[box.line - 1] = '\u0000'
  } else {
    if (group.name) gone.add(key(group.name))
    for (const box of group.boxes) gone.add(key(box.text))
    for (let line = group.line; line <= group.end; line++) all[line - 1] = '\u0000'
  }
  // A box another group also goes by still reaches that one.
  for (const [index, other] of diagram.groups.entries()) {
    if (index === target.group) continue
    if (other.name) gone.delete(key(other.name))
    for (const box of other.boxes) gone.delete(key(box.text))
  }
  all = dropJoins(all.filter(raw => raw !== '\u0000'), gone)
  return all.join('\n')
}
