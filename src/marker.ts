/**
 * Lines drawn as with a marker on paper, the way Anthropic draws its charts
 * (anthropic.com/institute/econ-scenarios, read from its DOM): a line is not
 * a stroke but a filled ribbon whose two edges wander on their own, laid down
 * as short overlapping strokes, each with a chisel tip cut at an angle and
 * thinning a little at its ends. A filter then takes grain out of the ink
 * (fine fractal noise subtracted from its alpha) and warps it a little
 * (coarse noise displacing it), and a ruled line gets the same treatment
 * lighter.
 *
 * What makes it read as material is the layers. A mark is never one ribbon:
 * its body is laid solid, then thinner passes of the same ink go over it a
 * little apart, darker where they cross the body (they multiply in the light),
 * the paper's own colour is let through in faint streaks, and along its edges
 * the ink pools in thin darker lines, as a felt tip's does where it stops
 * (`MarkerLayer`, `markerLine`, `markerSquare`).
 *
 * Everything is drawn from a seed, so a chart drawn again is the same chart.
 */

/** The filters, in user units of a twenty-to-the-square drawing: marker ink and the faint rule. */
export const MARKER_FILTERS = `
  <filter id="aa-marker" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="grain"/>
    <feColorMatrix in="grain" type="luminanceToAlpha" result="ga"/>
    <feComposite in="SourceGraphic" in2="ga" operator="arithmetic" k1="0" k2="1" k3="-0.3" k4="0" result="inked"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="11" result="warp"/>
    <feDisplacementMap in="inked" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="aa-marker-fine" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="grain"/>
    <feColorMatrix in="grain" type="luminanceToAlpha" result="ga"/>
    <feComposite in="SourceGraphic" in2="ga" operator="arithmetic" k1="0" k2="1" k3="-0.3" k4="0" result="inked"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="2" seed="11" result="warp"/>
    <feDisplacementMap in="inked" in2="warp" scale="1.3" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="aa-marker-rule" x="-8%" y="-50%" width="116%" height="200%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="5" result="grain"/>
    <feColorMatrix in="grain" type="luminanceToAlpha" result="ga"/>
    <feComposite in="SourceGraphic" in2="ga" operator="arithmetic" k1="0" k2="1" k3="-0.12" k4="0" result="inked"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="3" result="warp"/>
    <feDisplacementMap in="inked" in2="warp" scale="0.6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`

type Point = { x: number; y: number }

/** A small seeded generator, so the same line wanders the same way every time. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

/** Smooth noise along a line, about -1 to 1: a few slow waves at random phases. */
function wander(seed: number, scale: number): (s: number) => number {
  const next = random(seed)
  const waves = Array.from({ length: 3 }, (_, index) => ({
    frequency: (0.6 + next()) / scale / (index + 1),
    phase: next() * Math.PI * 2,
    weight: 1 / (index + 1),
  }))
  const total = waves.reduce((sum, wave) => sum + wave.weight, 0)
  return (s) => waves.reduce((sum, wave) => sum + Math.sin(s * wave.frequency * Math.PI * 2 + wave.phase) * wave.weight, 0) / total
}

