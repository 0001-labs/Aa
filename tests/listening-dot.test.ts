import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTLE, breatheDot, dotOpacity } from '../src/prompt'

/** Frames run by hand: each call gives the next one its moment. */
function frames() {
  let queued: FrameRequestCallback | null = null
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { queued = null })
  return (now: number) => { const run = queued; queued = null; run?.(now) }
}

afterEach(() => vi.unstubAllGlobals())

describe('the listening dot', () => {
  it('is steady while it moves, whatever the pulse and the voice', () => {
    expect(new Set([0, 0.5, 1].flatMap(pulse => [0, 1].map(level => dotOpacity(true, pulse, level)))).size).toBe(1)
    // Standing still, the pulse and the voice both show.
    expect(dotOpacity(false, 1, 0)).toBeGreaterThan(dotOpacity(false, 0, 0))
    expect(dotOpacity(false, 0, 1)).toBeGreaterThan(dotOpacity(false, 0, 0))
  })

  it('holds one strength while the words carry it along, and breathes again once it stands still', () => {
    const next = frames()
    const dot = document.createElement('span')
    let x = 0
    dot.getBoundingClientRect = () => ({ left: x, top: 0, right: x + 6, bottom: 6, width: 6, height: 6, x, y: 0, toJSON() {} }) as DOMRect
    const view = { matchMedia: () => ({ matches: false }) } as unknown as Window
    const breath = breatheDot(dot, view)
    // Carried along: a little further each frame, for long enough to settle on its steady strength.
    let now = 0
    for (; now < 3000; now += 16) { x += 1; next(now) }
    const moving: number[] = []
    for (let end = now + 1200; now < end; now += 16) { x += 1; next(now); moving.push(Number(dot.style.opacity)) }
    expect(Math.max(...moving) - Math.min(...moving)).toBeLessThan(0.01)
    // Standing still past SETTLE, it pulses.
    const still: number[] = []
    for (let end = now + SETTLE + 3000; now < end; now += 16) { next(now); still.push(Number(dot.style.opacity)) }
    expect(Math.max(...still) - Math.min(...still)).toBeGreaterThan(0.1)
    breath.stop()
  })
})
