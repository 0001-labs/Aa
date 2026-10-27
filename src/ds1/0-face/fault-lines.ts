import type { Finding } from './constraints';

const tolerance = 1;
const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
const style = (el: Element) => el.ownerDocument.defaultView!.getComputedStyle(el);
const visible = (el: Element) => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && style(el).visibility !== 'hidden' && style(el).display !== 'none';
};

/** Walk each open shadow tree once; slotted children already occur in the light tree. */
function elements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('*')).flatMap(el => [el, ...(el.shadowRoot ? elements(el.shadowRoot) : [])]);
}

type Grid = { element: Element; family: string | null; axis: 'x' | 'y'; lines: number[]; gaps: number[]; crossGap?: number; internalDrift: boolean; start: number; end: number };

/** Related grids opt in by name; unlabelled card grids are candidates for human review. */
export function faultLineGrids(root: ParentNode): Grid[] {
  return elements(root).flatMap(element => {
    const family = element.getAttribute('data-ds-fault-lines');
    if (family === 'off' || !visible(element)) return [];
    const children = Array.from(element.children).filter(visible);
    if (!children.length) return [];
    if (family === null && (!/grid/.test(style(element).display) || children.length < 2 ||
      !children.every(child => child.matches('ds-card, .ds-card, ds-button, button')))) return [];
    const axis = element.getAttribute('data-ds-fault-axis') === 'y' ? 'y' : 'x';
    const boxes = children.map(child => child.getBoundingClientRect());
    const crossStart = (box: DOMRect) => axis === 'x' ? box.top : box.left;
    const crossEnd = (box: DOMRect) => axis === 'x' ? box.bottom : box.right;
    const start = (box: DOMRect) => axis === 'x' ? box.left : box.top;
    const end = (box: DOMRect) => axis === 'x' ? box.right : box.bottom;
    const bands: DOMRect[][] = [];
    for (const box of boxes.sort((a,b) => crossStart(a)-crossStart(b))) {
      const band = bands.find(row => near(crossStart(row[0]!), crossStart(box)));
      if (band) band.push(box); else bands.push([box]);
    }
    // The fullest band defines the tracks; an incomplete final row is valid.
    const band = [...bands].sort((a,b) => b.length-a.length)[0]!.sort((a,b) => start(a)-start(b));
    const lines = band.flatMap(box => [start(box), end(box)]);
    const gaps = band.slice(1).map((box,index) => start(box)-end(band[index]!));
    const crossGaps = bands.slice(1).map((row,index) => Math.min(...row.map(crossStart))-Math.max(...bands[index]!.map(crossEnd)));
    const internalDrift = bands.some(row => row.length === band.length && row.slice().sort((a,b)=>start(a)-start(b)).some((box,index)=>!near(start(box),lines[index*2]!) || !near(end(box),lines[index*2+1]!))) || crossGaps.some(gap=>!near(gap,crossGaps[0]!));
    return [{element, family, axis, lines, gaps, crossGap: crossGaps[0], internalDrift, start: lines[0]!, end: lines[lines.length - 1]!}];
  });
}

function referenceFor(grids: Grid[], i: number) {
  const current = grids[i]!;
  return grids.slice(0,i).find(other => {
      if (other.axis !== current.axis || other.lines.length !== current.lines.length) return false;
      if (current.family !== null || other.family !== null) return current.family !== null && current.family === other.family;
      return near(current.start,other.start) && near(current.end,other.end);
    });
}

/** Fault lines compare rendered tracks across separate sections, in the current viewport. */
export function inspectFaultLines(root: ParentNode): Finding[] {
  const grids = faultLineGrids(root);
  const findings: Finding[] = [];
  for (let i = 0; i < grids.length; i++) {
    const current = grids[i]!;
    if (current.internalDrift) findings.push({element:current.element, ...(current.family === null ? {review:true} : {}), message:`Fault lines at ${current.element.ownerDocument.documentElement.clientWidth}px: tracks or repeated gaps drift inside ${current.family || 'this card grid'}. Align its complete rows and repeated spacing.`});
    const reference = referenceFor(grids, i);
    if (!reference) continue;
    const drift = current.lines.map((line,index) => Math.abs(line-reference.lines[index]!));
    const gapDrift = current.gaps.some((gap,index) => !near(gap,reference.gaps[index]!));
    const rowDrift = current.crossGap !== undefined && reference.crossGap !== undefined && !near(current.crossGap,reference.crossGap);
    if (!drift.some(value => value > tolerance) && !gapDrift && !rowDrift) continue;
    const width = current.element.ownerDocument.documentElement.clientWidth;
    const review = current.family === null;
    findings.push({element: current.element, ...(review ? {review:true} : {}), message:
      `Fault lines at ${width}px: ${current.family || 'these card grids'} ${review ? 'may be related but have' : 'have'} misaligned ${current.axis === 'x' ? 'column' : 'row'} edges or unequal gaps (edge drift ${Math.round(Math.max(...drift))}px; gaps ${current.gaps.map(Math.round).join('/')}px versus ${reference.gaps.map(Math.round).join('/')}px${rowDrift ? `; cross-axis gap ${Math.round(current.crossGap!)}px versus ${Math.round(reference.crossGap!)}px` : ''}). ${review ? 'Name the related groups with data-ds-fault-lines to enforce alignment, or mark an intentional exception off.' : 'Use the same tracks and gap for this family at this viewport.'}`});
  }
  return findings;
}


