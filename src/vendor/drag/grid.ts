/**
 * Things on squares: pressed and carried a whole square at a time, by a
 * pointer, a finger held still or the keys, as a diagram's boxes are moved,
 * sized and joined on its board.
 *
 * A surface is ruled in squares (`unit()` pixels each) from its top left
 * corner, its own scroll included. Each press on it asks the page what it
 * carries (`press`): a gesture, or nothing to leave the press to the page. A
 * gesture hears where the pointer is, in squares, as it moves, and is let go
 * (`onDrop`) or taken back (`onCancel`: Escape, a lost pointer, the window
 * losing the focus). A press that never lifted is a click (`onClick`). A
 * source outside the surface (a tool in a bar) starts a gesture measured on
 * the surface all the same, so a box can be carried out of a bar onto a board.
 *
 * Nothing moves by itself and nothing is cloned: the page draws what the
 * gesture means (a box on other squares, a line to the pointer) and writes
 * it once it is let go. A mouse or a pen lifts once it has moved five
 * pixels; a finger after a still hold, so a finger that moves sooner
 * scrolls the page. Near an edge, the surface and the page scroll under it.
 *
 * The keyboard carries a gesture too (`keyboard`): the arrows a square at a
 * time and Shift a step, Tab and Shift-Tab to the next or last place worth
 * landing on (`targets`), Enter or Space lets go and Escape takes it back,
 * each move said to a screen reader (`announce`).
 */
import type { Cleanup } from './types';
import { once } from './util';

/** A place in squares from a surface's top left; fractions where a pointer is inside a square. */
export type GridPoint = { x: number; y: number };

export type GridInput = 'mouse' | 'pen' | 'touch' | 'keyboard';

/** Where a gesture stands as it is carried. */
export type GridDrag = {
  input: GridInput;
  /** Where the press began, in squares. */
  origin: GridPoint;
  /** Where the pointer is, in squares. */
  point: GridPoint;
  /** The square under the pointer: its column and row from nought. */
  square: GridPoint;
  /** How far the pointer has carried what it holds, in whole squares, to the nearest. */
  moved: GridPoint;
  /** Whether the pointer is over the surface. */
  inside: boolean;
  /** The element under the pointer, inside shadow roots too; null for the keyboard. */
  target: Element | null;
};

export type GridGesture = {
  /** Lifted: a pointer moved far enough, a finger held still, or the keyboard took it. */
  onStart?: (drag: GridDrag) => void;
  /** Carried: on every move of the pointer, every key that moves it, and every scroll under it. */
  onMove?: (drag: GridDrag) => void;
  /** Let go. */
  onDrop?: (drag: GridDrag) => void;
  /** Taken back, or never lifted after all (a finger that moved before its hold). */
  onCancel?: (drag: GridDrag) => void;
  /** Let go before it lifted: the press was a click. */
  onClick?: (drag: GridDrag) => void;
  /** For the keyboard: the places worth landing on, in the order Tab reaches them. */
  targets?: () => GridPoint[];
  /** For the keyboard: what a screen reader is told as it is lifted, moved, let go and taken back. */
  announce?: (drag: GridDrag, phase: 'start' | 'move' | 'drop' | 'cancel') => string | undefined;
};

/** A press, as the page is asked about it. */
export type GridPress = {
  input: Exclude<GridInput, 'keyboard'>;
  point: GridPoint;
  square: GridPoint;
  inside: boolean;
  /** The element pressed. */
  target: Element | null;
  event: PointerEvent;
};

export type GridSurfaceArgs = {
  /** What the squares are ruled on: points are measured from its top left corner, its scroll included. */
  element: HTMLElement;
  /** One square, in the surface's own pixels. */
  unit: () => number;
  /** What a press on the surface carries; nothing leaves the press to the page. */
  press?: (press: GridPress) => GridGesture | null | undefined | void;
};

