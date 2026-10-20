/**
 * One tooltip for a whole page: any element with `data-tooltip="…"` shows its text in Design system 1's tooltip,
 * a small label: 16px high, black with white text (white on black in dark mode), 4px corners, 14px regular, 2.5px at
 * the sides, two pixels above the element, shown at once. `data-tooltip-colour` gives it a colour of its own. The same look as `<ds-tooltip>`, without wrapping each element in a component, so a table of
 * hundreds of cells can carry one each. Long text wraps at 320px on 20px lines.
 * Elements inside a component's open shadow root are found as well (`ds-sidebar`
 * marks its cut-short labels this way); the description link is set only on
 * elements in the document itself, since an id cannot reach across a shadow root.
 *
 * It shows on hover with a mouse or pen, and on focus only when the focus is
 * the keyboard's (`:focus-visible`), so a menu that moves focus into its first
 * row does not raise one. A showing tooltip follows its text as
 * `data-tooltip` changes. On touch, a long press shows it, and a tap does on
 * an element marked `data-tooltip-press`; it goes at the next touch or after
 * a moment. `showTooltip(element)` and `hideTooltip()` show and hide it from
 * code.
 */

/** How long a tooltip raised by touch stays, in milliseconds. */
export const TOUCH_TOOLTIP_DURATION = 2000;
/** How long a finger rests before a long press shows the tooltip, in milliseconds. */
export const LONG_PRESS_DELAY = 500;
/** How far a finger may move, in pixels, before a press is a scroll instead. */
const PRESS_SLOP = 10;

export type ShowTooltipOptions = {
  /** Hide it after this many milliseconds; it stays until hidden by default. */
  duration?: number;
};

type Controller = {
  show(target: HTMLElement, options?: ShowTooltipOptions): void;
  hide(): void;
};

// Shared through the window, so two copies of this module on a page share one tooltip.
const KEY = Symbol.for("ds-one:tooltips");
type TooltipWindow = Window & { [KEY]?: Controller };

function controller(): Controller | undefined {
  return typeof window === "undefined" ? undefined : (window as TooltipWindow)[KEY];
}

/** Show an element's `data-tooltip` now, as a press would: it stays until `hideTooltip()`, or for `duration`. */
export function showTooltip(target: HTMLElement, options?: ShowTooltipOptions): void {
  initTooltips();
  controller()?.show(target, options);
}

/** Hide the tooltip, however it was shown. */
export function hideTooltip(): void {
  controller()?.hide();
}

