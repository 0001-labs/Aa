import { isAccountCode, isListCode } from './shapes'
import { scanCodeChecksum, scanCodeColumns, scanCodeRows } from './scanCodeDrawing'
export { CODE_END_RADIUS, encodeScanCode, scanCodeColumns, scanCodePath, scanCodeRows } from './scanCodeDrawing'

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const idSpace = 62 ** 6

/** Validates the format byte and CRC; any single corrupted cell yields null. */
export function decodeScanCode(bits: readonly boolean[]): string | null {
  if (bits.length !== 64) return null
  const bytes: number[] = []
  for (let offset = 0; offset < 64; offset += 8) {
    let byte = 0
    for (let bit = 0; bit < 8; bit++) byte = (byte << 1) | (bits[offset + bit] ? 1 : 0)
    bytes.push(byte)
  }
  if (bytes[0] !== 3 || scanCodeChecksum(bytes.slice(0, 6)) !== ((bytes[6] << 8) | bytes[7])) return null
  let value = 0
  for (const byte of bytes.slice(1, 6)) value = value * 256 + byte
  if (value >= idSpace) return null
  let id = ''
  for (let index = 0; index < 6; index++) {
    id = alphabet[value % 62] + id
    value = Math.floor(value / 62)
  }
  return id
}

export const isListScanId = (id: string): boolean => isListCode(id)
/** A person's code: a name's `LLnnnn` or a product's `LLLLnn` (`shapes.ts`). */
export const isUserScanId = (id: string): boolean => isAccountCode(id)
/** Scanning opens lists and profiles; item codes are not scannable. */
export const isSupportedScanId = (id: string): boolean => isListScanId(id) || isUserScanId(id)

export type ScanRect = { x: number; y: number; width: number; height: number }
export type Luminance = (x: number, y: number) => number
export type Chroma = (x: number, y: number) => boolean

const insetRect = (rect: ScanRect, dx: number, dy: number): ScanRect => ({
  x: rect.x + dx, y: rect.y + dy, width: rect.width - 2 * dx, height: rect.height - 2 * dy,
})
const offsetRect = (rect: ScanRect, dx: number, dy: number): ScanRect => ({ ...rect, x: rect.x + dx, y: rect.y + dy })
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Reads only 576 luminance samples from the guide rectangle (default: centered, 80% wide, 4:1). */
export function sampleScanCode(width: number, height: number, luminance: Luminance, rect?: ScanRect): string | null {
  if (width < 80 || height < 20) return null
  const guideWidth = rect?.width ?? width * 0.8
  const guideHeight = rect?.height ?? guideWidth / 4
  if (guideHeight > height) return null
  const left = rect?.x ?? (width - guideWidth) / 2
  const top = rect?.y ?? (height - guideHeight) / 2
  const radius = guideWidth / 16 < 6 ? 0 : 1
  const levels: number[] = []
  for (let y = 0; y < scanCodeRows; y++) {
    for (let x = 0; x < scanCodeColumns; x++) {
      const px = Math.trunc(left + (x + 0.5) * guideWidth / scanCodeColumns)
      const py = Math.trunc(top + (y + 0.5) * guideHeight / scanCodeRows)
      let level = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) level += luminance(clamp(px + dx, 0, width - 1), clamp(py + dy, 0, height - 1))
      }
      levels.push(level / (radius * 2 + 1) ** 2)
    }
  }
  const low = Math.min(...levels), high = Math.max(...levels)
  if (high - low <= 8) return null
  const mid = (low + high) / 2
  return decodeScanCode(levels.map(level => level < mid)) ?? decodeScanCode(levels.map(level => level > mid))
}

/**
 * Where sixty-four levels part into two tones: the cut that leaves each side
 * closest to its own middle, so a cell buried under a letter does not move
 * it as the middle of the darkest and the lightest would.
 */
function partedLevels(levels: readonly number[]): number | null {
  const sorted = [...levels].sort((a, b) => a - b)
  if (sorted[sorted.length - 1] - sorted[0] <= 8) return null
  let total = 0
  for (const value of sorted) total += value
  let best = -1, cut: number | null = null, below = 0
  for (let index = 1; index < sorted.length; index++) {
    below += sorted[index - 1]
    if (sorted[index] === sorted[index - 1]) continue
    const low = below / index, high = (total - below) / (sorted.length - index)
    const between = index * (sorted.length - index) * (high - low) ** 2
    if (between > best) { best = between; cut = (sorted[index] + sorted[index - 1]) / 2 }
  }
  return cut
}

