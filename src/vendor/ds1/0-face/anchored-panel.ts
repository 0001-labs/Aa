/** Mobile anchored choices stay centred on their field, four CSS pixels away.
 * Keep panel dimensions on the design's grid; never round away the trigger gap.
 * At an edge shift sideways, flip above when it has more room, then bound the
 * height to the visible viewport (including the keyboard and safe areas).
 */
export type PanelViewport = { left: number; top: number; width: number; height: number };
export function anchoredPanel(rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width">, size: { width: number; height: number }, viewport: PanelViewport, margin = 4) {
  const gap = 4;
  const right = viewport.left + viewport.width - margin;
  const bottom = viewport.top + viewport.height - margin;
  const left = viewport.left + margin, top = viewport.top + margin;
  const below = Math.max(0, bottom - rect.bottom - gap);
  const above = Math.max(0, rect.top - gap - top);
  const up = below < size.height && above > below;
  const availableHeight = up ? above : below;
  const height = Math.min(size.height, availableHeight);
  return {
    left: Math.max(left, Math.min(rect.left + (rect.width - size.width) / 2, right - size.width)),
    top: Math.max(top, up ? rect.top - gap - height : Math.min(rect.bottom + gap, bottom - height)),
    availableHeight,
    availableWidth: Math.max(0, right - left),
  };
}

const probes = new WeakMap<Document, HTMLElement>();
export function panelViewport(element: HTMLElement): PanelViewport {
  const doc = element.ownerDocument, view = doc.defaultView!;
  let probe = probes.get(doc);
  if (!probe?.isConnected) {
    probe = doc.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;inset:0;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    doc.body.append(probe); probes.set(doc, probe);
  }
  const safe = view.getComputedStyle(probe);
  const l = parseFloat(safe.paddingLeft) || 0, r = parseFloat(safe.paddingRight) || 0;
  const t = parseFloat(safe.paddingTop) || 0, b = parseFloat(safe.paddingBottom) || 0;
  const viewport = view.visualViewport;
  return { left: (viewport?.offsetLeft ?? 0) + l, top: (viewport?.offsetTop ?? 0) + t,
    width: Math.max(0, (viewport?.width ?? view.innerWidth) - l - r),
    height: Math.max(0, (viewport?.height ?? view.innerHeight) - t - b) };
}
export function mobilePanel(element: HTMLElement) {
  return element.ownerDocument.defaultView?.matchMedia("(max-width: 768px)").matches ?? false;
}
