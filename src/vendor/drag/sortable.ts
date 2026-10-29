/**
 * Pointer-driven sortable lists: lift an item by a pointer, a finger hold or a
 * pen, move it through lists of the same type, and drop it in a slot.
 *
 * The motion follows @hello-pangea/dnd (Apache-2.0, © 2019 Atlassian,
 * © 2021 Gabriel Santerre; see NOTICE): siblings move out of the way by the
 * lifted item's whole size, a sibling moves once the lifted item's edge passes
 * its centre, counting the room it has already given, and the timings and
 * curves are carried over too. The engine around it is new and has no framework: the
 * lifted item is a clone in an overlay moved by writing its transform in the
 * pointer handler, siblings move by the `translate` property alone, geometry is
 * measured once at lift, and nothing changes layout while the pointer moves.
 */
import { flowHolds, flowStarts, type Flow, type FlowItem } from './flow';
import type { Cleanup } from './types';
import { once } from './util';

export type SortableAxis = 'vertical' | 'horizontal';

export type SortableLocation = {
  droppableId: string;
  index: number;
};

export type SortableStart = {
  draggableId: string;
  type: string;
  source: SortableLocation;
  /** A pointer moves the item freely; the keyboard moves it a slot at a time. */
  mode: 'FLUID' | 'SNAP';
};

/** The item the lifted one is held over, to be put together with it rather than beside it. */
export type SortableCombine = {
  draggableId: string;
  droppableId: string;
};

export type SortableUpdate = SortableStart & {
  /** No destination while combining: the lifted item is over another, not between two. */
  destination: SortableLocation | null;
  combine: SortableCombine | null;
};

export type SortableResult = SortableUpdate & {
  reason: 'DROP' | 'CANCEL';
};

export type SortableContainerArgs = {
  element: HTMLElement;
  id: string;
  type?: string;
  axis?: SortableAxis;
  isDropDisabled?: () => boolean;
  /**
   * Whether an item held over the middle of another here combines with it
   * (as a list dropped onto a list makes a folder): the leading edge inside
   * the middle half of the other item.
   */
  isCombineEnabled?: () => boolean;
  /** The list's name in announcements; its aria-label or id when left out. */
  label?: string;
  /**
   * Its items hold still while something is carried over them: nothing makes
   * room, the keyboard steps the lifted item from item to item, and a drop
   * lands at once. For a page that draws where the item will land itself, as
   * a board of squares does.
   */
  still?: boolean;
  /** Keep an item lifted from here on one line; the engine's `lockAxis` when left out. */
  lockAxis?: 'x' | 'y';
  /** The element drawn under the pointer for an item lifted from here; the engine's `renderPreview`, then a clone, when it gives none. */
  renderPreview?: (source: HTMLElement) => HTMLElement | null | undefined;
};

export type SortableItemArgs = {
  element: HTMLElement;
  id: string;
  type?: string;
  /** Where the item is held; the item itself when left out. */
  handle?: HTMLElement | null;
  /**
   * Whether the item may lift now, by what ('mouse', 'pen', 'touch' or
   * 'keyboard'), and from where: the element pressed, or the focused handle.
   */
  canDrag?: (by: { input: string; target: Element | null }) => boolean;
  /** Let a press on a button, field or link inside the handle start a drag. */
  allowInteractive?: boolean;
  /** The item's name in announcements; its aria-label or text when left out. */
  label?: string;
  /**
   * The item is writing, a block an editor draws: its handle keeps the
   * page's caret, selection, cursor and keys. A mouse or pen lifts it only
   * after a press held still for `hold()` milliseconds, asked at each press;
   * a press that moves sooner is the page's, and selects words. A hold of 0
   * lifts it as soon as the press moves, as any item. The keyboard never
   * lifts it, and it gets no tab stop or instructions of its own.
   *
   * With `axis`, a press that first moves along it, at least twice as far as
   * across, lifts at once without the hold: words are selected along a line,
   * so a block moved down a page is told apart from words being selected.
   */
  text?: { hold: () => number; axis?: 'x' | 'y' };
};

/** What an announcement is about. Positions count from one. */
export type SortableAnnouncement = {
  item: string;
  list: string;
  position: number;
  count: number;
};

/** What a screen reader hears, in the product's own words and language. */
export type SortableMessages = {
  instructions: string;
  lifted: (at: SortableAnnouncement) => string;
  moved: (at: SortableAnnouncement) => string;
  outside: (item: string) => string;
  combining: (item: string, target: string) => string;
  combined: (item: string, target: string) => string;
  dropped: (at: SortableAnnouncement) => string;
  returned: (at: SortableAnnouncement) => string;
};

export type SortableOptions = {
  /**
   * Called as the item is about to lift, before anything is measured, so the
   * page can draw itself as the drag needs (a selection folded into the row
   * that carries it). Draw it synchronously (`flushSync` in React).
   */
  onBeforeCapture?: (before: { draggableId: string; mode: SortableStart['mode'] }) => void;
  /** Called once the item lifts. */
  onDragStart?: (start: SortableStart) => void;
  /** Called when the destination changes. */
  onDragUpdate?: (update: SortableUpdate) => void;
  /**
   * Called when the drop settles. Apply the new order synchronously
   * (`flushSync` in React): the engine takes its offsets away right after.
   */
  onDragEnd?: (result: SortableResult) => void;
  /** Commit the final layout before landing. Return its authored item (which may have been redrawn).
   * Await layout work here; the preview then animates directly to this measured destination.
   * When supplied, this owns the commit; onDragEnd remains a completion notification. */
  prepareDrop?: (result: SortableResult) => HTMLElement | null | (() => HTMLElement | null) | Promise<HTMLElement | null | (() => HTMLElement | null)>;
  /** How long a finger holds before the item lifts, in milliseconds. */
  touchHold?: number;
  /** How far a mouse or pen moves before the item lifts, in pixels. */
  dragDistance?: number;
  /** Siblings moving out of the way. */
  outOfTheWay?: { duration: number; easing: string };
  /** The lifted item settling into its slot, its duration by distance. */
  drop?: { minDuration: number; maxDuration: number; easing: string };
  /** How near an edge, in pixels, the pointer scrolls the list or the page. */
  autoScrollEdge?: number;
  /** Keep the lifted item on one line as the pointer moves: across ('x') or down ('y'). */
  lockAxis?: 'x' | 'y';
  /** Custom properties copied from the source item onto the overlay. */
  inheritProperties?: string[];
  /** The element drawn under the pointer; a clone of the item by default. */
  renderPreview?: (source: HTMLElement) => HTMLElement;
  /** Announcements and the keyboard instructions; English by default. */
  messages?: Partial<SortableMessages>;
  /**
   * The pointer's place in the viewport, for a page that rewrites the
   * event's own coordinates; `clientX` and `clientY` by default.
   */
  pointerPoint?: (event: PointerEvent) => { x: number; y: number };
  /**
   * A pointer drop outside every list. Return true when the product has taken
   * the item (onto a canvas, say): it lands there at once instead of flying
   * home. `onDragEnd` still follows, with no destination.
   */
  onDropOutside?: (start: SortableStart, point: { x: number; y: number }) => boolean;
  /**
   * Every move a sibling makes: making room while the item is carried
   * ('drag'), and any move after release ('drop'), which means the page drew
   * it somewhere other than where it had made room. A sibling moves once per
   * change of place; a 'drop' move is a second one.
   */
  onMovement?: (movement: SortableMovement) => void;
};

export type SortableMovement = {
  element: HTMLElement;
  phase: 'drag' | 'drop';
  /** How far it moved, in screen pixels. */
  x: number;
  y: number;
};

export type SortableController = {
  container: (args: SortableContainerArgs) => Cleanup;
  item: (args: SortableItemArgs) => Cleanup;
  isDragging: () => boolean;
  cancel: () => void;
  destroy: () => void;
};

