/**
 * Swipe a sheet or a drawer away: a finger that drags a dialog towards the
 * edge it came from moves it, and letting go far or fast enough dismisses it.
 * `ds-overlay` binds it for `type="sheet"` and `type="drawer"`; a page
 * without Lit binds its own `dialog.ds-overlay--sheet` (or `--drawer`, with
 * `--start` for the start side) with `bindOverlaySwipe(dialog)`. Plain
 * TypeScript with no framework.
 *
 * It follows the finger as touch does on Apple's platforms:
 *
 * - Touch alone; a mouse or a trackpad closes with Escape or the close button.
 * - Ten pixels of movement before it decides, then it tracks the finger one
 *   to one from where it was grabbed, a moving dialog included (it starts
 *   from the dialog's place on screen, not from where it was going).
 * - A drag along the content's own scroll is the content's: a sheet scrolled
 *   down scrolls back up first, a horizontal strip in a drawer scrolls, and a
 *   slider, a range input or anything marked `data-ds-overlay-no-swipe` keeps
 *   its touches.
 * - Dragged the other way, it gives a little and pulls back (rubber-banding).
 * - On release it projects where the throw would come to rest (the
 *   deceleration of a scroll, rate 0.998) and dismisses when that is past half
 *   its size and the finger is not moving back; otherwise it settles home.
 * - The backdrop fades as the dialog goes (`--ds-overlay-progress`).
 *
 * Dismissing asks first, as a close button does: the element sends
 * `ds-close-request` with the reason `"swipe"`, the native frame a cancelable
 * `ds-close-request` on the dialog, and closes it when no listener prevents
 * that. Declined (a form with unsaved changes asking first), it settles home.
 * The motion itself is overlay.css's, in transform alone.
 */

/** The edge an overlay comes from and a finger swipes it back to: a sheet's foot, a drawer's side, or none. */
export type OverlayEdge = "none" | "bottom" | "end" | "start";

export interface OverlaySwipeOptions {
  /** Its edge, read at each touch; from `data-ds-edge` or its class by default. */
  edge?: OverlayEdge | (() => OverlayEdge);
  /**
   * Called when a swipe would dismiss it. By default a cancelable
   * `ds-close-request` (`detail.reason` `"swipe"`) on the dialog, then
   * `dialog.close()` unless a listener prevented it. Still open two frames
   * later, the dialog settles home.
   */
  onDismiss?: (dialog: HTMLDialogElement) => void;
}

/** Ten pixels before a touch is a drag, as the platforms wait. */
const SLOP = 10;
/** A scroll's deceleration: where a throw at this speed comes to rest. */
const DECELERATION = 0.998;
const project = (velocity: number) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
/** Past its edge the dialog follows less the further it goes. */
const rubberband = (overshoot: number, dimension: number, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

const EDGES = new Set<OverlayEdge>(["none", "bottom", "end", "start"]);

/** An overlay's edge, from `data-ds-edge` (the element marks it) or its native classes. */
export function overlayEdge(dialog: HTMLDialogElement): OverlayEdge {
  const marked = dialog.getAttribute("data-ds-edge") as OverlayEdge | null;
  if (marked && EDGES.has(marked)) return marked;
  if (dialog.classList.contains("ds-overlay--sheet")) return "bottom";
  if (dialog.classList.contains("ds-overlay--drawer")) return dialog.classList.contains("ds-overlay--start") ? "start" : "end";
  return "none";
}

type Gesture = {
  id: number;
  x: number;
  y: number;
  /** Where the dialog stood when the finger came down, towards its edge. */
  base: number;
  /** How far the finger had moved when the drag began. */
  start: number;
  mode: "pending" | "drag" | "ignore";
  offset: number;
  samples: { time: number; offset: number }[];
  target: EventTarget | null;
  path: EventTarget[];
};

/** The axis the dialog leaves along, and the sign of the way out on it. */
function direction(dialog: HTMLDialogElement, edge: OverlayEdge): { axis: "x" | "y"; sign: 1 | -1 } {
  if (edge === "bottom" || edge === "none") return { axis: "y", sign: 1 };
  const rtl = dialog.ownerDocument.defaultView?.getComputedStyle(dialog).direction === "rtl";
  const right = (edge === "end") !== rtl;
  return { axis: "x", sign: right ? 1 : -1 };
}

/**
 * True when the content under the finger would scroll for this drag, so it
 * keeps the touch: a finger moving down on content scrolled down scrolls it
 * back up first, and one moving up scrolls it on while there is more.
 */
function contentScrolls(path: EventTarget[], dialog: HTMLDialogElement, axis: "x" | "y", along: number): boolean {
  const view = dialog.ownerDocument.defaultView;
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    const style = view?.getComputedStyle(node);
    if (axis === "y") {
      const scrolls = /auto|scroll/.test(style?.overflowY ?? "") && node.scrollHeight > node.clientHeight;
      if (scrolls && (along > 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1)) return true;
    } else {
      const scrolls = /auto|scroll/.test(style?.overflowX ?? "") && node.scrollWidth > node.clientWidth;
      if (scrolls) return true;
    }
    if (node === dialog) break;
  }
  return false;
}

/** The dialog's place on screen along its axis, towards its edge, from its live transform. */
function presented(dialog: HTMLDialogElement, axis: "x" | "y", sign: 1 | -1): number {
  const view = dialog.ownerDocument.defaultView;
  const transform = view?.getComputedStyle(dialog).transform;
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return 0;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return sign * (axis === "y" ? matrix.m42 : matrix.m41);
  } catch {
    return 0;
  }
}

/**
 * Let a finger swipe a sheet or drawer away. Returns the function that
 * unbinds it and clears what it set on the dialog.
 */
