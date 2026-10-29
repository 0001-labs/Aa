import { anchoredPanel, mobilePanel, panelViewport } from "../0-face/anchored-panel";
import { LitElement, css, html, unsafeCSS } from "lit";
import { define } from "../0-face/define";
import "../2-core/ds-button";
import "../2-core/ds-icon";
import { bindOverlaySwipe, type OverlayEdge } from "../0-face/overlay-swipe";
import "./styles/ds-overlay.css";
import "../1-root/overlay.css";
import frameStyles from "./styles/ds-overlay.css?inline";
import placementStyles from "../1-root/overlay.css?inline";
import metrics from "../1-root/component-metrics.css?inline";

export type { OverlayEdge } from "../0-face/overlay-swipe";
/**
 * What an overlay is: a `modal` in the centre (the default), a `sheet` from the
 * foot of the screen, a `drawer` at the end or start of a line, a `popover`
 * at a point (`anchor`), or the whole `screen`.
 */
export type OverlayType = "modal" | "sheet" | "drawer" | "detail" | "popover" | "screen";
export type OverlaySide = "end" | "start";
export type OverlayCloseReason = "escape" | "backdrop" | "outside" | "button" | "native" | "swipe";
const dialogStyles = `${frameStyles}\n${placementStyles}`;
const TYPES = new Set<string>(["modal", "sheet", "drawer", "detail", "popover", "screen"]);
/** A phone's width, as `0-face/grid.ts` reads it. */
const onPhone = () => typeof matchMedia === "function" && matchMedia("(max-width: 768px)").matches;
const openDialogs = new WeakMap<Document, Set<Overlay>>();
type SavedStyle = { style: CSSStyleDeclaration; name: string; value: string; priority: string; locked: string };
const scrollStyles = new WeakMap<Document, { declarations: SavedStyle[]; x: number; y: number }>();

/** One owner per declaration, including mixed modal and stationary panels. */
function syncScroll(document: Document) {
  const stack = [...(openDialogs.get(document) ?? [])];
  const holding = stack.some(dialog => !dialog.modeless || dialog.holdScroll);
  const fixed = stack.some(dialog => !dialog.modeless);
  let saved = scrollStyles.get(document);
  if (!holding && !saved) return;
  if (!saved) {
    saved = { declarations: [], x: document.defaultView?.scrollX ?? 0, y: document.defaultView?.scrollY ?? 0 };
    scrollStyles.set(document, saved);
  }
  const root = document.documentElement.style, body = document.body.style;
  const desired: [CSSStyleDeclaration, string, string][] = holding ? [
    [root, "overflow", "hidden"], [root, "overscroll-behavior", "none"],
    [body, "overscroll-behavior", "none"], [body, "touch-action", "none"],
  ] : [];
  if (fixed) desired.push([body, "position", "fixed"], [body, "top", `${-saved.y}px`], [body, "left", `${-saved.x}px`], [body, "width", "100%"]);
  const wasFixed = saved.declarations.some(entry => entry.name === "position");
  for (const entry of [...saved.declarations]) {
    if (desired.some(([style, name]) => style === entry.style && name === entry.name)) continue;
    if (entry.style.getPropertyValue(entry.name) === entry.locked && entry.style.getPropertyPriority(entry.name) === "important") {
      if (entry.value) entry.style.setProperty(entry.name, entry.value, entry.priority);
      else entry.style.removeProperty(entry.name);
    }
    saved.declarations.splice(saved.declarations.indexOf(entry), 1);
  }
  for (const [style, name, locked] of desired) {
    if (saved.declarations.some(entry => entry.style === style && entry.name === name)) continue;
    saved.declarations.push({ style, name, locked, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) });
    style.setProperty(name, locked, "important");
  }
  if ((!holding || (wasFixed && !fixed)) && document.defaultView && (document.defaultView.scrollX !== saved.x || document.defaultView.scrollY !== saved.y)) {
    document.defaultView.scrollTo(saved.x, saved.y);
  }
  if (!holding) scrollStyles.delete(document);
}

