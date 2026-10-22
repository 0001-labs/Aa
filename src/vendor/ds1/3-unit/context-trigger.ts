import "./styles/context-trigger.css";

/** A touch held this long opens a context menu: half a second, as tooltips, Ezo's board and iOS wait. */
export const LONG_PRESS = 500;

export type ContextGesture = MouseEvent | PointerEvent | KeyboardEvent;
export type ContextPoint = { x: number; y: number };
type Options = {
  /** Return the actual row when one container delegates many controls. */
  resolve?: (event: ContextGesture) => HTMLElement | null;
  touch?: boolean;
  /** Titles can suppress native text selection/callout while keeping scrolling. */
  selection?: boolean;
  aria?: boolean;
};

/** The same native context gesture for Menu and other shared action surfaces.
 * Returning false leaves the gesture to the browser or an enclosing control. */
export function bindContextMenuTrigger(
  trigger: HTMLElement,
  open: (point: ContextPoint, control: HTMLElement, event: ContextGesture) => void | false,
  { resolve = () => trigger, touch = true, selection = false, aria = true }: Options = {},
) {
  const doc = trigger.ownerDocument;
  const previousAria = trigger.getAttribute("aria-haspopup");
  const hadClass = trigger.classList.contains("ds-context-trigger");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let point: ContextPoint | undefined;
  let suppressed: HTMLElement | null = null;
  let release: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  if (aria) trigger.setAttribute("aria-haspopup", "menu");
  if (selection) trigger.classList.add("ds-context-trigger");
  const enabled = (control: HTMLElement) => control.isConnected &&
    !control.matches(':disabled, [disabled], [aria-disabled="true"], [data-disabled]') && !control.closest('[hidden], [inert]');
  const clearSuppression = () => {
    clearTimeout(release); suppressed = null;
    doc.removeEventListener("click", consumeClick, true);
  };
  const consumeClick = (event: MouseEvent) => {
    const consume = suppressed && event.composedPath().includes(suppressed);
    clearSuppression();
    if (consume) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const arm = (control: HTMLElement) => {
    clearSuppression(); suppressed = control;
    doc.addEventListener("click", consumeClick, true);
    release = setTimeout(clearSuppression, 1000);
  };
  const cancel = () => {
    clearTimeout(timer); timer = undefined; point = undefined;
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", cancel);
    doc.removeEventListener("pointercancel", cancel);
    if (suppressed) { clearTimeout(release); release = setTimeout(clearSuppression, 1000); }
  };
  const context = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    const control = resolve(event); if (!control || !enabled(control)) return;
    cancel();
    if (suppressed === control) { event.preventDefault(); return; }
    if (open({ x: event.clientX, y: event.clientY }, control, event) === false) return;
    event.preventDefault();
    if (selection && event.button === 0) arm(control);
  };
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
        (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))) return;
    const control = resolve(event); if (!control || !enabled(control)) return;
    const rect = control.getBoundingClientRect();
    if (open({ x: rect.left, y: rect.bottom }, control, event) === false) return;
    event.preventDefault(); event.stopPropagation();
  };
  const move = (event: PointerEvent) => {
    if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 10) cancel();
  };
  const press = (event: PointerEvent) => {
    if (!touch || event.defaultPrevented || event.pointerType !== "touch" || event.button !== 0) return;
    const control = resolve(event); if (!control || !enabled(control)) return;
    cancel(); clearSuppression();
    const at = { x: event.clientX, y: event.clientY }; point = at;
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", cancel);
    doc.addEventListener("pointercancel", cancel);
    timer = setTimeout(() => {
      timer = undefined; point = undefined;
      if (disposed || !enabled(control) || !trigger.contains(control)) { cancel(); return; }
      if (open(at, control, event) !== false) arm(control);
    }, LONG_PRESS);
  };
  trigger.addEventListener("contextmenu", context);
  trigger.addEventListener("keydown", key);
  trigger.addEventListener("pointerdown", press);
  return {
    cancel,
    dispose() {
      disposed = true; cancel(); clearSuppression();
      trigger.removeEventListener("contextmenu", context);
      trigger.removeEventListener("keydown", key);
      trigger.removeEventListener("pointerdown", press);
      if (aria) {
        if (previousAria === null) trigger.removeAttribute("aria-haspopup"); else trigger.setAttribute("aria-haspopup", previousAria);
      }
      if (selection && !hadClass) trigger.classList.remove("ds-context-trigger");
    },
  };
}
