import type { Block } from './markdown'

export type Cell = { text: string; from: number; to: number }
/** Cells keep offsets into the original Markdown, including escaped pipes. */
export function tableRows(source: string): Cell[][] {
  let base = 0
  return source.split('\n').flatMap((line, index) => {
    const offset = base
    base += line.length + 1
    if (index === 1) return []
    const boundaries = [-1]
    let ticks = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue }
      if (line[i] === '`') ticks = !ticks
      if (line[i] === '|' && !ticks) boundaries.push(i)
    }
    boundaries.push(line.length)
    const cells: Cell[] = []
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1] + 1, end = boundaries[i]
      if ((i === 1 || i === boundaries.length - 1) && !line.slice(start, end).trim()) continue
      const raw = line.slice(start, end)
      // One space is delimiter padding; additional spaces belong to the cell.
      // Trimming them all moves a typing caret into the next cell after Space.
      const from = start + (raw.match(/^[ \t]?/)?.[0].length ?? 0)
      const to = Math.max(from, end - (raw.match(/[ \t]?$/)?.[0].length ?? 0))
      cells.push({ text: line.slice(from, to), from: offset + from, to: offset + to })
    }
    return [cells]
  })
}
/** A column's alignment, from the delimiter row: `:---` start, `:---:` centre, `---:` end. */
export type Alignment = 'start' | 'center' | 'end' | null
export function tableAlignments(source: string): Alignment[] {
  const line = source.split('\n')[1] ?? ''
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(cell => {
    const text = cell.trim(), start = text.startsWith(':'), end = text.endsWith(':')
    return start && end ? 'center' : end ? 'end' : start ? 'start' : null
  })
}
const DELIMITER: Record<string, string> = { start: ':---', center: ':---:', end: '---:' }
export function writeTable(rows: readonly (readonly string[])[], alignments: readonly Alignment[] = []): string {
  const width = Math.max(1, ...rows.map(row => row.length))
  const line = (row: readonly string[]) => `| ${Array.from({ length: width }, (_, i) => (row[i] ?? '').replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|')).join(' | ')} |`
  const delimiter = `| ${Array.from({ length: width }, (_, i) => DELIMITER[alignments[i] ?? ''] ?? '---').join(' | ')} |`
  return [line(rows[0] ?? ['']), delimiter, ...rows.slice(1).map(line)].join('\n')
}
export function fromTSV(text: string): string | null {
  if (!text.includes('\t')) return null
  return writeTable(text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t')))
}
export type TableAction = 'add-row' | 'delete-row' | 'add-column' | 'delete-column'
export function editTable(block: Block, action: TableAction, row: number, column: number): string {
  const rows = tableRows(block.source).map(row => row.map(cell => cell.text))
  const alignments = tableAlignments(block.source)
  const width = Math.max(1, ...rows.map(row => row.length))
  rows.forEach(row => { while (row.length < width) row.push('') })
  if (action === 'add-row') rows.splice(row + 1, 0, Array(width).fill(''))
  if (action === 'delete-row' && row > 0 && rows.length > 1) rows.splice(row, 1)
  if (action === 'add-column') { rows.forEach(row => row.splice(column + 1, 0, '')); alignments.splice(column + 1, 0, null) }
  if (action === 'delete-column' && width > 1) { rows.forEach(row => row.splice(column, 1)); alignments.splice(column, 1) }
  return writeTable(rows, alignments)
}