export type GridSourceArgs = {
  /** Pressed to start a gesture: a tool in a bar, say. */
  element: HTMLElement;
  /** The surface, registered with `surface`, that the gesture is measured on. */
  surface: HTMLElement;
  press: (press: GridPress) => GridGesture | null | undefined | void;
};

export type GridKeyboardArgs = {
  surface: HTMLElement;
  /** Where the keyboard starts: the middle of the square of what it carries, as a rule. */
  from: GridPoint;
  gesture: GridGesture;
};

export type GridOptions = {
  /** How far a mouse or pen moves before it lifts, in pixels. */
  dragDistance?: number;
  /** How long a finger holds still before it lifts, in milliseconds. */
  touchHold?: number;
  /** How near an edge, in pixels, the pointer scrolls the surface or the page. */
  autoScrollEdge?: number;
  /** How many squares Shift and an arrow move. */
  step?: number;
  /** The pointer's place in the viewport, for a page that rewrites the event's own; `clientX` and `clientY` by default. */
  pointerPoint?: (event: PointerEvent) => GridPoint;
};

export type GridController = {
  surface: (args: GridSurfaceArgs) => Cleanup;
  source: (args: GridSourceArgs) => Cleanup;
  /** Carry a gesture with the keys, from a place on a registered surface. */
  keyboard: (args: GridKeyboardArgs) => void;
  isDragging: () => boolean;
  /** Take back what is being carried, or let go of a press that has not lifted. */
  cancel: () => void;
  destroy: () => void;
};

const defaults = { dragDistance: 5, touchHold: 250, autoScrollEdge: 40, step: 4 } as const;
const maxScrollSpeed = 20;
const styleId = 'data-0001-drag-grid-style';
const styles = ':root[data-drag-grid],:root[data-drag-grid] *{-webkit-user-select:none!important;user-select:none!important}';

type Surface = Required<Pick<GridSurfaceArgs, 'element' | 'unit'>> & { press?: GridSurfaceArgs['press'] };

type Pending = {
  surface: Surface;
  gesture: GridGesture;
  input: Exclude<GridInput, 'keyboard'>;
  pointerId: number;
  startX: number;
  startY: number;
  origin: GridPoint;
  target: Element | null;
  timer: ReturnType<typeof setTimeout> | null;
};

type Session = {
  surface: Surface;
  gesture: GridGesture;
  input: GridInput;
  pointerId: number;
  origin: GridPoint;
  /** Where the pointer last was in the viewport, or the keyboard's place in squares. */
  clientX: number;
  clientY: number;
  point: GridPoint;
  /** Which of the keyboard's targets it last landed on. */
  landed: number;
  scrollFrame: number | null;
};