/**
 * The levels measured from the field's own tone where each column stands:
 * the lightest (or, under light words, the darkest) of a column and its
 * neighbours. A field whose colour turns across it, a spectrum month's
 * header cell, or a shadow over half the code then parts as a plain one does.
 */
function levelledColumns(levels: readonly number[], lightest: boolean): number[] {
  const ground: number[] = []
  for (let column = 0; column < scanCodeColumns; column++) {
    let found = lightest ? -Infinity : Infinity
    for (let near = Math.max(0, column - 1); near <= Math.min(scanCodeColumns - 1, column + 1); near++) {
      for (let row = 0; row < scanCodeRows; row++) {
        const level = levels[row * scanCodeColumns + near]
        found = lightest ? Math.max(found, level) : Math.min(found, level)
      }
    }
    ground.push(found)
  }
  return levels.map((level, index) => level - ground[index % scanCodeColumns])
}

/** The share of a cell's samples its own tone is read at: its lighter part under dark words, its darker under light ones. */
const WRITTEN_SHARES = [0.8, 0.2, 0.95, 0.05] as const

/** A code's four corners in the frame: top left, top right, bottom right, bottom left. */
export type ScanCorners = readonly [x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number]

const rectCorners = (rect: ScanRect): ScanCorners => [rect.x, rect.y, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height]

/**
 * Reads a code that has words written over it: a calendar's header cell is
 * its sheet's code, two tones of the cell's colour, with Jan 2027 printed on
 * top. The middle of a cell may then lie under a letter, so every cell is
 * read from many points across its middle and the words' ink left out: dark
 * words leave a cell's lighter part its own, light words its darker part.
 * The two tones are parted where they cluster (`partedLevels`), plain and
 * then levelled column by column (`levelledColumns`). The code is given by
 * its rectangle, or by its four corners where the page is held askew. So
 * many readings of one place ask more of the check than one does, so only an
 * ID a scan can open is taken.
 */
export function sampleWrittenScanCode(width: number, height: number, luminance: Luminance, place: ScanRect | ScanCorners): string | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = 'width' in place ? rectCorners(place) : place
  const cell = Math.min(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x2 - x3, y2 - y3)) / scanCodeColumns
  if (cell < 5) return null
  // The cells, each read from many points across `inner` of it, darkest first.
  const sampled = (inner: number): number[][] => {
    const across = Math.max(2, Math.min(7, Math.floor(cell * inner)))
    const cells: number[][] = []
    for (let row = 0; row < scanCodeRows; row++) {
      for (let column = 0; column < scanCodeColumns; column++) {
        const values: number[] = []
        for (let j = 0; j < across; j++) {
          const v = (row + (1 - inner) / 2 + (inner * (j + 0.5)) / across) / scanCodeRows
          for (let i = 0; i < across; i++) {
            const u = (column + (1 - inner) / 2 + (inner * (i + 0.5)) / across) / scanCodeColumns
            const px = Math.round((1 - v) * ((1 - u) * x0 + u * x1) + v * ((1 - u) * x3 + u * x2))
            const py = Math.round((1 - v) * ((1 - u) * y0 + u * y1) + v * ((1 - u) * y3 + u * y2))
            values.push(luminance(clamp(px, 0, width - 1), clamp(py, 0, height - 1)))
          }
        }
        values.sort((a, b) => a - b)
        cells.push(values)
      }
    }
    return cells
  }
  const taken = (dark: readonly boolean[]): string | null => {
    const id = decodeScanCode(dark as boolean[]) ?? decodeScanCode(dark.map(bit => !bit))
    return id && isSupportedScanId(id) ? id : null
  }
  // Words printed whole over the code: the middle of each cell, where a
  // neighbour's tone never reaches, read at its lighter and its darker parts.
  const middles = sampled(0.6)
  for (const share of WRITTEN_SHARES) {
    const read = middles.map(values => values[Math.round((values.length - 1) * share)])
    for (const levels of [read, levelledColumns(read, share > 0.5)]) {
      const cut = partedLevels(levels)
      if (cut === null) continue
      const id = taken(levels.map(level => level < cut))
      if (id) return id
    }
  }
  return sampleCutScanCode((u, v) => {
    const px = Math.round((1 - v) * ((1 - u) * x0 + u * x1) + v * ((1 - u) * x3 + u * x2))
    const py = Math.round((1 - v) * ((1 - u) * y0 + u * y1) + v * ((1 - u) * y3 + u * y2))
    return luminance(clamp(px, 0, width - 1), clamp(py, 0, height - 1))
  }, cell, taken)
}

