import { createLayoutInspector } from './layout-inspector';
import { initGridFit } from './grid-fit';

/** The presses of one key, each within 800ms of the last, that toggle an overlay. */
export const GRID_PRESSES = 5;

/**
 * Five presses of G toggle the grid and five of L inspect the layout, on every
 * page that loads this module and for everyone who reads it: never put them
 * behind a user, an owner or a development check. Escape hides both. Presses
 * typed into a field, with a modifier or held down never count, and any other
 * key starts the count again.
 */
export function initGridShortcut(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.hasAttribute("data-ds-grid-ready")) return;
  root.setAttribute("data-ds-grid-ready", "");
  root.setAttribute("data-design-system", "1");
  initGridFit();

  const overlay = document.createElement("div");
  overlay.setAttribute("data-ds-grid-overlay", "");
  overlay.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
  const shadow = overlay.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host {
      all: initial !important;
      display: block !important;
      color-scheme: inherit !important;
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: var(--ds-grid-z-index, 2147483647) !important;
    }
    :host([hidden]) { display: none !important; }
    .grid {
      position: absolute;
      inset: 0;
      --cell: var(--ds-grid-unit, calc(var(--unit, 20px) * var(--sf, 1)));
      --line: var(--ds-grid-color, light-dark(#61528440, #e0caff50));
      background-image:
        linear-gradient(to right, var(--line) 1px, transparent 1px),
        linear-gradient(to bottom, var(--line) 1px, transparent 1px);
      background-size: var(--cell) var(--cell);
      background-position:
        calc(var(--ds-grid-origin-x, 0px) - var(--ds-grid-scroll-x, 0px) - var(--ds-grid-line-offset, 0px))
        calc(var(--ds-grid-origin-y, 0px) - var(--ds-grid-scroll-y, 0px) - var(--ds-grid-line-offset, 0px));
    }
    @media print { :host { display: none !important; } }
  </style><div class="grid"></div>`;
  document.body.appendChild(overlay);
  const layout = createLayoutInspector();

  const updatePosition = () => {
    overlay.style.setProperty("--ds-grid-scroll-x", `${window.scrollX}px`);
    overlay.style.setProperty("--ds-grid-scroll-y", `${window.scrollY}px`);
  };
  const setVisible = (visible: boolean) => {
    overlay.hidden = !visible;
    root.toggleAttribute("data-ds-grid-visible", visible);
    if (visible) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, { passive: true });
    } else {
      window.removeEventListener("scroll", updatePosition);
    }
    window.dispatchEvent(new CustomEvent("design-system-grid-changed", { detail: { visible } }));
  };

  window.addEventListener("design-system-toggle-grid", () => setVisible(overlay.hidden !== false));
  window.addEventListener("design-system-toggle-layout", () => layout.toggle());

  const preview = new URLSearchParams(window.location.search);
  if (preview.get('grid') === '1') setVisible(true);
  if (preview.get('layout') === '1') layout.toggle();

  // A bundler's development flag (Vite's import.meta.env.DEV); absent elsewhere.
  if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
    const mobile = window.matchMedia('(max-width: 768px)');
    let taps = 0;
    let lastTap = 0;
    let touch: { id: number; x: number; y: number; time: number } | null = null;
    const resetTaps = () => { taps = 0; touch = null; };
    window.addEventListener('pointerdown', (event: PointerEvent) => {
      if (!mobile.matches || event.pointerType !== 'touch' || !event.isPrimary) {
        resetTaps();
        return;
      }
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    }, { passive: true, capture: true });
    window.addEventListener('pointerup', (event: PointerEvent) => {
      if (!touch || event.pointerId !== touch.id) return;
      const now = performance.now();
      const moved = Math.hypot(event.clientX - touch.x, event.clientY - touch.y);
      if (moved > 12 || now - touch.time > 350) {
        resetTaps();
        return;
      }
      touch = null;
      taps = now - lastTap <= 500 ? taps + 1 : 1;
      lastTap = now;
      if (taps === 3) {
        resetTaps();
        setVisible(false);
        layout.hide();
      }
    }, { passive: true, capture: true });
    window.addEventListener('pointercancel', resetTaps, { passive: true });
    window.addEventListener('blur', resetTaps);
    mobile.addEventListener('change', resetTaps);
  }

  let presses = 0;
  let lastPress = 0;
  let lastKey = '';
  const reset = () => { presses = 0; lastKey = ''; };
  window.addEventListener("blur", reset);
  window.addEventListener("keydown", (event: KeyboardEvent) => {
    const editing = document.designMode === "on" || event.composedPath().some((target) =>
      target instanceof HTMLElement && (
        target.isContentEditable || target.matches('input, textarea, select, [role="textbox"], [role="combobox"]')
      )
    );
    if (editing || event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      reset();
      return;
    }
    if (event.key === "Escape") { setVisible(false); layout.hide(); }
    const key = event.key.toLowerCase();
    if (key !== 'g' && key !== 'l') {
      reset();
      return;
    }
    const now = performance.now();
    presses = key === lastKey && now - lastPress <= 800 ? presses + 1 : 1;
    lastKey = key;
    lastPress = now;
    if (presses === GRID_PRESSES) {
      reset();
      if (key === 'g') setVisible(overlay.hidden !== false);
      else layout.toggle();
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGridShortcut, { once: true });
  } else {
    initGridShortcut();
  }
}
