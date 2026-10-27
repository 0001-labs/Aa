/**
 * A list's flow along its axis, as the lifted item's siblings make room in it.
 *
 * Measured once at lift: each item's start, size and margins, the list's gap,
 * and whether its margins collapse (block flow down the page). Where the model
 * draws the list in its own order where the page drew it, siblings move
 * straight to where the dropped order will draw them, so nothing moves again
 * on release. Where it does not (a wrapping row, a grid of columns, spacing
 * that depends on position), the engine keeps its uniform room.
 */

/** One item along the list's axis, in screen pixels. */
export type FlowItem = { start: number; size: number; marginStart: number; marginEnd: number };

export type Flow = {
  /** The list's gap along its axis. */
  gap: number;
  /** Adjoining margins collapse into one, as in block flow down the page. */
  collapse: boolean;
  /** The first item's margin passes through the list's start edge (block flow with no padding or border there). */
  through: boolean;
};

/** Two adjoining margins as block flow draws them: the largest positive and the most negative, added. */
export function collapsed(a: number, b: number): number {
  return Math.max(a, b, 0) + Math.min(a, b, 0);
}

/** Where each item starts when the list draws them in the order given, from where its content starts. */
export function flowStarts(items: readonly FlowItem[], flow: Flow, origin: number): number[] {
  const starts: number[] = [];
  let edge = origin;
  items.forEach((item, index) => {
    const previous = items[index - 1];
    const space = !previous
      ? flow.collapse && flow.through ? 0 : item.marginStart
      : flow.collapse ? collapsed(previous.marginEnd, item.marginStart) : previous.marginEnd + flow.gap + item.marginStart;
    starts.push(edge + space);
    edge += space + item.size;
  });
  return starts;
}

/** Whether the model draws the items, in their own order, where the page drew them, a pixel either way. */
export function flowHolds(items: readonly FlowItem[], flow: Flow, origin: number): boolean {
  const starts = flowStarts(items, flow, origin);
  return items.every((item, index) => Math.abs(starts[index] - item.start) <= 1);
}