/**
 * Words cut out of the code itself, two colours and no more: the words
 * change sides cell by cell, ink on the cell's colour and the cell's colour
 * on the ink, so a cell is the colour most of it is. Where a letter takes
 * about half a cell neither colour is most of it; such cells, a few at the
 * most, are read both ways, fewest changed first, and the check says which
 * reading is the code.
 *
 * `at` gives the light at a place in the code, 0 to 1 across and down.
 */
function sampleCutScanCode(at: (u: number, v: number) => number, cell: number, taken: (dark: readonly boolean[]) => string | null): string | null {
  const n = Math.max(4, Math.min(8, Math.round(cell * 0.8)))
  const count = scanCodeColumns * scanCodeRows, each = n * n
  const light = new Float32Array(count * each)
  for (let row = 0; row < scanCodeRows; row++) {
    for (let column = 0; column < scanCodeColumns; column++) {
      const base = (row * scanCodeColumns + column) * each
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) light[base + j * n + i] = at((column + 0.05 + (0.9 * (i + 0.5)) / n) / scanCodeColumns, (row + 0.05 + (0.9 * (j + 0.5)) / n) / scanCodeRows)
      }
    }
  }
  // Dark or light is judged against a column and its neighbours, since a cell's colour may turn across the code.
  const share = new Float32Array(count)
  for (let column = 0; column < scanCodeColumns; column++) {
    const near: number[] = []
    for (let other = Math.max(0, column - 1); other <= Math.min(scanCodeColumns - 1, column + 1); other++) {
      for (let row = 0; row < scanCodeRows; row++) {
        const base = (row * scanCodeColumns + other) * each
        for (let index = 0; index < each; index++) near.push(light[base + index])
      }
    }
    near.sort((a, b) => a - b)
    const low = near[Math.floor(near.length * 0.1)], high = near[Math.floor(near.length * 0.9)]
    if (high - low <= 16) return null
    const cut = (low + high) / 2
    for (let row = 0; row < scanCodeRows; row++) {
      const index = row * scanCodeColumns + column
      let dark = 0
      for (let k = 0; k < each; k++) if (light[index * each + k] < cut) dark++
      share[index] = dark / each
    }
  }
  const dark = Array.from(share, part => part > 0.5)
  const unsure: number[] = []
  share.forEach((part, index) => { if (Math.abs(part - 0.5) < WRITTEN_UNSURE) unsure.push(index) })
  if (unsure.length > 8) return null
  const ways = Array.from({ length: 1 << unsure.length }, (_, way) => way).sort((a, b) => ones(a) - ones(b))
  for (const way of ways) {
    const read = [...dark]
    unsure.forEach((index, bit) => { if (way & (1 << bit)) read[index] = !read[index] })
    const id = taken(read)
    if (id) return id
  }
  return null
}

/** How near half of a cell the words may take before it is read both ways. */
const WRITTEN_UNSURE = 0.2
const ones = (value: number): number => { let count = 0; for (; value; value &= value - 1) count++; return count }

/** A line through points that mostly lie on it: `b` the middle of every pair's slope, `a` the middle of what is left, so a stray point moves neither. */
function lineThrough(points: readonly (readonly [number, number])[]): { a: number; b: number } | null {
  if (points.length < 3) return null
  const middle = (values: number[]) => values.sort((p, q) => p - q)[Math.floor(values.length / 2)]
  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[j][0] !== points[i][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]))
    }
  }
  if (!slopes.length) return null
  const b = middle(slopes)
  return { a: middle(points.map(([t, value]) => value - b * t)), b }
}

/**
 * Finds a code under words anywhere in the frame and reads it. Its cell is a
 * field of colour on its paper, four to one: every other pixel is weighed,
 * the pixels that stand apart from the paper (by their colour, or by their
 * light against the frame's commonest and its lightest tones) are gathered
 * into the fields that touch, and a field of a code's shape has a line laid
 * along each of its four edges, so a page held askew is read along its own
 * corners and not the frame's (`sampleWrittenScanCode`).
 */