const styledRoots = new WeakSet<ShadowRoot>();
function styleRoot(root: Node) {
  if (!(root instanceof ShadowRoot) || styledRoots.has(root)) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(dialogStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  styledRoots.add(root);
}

/** Everything that stands over the page is an overlay, on a native light-DOM
 * `<dialog>` that keeps forms and accessible ID references together. The
 * browser owns the top layer, inert background and modal focus navigation.
 * Listen to ds-close-request and preventDefault to control whether it closes.
 * `type` says what it is: a `modal` in the centre (the default; a sheet on a phone), a `sheet`
 * from the foot of the screen, a `drawer` at the `side` `"end"` (the default)
 * or `"start"`, a responsive `detail` (drawer on desktop, sheet on phones), a `popover` at the `anchor` point, or the whole `screen`. A
 * sheet and a drawer slide in and out and a finger swipes them away (reason
 * `"swipe"`); a popover is modeless.
 */
export class Overlay extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    nonModal: { type: Boolean, attribute: "non-modal", reflect: true },
    closeOnOutside: { type: Boolean, attribute: "close-on-outside" },
    blockOutside: { type: Boolean, attribute: "block-outside" },
    holdScroll: { type: Boolean, attribute: "hold-scroll" },
    closeOnEscape: { type: Boolean, attribute: "close-on-escape" },
    closeOnBackdrop: { type: Boolean, attribute: "close-on-backdrop" },
    type: { type: String, reflect: true },
    side: { type: String, reflect: true },
    anchor: { attribute: false },
    trigger: { attribute: false },
    returnFocus: { attribute: false },
  };
  static styles = [unsafeCSS(metrics), css`:host { display: contents; } :host([hidden]) { display: none !important; }`];
  declare open: boolean;
  declare nonModal: boolean;
  declare closeOnOutside: boolean;
  declare blockOutside: boolean;
  declare holdScroll: boolean;
  declare closeOnEscape: boolean;
  declare closeOnBackdrop: boolean;
  /** What it is: `"modal"`, `"sheet"`, `"drawer"`, `"detail"`, `"popover"` or `"screen"`. */
  declare type: OverlayType;
  /** A drawer's side: `"end"` (the default) or `"start"`. */
  declare side: OverlaySide;
  /** A popover's viewport point. */
  declare anchor: { x: number; y: number } | null;
  /** A field anchoring a small popover; centres below it on mobile. */
  declare trigger: HTMLElement | null;
  /** Resolve a replacement opener after the product has rendered its closed state. */
  declare returnFocus: (() => HTMLElement | null) | null;
  private dialog: HTMLDialogElement | null = null;
  private opener: HTMLElement | null = null;
  private pointerStartedOutside = false;
  private pendingOpen: Promise<void> | null = null;
  private outsidePress: boolean | null = null;
  private observer = new MutationObserver(() => this.bindDialog());
  private sizeObserver: ResizeObserver | null = null;
  private unbindSwipe: (() => void) | null = null;

  constructor() {
    super();
    this.open = false;
    this.nonModal = false;
    this.closeOnOutside = false;
    this.blockOutside = false;
    this.holdScroll = false;
    this.closeOnEscape = true;
    this.closeOnBackdrop = true;
    this.type = "modal";
    this.side = "end";
    this.anchor = null;
    this.trigger = null;
    this.returnFocus = null;
  }

  connectedCallback() {
    super.connectedCallback();
    styleRoot(this.getRootNode());
    this.observer.observe(this, { childList: true });
    this.bindDialog();
  }

  disconnectedCallback() {
    this.observer.disconnect();
    this.detachDialog();
    super.disconnectedCallback();
  }

  protected updated() { this.syncType(); this.syncOpen(); this.place(); }

  /** Its type as drawn: detail follows the viewport; an unknown one is a modal, and a modal on a phone is a sheet (Joachim, 20 October 2026: no modals on a phone at all). */
  get kind(): OverlayType {
    const type = TYPES.has(this.type) ? this.type : "modal";
    if (type === "detail") return onPhone() ? "sheet" : "drawer";
    return type === "modal" && onPhone() ? "sheet" : type;
  }
  /** A modeless overlay leaves the page live: a popover always, any other with `non-modal`. */
  get modeless() { return this.nonModal || this.kind === "popover"; }
  /** The edge it comes from and a finger swipes it back to. */
  get edge(): OverlayEdge {
    if (this.kind === "sheet") return "bottom";
    if (this.kind === "drawer") return this.side === "start" ? "start" : "end";
    return "none";
  }

  /** Mark the native frame with its type and edge before it opens, so it slides in from that edge, and let a finger swipe it away. */
  private syncType() {
    const dialog = this.dialog;
    if (!dialog) return;
    dialog.setAttribute("data-ds-type", this.kind);
    const edge = this.edge;
    if (edge !== "none") dialog.setAttribute("data-ds-edge", edge);
    else dialog.removeAttribute("data-ds-edge");
    if (edge !== "none" && !this.unbindSwipe) {
      this.unbindSwipe = bindOverlaySwipe(dialog, {
        edge: () => this.edge,
        onDismiss: () => this.requestClose("swipe"),
      });
    } else if (edge === "none" && this.unbindSwipe) {
      this.unbindSwipe();
      this.unbindSwipe = null;
    }
  }

  /** Keep a popover inside the visible viewport as its content or keyboard changes. */
  place = () => {
    const dialog = this.dialog, view = this.ownerDocument.defaultView;
    if (!dialog || !view) return;
    this.syncType();
    const viewport = view.visualViewport;
    dialog.style.setProperty("--ds-overlay-viewport-height", `${viewport?.height ?? view.innerHeight}px`);
    dialog.style.setProperty("--ds-overlay-viewport-bottom", `${Math.max(0, view.innerHeight - (viewport?.height ?? view.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    if (this.kind !== "popover" || (!this.anchor && !this.trigger) || !dialog.open) return;
    if (this.trigger && mobilePanel(this)) {
      const bounds = panelViewport(this);
      dialog.style.setProperty("--ds-overlay-available-width", `${Math.max(0, bounds.width - 8)}px`);
      const position = anchoredPanel(this.trigger.getBoundingClientRect(), dialog.getBoundingClientRect(), bounds);
      dialog.style.setProperty("--ds-overlay-available-height", `${position.availableHeight}px`);
      const placed = anchoredPanel(this.trigger.getBoundingClientRect(), dialog.getBoundingClientRect(), bounds);
      const margin = parseFloat(view.getComputedStyle(dialog).marginLeft) || 0;
      dialog.style.setProperty("--ds-overlay-anchor-left", `${placed.left - margin}px`);
      dialog.style.setProperty("--ds-overlay-anchor-top", `${placed.top - margin}px`);
      return;
    }
    const triggerRect = this.trigger?.getBoundingClientRect();
    const anchor = this.anchor ?? { x: triggerRect!.left, y: triggerRect!.bottom };
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? view.innerWidth, height = viewport?.height ?? view.innerHeight;
    const margin = parseFloat(view.getComputedStyle(dialog).marginLeft) || 0;
    dialog.style.setProperty("--ds-overlay-available-width", `${Math.max(0, width - 2 * margin)}px`);
    dialog.style.setProperty("--ds-overlay-available-height", `${Math.max(0, height - 2 * margin)}px`);
    const rect = dialog.getBoundingClientRect();
    dialog.style.setProperty("--ds-overlay-anchor-left", `${Math.max(left, Math.min(anchor.x - margin, left + width - rect.width - 2 * margin))}px`);
    dialog.style.setProperty("--ds-overlay-anchor-top", `${Math.max(top, Math.min(anchor.y - margin, top + height - rect.height - 2 * margin))}px`);
  };

  private bindDialog = () => {
    const dialog = this.querySelector<HTMLDialogElement>(":scope > dialog");
    if (dialog === this.dialog) { this.syncOpen(); return; }
    this.detachDialog();
    this.dialog = dialog;
    dialog?.addEventListener("cancel", this.onCancel);
    dialog?.addEventListener("close", this.onNativeClose);
    dialog?.addEventListener("pointerdown", this.onPointerDown);
    dialog?.addEventListener("click", this.onClick);
    this.syncType();
    this.syncOpen();
  };

  private detachDialog() {
    const dialog = this.dialog;
    dialog?.removeEventListener("cancel", this.onCancel);
    dialog?.removeEventListener("close", this.onNativeClose);
    dialog?.removeEventListener("pointerdown", this.onPointerDown);
    dialog?.removeEventListener("click", this.onClick);
    this.unbindSwipe?.();
    this.unbindSwipe = null;
    dialog?.removeAttribute("data-ds-type");
    dialog?.removeAttribute("data-ds-edge");
    if (dialog?.open) dialog.close();
    this.release();
    this.dialog = null;
  }

  private syncOpen() {
    const dialog = this.dialog;
    if (!dialog || !this.isConnected) return;
    if (this.open && !dialog.open) {
      if (this.pendingOpen) return;
      // Let slotted Lit fields/buttons render before the browser chooses focus.
      // Otherwise their empty shadow roots can make the dialog itself receive it.
      const updates = [...dialog.querySelectorAll("*")].map(element => (element as LitElement).updateComplete);
      this.pendingOpen = Promise.all(updates).then(() => {
        this.pendingOpen = null;
        if (this.dialog !== dialog || !this.open || !this.isConnected) { this.syncOpen(); return; }
        this.showDialog(dialog);
      });
    } else if (!this.open) {
      if (dialog.open) dialog.close();
      this.release();
    }
  }

  /** Immediate opening preserves a user gesture for mobile keyboard/media focus.
   * The caller then focuses its already-rendered control synchronously. */
  async show({ immediate = false }: { immediate?: boolean } = {}) {
    this.open = true;
    if (immediate) {
      // The native frame must be in the rendered tree within this gesture too.
      // A newly connected Lit host has not drawn its slot yet.
      this.performUpdate();
      // Nested menu slots and fields must also exist before gesture-time focus.
      for (const child of this.querySelectorAll('*')) {
        (child as HTMLElement & { renderNow?: () => void }).renderNow?.();
      }
      this.bindDialog();
      if (this.dialog && this.isConnected) this.showDialog(this.dialog);
    }
    await this.updateComplete;
    await this.pendingOpen;
  }

  close() { this.open = false; this.syncOpen(); }

  private showDialog(dialog: HTMLDialogElement) {
    if (dialog.open) return;
    let active = this.ownerDocument.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    this.opener ??= active instanceof HTMLElement ? active : null;
    const document = this.ownerDocument;
    let stack = openDialogs.get(document);
    if (!stack) openDialogs.set(document, stack = new Set());
    stack.add(this);
    syncScroll(document);
    try { if (this.modeless) dialog.show(); else dialog.showModal(); }
    catch (error) { stack.delete(this); syncScroll(document); throw error; }
    this.place();
    if (typeof ResizeObserver !== "undefined") {
      this.sizeObserver = new ResizeObserver(this.place);
      this.sizeObserver.observe(dialog);
    }
    document.addEventListener("scroll", this.place, true);
    document.defaultView?.addEventListener("resize", this.place);
    document.defaultView?.visualViewport?.addEventListener("resize", this.place);
    document.defaultView?.visualViewport?.addEventListener("scroll", this.place);
    document.addEventListener("keydown", this.onDocumentKey);
    document.addEventListener("pointerdown", this.onOutsidePress, true);
    document.addEventListener("click", this.onOutsideClick, true);
    document.addEventListener("wheel", this.onScrollGesture, { passive: false });
    document.addEventListener("touchmove", this.onScrollGesture, { passive: false });
  }

  private release() {
    const document = this.ownerDocument;
    this.sizeObserver?.disconnect(); this.sizeObserver = null;
    document.removeEventListener("scroll", this.place, true);
    document.defaultView?.removeEventListener("resize", this.place);
    document.defaultView?.visualViewport?.removeEventListener("resize", this.place);
    document.defaultView?.visualViewport?.removeEventListener("scroll", this.place);
    const stack = openDialogs.get(document);
    const entries = stack ? [...stack] : [];
    const wasTop = entries[entries.length - 1] === this;
    if (!stack?.delete(this)) return;
    syncScroll(document);
    document.removeEventListener("keydown", this.onDocumentKey);
    document.removeEventListener("pointerdown", this.onOutsidePress, true);
    document.removeEventListener("click", this.onOutsideClick, true);
    document.removeEventListener("wheel", this.onScrollGesture);
    document.removeEventListener("touchmove", this.onScrollGesture);
    this.outsidePress = null;
    // Modeless content must not steal focus from a control already used outside it.
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    let within = active;
    while (within && !this.dialog?.contains(within)) {
      const root = within.getRootNode();
      within = root instanceof ShadowRoot ? root.host : null;
    }
    if (wasTop && (!this.modeless || active === document.body || active === this.dialog || within)) {
      const resolve = this.returnFocus;
      if (resolve) queueMicrotask(() => {
        const target = resolve();
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
      else if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    }
    this.opener = null;
  }

  requestClose(reason: OverlayCloseReason = "button") {
    if (!this.open) return;
    const event = new CustomEvent("ds-close-request", { detail: { reason }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(event)) this.close();
  }

  private isTop() {
    const stack = [...(openDialogs.get(this.ownerDocument) ?? [])];
    return stack[stack.length - 1] === this;
  }

  private onDocumentKey = (event: KeyboardEvent) => {
    if (!this.modeless || !this.isTop() || event.defaultPrevented) return;
    if (event.key === "Escape" && this.closeOnEscape) {
      event.preventDefault(); event.stopImmediatePropagation(); this.requestClose("escape");
    } else if (this.holdScroll && !event.composedPath().includes(this) && !event.composedPath().some(node => node instanceof HTMLElement && (node.isContentEditable || node.matches("input, textarea, select"))) && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) event.preventDefault();
  };
  private onScrollGesture = (event: Event) => {
    if (this.modeless && this.holdScroll && this.isTop() && !event.composedPath().includes(this)) event.preventDefault();
  };
  private onOutsidePress = (event: Event) => {
    if (!this.modeless || !this.isTop()) return;
    this.outsidePress = !event.composedPath().includes(this);
    if (this.outsidePress && this.blockOutside) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private onOutsideClick = (event: Event) => {
    if (!this.modeless || !this.isTop() || event.composedPath().includes(this)) return;
    if (this.blockOutside) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (this.closeOnOutside && this.outsidePress !== false) this.requestClose("outside");
    this.outsidePress = null;
  };

  private onCancel = (event: Event) => {
    event.preventDefault();
    if (this.closeOnEscape) this.requestClose("escape");
  };

  private onNativeClose = () => {
    if (!this.open || this.dialog?.open || this.pendingOpen) return;
    this.requestClose("native");
    this.syncOpen();
  };

  private outside(event: MouseEvent) {
    const dialog = this.dialog;
    if (!dialog || event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  private onPointerDown = (event: PointerEvent) => {
    this.pointerStartedOutside = event.button === 0 && this.outside(event);
  };
  private onClick = (event: MouseEvent) => {
    if (event.defaultPrevented) { this.pointerStartedOutside = false; return; }
    const dismiss = event.composedPath().find(node => node instanceof HTMLElement && node.hasAttribute("data-ds-overlay-dismiss")) as HTMLElement | undefined;
    if (dismiss?.closest("dialog") === this.dialog) this.requestClose("button");
    else if (this.closeOnBackdrop && this.pointerStartedOutside && this.outside(event)) this.requestClose("backdrop");
    this.pointerStartedOutside = false;
  };

  render() { return html`<slot @slotchange=${this.bindDialog}></slot>`; }
}

define("ds-overlay", Overlay);
declare global { interface HTMLElementTagNameMap { "ds-overlay": Overlay } }
