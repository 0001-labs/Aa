/**
 * A drawer: parts of a page folded away on a narrow screen and opened over it
 * from a menu button. Plain TypeScript with no Lit and no framework, so a page
 * of native HTML uses it as the elements do.
 *
 * `attachOverlay()` ties a toggle button to the parts it folds away (a
 * header's navigation and actions, a page's navigation). Opening moves them
 * into a native `<dialog class="ds-overlay ds-overlay--screen">` laid over the screen
 * (1-root/overlay.css draws it), shown modally so the rest of the page is
 * inert, with a close button where the toggle stood. While it is open:
 *
 * - Tab and Shift+Tab go round the panel's controls and never leave it;
 * - Escape, the close button, a link in the panel and the toggle going out of
 *   sight (the screen widened) close it;
 * - the page behind holds its scroll, and gets it back as it was.
 *
 * Closing puts every part back where it was and returns focus to the toggle.
 * The toggle carries `aria-expanded` and `aria-controls`; its accessible name
 * stays the same (Menu) open or closed.
 *
 * @example
 * const drawer = attachOverlay({ toggle, content: [nav, actions], closeLabel: "Close" });
 * drawer.open();
 */

export interface DrawerOptions {
  /** The button that opens the drawer, and stands for it while it is closed. */
  toggle: HTMLElement;
  /** What the drawer holds while it is open: moved into the panel in this order and back on closing. */
  content: readonly Element[] | (() => readonly Element[]);
  /**
   * The panel to open, with its close button marked `.ds-overlay__close`. A
   * `<dialog class="ds-overlay ds-overlay--screen">` is made beside the toggle when none
   * is given, its close button a copy of the toggle.
   */
  panel?: HTMLDialogElement;
  /** Where a new panel goes: after the toggle by default. */
  container?: Element | ShadowRoot;
  /** The panel's accessible name: the toggle's own name by default. */
  label?: string;
  /** The close button's accessible name. "Close" by default. */
  closeLabel?: string;
  /** Close when a link in the panel is followed. On by default. */
  closeOnLink?: boolean;
  /** Called after the drawer opens or closes. */
  onToggle?: (open: boolean) => void;
}

export interface Drawer {
  readonly panel: HTMLDialogElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Close it, take the panel away if it was made here, and stop listening. */
  destroy(): void;
}

const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';

/** The drawers open on each document, the last opened last: only it answers the keys. */
const openDrawers = new WeakMap<Document, object[]>();

/** The drawer that holds each document's scroll, so two drawers never fight over it. */
const scrollHolders = new WeakMap<Document, { owners: Set<object>; overflow: string; overscroll: string; x: number; y: number }>();

function holdScroll(document: Document, owner: object): void {
  let held = scrollHolders.get(document);
  if (!held) {
    const root = document.documentElement.style;
    held = { owners: new Set(), overflow: root.overflow, overscroll: root.overscrollBehavior, x: document.defaultView?.scrollX ?? 0, y: document.defaultView?.scrollY ?? 0 };
    scrollHolders.set(document, held);
    root.overflow = "hidden";
    root.overscrollBehavior = "none";
  }
  held.owners.add(owner);
}

function releaseScroll(document: Document, owner: object): void {
  const held = scrollHolders.get(document);
  if (!held || !held.owners.delete(owner) || held.owners.size) return;
  const root = document.documentElement.style;
  root.overflow = held.overflow;
  root.overscrollBehavior = held.overscroll;
  scrollHolders.delete(document);
  const view = document.defaultView;
  if (view && (view.scrollX !== held.x || view.scrollY !== held.y)) view.scrollTo(held.x, held.y);
}

/** The element that has focus, inside open shadow roots too. */
export function deepActiveElement(document: Document): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function shown(element: Element): boolean {
  if (element.closest("[hidden], [inert]")) return false;
  const check = (element as Element & { checkVisibility?: (options?: object) => boolean }).checkVisibility;
  return typeof check === "function" ? check.call(element, { visibilityProperty: true }) : true;
}

/**
 * The controls Tab reaches inside a root, in order: through open shadow roots
 * and the elements a slot shows.
 */
export function tabbables(root: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (node: Element) => {
    if (node instanceof HTMLElement && node.matches(FOCUSABLE) && node.tabIndex >= 0 && !(node as HTMLButtonElement).disabled && shown(node)) found.push(node);
    if (node.shadowRoot) for (const child of node.shadowRoot.children) visit(child);
    const children = node instanceof HTMLSlotElement ? node.assignedElements({ flatten: true }) : [...node.children];
    for (const child of children) visit(child);
  };
  for (const child of root.children) visit(child);
  return found;
}