export function locateWrittenScanCode(width: number, height: number, luminance: Luminance, chroma: Chroma): ScanFound | null {
  const step = 2, columns = Math.floor(width / step), rows = Math.floor(height / step)
  if (columns < 40 || rows < 10) return null
  const size = columns * rows
  const levels = new Uint8Array(size)
  const histogram = new Uint32Array(256)
  for (let y = 0, index = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++, index++) histogram[levels[index] = clamp(Math.round(luminance(x * step, y * step)), 0, 255)]++
  }
  // The paper: the commonest tone in the frame, and where a wall or a desk is commoner, the tone a tenth of the frame is lighter than.
  let paper = 0
  for (let level = 1; level < 256; level++) if (histogram[level] > histogram[paper]) paper = level
  let light = 255
  for (let above = histogram[255]; light > 0 && above < size / 10; above += histogram[--light]);
  const masks: ((index: number) => boolean)[] = [index => chroma((index % columns) * step, Math.floor(index / columns) * step)]
  for (const ground of Math.abs(paper - light) > 8 ? [paper, light] : [paper]) {
    for (const apart of [14, 30]) masks.push(index => Math.abs(levels[index] - ground) > apart)
  }
  // 0 unseen, -1 not of the mask, else the field it belongs to.
  const fields = new Int32Array(size)
  const stack = new Int32Array(size)
  for (const mask of masks) {
    fields.fill(0)
    let field = 0
    for (let start = 0; start < size; start++) {
      if (fields[start]) continue
      if (!mask(start)) { fields[start] = -1; continue }
      field++
      let left = columns, right = 0, top = rows, bottom = 0, count = 0, depth = 0
      stack[depth++] = start
      fields[start] = field
      while (depth) {
        const index = stack[--depth]
        const x = index % columns, y = (index - x) / columns
        count++
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
        for (const next of [x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1, y > 0 ? index - columns : -1, y < rows - 1 ? index + columns : -1]) {
          if (next < 0 || fields[next]) continue
          if (mask(next)) { fields[next] = field; stack[depth++] = next } else fields[next] = -1
        }
      }
      // A code's shape, however the page leans: about four to one, and mostly filled, its words the only holes.
      const w = right - left + 1, h = bottom - top + 1
      if (w * step < 80 || h * step < 16 || w / h < 2.6 || w / h > 5 || count < w * h * 0.5) continue
      const of = (x: number, y: number) => fields[y * columns + x] === field
      // A line along each edge, from where the field begins a tenth in from its corners, which are rounded.
      const edge = (along: number, from: number, to: number, crosswise: boolean): number | null => {
        const direction = to > from ? 1 : -1
        for (let at = from; at !== to + direction; at += direction) {
          if (crosswise ? of(at, along) : of(along, at)) return (at - direction * 0.5) * step
        }
        return null
      }
      const points = (count: number, low: number, span: number, find: (along: number) => number | null) => {
        const found: [number, number][] = []
        for (let k = 0; k < count; k++) {
          const along = low + Math.round((0.12 + (0.76 * k) / (count - 1)) * (span - 1))
          const at = find(along)
          if (at !== null) found.push([along * step, at])
        }
        return lineThrough(found)
      }
      const topLine = points(12, left, w, x => edge(x, top, bottom, false))
      const bottomLine = points(12, left, w, x => edge(x, bottom, top, false))
      const leftLine = points(7, top, h, y => edge(y, left, right, true))
      const rightLine = points(7, top, h, y => edge(y, right, left, true))
      if (!topLine || !bottomLine || !leftLine || !rightLine) continue
      // Where an edge along (y = a + b·x) meets an edge down (x = a + b·y).
      const meet = (alongLine: { a: number; b: number }, downLine: { a: number; b: number }): [number, number] => {
        const x = (downLine.a + downLine.b * alongLine.a) / (1 - downLine.b * alongLine.b)
        return [x, alongLine.a + alongLine.b * x]
      }
      const corners = [meet(topLine, leftLine), meet(topLine, rightLine), meet(bottomLine, rightLine), meet(bottomLine, leftLine)]
      const middleX = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4
      const middleY = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4
      // The field's edge is soft in a photograph: read it as found, then a little in and a little out.
      for (const scale of [1, 0.97, 1.03]) {
        const place = corners.flatMap(([x, y]) => [middleX + (x - middleX) * scale, middleY + (y - middleY) * scale]) as unknown as ScanCorners
        const id = sampleWrittenScanCode(width, height, luminance, place)
        if (id) return { id, rect: { x: left * step, y: top * step, width: w * step, height: h * step } }
      }
    }
  }
  return null
}