const defaultMessages: SortableMessages = {
  instructions: 'Press space to lift. Then use the arrow keys to move, space to drop and escape to cancel.',
  lifted: (at) => `Lifted ${at.item}, position ${at.position} of ${at.count} in ${at.list}.`,
  moved: (at) => `${at.item}, position ${at.position} of ${at.count} in ${at.list}.`,
  outside: (item) => `${item} is outside every list.`,
  combining: (item, target) => `${item} is over ${target}. Drop to put them together.`,
  combined: (item, target) => `Dropped ${item} onto ${target}.`,
  dropped: (at) => `Dropped ${at.item} at position ${at.position} of ${at.count} in ${at.list}.`,
  returned: (at) => `${at.item} is back at position ${at.position} of ${at.count} in ${at.list}.`,
};

const defaults = {
  touchHold: 250,
  dragDistance: 5,
  outOfTheWay: { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  drop: { minDuration: 330, maxDuration: 550, easing: 'cubic-bezier(.2, 1, .1, 1)' },
  autoScrollEdge: 60,
} as const;

/** The drop: the longest duration is reached at this distance. */
const maxDropDistance = 1500;
const maxScrollSpeed = 24;
const inheritedText = ['color', 'font', 'letter-spacing', 'line-height', '-webkit-font-smoothing'];
const interactive = 'input, textarea, select, option, button, a[href], [contenteditable]:not([contenteditable="false"])';
const handleStyleId = 'data-0001-drag-sortable-style';
const handleStyles = `
[data-drag-handle]:not([data-drag-handle="text"]){-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;cursor:grab;touch-action:manipulation}
:root[data-drag-active],:root[data-drag-active] *{-webkit-user-select:none!important;user-select:none!important;cursor:grabbing!important}
`;

type ContainerRegistration = Required<Omit<SortableContainerArgs, 'isDropDisabled' | 'isCombineEnabled' | 'label' | 'lockAxis' | 'renderPreview'>> & {
  isDropDisabled: () => boolean;
  isCombineEnabled: () => boolean;
  label: () => string;
  lockAxis: SortableContainerArgs['lockAxis'];
  renderPreview: SortableContainerArgs['renderPreview'];
};

type ItemRegistration = Required<Omit<SortableItemArgs, 'handle' | 'canDrag' | 'label' | 'text'>> & {
  handle: HTMLElement;
  canDrag: (by: { input: string; target: Element | null }) => boolean;
  text: SortableItemArgs['text'];
  label: () => string;
};

type Box = { left: number; top: number; width: number; height: number };

type Scroller = {
  element: HTMLElement | null;
  liftLeft: number;
  liftTop: number;
  box: Box;
};

type Slot = {
  item: ItemRegistration;
  /** Index in the container before the lift, the source included. */
  original: number;
  box: Box;
};

type ContainerSnapshot = {
  registration: ContainerRegistration;
  box: Box;
  gap: number;
  paddingStart: number;
  scroller: Scroller | null;
  /** The items other than the source, in order. */
  slots: Slot[];
  /** The room the lifted item takes in this container, its margins and gap included. */
  room: number;
  /** The lifted item's margin before it along this container's axis. */
  marginStart: number;
  /** Screen pixels to the list's own, for a list inside a scaled parent. */
  scale: number;
  isHome: boolean;
  /**
   * The list's flow at lift, every member in its own order (the source
   * included at home), and the lifted item as it would stand here; null where
   * the model does not draw the list where the page did.
   */
  flow: { items: FlowItem[]; source: FlowItem; flow: Flow; origin: number } | null;
};

type Pending = {
  item: ItemRegistration;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Waiting for a still press to lift writing; a move first leaves the press to the page. */
  held: boolean;
};

type Session = {
  item: ItemRegistration;
  mode: SortableStart['mode'];
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  liftBox: Box;
  previewScale: number;
  sourceIndex: number;
  home: ContainerSnapshot;
  containers: ContainerSnapshot[];
  scrollers: Scroller[];
  windowLiftX: number;
  windowLiftY: number;
  overlay: HTMLElement;
  preview: HTMLElement;
  destination: { container: ContainerSnapshot; index: number } | null;
  shifts: Map<HTMLElement, { value: number; scale: number; translate: string; transition: string }>;
  sourceVisibility: string;
  reserved: ContainerSnapshot | null;
  scrollFrame: number | null;
  impactFrame: number | null;
  dropping: boolean;
  preparing?: boolean;
  landing?: { element: HTMLElement; visibility: string };
  /** The sibling the lifted item is held over, to combine with; the gap stays as it was. */
  combine: { container: ContainerSnapshot; slot: Slot } | null;
  /** The line the lifted item keeps to, if any. */
  lockAxis: 'x' | 'y' | undefined;
};

export function createSortable(options: SortableOptions = {}): SortableController {
  const settings = {
    touchHold: options.touchHold ?? defaults.touchHold,
    dragDistance: options.dragDistance ?? defaults.dragDistance,
    outOfTheWay: options.outOfTheWay ?? defaults.outOfTheWay,
    drop: options.drop ?? defaults.drop,
    autoScrollEdge: options.autoScrollEdge ?? defaults.autoScrollEdge,
  };
  const messages: SortableMessages = { ...defaultMessages, ...options.messages };
  const pointOf = options.pointerPoint ?? ((event: PointerEvent) => ({ x: event.clientX, y: event.clientY }));
  const containers = new Map<HTMLElement, ContainerRegistration>();
  const items = new Map<HTMLElement, ItemRegistration>();
  const handles = new Map<HTMLElement, ItemRegistration>();
  let pending: Pending | null = null;
  let session: Session | null = null;
  const documents = new Map<Document, { view: Window; instructions: HTMLElement; liveRegion: HTMLElement }>();
  let eventView: Window | null = null;
  let destroyed = false;
  let reducedMotion = false;
  let liveRegion: HTMLElement | null = null;

  function container(args: SortableContainerArgs): Cleanup {
    const registration: ContainerRegistration = {
      element: args.element,
      id: args.id,
      type: args.type ?? 'default',
      axis: args.axis ?? 'vertical',
      isDropDisabled: args.isDropDisabled ?? (() => false),
      isCombineEnabled: args.isCombineEnabled ?? (() => false),
      label: () => args.label ?? args.element.getAttribute('aria-label') ?? args.id,
      still: args.still ?? false,
      lockAxis: args.lockAxis,
      renderPreview: args.renderPreview,
    };
    containers.set(args.element, registration);
    return once(() => {
      if (containers.get(args.element) === registration) containers.delete(args.element);
    });
  }

  function item(args: SortableItemArgs): Cleanup {
    const handle = args.handle ?? args.element;
    const registration: ItemRegistration = {
      element: args.element,
      id: args.id,
      type: args.type ?? 'default',
      handle,
      canDrag: args.canDrag ?? (() => true),
      allowInteractive: args.allowInteractive ?? false,
      label: () => args.label ?? labelOf(args.element, handle),
      text: args.text,
    };
    items.set(args.element, registration);
    handles.set(handle, registration);
    // Writing keeps its own caret, cursor and keys: no grab, no tab stop, no instructions.
    handle.setAttribute('data-drag-handle', args.text ? 'text' : '');
    // The keyboard reaches the handle, and a screen reader says how to lift it.
    const addedTabIndex = !args.text && !handle.hasAttribute('tabindex') && !handle.matches(interactive);
    if (addedTabIndex) handle.tabIndex = 0;
    const describedBy = handle.getAttribute('aria-describedby');
    const { instructions } = installDocument(handle.ownerDocument);
    if (!args.text) {
      handle.setAttribute('aria-describedby', [describedBy, instructions.id].filter(Boolean).join(' '));
    }
    return once(() => {
      if (items.get(args.element) === registration) items.delete(args.element);
      if (handles.get(handle) === registration) {
        handles.delete(handle);
        handle.removeAttribute('data-drag-handle');
        if (addedTabIndex) handle.removeAttribute('tabindex');
        if (args.text) return;
        if (describedBy) handle.setAttribute('aria-describedby', describedBy);
        else handle.removeAttribute('aria-describedby');
      }
    });
  }

  function installDocument(document: Document) {
    const existing = documents.get(document);
    if (existing) return existing;
    const view = document.defaultView ?? window;
    // A framed page owns its event stream and its DOM constructors.
    view.addEventListener('pointerdown', onPointerDown, true);
    view.addEventListener('keydown', onHandleKeyDown, true);
    if (!document.querySelector(`style[${handleStyleId}]`)) {
      const style = document.createElement('style');
      style.setAttribute(handleStyleId, '');
      style.textContent = handleStyles;
      document.head.appendChild(style);
    }
    const instructions = hiddenText(document, `0001-drag-instructions-${++instanceCount}`);
    instructions.textContent = messages.instructions;
    const liveRegion = hiddenText(document, `0001-drag-live-${instanceCount}`);
    liveRegion.setAttribute('aria-live', 'assertive');
    liveRegion.setAttribute('aria-atomic', 'true');
    const registration = { view, instructions, liveRegion };
    documents.set(document, registration);
    return registration;
  }

  function announce(message: string): void {
    if (liveRegion) liveRegion.textContent = message;
  }

  function announcement(current: Session): SortableAnnouncement | null {
    const destination = current.destination;
    if (!destination) return null;
    return {
      item: current.item.label(),
      list: destination.container.registration.label(),
      position: destination.index + 1,
      count: destination.container.slots.length + 1,
    };
  }

  function announceMove(current: Session): void {
    const at = announcement(current);
    announce(at ? messages.moved(at) : messages.outside(current.item.label()));
  }

  /** Space on a focused handle lifts its item for the keyboard. */
  function onHandleKeyDown(event: KeyboardEvent): void {
    if (destroyed || session || pending || event.key !== ' ' || event.defaultPrevented) return;
    const target = eventElement(event.target);
    if (target?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const registration = target ? handles.get(target as HTMLElement) : undefined;
    if (!registration || registration.text || !registration.canDrag({ input: 'keyboard', target: registration.handle })) return;
    event.preventDefault();
    event.stopPropagation();
    addWindowListeners(registration.element.ownerDocument.defaultView ?? window);
    const box = measure(registration.element);
    lift(registration, -1, box.left + box.width / 2, box.top + box.height / 2, 'SNAP');
  }

  function findHandle(target: EventTarget | null): ItemRegistration | null {
    let element = eventElement(target);
    let crossedInteractive = false;
    while (element) {
      const registration = handles.get(element as HTMLElement);
      if (registration) {
        return crossedInteractive && !registration.allowInteractive ? null : registration;
      }
      if (element.matches(interactive)) crossedInteractive = true;
      element = element.parentElement;
    }
    return null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (destroyed || session || pending) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const registration = findHandle(event.target);
    const target = eventElement(event.target);
    if (!registration || !registration.canDrag({ input: event.pointerType || 'mouse', target })) return;

    // Writing lifts after a still press, so a press that moves sooner still selects words.
    const hold = event.pointerType !== 'touch' && registration.text ? Math.max(0, registration.text.hold()) : 0;
    pending = {
      item: registration,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: pointOf(event).x,
      startY: pointOf(event).y,
      timer: null,
      held: hold > 0,
    };
    if (event.pointerType === 'touch' || hold > 0) {
      pending.timer = setTimeout(() => {
        if (pending) lift(pending.item, pending.pointerId, pending.startX, pending.startY);
      }, hold || settings.touchHold);
    }
    addWindowListeners(registration.element.ownerDocument.defaultView ?? window);
  }

  function onPointerMove(event: PointerEvent): void {
    if (pending && event.pointerId === pending.pointerId) {
      const point = pointOf(event);
      const distance = Math.hypot(point.x - pending.startX, point.y - pending.startY);
      if (distance < settings.dragDistance) return;
      if (pending.pointerType === 'touch' || pending.held) {
        // Writing moved along its axis is lifted at once; moved any other way, it selects words.
        const axis = pending.pointerType !== 'touch' ? pending.item.text?.axis : undefined;
        const along = Math.abs(axis === 'x' ? point.x - pending.startX : point.y - pending.startY);
        const across = Math.abs(axis === 'x' ? point.y - pending.startY : point.x - pending.startX);
        if (!axis || along < 2 * across) {
          // It moved before the hold finished: a finger scrolls, a press on writing selects words.
          clearPending();
          return;
        }
      }
      lift(pending.item, pending.pointerId, pending.startX, pending.startY);
    }
    if (session && event.pointerId === session.pointerId && !session.dropping) {
      const point = pointOf(event);
      move(point.x, point.y);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (pending && event.pointerId === pending.pointerId) {
      clearPending();
      return;
    }
    if (session && event.pointerId === session.pointerId && !session.dropping) {
      suppressClick();
      void drop('DROP');
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pending && event.pointerId === pending.pointerId) clearPending();
    if (session && event.pointerId === session.pointerId && !session.dropping) void drop('CANCEL');
  }

  function onKeyDown(event: KeyboardEvent): void {
    const current = session;
    if (!current || current.dropping) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void drop('CANCEL');
      return;
    }
    if (current.mode !== 'SNAP') return;
    // While lifted by the keyboard, these keys belong to the drag, not the page.
    if (event.key === ' ' || event.key === 'Enter') {
      void drop('DROP');
    } else if (event.key in arrows) {
      moveByKey(current, arrows[event.key as keyof typeof arrows]);
    } else if (event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchMove(event: TouchEvent): void {
    // While lifted, the finger moves the item rather than the page.
    if (session && event.cancelable) event.preventDefault();
  }

  function onContextMenu(event: Event): void {
    if (pending || session) event.preventDefault();
  }

  function onBlur(): void {
    clearPending();
    if (session && !session.dropping) void drop('CANCEL');
  }

  function onScroll(): void {
    if (!session || session.dropping || session.impactFrame !== null) return;
    const view = session.overlay.ownerDocument.defaultView;
    if (!view) return;
    session.impactFrame = view.requestAnimationFrame(() => {
      if (!session) return;
      session.impactFrame = null;
      if (session.mode === 'SNAP') placePreview(session, false);
      else updateImpact(session);
    });
  }

  function addWindowListeners(view: Window): void {
    if (eventView === view) return;
    removeWindowListeners();
    eventView = view;
    liveRegion = documents.get(view.document)?.liveRegion ?? null;
    view.addEventListener('pointermove', onPointerMove, true);
    view.addEventListener('pointerup', onPointerUp, true);
    view.addEventListener('pointercancel', onPointerCancel, true);
    view.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    view.addEventListener('contextmenu', onContextMenu, true);
    view.addEventListener('keydown', onKeyDown, true);
    view.addEventListener('blur', onBlur);
    view.addEventListener('scroll', onScroll, true);
  }

  function removeWindowListeners(): void {
    const view = eventView;
    if (!view) return;
    eventView = null;
    view.removeEventListener('pointermove', onPointerMove, true);
    view.removeEventListener('pointerup', onPointerUp, true);
    view.removeEventListener('pointercancel', onPointerCancel, true);
    view.removeEventListener('touchmove', onTouchMove, true);
    view.removeEventListener('contextmenu', onContextMenu, true);
    view.removeEventListener('keydown', onKeyDown, true);
    view.removeEventListener('blur', onBlur);
    view.removeEventListener('scroll', onScroll, true);
  }

  function clearPending(): void {
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending = null;
    if (!session) removeWindowListeners();
  }

  function suppressClick(): void {
    const view = session?.overlay.ownerDocument.defaultView ?? eventView ?? window;
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    view.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => view.removeEventListener('click', stop, true), 0);
  }

  function lift(
    pressed: ItemRegistration,
    pointerId: number,
    startX: number,
    startY: number,
    mode: SortableStart['mode'] = 'FLUID',
  ): void {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;

    options.onBeforeCapture?.({ draggableId: pressed.id, mode });
    const registration = registrationFor(pressed);
    if (!registration) {
      removeWindowListeners();
      return;
    }
    const document = registration.element.ownerDocument;
    const view = document.defaultView ?? window;
    const homeRegistration = closestContainer(registration);
    if (!homeRegistration) {
      removeWindowListeners();
      return;
    }

    // Asked for less motion: siblings and the drop move at once.
    reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const liftBox = measure(registration.element);
    const sourceStyle = view.getComputedStyle(registration.element);
    const margins = {
      top: parsePixels(sourceStyle.marginTop),
      left: parsePixels(sourceStyle.marginLeft),
      vertical: parsePixels(sourceStyle.marginTop) + parsePixels(sourceStyle.marginBottom),
      horizontal: parsePixels(sourceStyle.marginLeft) + parsePixels(sourceStyle.marginRight),
    };
    const itemScale = scaleOf(registration.element, liftBox);
    const scrollers = new Map<HTMLElement | null, Scroller>();
    const snapshots: ContainerSnapshot[] = [];
    let sourceIndex = 0;

    for (const candidate of containers.values()) {
      if (candidate.type !== registration.type || !candidate.element.isConnected || candidate.element.ownerDocument !== document) continue;
      const members = itemsOf(candidate);
      const isHome = candidate === homeRegistration;
      const style = view.getComputedStyle(candidate.element);
      const vertical = candidate.axis === 'vertical';
      const box = measure(candidate.element);
      // A list drawn inside a scaled parent: its own pixels against the screen's.
      const scale = scaleOf(candidate.element, box);
      const gap = parsePixels(vertical ? style.rowGap : style.columnGap) * scale;
      const slots: Slot[] = [];
      const flowItems: FlowItem[] = [];
      const along = (element: HTMLElement, box: Box): FlowItem => {
        const style = view.getComputedStyle(element);
        const scale = scaleOf(element, box);
        return {
          start: vertical ? box.top : box.left,
          size: vertical ? box.height : box.width,
          marginStart: parsePixels(vertical ? style.marginTop : style.marginLeft) * scale,
          marginEnd: parsePixels(vertical ? style.marginBottom : style.marginRight) * scale,
        };
      };
      members.forEach((member, original) => {
        const memberBox = member === registration ? liftBox : measure(member.element);
        if (!candidate.still) flowItems.push(along(member.element, memberBox));
        if (member === registration) {
          sourceIndex = original;
          return;
        }
        slots.push({ item: member, original, box: memberBox });
      });
      const scrollElement = scrollParent(candidate.element);
      let scroller = scrollers.get(scrollElement) ?? null;
      if (!scroller && scrollElement) {
        scroller = {
          element: scrollElement,
          liftLeft: scrollElement.scrollLeft,
          liftTop: scrollElement.scrollTop,
          box: measure(scrollElement),
        };
        scrollers.set(scrollElement, scroller);
      }
      snapshots.push({
        registration: candidate,
        box,
        scale,
        gap,
        paddingStart: parsePixels(vertical ? style.paddingTop : style.paddingLeft) * scale,
        scroller,
        slots,
        // The lifted item's margin box and the list's gap: the room siblings give, none where they hold still.
        room: candidate.still ? 0 : (vertical ? liftBox.height + margins.vertical * itemScale : liftBox.width + margins.horizontal * itemScale) + gap,
        marginStart: (vertical ? margins.top : margins.left) * itemScale,
        isHome,
        flow: candidate.still ? null : flowOf(style, box, scale, vertical, flowItems, isHome ? flowItems[sourceIndex] : along(registration.element, liftBox)),
      });
    }

    const home = snapshots.find((snapshot) => snapshot.isHome);
    if (!home) {
      removeWindowListeners();
      return;
    }

    const overlay = document.createElement('div');
    overlay.setAttribute('data-drag-overlay', '');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483000',
      contain: 'layout style',
    });
    for (const property of options.inheritProperties ?? []) {
      overlay.style.setProperty(property, sourceStyle.getPropertyValue(property));
    }

    const customPreview = home.registration.renderPreview?.(registration.element) ?? options.renderPreview?.(registration.element);
    const preview = customPreview ?? cloneForPreview(registration.element);
    for (const property of customPreview ? inheritedText : []) {
      preview.style.setProperty(property, sourceStyle.getPropertyValue(property));
    }
    preview.setAttribute('data-drag-preview', '');
    preview.setAttribute('aria-hidden', 'true');
    Object.assign(preview.style, {
      position: 'absolute',
      left: `${liftBox.left}px`,
      top: `${liftBox.top}px`,
      // Drawn at the item's own size and scaled as it was on the page.
      width: `${liftBox.width / itemScale}px`,
      height: `${liftBox.height / itemScale}px`,
      transformOrigin: '0 0',
      margin: '0',
      boxSizing: 'border-box',
      translate: 'none',
      transform: previewTransform(0, 0, itemScale),
      transition: 'none',
      willChange: 'transform',
      pointerEvents: 'none',
    });
    overlay.appendChild(preview);
    document.body.appendChild(overlay);

    const element = registration.element;
    session = {
      item: registration,
      mode,
      pointerId,
      startX,
      startY,
      lastX: startX,
      lastY: startY,
      liftBox,
      previewScale: itemScale,
      sourceIndex,
      home,
      containers: snapshots,
      scrollers: [...scrollers.values()],
      windowLiftX: view.scrollX,
      windowLiftY: view.scrollY,
      overlay,
      preview,
      destination: { container: home, index: sourceIndex },
      shifts: new Map(),
      sourceVisibility: element.style.visibility,
      reserved: null,
      scrollFrame: null,
      impactFrame: null,
      dropping: false,
      combine: null,
      lockAxis: home.registration.lockAxis ?? options.lockAxis,
    };

    element.style.visibility = 'hidden';
    element.setAttribute('data-drag-source', '');
    home.registration.element.setAttribute('data-drag-over', '');
    document.documentElement.setAttribute('data-drag-active', registration.type);

    options.onDragStart?.(startOf(session));
    const lifted = announcement(session);
    if (lifted) announce(messages.lifted(lifted));
  }

  function move(clientX: number, clientY: number): void {
    const current = session;
    if (!current) return;
    current.lastX = clientX;
    current.lastY = clientY;
    const x = current.lockAxis === 'y' ? 0 : clientX - current.startX;
    const y = current.lockAxis === 'x' ? 0 : clientY - current.startY;
    current.preview.style.transform = previewTransform(x, y, current.previewScale);
    updateImpact(current);
    scheduleAutoScroll(current);
  }

  /** Where the lifted item is now in each container, scroll taken into account. */
  function offsetOf(current: Session, snapshot: ContainerSnapshot): { x: number; y: number } {
    const view = current.overlay.ownerDocument.defaultView ?? window;
    let x = view.scrollX - current.windowLiftX;
    let y = view.scrollY - current.windowLiftY;
    const scroller = snapshot.scroller;
    if (scroller?.element) {
      x += scroller.element.scrollLeft - scroller.liftLeft;
      y += scroller.element.scrollTop - scroller.liftTop;
    }
    return { x, y };
  }

  function containerBox(current: Session, snapshot: ContainerSnapshot): Box {
    const offset = offsetOf(current, snapshot);
    const box = snapshot.box;
    const scroller = snapshot.scroller;
    const visible = { ...box, left: box.left - offset.x, top: box.top - offset.y };
    if (!scroller?.element) return visible;
    return intersect(visible, scroller.box);
  }

  function updateImpact(current: Session): void {
    const pointerX = current.lastX;
    const pointerY = current.lastY;
    let over: ContainerSnapshot | null = null;
    let overArea = Infinity;

    for (const snapshot of current.containers) {
      if (snapshot.registration.isDropDisabled()) continue;
      const box = containerBox(current, snapshot);
      if (!contains(box, pointerX, pointerY)) continue;
      const area = box.width * box.height;
      if (area < overArea) {
        over = snapshot;
        overArea = area;
      }
    }

    // Combining is checked first, against the gap as it stands, which it leaves where it is.
    const combining = over && current.mode === 'FLUID' ? combineIn(current, over) : null;
    if (combining && over) {
      if (setCombine(current, { container: over, slot: combining })) {
        options.onDragUpdate?.(updateOf(current));
        announce(messages.combining(current.item.label(), combining.item.label()));
      }
      return;
    }
    const uncombined = setCombine(current, null);

    let next: Session['destination'] = null;
    if (over) next = { container: over, index: indexIn(current, over) };

    const previous = current.destination;
    if (previous?.container === next?.container && previous?.index === next?.index) {
      if (uncombined) {
        options.onDragUpdate?.(updateOf(current));
        announceMove(current);
      }
      return;
    }
    current.destination = next;
    applyShifts(current, previous?.container ?? null);
    current.overlay.ownerDocument.documentElement.toggleAttribute('data-drag-outside', !next);
    options.onDragUpdate?.(updateOf(current));
    announceMove(current);
  }

  /**
   * The keyboard moves the item a slot along its list, or into the nearest
   * list of its type beside it, where it keeps its height as near as it can.
   */
  function moveByKey(current: Session, direction: { x: number; y: number }): void {
    const from = current.destination ?? { container: current.home, index: current.sourceIndex };
    const vertical = from.container.registration.axis === 'vertical';
    const along = vertical ? direction.y : direction.x;
    let next: NonNullable<Session['destination']> | null = null;

    if (along !== 0) {
      const index = from.index + along;
      if (index >= 0 && index <= from.container.slots.length) next = { container: from.container, index };
    } else {
      const neighbour = neighbourOf(current, from.container, direction);
      if (neighbour) next = { container: neighbour, index: indexNear(current, neighbour) };
    }
    if (!next) return;

    const previous = current.destination?.container ?? null;
    current.destination = next;
    applyShifts(current, previous);
    placePreview(current, true);
    revealPreview(current);
    options.onDragUpdate?.(updateOf(current));
    announceMove(current);
  }

  /** The nearest list of the same type in a direction across the axis. */
  function neighbourOf(current: Session, from: ContainerSnapshot, direction: { x: number; y: number }): ContainerSnapshot | null {
    const origin = centreOf(containerBox(current, from));
    let best: ContainerSnapshot | null = null;
    let bestDistance = Infinity;
    for (const snapshot of current.containers) {
      if (snapshot === from || snapshot.registration.isDropDisabled()) continue;
      const centre = centreOf(containerBox(current, snapshot));
      const ahead = (centre.x - origin.x) * direction.x + (centre.y - origin.y) * direction.y;
      if (ahead <= 1) continue;
      const aside = Math.abs((centre.x - origin.x) * direction.y) + Math.abs((centre.y - origin.y) * direction.x);
      const distance = ahead + aside * 2;
      if (distance < bestDistance) {
        best = snapshot;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Where the preview's centre falls among a list's slots. */
  function indexNear(current: Session, snapshot: ContainerSnapshot): number {
    const vertical = snapshot.registration.axis === 'vertical';
    const offset = offsetOf(current, snapshot);
    const placed = parseTranslate(current.preview.style.transform);
    const centre = vertical
      ? current.liftBox.top + placed.y + current.liftBox.height / 2
      : current.liftBox.left + placed.x + current.liftBox.width / 2;
    return snapshot.slots.filter((slot) => {
      const start = baselineStart(current, snapshot, slot) - (vertical ? offset.y : offset.x);
      return start + (vertical ? slot.box.height : slot.box.width) / 2 < centre;
    }).length;
  }

  function placePreview(current: Session, animate: boolean): void {
    const target = targetPosition(current);
    const { duration, easing } = settings.outOfTheWay;
    current.preview.style.transition = animate && !reducedMotion ? `transform ${duration}ms ${easing}` : 'none';
    current.preview.style.transform = previewTransform(target.x, target.y, current.previewScale);
  }

  /** Scrolls the list, then the page, so the moved item is in view. */
  function revealPreview(current: Session): void {
    const view = current.overlay.ownerDocument.defaultView;
    if (!view) return;
    const target = targetPosition(current);
    const box = {
      left: current.liftBox.left + target.x,
      top: current.liftBox.top + target.y,
      width: current.liftBox.width,
      height: current.liftBox.height,
    };
    const margin = settings.autoScrollEdge;
    const scroller = current.destination?.container.scroller;
    const into = (frame: Box) => ({
      x: Math.min(0, box.left - margin - frame.left) + Math.max(0, box.left + box.width + margin - frame.left - frame.width),
      y: Math.min(0, box.top - margin - frame.top) + Math.max(0, box.top + box.height + margin - frame.top - frame.height),
    });
    if (scroller?.element) {
      const by = into(scroller.box);
      if (by.x || by.y) scroller.element.scrollBy(by.x, by.y);
    }
    const page = into({ left: 0, top: 0, width: view.innerWidth, height: view.innerHeight });
    if (page.x || page.y) view.scrollBy(page.x, page.y);
    placePreview(current, true);
  }

  /** Where the lifted item runs along a list's axis now, in the viewport. */
  function spanOf(current: Session, snapshot: ContainerSnapshot): { start: number; end: number } {
    const vertical = snapshot.registration.axis === 'vertical';
    const liftStart = vertical ? current.liftBox.top : current.liftBox.left;
    const size = vertical ? current.liftBox.height : current.liftBox.width;
    const moved =
      vertical
        ? current.lockAxis === 'x' ? 0 : current.lastY - current.startY
        : current.lockAxis === 'y' ? 0 : current.lastX - current.startX;
    return { start: liftStart + moved, end: liftStart + moved + size };
  }

  /**
   * The sibling the lifted item is held over: before the
   * gap, the leading edge inside its middle half; after the gap, the
   * trailing edge inside the middle half of where it has moved to.
   */
  function combineIn(current: Session, snapshot: ContainerSnapshot): Slot | null {
    const destination = current.destination;
    if (!destination || destination.container !== snapshot || !snapshot.registration.isCombineEnabled()) return null;
    const vertical = snapshot.registration.axis === 'vertical';
    const scrolled = vertical ? offsetOf(current, snapshot).y : offsetOf(current, snapshot).x;
    const dragged = spanOf(current, snapshot);
    return snapshot.slots.find((slot, position) => {
      const size = vertical ? slot.box.height : slot.box.width;
      const after = position >= destination.index;
      const start = baselineStart(current, snapshot, slot) - scrolled + (after ? snapshot.room : 0);
      const threshold = size / 4;
      const edge = after ? dragged.end : dragged.start;
      return edge > start + threshold && edge < start + size - threshold;
    }) ?? null;
  }

  function setCombine(current: Session, next: Session['combine']): boolean {
    if (current.combine?.slot === next?.slot) return false;
    current.combine?.slot.item.element.removeAttribute('data-drag-combine');
    next?.slot.item.element.setAttribute('data-drag-combine', '');
    current.combine = next;
    return true;
  }

  /** The lifted item's index in a container, with hysteresis so it does not flicker. */
  function indexIn(current: Session, snapshot: ContainerSnapshot): number {
    const vertical = snapshot.registration.axis === 'vertical';
    const offset = offsetOf(current, snapshot);
    const { start: draggedStart, end: draggedEnd } = spanOf(current, snapshot);
    const scrolled = vertical ? offset.y : offset.x;
    const centres = snapshot.slots.map((slot) => baselineStart(current, snapshot, slot) - scrolled + (vertical ? slot.box.height : slot.box.width) / 2);
    const count = centres.length;

    if (current.destination?.container !== snapshot) {
      const centre = (draggedStart + draggedEnd) / 2;
      return centres.filter((value) => value < centre).length;
    }

    let index = current.destination.index;
    // Moving back: a sibling before the gap moves once the leading edge passes its centre.
    while (index > 0 && draggedStart < centres[index - 1]) index--;
    if (index !== current.destination.index) return index;
    // Moving on: a sibling after the gap, displaced by the room, moves once the trailing edge passes its displaced centre.
    while (index < count && draggedEnd > centres[index] + snapshot.room) index++;
    return index;
  }

  /** A slot's start along the axis with the source's room closed, at lift scroll. */
  function baselineStart(current: Session, snapshot: ContainerSnapshot, slot: Slot): number {
    const vertical = snapshot.registration.axis === 'vertical';
    const start = vertical ? slot.box.top : slot.box.left;
    return snapshot.isHome && slot.original > current.sourceIndex ? start - snapshot.room : start;
  }

  function applyShifts(current: Session, previous: ContainerSnapshot | null): void {
    const destination = current.destination;
    const touched = new Set<ContainerSnapshot>([current.home]);
    if (previous) touched.add(previous);
    if (destination) touched.add(destination.container);

    for (const snapshot of touched) {
      const drawn = flowOrder(current, snapshot);
      snapshot.slots.forEach((slot, position) => {
        let value = 0;
        if (drawn) value = drawn.shifts[position];
        else {
          if (snapshot.isHome && slot.original > current.sourceIndex) value -= snapshot.room;
          if (destination?.container === snapshot && position >= destination.index) value += snapshot.room;
        }
        shift(current, slot.item.element, value, snapshot);
      });
    }

    const foreign = destination && !destination.container.isHome ? destination.container : null;
    if (current.reserved !== foreign) {
      current.reserved?.registration.element.style.removeProperty('--drag-reserve');
      current.reserved?.registration.element.removeAttribute('data-drag-over');
      if (foreign && !foreign.registration.still) {
        foreign.registration.element.style.setProperty('--drag-reserve', `${foreign.room}px`);
      }
      current.reserved = foreign;
    }
    for (const snapshot of current.containers) {
      const isOver = destination?.container === snapshot;
      if (isOver) snapshot.registration.element.setAttribute('data-drag-over', '');
      else snapshot.registration.element.removeAttribute('data-drag-over');
    }
  }

  /** Where the list draws its items with the lifted one where it is now, and how far each sibling stands off; null without a flow. */
  function flowOrder(current: Session, snapshot: ContainerSnapshot): { shifts: number[]; source: number | null } | null {
    const model = snapshot.flow;
    if (!model) return null;
    const order = snapshot.slots.map((slot) => model.items[slot.original]);
    const at = current.destination?.container === snapshot ? current.destination.index : -1;
    if (at >= 0) order.splice(at, 0, model.source);
    const starts = flowStarts(order, model.flow, model.origin);
    const shifts = snapshot.slots.map((slot, position) => starts[at >= 0 && position >= at ? position + 1 : position] - model.items[slot.original].start);
    return { shifts, source: at >= 0 ? starts[at] : null };
  }

  /** Moves a sibling `value` screen pixels off along the list's axis. */
  function shift(current: Session, element: HTMLElement, screen: number, snapshot: ContainerSnapshot): void {
    const axis = snapshot.registration.axis;
    const value = screen / snapshot.scale;
    const existing = current.shifts.get(element);
    const before = existing?.value ?? 0;
    if (Math.abs(before - value) < 0.01) return;
    if (!existing) {
      current.shifts.set(element, {
        value,
        scale: snapshot.scale,
        translate: element.style.translate,
        transition: element.style.transition,
      });
      const { duration, easing } = settings.outOfTheWay;
      element.style.transition = reducedMotion ? 'none' : `translate ${duration}ms ${easing}`;
    } else {
      existing.value = value;
    }
    const moved = (value - before) * snapshot.scale;
    options.onMovement?.({ element, phase: 'drag', x: axis === 'vertical' ? 0 : moved, y: axis === 'vertical' ? moved : 0 });
    element.style.translate = value === 0 ? 'none' : axis === 'vertical' ? `0 ${value}px` : `${value}px 0`;
    // How far it stands off, for what inside it stays where it is (`translate: calc(-1 * var(--drag-shift)) 0`).
    element.style.setProperty('--drag-shift', `${value}px`);
  }

  function scheduleAutoScroll(current: Session): void {
    if (current.scrollFrame !== null) return;
    const view = current.overlay.ownerDocument.defaultView;
    if (!view) return;
    const step = () => {
      if (session !== current || current.dropping) return;
      current.scrollFrame = null;
      if (autoScroll(current)) {
        updateImpact(current);
        current.scrollFrame = view.requestAnimationFrame(step);
      }
    };
    if (edgeSpeed(current, current.destination?.container.scroller ?? null, view)) {
      current.scrollFrame = view.requestAnimationFrame(step);
    }
  }

  function autoScroll(current: Session): boolean {
    const view = current.overlay.ownerDocument.defaultView;
    if (!view) return false;
    const scroller = current.destination?.container.scroller ?? null;
    const speed = edgeSpeed(current, scroller, view);
    if (!speed) return false;
    if (scroller?.element) {
      const before = { left: scroller.element.scrollLeft, top: scroller.element.scrollTop };
      scroller.element.scrollBy(speed.x, speed.y);
      if (scroller.element.scrollLeft !== before.left || scroller.element.scrollTop !== before.top) return true;
    }
    const windowSpeed = edgeSpeed(current, null, view);
    if (!windowSpeed) return false;
    const before = { x: view.scrollX, y: view.scrollY };
    view.scrollBy(windowSpeed.x, windowSpeed.y);
    return view.scrollX !== before.x || view.scrollY !== before.y;
  }

  function edgeSpeed(current: Session, scroller: Scroller | null, view: Window): { x: number; y: number } | null {
    const box = scroller?.element ? scroller.box : { left: 0, top: 0, width: view.innerWidth, height: view.innerHeight };
    const edge = settings.autoScrollEdge;
    const along = (position: number, start: number, length: number) => {
      const fromStart = position - start;
      const fromEnd = start + length - position;
      if (fromStart < edge) return -maxScrollSpeed * ((edge - Math.max(fromStart, 0)) / edge) ** 2;
      if (fromEnd < edge) return maxScrollSpeed * ((edge - Math.max(fromEnd, 0)) / edge) ** 2;
      return 0;
    };
    const x = along(current.lastX, box.left, box.width);
    const y = along(current.lastY, box.top, box.height);
    return x || y ? { x, y } : null;
  }

  async function drop(reason: SortableResult['reason']): Promise<void> {
    const current = session;
    if (!current || current.dropping) return;
    current.dropping = true;
    const view = current.overlay.ownerDocument.defaultView ?? window;
    if (current.scrollFrame !== null) view.cancelAnimationFrame(current.scrollFrame);
    if (current.impactFrame !== null) view.cancelAnimationFrame(current.impactFrame);

    // Dropped onto another item: it shrinks into it and fades.
    if (reason === 'DROP' && current.combine) {
      const { container, slot } = current.combine;
      const result: SortableResult = { ...startOf(current), destination: null, combine: combineOf(current), reason };
      const vertical = container.registration.axis === 'vertical';
      const offset = offsetOf(current, container);
      const index = container.slots.indexOf(slot);
      const along = baselineStart(current, container, slot) + (current.destination && index >= current.destination.index ? container.room : 0);
      const x = (vertical ? slot.box.left : along) - offset.x - current.liftBox.left;
      const y = (vertical ? along : slot.box.top) - offset.y - current.liftBox.top;
      const { maxDuration, easing } = settings.drop;
      if (reducedMotion) {
        finish(current, result);
        return;
      }
      current.preview.style.transition = `transform ${maxDuration}ms ${easing}, opacity ${maxDuration}ms ${easing}`;
      current.preview.style.transform = previewTransform(x, y, current.previewScale * 0.75);
      current.preview.style.opacity = '0';
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        finish(current, result);
      };
      current.preview.addEventListener('transitionend', done, { once: true });
      setTimeout(done, maxDuration + 50);
      return;
    }
    setCombine(current, null);

    // A cancel, or a drop outside every list, sends the item home.
    // A product may take an item dropped outside every list, where it lies.
    if (reason === 'DROP' && !current.destination && current.mode === 'FLUID') {
      if (options.onDropOutside?.(startOf(current), { x: current.lastX, y: current.lastY })) {
        finish(current, { ...startOf(current), destination: null, combine: null, reason: 'DROP' });
        return;
      }
    }
    const returning = reason === 'CANCEL' || !current.destination;
    if (returning) {
      const previous = current.destination?.container ?? null;
      current.destination = { container: current.home, index: current.sourceIndex };
      applyShifts(current, previous);
    }

    let finalElement: HTMLElement | null = null;
    if (reason === 'DROP' && options.prepareDrop) {
      current.preparing = true;
      // Preserve the visual positions while the adapter commits the actual final structure.
      const siblings = siblingsOf(current);
      const before = new Map(siblings.map(element => [element, element.getBoundingClientRect()]));
      const resting = restingBoxes(current, siblings);
      for (const [element, saved] of current.shifts) { element.style.transition = 'none'; element.style.translate = saved.translate; }
      const prepared = options.prepareDrop({ ...startOf(current), destination: returning ? null : locationOf(current.destination!), combine: null, reason });
      const resolved = promiseLike(prepared) ? await prepared : prepared;
      const locate = typeof resolved === 'function' ? resolved : () => resolved;
      finalElement = locate();
      if (session !== current) return;
      if (finalElement?.isConnected) {
        current.landing = { element: finalElement, visibility: finalElement.style.visibility };
        finalElement.style.visibility = 'hidden';
      }
      await new Promise<void>(resolve => (current.overlay.ownerDocument.defaultView ?? window).requestAnimationFrame(() => resolve()));
      if (session !== current) return;
      const updated = locate();
      if (updated !== finalElement) {
        if (current.landing) current.landing.element.style.visibility = current.landing.visibility;
        finalElement = updated;
        if (finalElement?.isConnected) { current.landing = { element: finalElement, visibility: finalElement.style.visibility }; finalElement.style.visibility = 'hidden'; }
      }
      for (const element of siblings) {
        if (!element.isConnected || element === finalElement) continue;
        const old = before.get(element)!, next = element.getBoundingClientRect();
        reportDrop(element, resting.get(element)!, next);
        const x = old.left - next.left, y = old.top - next.top;
        if (!reducedMotion && (x || y)) element.animate([{ translate: `${x}px ${y}px` }, { translate: (element.ownerDocument.defaultView ?? window).getComputedStyle(element).translate }], { duration: settings.outOfTheWay.duration, easing: settings.outOfTheWay.easing });
      }
    }
    const finalBox = finalElement?.isConnected ? finalElement.getBoundingClientRect() : null;
    const target = finalBox ? { x: finalBox.left - current.liftBox.left, y: finalBox.top - current.liftBox.top } : targetPosition(current);
    const from = parseTranslate(current.preview.style.transform);
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    const { minDuration, maxDuration, easing } = settings.drop;
    // Among items that hold still the page draws where it lands: the drop is there at once.
    const lands = !returning && !!current.destination?.container.registration.still;
    const duration = distance < 0.5 || reducedMotion || lands ? 0 : minDuration + (maxDuration - minDuration) * Math.min(distance / maxDropDistance, 1);

    const result: SortableResult = {
      ...startOf(current),
      destination: returning || !current.destination ? null : locationOf(current.destination),
      combine: null,
      reason,
    };

    if (duration === 0) {
      finish(current, result);
      return;
    }
    current.preview.style.transition = `transform ${duration}ms ${easing}`;
    current.preview.style.transform = previewTransform(target.x, target.y, current.previewScale);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      finish(current, result);
    };
    current.preview.addEventListener('transitionend', done, { once: true });
    setTimeout(done, duration + 50);
  }

  /** Where the preview lands, as its translation from the lift position. */
  function targetPosition(current: Session): { x: number; y: number } {
    const destination = current.destination ?? { container: current.home, index: current.sourceIndex };
    const snapshot = destination.container;
    const vertical = snapshot.registration.axis === 'vertical';
    const offset = offsetOf(current, snapshot);
    const slots = snapshot.slots;
    let start: number;
    // Where items hold still, the lifted one stands over the item at its index, as it was before the lift.
    const still = snapshot.registration.still;
    const over = still ? stillSlot(snapshot, destination.index) : undefined;

    const flowed = still ? null : flowOrder(current, snapshot)?.source ?? null;

    if (snapshot.isHome && destination.index === current.sourceIndex) {
      start = vertical ? current.liftBox.top : current.liftBox.left;
    } else if (flowed !== null) {
      // The list's flow says where the dropped order draws it.
      start = flowed;
    } else if (over) {
      start = vertical ? over.box.top : over.box.left;
    } else if (still && slots.length > 0) {
      // Past the last item: just beyond it, after the gap.
      const last = slots[slots.length - 1];
      start = (vertical ? last.box.top + last.box.height : last.box.left + last.box.width) + snapshot.gap;
    } else if (destination.index < slots.length) {
      start = baselineStart(current, snapshot, slots[destination.index]);
    } else if (slots.length > 0) {
      // After the last sibling: its size and the lifted item's room beyond its own size.
      const last = slots[slots.length - 1];
      const size = vertical ? current.liftBox.height : current.liftBox.width;
      start = baselineStart(current, snapshot, last) + (vertical ? last.box.height : last.box.width) + snapshot.room - size;
    } else {
      start = (vertical ? snapshot.box.top : snapshot.box.left) + snapshot.paddingStart + snapshot.marginStart;
    }

    // Across the axis the item keeps where it stood in its own list.
    const crossInHome = vertical ? current.liftBox.left - current.home.box.left : current.liftBox.top - current.home.box.top;
    const cross = snapshot.isHome
      ? vertical
        ? current.liftBox.left
        : current.liftBox.top
      : (vertical ? snapshot.box.left : snapshot.box.top) + crossInHome;

    // Boxes were measured at lift; take away what has scrolled since.
    const startNow = start - (vertical ? offset.y : offset.x);
    const crossNow = cross - (vertical ? offset.x : offset.y);
    return {
      x: (vertical ? crossNow : startNow) - current.liftBox.left,
      y: (vertical ? startNow : crossNow) - current.liftBox.top,
    };
  }

  /** The item at an index among items that hold still, counted as they stood with the lifted one among them. */
  function stillSlot(snapshot: ContainerSnapshot, index: number): Slot | undefined {
    if (!snapshot.isHome) return snapshot.slots[index];
    return snapshot.slots.find((slot) => slot.original === index);
  }

  function finish(current: Session, result: SortableResult): void {
    const at = announcement(current);
    // Without prepareDrop the page draws the drop in onDragEnd: once it has, nothing should have moved.
    const siblings = options.onMovement && !current.preparing ? siblingsOf(current) : [];
    const resting = restingBoxes(current, siblings);
    try {
      options.onDragEnd?.(result);
    } finally {
      cleanup(current);
    }
    if (siblings.length) {
      (current.overlay.ownerDocument.defaultView ?? window).requestAnimationFrame(() => {
        for (const element of siblings) if (element.isConnected) reportDrop(element, resting.get(element)!, element.getBoundingClientRect());
      });
    }
    if (result.combine && current.combine) announce(messages.combined(current.item.label(), current.combine.slot.item.label()));
    else if (at) announce(result.reason === 'DROP' && result.destination ? messages.dropped(at) : messages.returned(at));
    // A keyboard drag keeps the focus on the moved item, wherever it was drawn again.
    if (current.mode === 'SNAP') {
      for (const registration of items.values()) {
        if (registration.id === current.item.id && registration.element.isConnected) {
          registration.handle.focus({ preventScroll: true });
          break;
        }
      }
    }
  }

  /** Every item that stayed in a list the lifted item could reach. */
  function siblingsOf(current: Session): HTMLElement[] {
    return [...new Set(current.containers.flatMap((snapshot) => snapshot.slots.map((slot) => slot.item.element)))].filter((element) => element.isConnected);
  }

  function restingBoxes(current: Session, elements: HTMLElement[]): Map<HTMLElement, Box> {
    return new Map(elements.map((element) => [element, restingBox(element, current.shifts.get(element)?.scale ?? 1)]));
  }

  /** A sibling drawn more than a pixel from where it had made room has moved a second time. */
  function reportDrop(element: HTMLElement, resting: Box, next: Box): void {
    const x = next.left - resting.left, y = next.top - resting.top;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) options.onMovement?.({ element, phase: 'drop', x, y });
  }

  function cleanup(current: Session): void {
    const element = current.item.element;
    const view = current.overlay.ownerDocument.defaultView ?? window;
    for (const [shifted, saved] of current.shifts) {
      shifted.style.transition = 'none';
      shifted.style.translate = saved.translate;
      shifted.style.removeProperty('--drag-shift');
    }
    const restored = [...current.shifts];
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => {
        for (const [shifted, saved] of restored) shifted.style.transition = saved.transition;
      });
    });
    if (current.landing) current.landing.element.style.visibility = current.landing.visibility;
    element.style.visibility = current.sourceVisibility;
    element.removeAttribute('data-drag-source');
    current.combine?.slot.item.element.removeAttribute('data-drag-combine');
    current.reserved?.registration.element.style.removeProperty('--drag-reserve');
    for (const snapshot of current.containers) snapshot.registration.element.removeAttribute('data-drag-over');
    current.overlay.remove();
    element.ownerDocument.documentElement.removeAttribute('data-drag-active');
    element.ownerDocument.documentElement.removeAttribute('data-drag-outside');
    session = null;
    removeWindowListeners();
  }

  function closestContainer(registration: ItemRegistration): ContainerRegistration | null {
    let element = registration.element.parentElement;
    while (element) {
      const candidate = containers.get(element);
      if (candidate && candidate.type === registration.type) return candidate;
      element = element.parentElement;
    }
    return null;
  }

  function itemsOf(registration: ContainerRegistration): ItemRegistration[] {
    const members: ItemRegistration[] = [];
    for (const candidate of items.values()) {
      if (candidate.type !== registration.type || !candidate.element.isConnected) continue;
      if (closestContainer(candidate) === registration) members.push(candidate);
    }
    return members.sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  }

  function startOf(current: Session): SortableStart {
    return {
      draggableId: current.item.id,
      type: current.item.type,
      source: { droppableId: current.home.registration.id, index: current.sourceIndex },
      mode: current.mode,
    };
  }

  function updateOf(current: Session): SortableUpdate {
    return {
      ...startOf(current),
      destination: current.destination && !current.combine ? locationOf(current.destination) : null,
      combine: combineOf(current),
    };
  }

  function combineOf(current: Session): SortableCombine | null {
    return current.combine
      ? { draggableId: current.combine.slot.item.id, droppableId: current.combine.container.registration.id }
      : null;
  }

  /** The item's registration now: the page may have drawn it again before the lift. */
  function registrationFor(lifted: ItemRegistration): ItemRegistration | null {
    if (lifted.element.isConnected && items.get(lifted.element) === lifted) return lifted;
    for (const candidate of items.values()) {
      if (candidate.id === lifted.id && candidate.type === lifted.type && candidate.element.isConnected) return candidate;
    }
    return null;
  }

  function locationOf(destination: NonNullable<Session['destination']>): SortableLocation {
    return { droppableId: destination.container.registration.id, index: destination.index };
  }

  return {
    container,
    item,
    isDragging: () => session !== null,
    cancel: () => {
      clearPending();
      if (session && !session.dropping) void drop('CANCEL');
    },
    destroy: () => {
      destroyed = true;
      clearPending();
      // A prepared layout may destroy its old editor while replacing columns.
      // The landing overlay owns its lifetime until the already-started handoff finishes.
      if (session && !session.preparing) cleanup(session);
      for (const { view, instructions, liveRegion } of documents.values()) {
        view.removeEventListener('pointerdown', onPointerDown, true);
        view.removeEventListener('keydown', onHandleKeyDown, true);
        instructions.remove(); liveRegion.remove();
      }
      documents.clear();
      containers.clear();
      items.clear();
      handles.clear();
    },
  };
}

function promiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === 'function';
}

// Structural element checks work when registration and events belong to another same-origin window.
function eventElement(target: EventTarget | null): Element | null {
  return target && (target as Node).nodeType === 1 ? target as Element : null;
}

let instanceCount = 0;

const arrows = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
} as const;

function centreOf(box: Box): { x: number; y: number } {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Text only a screen reader reads. */
function hiddenText(document: Document, id: string): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
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

function labelOf(element: HTMLElement, handle: HTMLElement): string {
  const named = element.getAttribute('aria-label') ?? handle.getAttribute('aria-label');
  const text = named ?? element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return text.length > 60 ? `${text.slice(0, 59)}…` : text || 'Item';
}

/** How much larger than its own pixels an element is drawn on the screen. */
function scaleOf(element: HTMLElement, box: Box): number {
  if (element.offsetWidth <= 0 || box.width <= 0) return 1;
  const scale = box.width / element.offsetWidth;
  // offsetWidth is rounded to a whole pixel: a difference that small is not a scale.
  return Math.abs(scale - 1) < 0.02 ? 1 : scale;
}

function previewTransform(x: number, y: number, scale: number): string {
  return `translate3d(${x}px, ${y}px, 0)${scale === 1 ? '' : ` scale(${scale})`}`;
}

function measure(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function intersect(a: Box, b: Box): Box {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
}

/** A list's flow at lift, when the model draws its members where the page drew them. */
function flowOf(style: CSSStyleDeclaration, box: Box, scale: number, vertical: boolean, items: FlowItem[], source: FlowItem): ContainerSnapshot['flow'] {
  const collapse = vertical && /^(block|flow-root|list-item)$/.test(style.display);
  const gap = collapse ? 0 : parsePixels(vertical ? style.rowGap : style.columnGap) * scale;
  const origin = (vertical ? box.top : box.left)
    + (parsePixels(vertical ? style.borderTopWidth : style.borderLeftWidth) + parsePixels(vertical ? style.paddingTop : style.paddingLeft)) * scale;
  const first = items[0];
  // A first margin that stands outside the list: it has passed through the list's edge.
  const through = collapse && !!first && first.marginStart > 0.5 && Math.abs(first.start - origin) <= 1;
  const flow = { gap, collapse, through };
  return flowHolds(items, flow, origin) ? { items, source, flow, origin } : null;
}

/** Where an element would stand without the part of its `translate` still on its way: how its slide ends. */
function restingBox(element: HTMLElement, scale: number): Box {
  const box = measure(element);
  const pair = (value: string) => {
    if (!value || value === 'none') return { x: 0, y: 0 };
    const [x = '0', y = '0'] = value.trim().split(/\s+/);
    return { x: parsePixels(x), y: parsePixels(y) };
  };
  const target = pair(element.style.translate);
  const now = pair((element.ownerDocument.defaultView ?? window).getComputedStyle(element).translate);
  return { ...box, left: box.left + (target.x - now.x) * scale, top: box.top + (target.y - now.y) * scale };
}

function parsePixels(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function parseTranslate(transform: string): { x: number; y: number } {
  const match = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  let parent = element.parentElement;
  while (parent && parent !== element.ownerDocument.body && parent !== element.ownerDocument.documentElement) {
    const style = view?.getComputedStyle(parent);
    const scrolls = (value: string | undefined) => value === 'auto' || value === 'scroll' || value === 'overlay';
    if (style && (scrolls(style.overflowY) || scrolls(style.overflowX))) return parent;
    parent = parent.parentElement;
  }
  return null;
}

function cloneForPreview(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  // The overlay no longer has the source's ancestors. Snapshot the resolved
  // appearance at lift, including descendants whose selectors depend on them.
  const view = source.ownerDocument.defaultView!;
  const originals = [source, ...source.querySelectorAll<HTMLElement | SVGElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>('*')];
  originals.forEach((element, index) => {
    const target = copies[index];
    if (!target.style) return;
    const style = view.getComputedStyle(element);
    for (const property of Array.from(style)) {
      target.style.setProperty(property, style.getPropertyValue(property), 'important');
    }
    target.removeAttribute('contenteditable');
  });
  // Logical insets copied as !important override the overlay's physical left/top.
  // Keep descendant appearance, but let the drag engine own the root's position.
  for (const property of ['inset', 'inset-block', 'inset-inline', 'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end', 'top', 'right', 'bottom', 'left', 'margin-block', 'margin-inline', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end']) clone.style.removeProperty(property);
  clone.removeAttribute('id');
  clone.removeAttribute('data-drag-source');
  clone.style.visibility = 'visible';
  for (const element of clone.querySelectorAll('[id]')) element.removeAttribute('id');
  for (const element of clone.querySelectorAll('[data-drag-handle]')) element.removeAttribute('data-drag-handle');
  clone.removeAttribute('data-drag-handle');
  return clone;
}