/** The points of a curve through every point given, a Catmull-Rom spline sampled every `spacing` units. */
function smooth(points: Point[], spacing: number): Point[] {
  if (points.length < 2) return points
  const out: Point[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)], p1 = points[index], p2 = points[index + 1], p3 = points[Math.min(points.length - 1, index + 2)]
    const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / spacing))
    for (let step = 0; step < steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(points[points.length - 1])
  return out
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * A marker's line through the points, as the outlines of the strokes it is
 * laid down in: each a closed ribbon `width` across, its edges wandering
 * apart and together, its ends cut at the chisel's angle, the next stroke
 * starting a little before this one ends.
 */
export function markerStrokes(
  points: Point[],
  width: number,
  seed: number,
  { offset = 0, whole = false }: { offset?: number; whole?: boolean } = {},
): string[] {
  const path = smooth(points, 3)
  if (path.length < 2) return []
  const next = random(seed)
  const upper = wander(Math.floor(next() * 1e9), 60)
  const lower = wander(Math.floor(next() * 1e9), 60)
  const drift = wander(Math.floor(next() * 1e9), 140)
  // How far along the line each sample is, so the wander follows the ink's length rather than its samples.
  const along = [0]
  for (let index = 1; index < path.length; index++) along.push(along[index - 1] + Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y))
  const length = along[along.length - 1]
  const strokeLength = whole ? Infinity : 90 + next() * 50
  const overlap = 6
  const strokes: string[] = []
  for (let start = 0; start < length - overlap / 2; start += strokeLength - overlap) {
    const end = Math.min(length, start + strokeLength)
    const top: Point[] = [], bottom: Point[] = []
    // The chisel's tip is cut at an angle: its upper corner a little behind the lower at the start, ahead at the end.
    const cut = width * 0.35
    for (let index = 0; index < path.length; index++) {
      const s = along[index]
      if (s < start - cut || s > end + cut) continue
      const previous = path[Math.max(0, index - 1)], following = path[Math.min(path.length - 1, index + 1)]
      const dx = following.x - previous.x, dy = following.y - previous.y
      const norm = Math.hypot(dx, dy) || 1
      const nx = -dy / norm, ny = dx / norm
      const centre = drift(s) * width * 0.08 + offset
      // A felt tip lays a little less at the very start and end of a stroke.
      const taper = 0.86 + 0.14 * Math.min(1, (s - start + cut) / (width * 1.5), (end + cut - s) / (width * 1.5))
      const half = (width / 2) * taper
      const up = half * (1 + upper(s) * 0.14) + centre
      const down = half * (1 + lower(s) * 0.14) - centre
      if (s >= start && s <= end + cut) top.push({ x: path[index].x + nx * up, y: path[index].y + ny * up })
      if (s >= start - cut && s <= end) bottom.push({ x: path[index].x - nx * down, y: path[index].y - ny * down })
    }
    if (top.length < 2 || bottom.length < 2) continue
    const outline = [...top, ...bottom.reverse()]
    strokes.push(`M${outline.map(point => `${round(point.x)} ${round(point.y)}`).join('L')}Z`)
  }
  return strokes
}

/** A ruled line from one point to another as a hand would draw it: nearly straight, a sample every few units, wandering a fraction of a unit. */
export function markerRule(from: Point, to: Point, seed: number): string {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.round(length / 5))
  const sway = wander(seed, 80)
  const nx = -(to.y - from.y) / (length || 1), ny = (to.x - from.x) / (length || 1)
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps, off = sway(t * length) * 0.4
    return `${round(from.x + (to.x - from.x) * t + nx * off)} ${round(from.y + (to.y - from.y) * t + ny * off)}`
  })
  return `M${points.join('L')}`
}

/**
 * One pass of a mark: its outline, which ink it is laid in and how strongly.
 * `body` is the mark's own colour, `pass` the same ink laid over itself (a
 * shade darker, as ink over ink is), `edge` the ink pooled darker still, and
 * `paper` the paper's colour showing back through.
 */
export type MarkerTone = "body" | "pass" | "edge" | "paper"
export type MarkerLayer = { d: string; tone: MarkerTone; opacity: number }

const layers = (tone: MarkerTone, opacity: number, strokes: string[]): MarkerLayer[] =>
  strokes.map((d) => ({ d, tone, opacity }))

/**
 * A chart's line as a marker lays it, measured from Anthropic's own: one
 * continuous ribbon as the body, a touch under solid (0.86); a narrower pass
 * of the same ink along its middle, under half its width (0.3); and a thin
 * streak of it a third of the way to one edge (0.22), where a felt tip's
 * worn side drags.
 */