/** Groups disconnected accent cells into horizontal 4:1 code regions, without a finder border. */
export function scanCodeRegions(width: number, height: number, foreground: Chroma): ScanRect[] {
  const step = 2, columns = Math.floor(width / step), rows = Math.floor(height / step)
  if (columns <= 0 || rows <= 0) return []
  const mask = new Uint8Array(columns * rows)
  const occupied = new Uint8Array(rows)
  for (let y = 0; y < rows; y++) {
    let count = 0
    for (let x = 0; x < columns; x++) {
      if (foreground(x * step, y * step)) { mask[y * columns + x] = 1; count++ }
    }
    occupied[y] = count >= 8 ? 1 : 0
  }
  const result: ScanRect[] = []
  const seen = new Set<number>()
  const take = (left: number, top: number, right: number, bottom: number) => {
    const w = (right - left + 1) * step, h = (bottom - top + 1) * step
    if (w < 48 || h < 8 || Math.abs(w / h - 4) >= 0.6) return
    const key = ((left * 4099 + top) * 4099 + right) * 4099 + bottom
    if (seen.has(key)) return
    seen.add(key)
    result.push({ x: left * step, y: top * step, width: w, height: h })
  }
  /**
   * A code standing beside something else on its rows, the year large on a
   * calendar's cover or a product's name before a sheet's code, is not the whole
   * of its band: the band is as tall as its tallest thing. So each run
   * across a band is looked at again by itself: drawn in to the rows and
   * columns its own ink stands on, parted where it has a gap wider than it
   * is now tall, and each part looked at the same way; and where a part is
   * still wider than a code, the code may be its left or its right end.
   */
  const cut = (left: number, top: number, right: number, bottom: number, depth: number) => {
    const inked = (x: number, from: number, to: number) => { for (let row = from; row <= to; row++) if (mask[row * columns + x]) return true; return false }
    const lined = (row: number) => { let count = 0; for (let x = left; x <= right; x++) if (mask[row * columns + x] && ++count >= 2) return true; return false }
    while (top < bottom && !lined(top)) top++
    while (bottom > top && !lined(bottom)) bottom--
    while (left < right && !inked(left, top, bottom)) left++
    while (right > left && !inked(right, top, bottom)) right--
    const h = bottom - top + 1
    if (h * step < 8 || (right - left + 1) * step < 48) return
    take(left, top, right, bottom)
    if (depth <= 0) return
    // Parted across, where a gap is wider than the part is tall.
    const parts: [number, number][] = []
    let from = left, last = left
    for (let x = left + 1; x <= right; x++) {
      if (!inked(x, top, bottom)) continue
      if (x - last > h) { parts.push([from, last]); from = x }
      last = x
    }
    parts.push([from, last])
    if (parts.length > 1) { for (const [start, end] of parts) cut(start, top, end, bottom, depth - 1); return }
    // Parted down, where more than three rows stand empty.
    const bands: [number, number][] = []
    let first = top, lastRow = top
    for (let row = top + 1; row <= bottom; row++) {
      if (!lined(row)) continue
      if (row - lastRow > 4) { bands.push([first, lastRow]); first = row }
      lastRow = row
    }
    bands.push([first, lastRow])
    if (bands.length > 1) { for (const [start, end] of bands) cut(left, start, right, end, depth - 1); return }
    // Wider than a code: the code may be either end of it.
    if ((right - left + 1) / h > 4.6) {
      cut(right - 4 * h + 1, top, right, bottom, 0)
      cut(left, top, left + 4 * h - 1, bottom, 0)
    }
  }
  let y = 0
  while (y < rows) {
    if (!occupied[y]) { y++; continue }
    const top = y
    let bottom = y
    while (y < rows && y - bottom <= 3) {
      if (occupied[y]) bottom = y
      y++
    }
    const h = (bottom - top + 1) * step
    if (h < 8) continue
    const xs: number[] = []
    for (let x = 0; x < columns; x++) {
      for (let row = top; row <= bottom; row++) {
        if (mask[row * columns + x]) { xs.push(x); break }
      }
    }
    let index = 0
    while (index < xs.length) {
      const left = xs[index]
      let right = left
      index++
      while (index < xs.length && (xs[index] - right) * step <= h) { right = xs[index]; index++ }
      const w = (right - left + 1) * step
      if (h <= Math.floor(height / 3) && w >= 48 && Math.abs(w / h - 4) < 0.6) take(left, top, right, bottom)
      cut(left, top, right, bottom, 3)
    }
  }
  return result
}