export function createGrid(options: GridOptions = {}): GridController {
  const settings = {
    dragDistance: options.dragDistance ?? defaults.dragDistance,
    touchHold: options.touchHold ?? defaults.touchHold,
    autoScrollEdge: options.autoScrollEdge ?? defaults.autoScrollEdge,
    step: options.step ?? defaults.step,
  };
  const pointOf = options.pointerPoint ?? ((event: PointerEvent) => ({ x: event.clientX, y: event.clientY }));
  const surfaces = new Map<HTMLElement, Surface>();
  let pending: Pending | null = null;
  let session: Session | null = null;
  let destroyed = false;
  let liveRegion: HTMLElement | null = null;

  function surface(args: GridSurfaceArgs): Cleanup {
    const registration: Surface = { element: args.element, unit: args.unit, press: args.press };
    surfaces.set(args.element, registration);
    const down = (event: PointerEvent) => {
      if (registration.press) onPress(event, registration, registration.press);
    };
    args.element.addEventListener('pointerdown', down);
    return once(() => {
      args.element.removeEventListener('pointerdown', down);
      if (surfaces.get(args.element) === registration) surfaces.delete(args.element);
      if (pending?.surface === registration) clearPending();
      if (session?.surface === registration) end('cancel');
    });
  }

  function source(args: GridSourceArgs): Cleanup {
    const down = (event: PointerEvent) => {
      const registration = surfaces.get(args.surface);
      if (registration) onPress(event, registration, args.press);
    };
    args.element.addEventListener('pointerdown', down);
    return once(() => args.element.removeEventListener('pointerdown', down));
  }

  function onPress(event: PointerEvent, registration: Surface, ask: NonNullable<GridSurfaceArgs['press']>): void {
    if (destroyed || session || pending) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const input: Pending['input'] = event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse';
    const client = pointOf(event);
    const at = locate(registration, client.x, client.y);
    // Pressed inside a shadow root, the element itself rather than its host.
    const first = event.composedPath?.()[0];
    const target = first instanceof Element ? first : event.target instanceof Element ? event.target : null;
    const gesture = ask({ input, point: at.point, square: squareOf(at.point), inside: at.inside, target, event });
    if (!gesture) return;
    pending = { surface: registration, gesture, input, pointerId: event.pointerId, startX: client.x, startY: client.y, origin: at.point, target, timer: null };
    if (input === 'touch') {
      pending.timer = setTimeout(() => {
        if (pending) lift(pending);
      }, settings.touchHold);
    }
    addWindowListeners();
  }

  function lift(from: Pending): void {
    if (from.timer) clearTimeout(from.timer);
    pending = null;
    session = {
      surface: from.surface,
      gesture: from.gesture,
      input: from.input,
      pointerId: from.pointerId,
      origin: from.origin,
      clientX: from.startX,
      clientY: from.startY,
      point: from.origin,
      landed: -1,
      scrollFrame: null,
    };
    installStyle(from.surface.element.ownerDocument);
    from.surface.element.ownerDocument.documentElement.setAttribute('data-drag-grid', '');
    const drag = dragOf(session);
    from.gesture.onStart?.(drag);
    from.gesture.onMove?.(drag);
  }

  function onPointerMove(event: PointerEvent): void {
    const client = pointOf(event);
    if (pending && event.pointerId === pending.pointerId) {
      if (Math.hypot(client.x - pending.startX, client.y - pending.startY) < settings.dragDistance) return;
      // A finger that moves before its hold scrolls the page.
      if (pending.input === 'touch') {
        const gesture = pending.gesture, drag = pendingDrag(pending);
        clearPending();
        gesture.onCancel?.(drag);
        return;
      }
      lift(pending);
    }
    if (session && session.input !== 'keyboard' && event.pointerId === session.pointerId) {
      session.clientX = client.x;
      session.clientY = client.y;
      moveTo(session);
      scheduleAutoScroll(session);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (pending && event.pointerId === pending.pointerId) {
      const gesture = pending.gesture, drag = pendingDrag(pending);
      clearPending();
      gesture.onClick?.(drag);
      return;
    }
    if (session && session.input !== 'keyboard' && event.pointerId === session.pointerId) {
      suppressClick();
      end('drop');
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pending && event.pointerId === pending.pointerId) {
      const gesture = pending.gesture, drag = pendingDrag(pending);
      clearPending();
      gesture.onCancel?.(drag);
    }
    if (session && event.pointerId === session.pointerId) end('cancel');
  }

  function onKeyDown(event: KeyboardEvent): void {
    const current = session;
    if (!current) {
      if (pending && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
      return;
    }
    if (event.key === 'Escape') {
      end('cancel');
    } else if (current.input !== 'keyboard') {
      return;
    } else if (event.key === 'Enter' || event.key === ' ') {
      end('drop');
    } else if (event.key in arrows) {
      const by = event.shiftKey ? settings.step : 1;
      const arrow = arrows[event.key as keyof typeof arrows];
      current.point = { x: Math.max(0, current.point.x + arrow.x * by), y: Math.max(0, current.point.y + arrow.y * by) };
      moveTo(current, 'move');
    } else if (event.key === 'Tab') {
      const targets = current.gesture.targets?.() ?? [];
      if (!targets.length) return;
      const count = targets.length;
      current.landed = current.landed < 0 ? (event.shiftKey ? count - 1 : 0) : (current.landed + (event.shiftKey ? count - 1 : 1)) % count;
      current.point = targets[current.landed];
      moveTo(current, 'move');
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchMove(event: TouchEvent): void {
    // Lifted, the finger carries what it holds rather than scrolling the page.
    if (session && event.cancelable) event.preventDefault();
  }

  function onContextMenu(event: Event): void {
    if (pending || session) event.preventDefault();
  }

  function onBlur(): void {
    if (pending) {
      const gesture = pending.gesture, drag = pendingDrag(pending);
      clearPending();
      gesture.onCancel?.(drag);
    }
    if (session) end('cancel');
  }

  function onScroll(): void {
    if (session && session.input !== 'keyboard') moveTo(session);
  }

  function addWindowListeners(): void {
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, true);
  }

  function removeWindowListeners(): void {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    window.removeEventListener('touchmove', onTouchMove, true);
    window.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('scroll', onScroll, true);
  }

  function clearPending(): void {
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending = null;
    if (!session) removeWindowListeners();
  }

  /** The click a drop would otherwise make on what it was let go over. */
  function suppressClick(): void {
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, true), 0);
  }

  function keyboard(args: GridKeyboardArgs): void {
    const registration = surfaces.get(args.surface);
    if (destroyed || session || !registration) return;
    clearPending();
    session = {
      surface: registration,
      gesture: args.gesture,
      input: 'keyboard',
      pointerId: -1,
      origin: args.from,
      clientX: 0,
      clientY: 0,
      point: args.from,
      landed: -1,
      scrollFrame: null,
    };
    addWindowListeners();
    const drag = dragOf(session);
    args.gesture.onStart?.(drag);
    args.gesture.onMove?.(drag);
    say(args.gesture.announce?.(drag, 'start'));
  }

  /** Where the session is now, told to its gesture. */
  function moveTo(current: Session, phase?: 'move'): void {
    if (current.input !== 'keyboard') current.point = locate(current.surface, current.clientX, current.clientY).point;
    const drag = dragOf(current);
    current.gesture.onMove?.(drag);
    if (phase) say(current.gesture.announce?.(drag, phase));
  }

  function end(how: 'drop' | 'cancel'): void {
    const current = session;
    if (!current) return;
    session = null;
    if (current.scrollFrame !== null) cancelAnimationFrame(current.scrollFrame);
    removeWindowListeners();
    current.surface.element.ownerDocument.documentElement.removeAttribute('data-drag-grid');
    const drag = dragOf(current);
    if (how === 'drop') current.gesture.onDrop?.(drag);
    else current.gesture.onCancel?.(drag);
    if (current.input === 'keyboard') say(current.gesture.announce?.(drag, how));
  }

  function cancel(): void {
    if (pending) {
      const gesture = pending.gesture, drag = pendingDrag(pending);
      clearPending();
      gesture.onCancel?.(drag);
    }
    end('cancel');
  }

  function dragOf(current: Session): GridDrag {
    const inside = current.input === 'keyboard' ? true : locate(current.surface, current.clientX, current.clientY).inside;
    return {
      input: current.input,
      origin: current.origin,
      point: current.point,
      square: squareOf(current.point),
      moved: { x: Math.round(current.point.x - current.origin.x), y: Math.round(current.point.y - current.origin.y) },
      inside,
      target: current.input === 'keyboard' ? null : deepest(current.surface.element.ownerDocument, current.clientX, current.clientY),
    };
  }

  function pendingDrag(from: Pending): GridDrag {
    return { input: from.input, origin: from.origin, point: from.origin, square: squareOf(from.origin), moved: { x: 0, y: 0 }, inside: true, target: from.target };
  }

  function scheduleAutoScroll(current: Session): void {
    if (current.scrollFrame !== null || !speedFor(current)) return;
    const step = () => {
      current.scrollFrame = null;
      if (session !== current) return;
      const speed = speedFor(current);
      if (!speed) return;
      const scroller = speed.element;
      const before = scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : { x: window.scrollX, y: window.scrollY };
      if (scroller) scroller.scrollBy(speed.x, speed.y);
      else window.scrollBy(speed.x, speed.y);
      const after = scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : { x: window.scrollX, y: window.scrollY };
      if (after.x === before.x && after.y === before.y) return;
      moveTo(current);
      current.scrollFrame = requestAnimationFrame(step);
    };
    current.scrollFrame = requestAnimationFrame(step);
  }

  /** How fast the pointer near an edge scrolls: the surface first, where it scrolls that way, then the page. */
  function speedFor(current: Session): { element: HTMLElement | null; x: number; y: number } | null {
    const edge = settings.autoScrollEdge;
    const along = (position: number, start: number, length: number) => {
      const fromStart = position - start, fromEnd = start + length - position;
      if (fromStart < edge) return -maxScrollSpeed * ((edge - Math.max(fromStart, 0)) / edge) ** 2;
      if (fromEnd < edge) return maxScrollSpeed * ((edge - Math.max(fromEnd, 0)) / edge) ** 2;
      return 0;
    };
    const element = current.surface.element;
    const rect = element.getBoundingClientRect();
    const inside = current.clientX >= rect.left && current.clientX < rect.right && current.clientY >= rect.top && current.clientY < rect.bottom;
    if (inside) {
      const x = element.scrollWidth > element.clientWidth ? along(current.clientX, rect.left, rect.width) : 0;
      const y = element.scrollHeight > element.clientHeight ? along(current.clientY, rect.top, rect.height) : 0;
      const movable = (x < 0 && element.scrollLeft > 0) || (x > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth)
        || (y < 0 && element.scrollTop > 0) || (y > 0 && element.scrollTop + element.clientHeight < element.scrollHeight);
      if (movable) return { element, x, y };
    }
    const y = along(current.clientY, 0, window.innerHeight);
    return y ? { element: null, x: 0, y } : null;
  }

  function say(message: string | undefined): void {
    if (!message) return;
    liveRegion ??= hiddenText(document);
    liveRegion.textContent = message;
  }

  function destroy(): void {
    if (destroyed) return;
    cancel();
    destroyed = true;
    surfaces.clear();
    removeWindowListeners();
    liveRegion?.remove();
    liveRegion = null;
  }

  return { surface, source, keyboard, isDragging: () => !!session, cancel, destroy };
}

const arrows = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
} as const;