export function attachOverlay(options: DrawerOptions): Drawer {
  const { toggle } = options;
  const document = toggle.ownerDocument;
  const made = !options.panel;
  const panel = options.panel ?? document.createElement("dialog");
  let placeholders: [Element, Comment][] = [];
  let open = false;
  /** The button in the panel that closes it: made here, or the panel's own `.ds-overlay__close`. */
  let closeButton: HTMLElement | null = options.panel?.querySelector<HTMLElement>(".ds-overlay__close") ?? null;

  if (made) {
    panel.className = "ds-overlay ds-overlay--screen";
    const bar = document.createElement("div");
    bar.className = "ds-overlay__bar";
    // The close button is a copy of the toggle, so it shows the same icons
    // (the second one, close) in the same place.
    closeButton = toggle.cloneNode(true) as HTMLElement;
    closeButton.removeAttribute("id");
    closeButton.removeAttribute("aria-controls");
    closeButton.removeAttribute("aria-expanded");
    closeButton.removeAttribute("aria-haspopup");
    closeButton.classList.remove("ds-overlay__toggle", "ds-header__toggle");
    closeButton.classList.add("ds-overlay__close");
    closeButton.setAttribute("aria-label", options.closeLabel || "Close");
    if (closeButton instanceof HTMLButtonElement) closeButton.type = "button";
    bar.append(closeButton);
    panel.append(bar);
    if (options.container) options.container.append(panel);
    else toggle.after(panel);
  }
  panel.classList.add("ds-overlay--screen");
  const label = () => options.label || toggle.getAttribute("aria-label") || toggle.textContent?.trim() || "";
  if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby") && label()) panel.setAttribute("aria-label", label());
  if (!panel.id) panel.id = `ds-overlay-${Math.random().toString(36).slice(2, 10)}`;
  if (!toggle.hasAttribute("aria-controls")) toggle.setAttribute("aria-controls", panel.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.classList.add("ds-overlay__toggle");

  const parts = () => (typeof options.content === "function" ? options.content() : options.content).filter(Boolean);

  function show() {
    if (open || !toggle.isConnected) return;
    open = true;
    const content = parts();
    placeholders = content.map(element => {
      const mark = document.createComment("ds-overlay");
      element.before(mark);
      return [element, mark];
    });
    panel.append(...content);
    holdScroll(document, drawer);
    const stack = openDrawers.get(document) ?? [];
    openDrawers.set(document, [...stack.filter(entry => entry !== drawer), drawer]);
    toggle.setAttribute("aria-expanded", "true");
    if (typeof panel.showModal === "function" && panel.isConnected) {
      try { panel.showModal(); } catch { panel.setAttribute("open", ""); }
    } else panel.setAttribute("open", "");
    // The panel's first control takes focus: the close button.
    (closeButton ?? tabbables(panel)[0])?.focus({ preventScroll: true });
    view?.addEventListener("resize", onResize);
    // Bubbling, so a menu or dialog inside the panel takes its own Escape first.
    document.addEventListener("keydown", onKey);
    options.onToggle?.(true);
  }

  function hide() {
    if (!open) return;
    open = false;
    if (panel.open) panel.close();
    panel.removeAttribute("open");
    for (const [element, mark] of placeholders) {
      if (mark.isConnected) mark.replaceWith(element);
      else mark.remove();
    }
    placeholders = [];
    releaseScroll(document, drawer);
    openDrawers.set(document, (openDrawers.get(document) ?? []).filter(entry => entry !== drawer));
    toggle.setAttribute("aria-expanded", "false");
    view?.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);
    if (toggle.isConnected && shown(toggle)) toggle.focus({ preventScroll: true });
    options.onToggle?.(false);
  }

  const view = document.defaultView;
  const onToggleClick = () => (open ? hide() : show());
  const onResize = () => { if (open && !shown(toggle)) hide(); };
  const onKey = (event: KeyboardEvent) => {
    if (!open || event.defaultPrevented || openDrawers.get(document)?.slice(-1)[0] !== drawer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = tabbables(panel);
    if (!controls.length) { event.preventDefault(); return; }
    const active = deepActiveElement(document);
    const first = controls[0]!, last = controls[controls.length - 1]!;
    const index = active ? controls.indexOf(active as HTMLElement) : -1;
    if (event.shiftKey && index <= 0) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (index === -1 || active === last)) { event.preventDefault(); first.focus(); }
  };
  // Escape on a modal dialog is its cancel: close through the drawer so the parts go back.
  const onCancel = (event: Event) => { event.preventDefault(); hide(); };
  const onNativeClose = () => { if (open) hide(); };
  const onPanelClick = (event: MouseEvent) => {
    const path = event.composedPath();
    if (closeButton && path.includes(closeButton)) { hide(); return; }
    // A link closes it even when a router takes the click (and prevents its default).
    if (options.closeOnLink === false) return;
    // Only what stands inside the panel: the path up to it.
    if (path.slice(0, path.indexOf(panel)).some(node => node instanceof Element && node.matches("a[href]"))) hide();
  };

  toggle.addEventListener("click", onToggleClick);
  panel.addEventListener("cancel", onCancel);
  panel.addEventListener("close", onNativeClose);
  panel.addEventListener("click", onPanelClick);

  const drawer: Drawer = {
    panel,
    get isOpen() { return open; },
    open: show,
    close: hide,
    toggle: onToggleClick,
    destroy() {
      hide();
      toggle.removeEventListener("click", onToggleClick);
      panel.removeEventListener("cancel", onCancel);
      panel.removeEventListener("close", onNativeClose);
      panel.removeEventListener("click", onPanelClick);
      toggle.removeAttribute("aria-expanded");
      toggle.removeAttribute("aria-haspopup");
      if (made) panel.remove();
    },
  };
  return drawer;
}