/** A code read from a frame, and the rectangle it was read from. */
export type ScanFound = { id: string; rect: ScanRect }

/** Locates and decodes an upright code anywhere in a camera frame; mirrors the native reader. */
export function readScanFrame(width: number, height: number, luminance: Luminance, chroma: Chroma): string | null {
  return locateScanFrame(width, height, luminance, chroma)?.id ?? null
}

/** As `readScanFrame`, saying where in the frame the code stands. */
export function locateScanFrame(width: number, height: number, luminance: Luminance, chroma: Chroma): ScanFound | null {
  // Every rectangle tried, kept for a second look past words.
  const tried: ScanRect[] = []
  const read = (bounds: ScanRect): ScanFound | null => {
    tried.push(bounds)
    for (const fraction of [0, 0.05]) {
      const rect = insetRect(bounds, bounds.width * fraction, bounds.height * fraction)
      // Detection samples every second pixel; refine its origin before reading tiny cells.
      for (const dy of [0, -1, 1]) {
        for (const dx of [0, -1, 1]) {
          const at = offsetRect(rect, dx, dy)
          const id = sampleScanCode(width, height, luminance, at)
          if (id) return { id, rect: at }
        }
      }
    }
    return null
  }
  // The page itself may be chromatic too; exclude its dark pixels from the accent mask.
  const colored = scanCodeRegions(width, height, (x, y) => luminance(x, y) > 70 && chroma(x, y))
  for (const bounds of colored) {
    const id = read(bounds)
    if (id) return id
  }
  // Neutral accents have no chroma. Locate their light/dark rectangle using luminance.
  let darkest = 255, lightest = 0
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const value = luminance(x, y)
      darkest = Math.min(darkest, value)
      lightest = Math.max(lightest, value)
    }
  }
  for (const threshold of [(darkest + lightest) / 2, 60, 130, 200]) {
    for (const light of [true, false]) {
      const candidates = scanCodeRegions(width, height, (x, y) => (light ? luminance(x, y) > threshold : luminance(x, y) < threshold))
      for (const bounds of candidates) {
        const id = read(bounds)
        if (id) return id
      }
    }
  }
  const w = width * 0.8
  const guide = read({ x: (width - w) / 2, y: (height - w / 4) / 2, width: w, height: w / 4 })
  if (guide) return guide
  // Nothing read plainly: a code under words, a calendar's header cell. As a
  // field of colour on its paper first (`locateWrittenScanCode`); then, where
  // its cells stand on a cell as white as the paper, in the rectangles its
  // ink was found in.
  const field = locateWrittenScanCode(width, height, luminance, chroma)
  if (field) return field
  for (const bounds of tried) {
    if (bounds.width < 80) continue
    for (const fraction of [0, 0.03]) {
      const rect = insetRect(bounds, bounds.width * fraction, bounds.height * fraction)
      const id = sampleWrittenScanCode(width, height, luminance, rect)
      if (id) return { id, rect }
    }
  }
  return null
}

/** Reads an upright RGBA frame, deriving luminance and chroma the way the native YCbCr reader does. */
export function readRgbaScanFrame(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): string | null {
  return locateRgbaScanFrame(rgba, width, height)?.id ?? null
}

/** The luminance of an RGBA frame, as the reader weighs it. */
export function rgbaLuminance(rgba: Uint8Array | Uint8ClampedArray, width: number): Luminance {
  return (x, y) => {
    const p = (y * width + x) * 4
    return 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]
  }
}

/** As `readRgbaScanFrame`, saying where in the frame the code stands. */
export function locateRgbaScanFrame(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): ScanFound | null {
  if (rgba.length < width * height * 4) return null
  const luminance = rgbaLuminance(rgba, width)
  const chroma: Chroma = (x, y) => {
    const p = (y * width + x) * 4
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]
    const cb = -0.1687 * r - 0.3313 * g + 0.5 * b
    const cr = 0.5 * r - 0.4187 * g - 0.0813 * b
    return Math.abs(cb) + Math.abs(cr) > 26
  }
  return locateScanFrame(width, height, luminance, chroma)
}

/** Accepts an ID only after three consecutive matching frames. */
export class StableScan {
  private last: string | null = null
  private count = 0
  accept(id: string | null): string | null {
    if (!id) { this.last = null; this.count = 0; return null }
    if (id === this.last) this.count++
    else { this.last = id; this.count = 1 }
    return this.count >= 3 ? id : null
  }
}