export function markerLine(points: Point[], width: number, seed: number, body = 0.86): MarkerLayer[] {
  return [
    ...layers("body", body, markerStrokes(points, width, seed, { whole: true })),
    ...layers("pass", 0.3, markerStrokes(points, width * 0.45, seed + 1, { offset: width * 0.04, whole: true })),
    ...layers("pass", 0.22, markerStrokes(points, width * 0.16, seed + 2, { offset: -width * 0.34, whole: true })),
  ]
}

/**
 * A card's edge ruled by hand, as Anthropic frames each chart: a ribbon a
 * little over a pixel and a half wide along each side, faint.
 */
export function markerFrame(x: number, y: number, w: number, h: number, seed: number): MarkerLayer[] {
  const side = (from: Point, to: Point, at: number) => markerStrokes([from, to], 1.6, seed + at, { whole: true })
  return layers("body", 0.3, [
    ...side({ x, y }, { x: x + w, y }, 1),
    ...side({ x, y: y + h }, { x: x + w, y: y + h }, 2),
    ...side({ x, y }, { x, y: y + h }, 3),
    ...side({ x: x + w, y }, { x: x + w, y: y + h }, 4),
  ])
}

/**
 * A square coloured in with a marker, as Anthropic colours its squares: five
 * strokes across it, each two fifths of its side and overlapping the next,
 * laid solid; then the paper let back through in two faint streaks, the ink
 * laid over itself in pairs of streaks, one wide and faint and one narrow and
 * stronger, across, slantwise and down, so the colour is uneven as a hand
 * leaves it; and the ink pooled along each of its four edges. It keeps a
 * little of the square clear all round, so squares side by side stand apart.
 */
export function markerSquare(x: number, y: number, size: number, seed: number): MarkerLayer[] {
  const next = random(seed)
  const inset = size * 0.08
  const left = x + inset, top = y + inset, side = size - inset * 2
  const across = (at: number, width: number, layerSeed: number, slant = 0) => {
    const lean = (next() - 0.5) * side * 0.05
    return markerStrokes(
      [
        { x: left - side * 0.02 + (next() - 0.5) * side * 0.04, y: top + side * at + lean - slant * side / 2 },
        { x: left + side * 1.02 + (next() - 0.5) * side * 0.04, y: top + side * at - lean + slant * side / 2 },
      ],
      side * width,
      layerSeed,
      { whole: true },
    )
  }
  const down = (at: number, width: number, layerSeed: number) =>
    markerStrokes(
      [
        { x: left + side * at + (next() - 0.5) * side * 0.04, y: top - side * 0.02 },
        { x: left + side * at - (next() - 0.5) * side * 0.04, y: top + side * 1.02 },
      ],
      side * width,
      layerSeed,
      { whole: true },
    )
  const seedOf = () => Math.floor(next() * 1e9)
  // The edges: a hairline along each side, a twentieth of the square across.
  const edge = (from: Point, to: Point) => markerStrokes([from, to], side * 0.05, seedOf(), { whole: true })
  return [
    ...layers("body", 1, [0.14, 0.31, 0.48, 0.66, 0.83].flatMap((at) => across(at, 0.38, seedOf()))),
    ...layers("paper", 0.05, across(0.5, 0.75, seedOf())),
    ...layers("paper", 0.09, across(0.3 + next() * 0.4, 0.34, seedOf())),
    ...layers("pass", 0.05, across(0.45 + next() * 0.1, 0.78, seedOf())),
    ...layers("pass", 0.1, across(0.25 + next() * 0.5, 0.36, seedOf())),
    ...layers("pass", 0.06, across(0.5, 0.9, seedOf(), 0.35)),
    ...layers("pass", 0.12, across(0.4 + next() * 0.2, 0.5, seedOf(), -0.3)),
    ...layers("pass", 0.06, down(0.3 + next() * 0.4, 0.42, seedOf())),
    ...layers("pass", 0.08, down(0.2 + next() * 0.6, 0.3, seedOf())),
    ...layers("edge", 0.16, edge({ x: left, y: top + side * 0.02 }, { x: left + side, y: top + side * 0.02 })),
    ...layers("edge", 0.16, edge({ x: left + side * 0.98, y: top }, { x: left + side * 0.98, y: top + side })),
    ...layers("edge", 0.16, edge({ x: left + side, y: top + side * 0.98 }, { x: left, y: top + side * 0.98 })),
    ...layers("edge", 0.16, edge({ x: left + side * 0.02, y: top + side }, { x: left + side * 0.02, y: top })),
  ]
}