export function initTooltips(): void {
  if (typeof document === "undefined" || !document.body) return;
  const root = document.documentElement;
  if (root.hasAttribute("data-ds-tooltips-ready")) return;
  root.setAttribute("data-ds-tooltips-ready", "");

  const bubble = document.createElement("div");
  bubble.setAttribute("data-ds-tooltip", "");
  bubble.setAttribute("role", "tooltip");
  bubble.id = "ds-tooltip";
  const style = document.createElement("style");
  style.textContent = `
    [data-ds-tooltip] {
      position: fixed; z-index: 2147483646; top: 0; left: 0; pointer-events: none; visibility: hidden;
      max-width: 320px; min-height: 16px; box-sizing: border-box; padding: 0 2.5px; border-radius: 4px;
      background: var(--ds-tooltip-background, light-dark(#000, #fff));
      color: var(--ds-tooltip-color, light-dark(#fff, #000));
      font-family: var(--typeface-regular, var(--font-regular, system-ui)), sans-serif;
      font-size: 14px; font-weight: 400; line-height: 16px; letter-spacing: 0; white-space: nowrap;
    }
    [data-ds-tooltip].is-wide { white-space: normal; }
    [data-ds-tooltip].is-visible { visibility: visible; }
    @media print { [data-ds-tooltip] { display: none; } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(bubble);

  let current: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const place = (target: HTMLElement) => {
    const box = target.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const left = Math.min(Math.max(4, box.left + box.width / 2 - width / 2), window.innerWidth - width - 4);
    // Above the element, two pixels clear; below it when there is no room above.
    const top = box.top - height - 2 >= 4 ? box.top - height - 2 : box.bottom + 2;
    bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  /** Draws the target's text and colour; false when it has no text. */
  const draw = (target: HTMLElement): boolean => {
    const text = target.dataset.tooltip;
    if (!text) return false;
    bubble.textContent = text;
    // A colour of its own, such as the accent: data-tooltip-colour="#f5aad1", lettered in the ink.
    const colour = target.dataset.tooltipColour;
    if (colour) {
      bubble.style.setProperty("--ds-tooltip-background", colour);
      bubble.style.setProperty("--ds-tooltip-color", "#1e1e1e");
    } else {
      bubble.style.removeProperty("--ds-tooltip-background");
      bubble.style.removeProperty("--ds-tooltip-color");
    }
    // One line; a long text wraps at 320px instead of running off the page.
    bubble.classList.remove("is-wide");
    if (bubble.scrollWidth > 320) bubble.classList.add("is-wide");
    place(target);
    return true;
  };
  // A showing tooltip follows its element's text and colour, and goes when the text does.
  const watcher = typeof MutationObserver === "function"
    ? new MutationObserver(() => { if (current && (!current.isConnected || !draw(current))) hide(); })
    : null;
  const show = (target: HTMLElement, options: ShowTooltipOptions = {}) => {
    clearTimeout(timer);
    timer = undefined;
    if (current && current !== target) hide();
    if (!draw(target)) return;
    current = target;
    if (target.getRootNode() === document) target.setAttribute("aria-describedby", bubble.id);
    watcher?.disconnect();
    watcher?.observe(target, { attributes: true, attributeFilter: ["data-tooltip", "data-tooltip-colour"] });
    bubble.classList.add("is-visible");
    if (options.duration !== undefined && options.duration >= 0) timer = setTimeout(hide, options.duration);
  };
  function hide() {
    clearTimeout(timer);
    timer = undefined;
    watcher?.disconnect();
    current?.removeAttribute("aria-describedby");
    current = null;
    bubble.classList.remove("is-visible");
  }
  (window as TooltipWindow)[KEY] = { show, hide };

  // The composed path crosses open shadow roots, where `closest` stops at the host.
  const find = (event: Event): HTMLElement | null => {
    for (const node of event.composedPath()) {
      if (node === document || node === window) break;
      if ((node as Element).hasAttribute?.("data-tooltip")) return node as HTMLElement;
    }
    return (event.target as Element | null)?.closest?.<HTMLElement>("[data-tooltip]") ?? null;
  };
  const keyboardFocus = (event: Event): boolean => {
    const focused = event.composedPath()[0] as Element | undefined;
    try {
      return Boolean(focused?.matches?.(":focus-visible"));
    } catch {
      // A browser without :focus-visible cannot tell, and a pointer's focus must not raise one.
      return false;
    }
  };
  const touch = (event: Event) => (event as PointerEvent).pointerType === "touch";

  document.addEventListener("pointerover", (event) => {
    // A finger has no hover: on touch a press shows the tooltip.
    if (touch(event)) return;
    const target = find(event);
    if (target !== current) target ? show(target) : hide();
  }, { passive: true });
  document.addEventListener("pointerleave", (event) => { if (!touch(event)) hide(); }, { passive: true });
  document.addEventListener("focusin", (event) => {
    const target = find(event);
    if (target && keyboardFocus(event)) show(target);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, { passive: true, capture: true });

  // Touch: a long press shows the label, a tap does where the element asks for it, and the next touch dismisses it.
  let press: { target: HTMLElement; id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let swallowClick = false;
  const release = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  document.addEventListener("pointerdown", (event) => {
    swallowClick = false;
    if (!touch(event)) return;
    release();
    hide();
    const target = find(event);
    if (!target?.dataset.tooltip) return;
    const pointer = event as PointerEvent;
    press = {
      target,
      id: pointer.pointerId,
      x: pointer.clientX,
      y: pointer.clientY,
      timer: setTimeout(() => {
        if (!press) return;
        // The press was for the label: the click its release makes is not the element's.
        swallowClick = true;
        show(press.target, { duration: TOUCH_TOOLTIP_DURATION });
        press = null;
      }, LONG_PRESS_DELAY),
    };
  }, { passive: true, capture: true });
  document.addEventListener("pointermove", (event) => {
    const pointer = event as PointerEvent;
    if (press && pointer.pointerId === press.id && Math.hypot(pointer.clientX - press.x, pointer.clientY - press.y) > PRESS_SLOP) release();
  }, { passive: true, capture: true });
  document.addEventListener("pointerup", (event) => {
    if (!press || (event as PointerEvent).pointerId !== press.id) return;
    const { target } = press;
    release();
    if (target.hasAttribute("data-tooltip-press")) show(target, { duration: TOUCH_TOOLTIP_DURATION });
  }, { passive: true, capture: true });
  document.addEventListener("pointercancel", release, { passive: true, capture: true });
  document.addEventListener("click", (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTooltips, { once: true });
  else initTooltips();
}
