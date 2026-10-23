/** Encoding and SVG artwork; camera pixel sampling stays in scanCode.ts. */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const scanCodeColumns = 16
export const scanCodeRows = 4
/** The joined code's corners, a tenth of a cell: half an item cell's, 2 of its 20. */
export const CODE_END_RADIUS = 0.1

export function scanCodeChecksum(bytes: readonly number[]): number {
  let crc = 0xffff
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff
  }
  return crc
}

/** Format 3: 16 × 4 upright cells, matching the iOS scanner and playground. */
export function encodeScanCode(id: string): boolean[] | null {
  if (!/^[A-Za-z0-9]{6}$/.test(id)) return null
  let value = 0
  for (const character of id) value = value * 62 + alphabet.indexOf(character)
  const bytes = [3]
  for (let shift = 32; shift >= 0; shift -= 8) bytes.push(Math.floor(value / 2 ** shift) & 255)
  const crc = scanCodeChecksum(bytes)
  bytes.push(crc >> 8, crc & 255)
  return bytes.flatMap(byte => Array.from({ length: 8 }, (_, bit) => !!(byte & (1 << (7 - bit)))))
}

/**
 * A code's inked cells as one SVG path, each row's run of neighbours one
 * rectangle. Drawn as separate squares, every square's edge is softened on
 * its own and a hairline of the backing shows where two meet; one path is
 * softened only at its outline. `ink` says which cells are inked (a list's
 * code inks its clear bits), `cell` is a cell's size and `x`, `y` where the
 * code's corner stands.
 *
 * With a `radius` (a share of a cell) every corner is rounded, the ink's and
 * the backing's alike, as item cells are: a run's corner is rounded when
 * nothing inked stands against it above or below (a lone dot round all
 * round, whatever touches it across a corner), and stays square where the
 * shape carries on into the next row; and where the ink turns an inside
 * corner the backing's corner is rounded by filling it with ink. The reader
 * samples the middle of each cell, so corners rounded by less than half a
 * cell never change what it reads.
 */
export function scanCodePath(bits: readonly boolean[], { ink = (bit: boolean) => !bit, cell = 1, x = 0, y = 0, radius = 0 }: { ink?: (bit: boolean) => boolean; cell?: number; x?: number; y?: number; radius?: number } = {}): string {
  const round = (value: number) => Math.round(value * 1e4) / 1e4
  const inked = (row: number, column: number) =>
    row >= 0 && row < scanCodeRows && column >= 0 && column < scanCodeColumns && ink(bits[row * scanCodeColumns + column])
  const r = Math.min(Math.max(radius, 0), 0.5) * cell
  let d = ''
  for (let row = 0; row < scanCodeRows; row++) {
    for (let column = 0; column < scanCodeColumns;) {
      if (!inked(row, column)) { column++; continue }
      const start = column
      while (column < scanCodeColumns && inked(row, column)) column++
      const left = x + start * cell, right = x + column * cell, top = y + row * cell, bottom = top + cell
      if (!r) {
        d += `M${round(left)} ${round(top)}h${round(right - left)}v${round(cell)}h${round(left - right)}z`
        continue
      }
      // A corner is rounded wherever the ink stops both ways, straight across
      // and along: a lone dot is round at every corner, even where another
      // touches it across a corner.
      const end = (facing: number, inside: number) => !inked(facing, inside) ? r : 0
      const tl = end(row - 1, start)
      const tr = end(row - 1, column - 1)
      const br = end(row + 1, column - 1)
      const bl = end(row + 1, start)
      const arc = (radius: number, toX: number, toY: number) => radius ? `A${round(radius)} ${round(radius)} 0 0 1 ${round(toX)} ${round(toY)}` : ''
      d += `M${round(left + tl)} ${round(top)}H${round(right - tr)}${arc(tr, right, top + tr)}`
      d += `V${round(bottom - br)}${arc(br, right - br, bottom)}`
      d += `H${round(left + bl)}${arc(bl, left, bottom - bl)}`
      d += `V${round(top + tl)}${arc(tl, left + tl, top)}Z`
    }
  }
  if (!r) return d
  // The backing's corners round too: where the ink turns an inside corner,
  // three cells of it round a clear one, the clear cell's corner is filled
  // with ink to the same radius. Where the ink only touches across a corner,
  // the ink's own corners are rounded instead.
  for (let row = 0; row < scanCodeRows; row++) {
    for (let column = 0; column < scanCodeColumns; column++) {
      if (inked(row, column)) continue
      const left = x + column * cell, top = y + row * cell
      for (const [dy, dx] of [[-1, -1], [-1, 1], [1, 1], [1, -1]] as const) {
        if (!inked(row + dy, column) || !inked(row, column + dx) || !inked(row + dy, column + dx)) continue
        const cornerX = left + (dx > 0 ? cell : 0), cornerY = top + (dy > 0 ? cell : 0)
        const alongX = cornerX - dx * r, alongY = cornerY - dy * r
        // From the corner along the cell's edge, round the arc to its other edge, and back.
        const sweep = dx * dy > 0 ? 0 : 1
        d += `M${round(cornerX)} ${round(cornerY)}H${round(alongX)}A${round(r)} ${round(r)} 0 0 ${sweep} ${round(cornerX)} ${round(alongY)}Z`
      }
    }
  }
  return d
}