/* The brush ----------------------------------------------------------------
 * What follows is the marker itself as Anthropic's illustrations lay it,
 * written for Ezo from what their page draws (its parameters measured off the
 * econ-scenarios page): a ribbon that starts thin, swells a little through
 * its belly, wobbles, wanders at either edge and is cut at a chisel's angle
 * at its end; a stroke of that ribbon with the ink laid over itself along its
 * core and dragged along one edge; and a line of such strokes broken into
 * dashes, each turned a hair off the line, as a hand lays a dashed line.
 */

/** A seeded generator that is good from its first number, whatever the seed. */
function seeded(seed: number): () => number {
  let state = Math.imul(seed | 0, 0x9e3779b1) ^ 0x6d2b79f5
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth noise from -1 to 1 along a stroke, through `knots` random knots eased into one another. */
function knotted(seed: number, knots: number): (t: number) => number {
  const next = seeded(seed)
  const values = Array.from({ length: knots + 2 }, () => next() * 2 - 1)
  return (t) => {
    const at = Math.max(0, Math.min(1, t)) * knots
    const index = Math.floor(at), f = at - index
    return values[index] + (values[index + 1] - values[index]) * (f * f * (3 - 2 * f))
  }
}

const ease = (t: number) => t * t * (3 - 2 * t)
const lengthOf = (points: Point[]) => points.reduce((sum, point, index) => index ? sum + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) : 0, 0)

/** The same line through `count` points spaced evenly along it. */
function resample(points: Point[], count: number): Point[] {
  if (points.length < 2) return points.slice()
  const along = [0]
  for (let index = 1; index < points.length; index++) along.push(along[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y))
  const total = along[along.length - 1]
  if (!total) return points.slice()
  const out: Point[] = []
  let segment = 0
  for (let index = 0; index < count; index++) {
    const s = (total * index) / (count - 1)
    while (segment < along.length - 2 && along[segment + 1] < s) segment++
    const f = (s - along[segment]) / (along[segment + 1] - along[segment] || 1)
    out.push({ x: points[segment].x + (points[segment + 1].x - points[segment].x) * f, y: points[segment].y + (points[segment + 1].y - points[segment].y) * f })
  }
  return out
}

/** The unit direction of a line at each of its points. */
function directions(points: Point[]): Point[] {
  return points.map((_, index) => {
    const a = points[Math.max(0, index - 1)], b = points[Math.min(points.length - 1, index + 1)]
    const dx = b.x - a.x, dy = b.y - a.y, norm = Math.hypot(dx, dy) || 1
    return { x: dx / norm, y: dy / norm }
  })
}

/** A line moved off itself, square to its direction, by `by(t)` along it. */
function beside(points: Point[], by: (t: number) => number): Point[] {
  const along = directions(points)
  return points.map((point, index) => {
    const off = by(index / (points.length - 1))
    return { x: point.x - along[index].y * off, y: point.y + along[index].x * off }
  })
}

export type RibbonShape = {
  width: number
  seed: number
  /** How much of the stroke, at each end, the tip takes to reach its width. */
  taperIn?: number
  taperOut?: number
  /** The width the stroke starts and ends at, against its full width. */
  startWidth?: number
  endWidth?: number
  /** How much fuller its middle is, as a felt tip pressed down mid-stroke. */
  belly?: number
  /** How much its width wanders along it. */
  wobble?: number
  /** How far each edge wanders on its own, in units. */
  edge?: number
  /** How far the tip is cut across, against the width. */
  chisel?: number
}

