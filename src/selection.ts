/** Paint the native selection without adding nodes to the editable document. */
export type SelectionRect = { left: number; top: number; right: number; bottom: number }
type Point = { x: number; y: number }

/** Merge inline fragments, join wrapped lines, and round the outside and inside turns. */
export function selectionPath(rects: readonly SelectionRect[], lineHeight: number, radius: number): string | null {
  const rows: (SelectionRect & { fragments: SelectionRect[] })[] = []
  for (const rect of [...rects].filter(r => r.right > r.left && r.bottom > r.top).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find(r => Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top) > Math.min(r.bottom - r.top, rect.bottom - rect.top) / 2)
    if (!row) { rows.push({ ...rect, fragments: [rect] }); continue }
    row.fragments.push(rect)
    row.left = Math.min(row.left, rect.left); row.right = Math.max(row.right, rect.right)
    row.top = Math.min(row.top, rect.top); row.bottom = Math.max(row.bottom, rect.bottom)
  }
  for (const row of rows) {
    // Test after collecting all fragments: a smaller inline font may bridge
    // two fragments that were encountered earlier at a different top edge.
    let right = row.left
    for (const fragment of row.fragments.sort((a, b) => a.left - b.left)) {
      if (fragment.left > right + 1) return null
      right = Math.max(right, fragment.right)
    }
    const leading = Math.max(0, lineHeight - (row.bottom - row.top)) / 2
    row.top -= leading; row.bottom += leading
  }
  const groups: SelectionRect[][] = []
  for (const row of rows) {
    const group = groups.at(-1), previous = group?.at(-1)
    if (previous && row.top <= previous.bottom + 1 && row.left < previous.right && row.right > previous.left) {
      previous.bottom = row.top = (previous.bottom + row.top) / 2
      group!.push(row)
    } else groups.push([row])
  }
  return groups.map(group => {
    const first = group[0], last = group.at(-1)!
    const points: Point[] = [{ x: first.left, y: first.top }, { x: first.right, y: first.top }]
    for (const row of group) points.push({ x: row.right, y: row.top }, { x: row.right, y: row.bottom })
    points.push({ x: last.left, y: last.bottom })
    for (const row of [...group].reverse()) points.push({ x: row.left, y: row.bottom }, { x: row.left, y: row.top })
    return roundedPolygon(points, radius)
  }).join(' ')
}

function roundedPolygon(input: Point[], radius: number): string {
  let points = input.filter((p, i) => !i || p.x !== input[i - 1].x || p.y !== input[i - 1].y)
  if (points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y) points.pop()
  points = points.filter((p, i, all) => {
    const a = all[(i + all.length - 1) % all.length], b = all[(i + 1) % all.length]
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y))
  })
  const n = (v: number) => Number(v.toFixed(3))
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length]
    const before = Math.hypot(a.x - p.x, a.y - p.y), after = Math.hypot(b.x - p.x, b.y - p.y)
    const r = Math.max(0, Math.min(radius, before / 2, after / 2))
    const x1 = p.x + (a.x - p.x) * r / before, y1 = p.y + (a.y - p.y) * r / before
    const x2 = p.x + (b.x - p.x) * r / after, y2 = p.y + (b.y - p.y) * r / after
    return `${i ? 'L' : 'M'}${n(x1)} ${n(y1)} Q${n(p.x)} ${n(p.y)} ${n(x2)} ${n(y2)}`
  }).join(' ') + ' Z'
}