/** A viewport point as squares on a surface, and whether it is over it. */
function locate(surface: Surface, x: number, y: number): { point: GridPoint; inside: boolean } {
  const element = surface.element;
  const rect = element.getBoundingClientRect();
  // A surface drawn inside a scaled parent: the screen's pixels against its own.
  const scale = element.offsetWidth > 0 && rect.width > 0 && Math.abs(rect.width / element.offsetWidth - 1) >= 0.02 ? rect.width / element.offsetWidth : 1;
  const unit = surface.unit() || 1;
  return {
    point: {
      x: ((x - rect.left) / scale - element.clientLeft + element.scrollLeft) / unit,
      y: ((y - rect.top) / scale - element.clientTop + element.scrollTop) / unit,
    },
    inside: x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height,
  };
}

function squareOf(point: GridPoint): GridPoint {
  return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

/** The element at a point, looking into shadow roots. */
function deepest(document: Document, x: number, y: number): Element | null {
  let element = document.elementFromPoint?.(x, y) ?? null;
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint?.(x, y) ?? null;
    if (!inner || inner === element) break;
    element = inner;
  }
  return element;
}

function installStyle(document: Document): void {
  if (document.querySelector(`style[${styleId}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(styleId, '');
  style.textContent = styles;
  document.head.appendChild(style);
}

/** Text only a screen reader reads, said as it changes. */
function hiddenText(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('aria-live', 'assertive');
  element.setAttribute('aria-atomic', 'true');
  Object.assign(element.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.appendChild(element);
  return element;
}