/** One ribbon of ink along a line, as a closed outline. */
export function ribbon(points: Point[], shape: RibbonShape): string {
  const count = points.length
  if (count < 2) return ""
  const { width, seed } = shape
  const taperIn = shape.taperIn ?? 0.14, taperOut = shape.taperOut ?? 0.08
  const startWidth = shape.startWidth ?? 0.14, endWidth = shape.endWidth ?? 0.8
  const belly = shape.belly ?? 0.07, wobble = shape.wobble ?? 0.14
  const edge = shape.edge ?? 0.055 * width + 0.35, chisel = shape.chisel ?? 0.35
  const swell = knotted(7 * seed + 1, Math.max(3, Math.round(count / 9)))
  const upper = knotted(13 * seed + 2, Math.max(4, Math.round(count / 5)))
  const lower = knotted(17 * seed + 3, Math.max(4, Math.round(count / 5)))
  const along = directions(points)
  const top: Point[] = [], bottom: Point[] = []
  points.forEach((point, index) => {
    const t = index / (count - 1)
    let k = 1
    if (taperIn > 0 && t < taperIn) k *= startWidth + (1 - startWidth) * ease(t / taperIn)
    if (taperOut > 0 && t > 1 - taperOut) k *= endWidth + (1 - endWidth) * ease((1 - t) / taperOut)
    k *= (1 + belly * Math.sin(Math.PI * t)) * (1 + wobble * swell(t))
    const half = Math.max(0.25, (width * k) / 2)
    const nx = -along[index].y, ny = along[index].x
    const up = half + edge * upper(t), down = half + edge * lower(t)
    top.push({ x: point.x + nx * up, y: point.y + ny * up })
    bottom.push({ x: point.x - nx * down, y: point.y - ny * down })
  })
  // The chisel: its upper corner carried on past the end, its lower held back at the start.
  const cut = chisel * width, last = count - 1
  top[last] = { x: top[last].x + along[last].x * cut, y: top[last].y + along[last].y * cut }
  bottom[0] = { x: bottom[0].x - along[0].x * cut * 0.6, y: bottom[0].y - along[0].y * cut * 0.6 }
  return `M${[...top, ...bottom.reverse()].map((point) => `${round(point.x)} ${round(point.y)}`).join("L")}Z`
}

/** How many points a stroke is drawn through: one every five units, sixteen to a hundred and sixty. */
const samplesFor = (points: Point[]) => Math.max(16, Math.min(160, Math.round(lengthOf(points) / 5)))

export type StrokeOptions = Omit<RibbonShape, "width" | "seed"> & { width: number; seed: number; opacity?: number; core?: boolean; streaks?: boolean }

/**
 * One marker stroke: its body; then, once it is wide enough to show it, the
 * ink laid over itself in a narrower ribbon wandering about its middle (a
 * shade deeper, three tenths) and dragged along one edge (deeper still, a
 * fifth); and on a broad stroke, the paper let back through in three faint
 * streaks.
 */