export function paintSelection(host: HTMLElement): () => void {
  // The host's own document and window: an editor in a frame (Team CMS's page editor) selects there, not in the page that made it.
  const doc = host.ownerDocument, view = doc.defaultView ?? window
  let frame = 0, stopped = false, composing = false
  const painted = new Set<HTMLElement>()
  const forcedColors = view.matchMedia('(forced-colors: active)')
  const clear = () => {
    for (const block of painted) {
      block.removeAttribute('data-aa-selection')
      block.style.removeProperty('--aa-selection-mask')
      block.style.removeProperty('--aa-selection-box')
      block.style.removeProperty('--aa-selection-width')
      block.style.removeProperty('--aa-selection-height')
    }
    painted.clear()
  }
  const draw = () => {
    frame = 0
    clear()
    const selection = view.getSelection()
    if (stopped || composing || forcedColors.matches || !selection?.rangeCount || selection.isCollapsed || !host.contains(selection.anchorNode) || !host.contains(selection.focusNode)) return
    const selected = selection.getRangeAt(0)
    for (const block of Array.from(host.children) as HTMLElement[]) {
      if (!block.classList.contains('aa-block') || block.dataset.kind === 'table' || !selected.intersectsNode(block)) continue
      const range = doc.createRange()
      range.selectNodeContents(block)
      if (selected.compareBoundaryPoints(Range.START_TO_START, range) > 0) range.setStart(selected.startContainer, selected.startOffset)
      if (selected.compareBoundaryPoints(Range.END_TO_END, range) < 0) range.setEnd(selected.endContainer, selected.endOffset)
      if (range.collapsed || typeof range.getClientRects !== 'function') continue
      const box = block.getBoundingClientRect(), style = view.getComputedStyle(block)
      // Keep vertical writing and transformed/zoomed surfaces native.
      if (style.writingMode && style.writingMode !== 'horizontal-tb' || Math.abs(box.width - block.offsetWidth) > 1) continue
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
      const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0).map(r => ({ left: r.left - box.left + block.scrollLeft - block.clientLeft, right: r.right - box.left + block.scrollLeft - block.clientLeft, top: r.top - box.top + block.scrollTop - block.clientTop, bottom: r.bottom - box.top + block.scrollTop - block.clientTop }))
      if (!rects.length) continue
      const x = Math.min(...rects.map(r => r.left)), y = Math.min(...rects.map(r => r.top)) - line / 2
      const width = Math.max(...rects.map(r => r.right)) - x, height = Math.max(...rects.map(r => r.bottom)) - y + line / 2
      const scale = parseFloat(style.getPropertyValue('--sf')) || 1
      const path = selectionPath(rects.map(r => ({ left: r.left - x, right: r.right - x, top: r.top - y, bottom: r.bottom - y })), line, 2 * scale)
      if (!path) continue
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${path}"/></svg>`
      block.style.setProperty('--aa-selection-mask', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
      block.style.setProperty('--aa-selection-box', `${y}px auto auto ${x}px`)
      block.style.setProperty('--aa-selection-width', `${width}px`)
      block.style.setProperty('--aa-selection-height', `${height}px`)
      block.setAttribute('data-aa-selection', '')
      painted.add(block)
    }
  }
  const schedule = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(draw) }
  const startComposition = () => { composing = true; clear() }
  const endComposition = () => { composing = false; schedule() }
  const resize = new (view.ResizeObserver ?? ResizeObserver)(schedule)
  resize.observe(host)
  const changes = new (view.MutationObserver ?? MutationObserver)(schedule)
  changes.observe(host, { childList: true, subtree: true, characterData: true })
  doc.addEventListener('selectionchange', schedule)
  doc.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule)
  host.addEventListener('compositionstart', startComposition)
  host.addEventListener('compositionend', endComposition)
  host.addEventListener('load', schedule, true)
  doc.fonts?.addEventListener('loadingdone', schedule)
  forcedColors.addEventListener?.('change', schedule)
  return () => {
    stopped = true
    view.cancelAnimationFrame(frame)
    clear()
    resize.disconnect(); changes.disconnect()
    doc.removeEventListener('selectionchange', schedule)
    doc.removeEventListener('scroll', schedule, true)
    view.removeEventListener('resize', schedule)
    host.removeEventListener('compositionstart', startComposition)
    host.removeEventListener('compositionend', endComposition)
    host.removeEventListener('load', schedule, true)
    doc.fonts?.removeEventListener('loadingdone', schedule)
    forcedColors.removeEventListener?.('change', schedule)
  }
}