export function bindOverlaySwipe(dialog: HTMLDialogElement, options: OverlaySwipeOptions = {}): () => void {
  const edgeNow = (): OverlayEdge => {
    const given = typeof options.edge === "function" ? options.edge() : options.edge;
    return given ?? overlayEdge(dialog);
  };
  let gesture: Gesture | null = null;
  let settleTimer = 0;
  const view = dialog.ownerDocument.defaultView;
  const frame = (callback: () => void) => (view?.requestAnimationFrame ? view.requestAnimationFrame(callback) : view?.setTimeout(callback, 16) ?? 0);

  const write = (offset: number, size: number, sign: 1 | -1) => {
    dialog.style.setProperty("--ds-overlay-drag", `${sign * offset}px`);
    dialog.style.setProperty("--ds-overlay-progress", String(size > 0 ? Math.min(1, Math.max(0, offset / size)) : 0));
  };
  const clear = () => {
    dialog.style.removeProperty("--ds-overlay-drag");
    dialog.style.removeProperty("--ds-overlay-progress");
    dialog.removeAttribute("data-ds-overlay-dragging");
  };
  /** Home: the stylesheet's transition takes it back from where it is. */
  const settle = () => {
    dialog.removeAttribute("data-ds-overlay-dragging");
    dialog.style.setProperty("--ds-overlay-drag", "0px");
    dialog.style.setProperty("--ds-overlay-progress", "0");
  };

  const dismiss = () => {
    dialog.removeAttribute("data-ds-overlay-dragging");
    if (options.onDismiss) options.onDismiss(dialog);
    else {
      const request = new CustomEvent("ds-close-request", { detail: { reason: "swipe" }, bubbles: true, composed: true, cancelable: true });
      if (dialog.dispatchEvent(request)) dialog.close();
    }
    // A product may close it a moment later (a framework's state); declined, it goes home.
    const token = ++settleTimer;
    frame(() => frame(() => { if (token === settleTimer && dialog.open) settle(); }));
  };

  const onStart = (event: TouchEvent) => {
    const edge = edgeNow();
    if (!dialog.open || edge === "none") return;
    if (event.touches.length !== 1) {
      if (gesture?.mode === "drag") settle();
      gesture = null;
      return;
    }
    const path = event.composedPath();
    if (path.some(node => node instanceof Element && node.matches('[data-ds-overlay-no-swipe], input[type="range"], [role="slider"]'))) return;
    const touch = event.touches[0]!;
    const { axis, sign } = direction(dialog, edge);
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, base: Math.max(0, presented(dialog, axis, sign)), start: 0, mode: "pending", offset: 0, samples: [], target: event.target, path };
  };

  const onMove = (event: TouchEvent) => {
    if (!gesture || gesture.mode === "ignore") return;
    const touch = [...event.touches].find(each => each.identifier === gesture!.id);
    if (!touch) return;
    const edge = edgeNow();
    if (edge === "none") { gesture = null; return; }
    const { axis, sign } = direction(dialog, edge);
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    const along = axis === "y" ? dy * sign : dx * sign;
    const across = axis === "y" ? dx : dy;
    if (gesture.mode === "pending") {
      if (Math.hypot(dx, dy) < SLOP) return;
      if (Math.abs(along) <= Math.abs(across) || contentScrolls(gesture.path, dialog, axis, along)) {
        gesture.mode = "ignore";
        return;
      }
      gesture.mode = "drag";
      gesture.start = along;
      settleTimer++;
      dialog.setAttribute("data-ds-overlay-dragging", "");
    }
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    const size = axis === "y" ? rect.height : rect.width;
    const raw = gesture.base + along - gesture.start;
    gesture.offset = raw < 0 ? rubberband(raw, size || 1) : raw;
    write(gesture.offset, size, sign);
    const time = event.timeStamp || (view?.performance?.now() ?? Date.now());
    gesture.samples.push({ time, offset: gesture.offset });
    while (gesture.samples.length > 2 && time - gesture.samples[0]!.time > 150) gesture.samples.shift();
  };

  const onEnd = (event: TouchEvent) => {
    if (!gesture) return;
    if ([...event.touches].some(each => each.identifier === gesture!.id)) return;
    const ended = gesture;
    gesture = null;
    if (ended.mode !== "drag") return;
    const edge = edgeNow();
    const { axis } = direction(dialog, edge);
    const rect = dialog.getBoundingClientRect();
    const size = axis === "y" ? rect.height : rect.width;
    // The speed of the last tenth of a second: a finger held still before letting go throws nothing.
    const now = event.timeStamp || (view?.performance?.now() ?? Date.now());
    const recent = ended.samples.filter(sample => now - sample.time <= 100);
    const first = recent[0], last = recent[recent.length - 1];
    const elapsed = first && last ? last.time - first.time : 0;
    const velocity = first && last && elapsed > 0 ? ((last.offset - first.offset) / elapsed) * 1000 : 0;
    const resting = ended.offset + project(velocity);
    if (event.type !== "touchcancel" && edge !== "none" && ended.offset > 0 && resting > size / 2 && velocity > -100) dismiss();
    else settle();
  };

  // Open again: it starts from its edge, with nothing left of the last drag.
  const observer = new MutationObserver(() => { if (dialog.open) { settleTimer++; gesture = null; clear(); } });
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  dialog.addEventListener("touchstart", onStart, { passive: true });
  dialog.addEventListener("touchmove", onMove, { passive: false });
  dialog.addEventListener("touchend", onEnd, { passive: true });
  dialog.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    observer.disconnect();
    dialog.removeEventListener("touchstart", onStart);
    dialog.removeEventListener("touchmove", onMove);
    dialog.removeEventListener("touchend", onEnd);
    dialog.removeEventListener("touchcancel", onEnd);
    settleTimer++;
    gesture = null;
    clear();
  };
}