export function markerStroke(points: Point[], options: StrokeOptions): MarkerLayer[] {
  const { width, seed } = options
  const line = resample(points, samplesFor(points))
  const out: MarkerLayer[] = [{ tone: "body", opacity: options.opacity ?? 0.92, d: ribbon(line, options) }]
  if (width >= 3.5 && options.core !== false) {
    const drift = knotted(5 * seed + 9, 5)
    out.push({ tone: "pass", opacity: 0.3, d: ribbon(beside(line, (t) => drift(t) * width * 0.17), { width: width * 0.45, seed: seed + 31, taperIn: 0.2, taperOut: 0.16, startWidth: 0.2, endWidth: 0.5, edge: 0.03 * width + 0.3, chisel: 0.25 }) })
    out.push({ tone: "edge", opacity: 0.22, d: ribbon(beside(line, () => width * 0.3), { width: width * 0.16, seed: seed + 57, taperIn: 0.25, taperOut: 0.2, startWidth: 0.15, endWidth: 0.4, edge: 0.5, chisel: 0.15 }) })
  }
  if (width >= 14 && options.streaks !== false) {
    ;[-0.22, 0.05, 0.26].forEach((at, index) => {
      out.push({ tone: "paper", opacity: 0.1 + (index % 2) * 0.04, d: ribbon(beside(line, (t) => at * width * (1 + 0.15 * Math.sin(5 * t + index))), { width: width * (0.09 + 0.04 * index), seed: seed + 71 + 13 * index, taperIn: 0.3, taperOut: 0.25, startWidth: 0.2, endWidth: 0.3, edge: 0.6, chisel: 0.1 }) })
    })
  }
  return out
}

export type DashOptions = { width: number; seed: number; dashLength?: number; gap?: number; opacity?: number; samples?: number }

/**
 * A line laid in dashes, as a hand lays one: each dash its own short stroke,
 * a little longer or shorter than the last, the gaps likewise, each turned a
 * hair off the line about its middle, its width and strength its own, and
 * about one in three gone over again a shade deeper. Returns the dashes in
 * order, so they can be laid down one after another.
 */
export function markerDashes(points: Point[], options: DashOptions): MarkerLayer[][] {
  const { width, seed } = options
  const dash = options.dashLength ?? 3.4 * width, gap = options.gap ?? 1.6 * width, strength = options.opacity ?? 1
  const line = resample(points, Math.max(48, options.samples ?? samplesFor(points)))
  const total = lengthOf(line)
  const next = seeded(101 * seed + 5)
  const pieces: MarkerLayer[][] = []
  const piece = (from: number, to: number) => {
    const first = Math.max(0, Math.floor((from / total) * (line.length - 1)))
    const last = Math.min(line.length - 1, Math.ceil((to / total) * (line.length - 1)))
    if (last - first < 1) return
    const turn = (next() - 0.5) * 0.06, cos = Math.cos(turn), sin = Math.sin(turn)
    const part = resample(line.slice(first, last + 1), 8)
    const cx = part.reduce((sum, point) => sum + point.x, 0) / part.length, cy = part.reduce((sum, point) => sum + point.y, 0) / part.length
    const turned = part.map((point) => ({ x: cx + (point.x - cx) * cos - (point.y - cy) * sin, y: cy + (point.x - cx) * sin + (point.y - cy) * cos }))
    const w = width * (0.85 + 0.35 * next())
    const layers: MarkerLayer[] = [{
      tone: "body",
      opacity: Math.round((0.82 + 0.16 * next()) * strength * 100) / 100,
      d: ribbon(turned, { width: w, seed: seed + Math.round(from), taperIn: 0.18, taperOut: 0.18, startWidth: 0.55, endWidth: 0.5, belly: 0.05, wobble: 0.08, edge: 0.05 * w + 0.3, chisel: 0.35 }),
    }]
    if (next() < 0.35) layers.push({ tone: "pass", opacity: Math.round(0.3 * strength * 100) / 100, d: ribbon(turned, { width: w * 0.5, seed: seed + Math.round(from) + 7, taperIn: 0.3, taperOut: 0.3, startWidth: 0.3, endWidth: 0.3, edge: 0.4, chisel: 0.2 }) })
    pieces.push(layers)
  }
  for (let at = 0.3 * dash * next(); at < total - 2;) {
    const end = Math.min(total, at + dash * (0.8 + 0.45 * next()))
    piece(at, end)
    at = end + gap * (0.75 + 0.5 * next())
  }
  return pieces
}

/** Smoothly varying noise for a place, 0 to 1, the same every time for the same number. */
export function hashed(n: number): number {
  const t = 43758.5453 * Math.sin(127.1 * n + 311.7)
  return t - Math.floor(t)
}
