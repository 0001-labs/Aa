/** Shared side placement geometry, independent of a document or rendering framework. */
export type PlacementRect = { left:number; right:number; top:number; bottom:number; width:number; height:number };
export function sidePlacement(rects: readonly PlacementRect[], from:number, point:{x:number;y:number}, unit=20): { index:number; at:'start'|'end'; rect:PlacementRect } | null {
  const index = rects.findIndex((rect,index) => index !== from && point.y >= rect.top && point.y <= rect.bottom && point.x >= rect.left-unit && point.x <= rect.right+unit);
  const rect = rects[index];
  if (!rect) return null;
  const zone = Math.min(rect.width / 5, 4 * unit);
  const at = point.x < rect.left + zone ? 'start' : point.x > rect.right - zone ? 'end' : null;
  return at ? { index, at, rect } : null;
}

/** The place in the text a point on the screen falls on, in whichever way the browser says it. */
export function caretAt(document: Document, x: number, y: number): { node: Node; offset: number } | null {
  const position = (document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(x, y)
  if (position) return { node: position.offsetNode, offset: position.offset }
  const range = document.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}