/** The same rendered geometry as the checker, painted without affecting layout or hit testing. */
export function paintFaultLines(root: ParentNode, layer: SVGSVGElement): void {
  const doc = layer.ownerDocument;
  const width = doc.documentElement.clientWidth;
  const height = doc.defaultView!.innerHeight;
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  layer.setAttribute('width', String(width));
  layer.setAttribute('height', String(height));
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483644';
  layer.replaceChildren();
  const grids = faultLineGrids(root);
  const failed = new Set(inspectFaultLines(root).map(finding => finding.element));
  const drawn = new Set<string>();
  const referenceInk = '#087ba8';
  const faultInk = '#de0331';
  function mark(tag: string, attributes: Record<string, string | number>, title?: string) {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (title) {const tip = doc.createElementNS(node.namespaceURI, 'title');tip.textContent = title;node.appendChild(tip);}
    layer.appendChild(node);
    return node;
  }
  for (let index = 0; index < grids.length; index++) {
    const grid = grids[index]!;
    const reference = referenceFor(grids, index) ?? grid;
    for (const edge of reference.lines) {
      const key = `${grid.axis}:${edge}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      mark('line', { 'data-fault-reference': '', x1: grid.axis === 'x' ? edge : 0, y1: grid.axis === 'y' ? edge : 0,
        x2: grid.axis === 'x' ? edge : width, y2: grid.axis === 'y' ? edge : height,
        stroke: referenceInk, 'stroke-width': 1, 'stroke-dasharray': '4 4' }, 'Reference edge');
    }
    const broken = failed.has(grid.element);
    if (!broken) continue;
    // Draw each actual child so drift inside a later row is visible too.
    for (const child of Array.from(grid.element.children).filter(visible)) {
      const box = child.getBoundingClientRect();
      const edges = grid.axis === 'x' ? [box.left, box.right] : [box.top, box.bottom];
      for (const edge of edges) {
        if (reference.lines.some(expected => near(edge, expected))) continue;
        mark('line', { 'data-fault-actual': '', x1: grid.axis === 'x' ? edge : box.left, y1: grid.axis === 'y' ? edge : box.top,
          x2: grid.axis === 'x' ? edge : box.right, y2: grid.axis === 'y' ? edge : box.bottom,
          stroke: faultInk, 'stroke-width': 2 }, 'Actual edge differs from the dashed reference');
      }
    }
    // Row spacing can drift even when every column edge still aligns.
    const rows: DOMRect[][] = [];
    for (const child of Array.from(grid.element.children).filter(visible)) {
      const box = child.getBoundingClientRect();
      const start = grid.axis === 'x' ? box.top : box.left;
      const row = rows.find(row => near(grid.axis === 'x' ? row[0]!.top : row[0]!.left, start));
      if (row) row.push(box); else rows.push([box]);
    }
    rows.sort((a,b) => grid.axis === 'x' ? a[0]!.top-b[0]!.top : a[0]!.left-b[0]!.left);
    const bounds = grid.element.getBoundingClientRect();
    const crossGap = reference.crossGap ?? grid.crossGap;
    if (crossGap !== undefined) for (let row = 1; row < rows.length; row++) {
      const previousEnd = Math.max(...rows[row-1]!.map(box => grid.axis === 'x' ? box.bottom : box.right));
      const actual = Math.min(...rows[row]!.map(box => grid.axis === 'x' ? box.top : box.left));
      const expected = previousEnd+crossGap;
      if (near(actual,expected)) continue;
      for (const [edge,kind] of [[expected,'reference'],[actual,'actual']] as const) {
        mark('line', {[`data-fault-${kind}`]: '', x1:grid.axis === 'x' ? bounds.left : edge, y1:grid.axis === 'x' ? edge : bounds.top,
          x2:grid.axis === 'x' ? bounds.right : edge, y2:grid.axis === 'x' ? edge : bounds.bottom,
          stroke:kind === 'reference' ? referenceInk : faultInk, 'stroke-width':kind === 'reference' ? 1 : 2,
          'stroke-dasharray':kind === 'reference' ? '4 4' : ''}, `Row gap ${Math.round(actual-previousEnd)}px; reference ${Math.round(crossGap)}px`);
      }
    }
    const box = grid.element.getBoundingClientRect();
    const label = mark('text', { 'data-fault-gap': '', x: Math.max(4,box.left), y: Math.max(16,Math.min(height-4,box.top+16)),
      fill: faultInk, stroke: 'var(--ds-background-color, white)', 'stroke-width': 3, 'paint-order': 'stroke',
      'font-family': 'var(--ds-typeface-regular, sans-serif)', 'font-size': 12 });
    const gaps = grid.gaps.map(gap => Math.round(gap)).join('/');
    const expected = reference.gaps.map(gap => Math.round(gap)).join('/');
    label.textContent = `Gap ${gaps || '—'}px · reference ${expected || '—'}px` +
      (grid.crossGap !== undefined && reference.crossGap !== undefined && !near(grid.crossGap,reference.crossGap)
        ? ` · row gap ${Math.round(grid.crossGap)}px / ${Math.round(reference.crossGap)}px` : '');
  }
}
