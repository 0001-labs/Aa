import { LitElement, html, unsafeCSS, type PropertyValues } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { define } from "../0-face/define";
import { attachOverlay, type Drawer } from "../0-face/attach-overlay";
import { getText } from "../0-face/i18n";
import "../2-core/ds-icon";
import controls from "../1-root/controls.css?inline";
import styles from "./styles/ds-page.css?inline";

const MAIN = "main, [role='main']";

export type PageLayout = "sidebar" | "split" | "inspector" | "column" | "centered" | "tiles";
export const PAGE_LAYOUTS: readonly PageLayout[] = ["sidebar", "split", "inspector", "column", "centered", "tiles"];

/**
 * A standard page: where units stand on the grid. Every layout uses the same
 * five areas, so content can move between layouts without being rewritten.
 *
 * - `slot="header"` runs along the top of the main area
 * - `slot="nav"` is the leading column: navigation, or the list in `split`
 * - the default slot is the main area
 * - `slot="aside"` is the trailing column, shown by `inspector`
 * - `slot="footer"` runs along the bottom of the main area
 *
 * The main area is the document's main landmark (`role="main"`), unless the
 * page stands inside a `<main>` or another page, or is given a `<main>` itself.
 *
 * Columns are whole squares: `sidebar` and `inspector` lead with 12, `split`
 * with 16; `column` is 32 wide and `centered` 16, and `measure` sets either in
 * whole squares. A centred column stands on a whole square: the room beside it
 * is rounded down to squares, so the column never straddles a grid line.
 * `tiles` places each main child in a 12-square tile. Below 30 squares of
 * width every layout stacks.
 *
 * With `drawer`, the navigation folds away below 30 squares instead of
 * standing above the work: a menu button one square wide stands before the
 * header and opens it in a drawer over the page (0-face/attach-overlay.ts, the
 * header's), with focus kept inside, closed by Escape, its close button, a
 * link or the page widening, and the page's scroll held behind it.
 *
 * @element ds-page
 * @attr layout - `sidebar`, `split`, `inspector`, `column`, `centered` or `tiles`.
 * @attr resizable - Adds a draggable, keyboard-accessible divider to a split layout.
 * @attr split - Leading column share (0–1), default 0.5; resizing emits ds-page-resize with detail.split.
 * @attr divided - Draws a hairline between the columns.
 * @attr measure - Width of the `column` or `centered` column in whole squares.
 * @attr fill - Takes its container's height; each column scrolls on its own.
 * @attr view - Labels each area with its slot name, for inspection.
 * @attr drawer - Folds the navigation into a drawer on a narrow page.
 * @attr drawer-label - The menu button's and drawer's name: a translation key, the shared word "Menu" by default.
 * @fires ds-page-drawer - The drawer opened or closed; `detail.open` says which.
 *
 * @example
 * <ds-page layout="sidebar">
 *   <ds-sidebar slot="nav" label="Projects"></ds-sidebar>
 *   <ds-row slot="header" fill>…</ds-row>
 *   <ds-list>…</ds-list>
 * </ds-page>
 */
export class Page extends LitElement {
  static properties = {
    resizable: { type: Boolean, reflect: true },
    navWidth: { type: Number, attribute: "nav-width", reflect: true },
    split: { type: Number },
    layout: { type: String, reflect: true },
    divided: { type: Boolean, reflect: true },
    measure: { type: Number, reflect: true },
    fill: { type: Boolean, reflect: true },
    view: { type: Boolean, reflect: true },
    drawer: { type: Boolean, reflect: true },
    drawerLabel: { type: String, attribute: "drawer-label" },
    landmark: { state: true },
  };

  declare resizable: boolean;
  declare navWidth: number;
  declare split: number;
  declare layout: PageLayout;
  declare divided: boolean;
  declare measure: number | undefined;
  declare fill: boolean;
  declare view: boolean;
  declare drawer: boolean;
  declare drawerLabel: string | undefined;
  private declare landmark: boolean;

  static styles = [unsafeCSS(controls), unsafeCSS(styles)];

  private navigationDrawer: Drawer | null = null;
  private readonly relabel = () => this.requestUpdate();

  constructor() {
    super();
    this.resizable = false;
    this.navWidth = 12;
    this.split = 0.5;
    this.layout = "sidebar";
    this.divided = false;
    this.fill = false;
    this.view = false;
    this.drawer = false;
    this.landmark = true;
  }

  /**
   * The main area is the page's main landmark, unless the page stands inside
   * one (or inside another page) or is given its own `<main>`.
   */
  private readonly syncLandmark = () => {
    const slot = this.renderRoot?.querySelector?.<HTMLSlotElement>("slot:not([name])");
    const given = slot?.assignedElements({ flatten: true }).some(element => element.matches(MAIN) || !!element.querySelector(MAIN));
    const inside = !!this.parentElement?.closest(`${MAIN}, ds-page`);
    this.landmark = !given && !inside;
  };

  connectedCallback() {
    super.connectedCallback();
    this.syncLandmark();
    window.addEventListener("language-changed", this.relabel);
    window.addEventListener("translations-loaded", this.relabel);
  }

  disconnectedCallback() {
    window.removeEventListener("language-changed", this.relabel);
    window.removeEventListener("translations-loaded", this.relabel);
    this.navigationDrawer?.destroy();
    this.navigationDrawer = null;
    super.disconnectedCallback();
  }

  /** Whether the navigation drawer is open. */
  get drawerOpen(): boolean {
    return this.navigationDrawer?.isOpen ?? false;
  }

  /** Open the navigation drawer (on a narrow page with `drawer`). */
  openDrawer(): void { this.navigationDrawer?.open(); }

  /** Close the navigation drawer. */
  closeDrawer(): void { this.navigationDrawer?.close(); }

  protected updated(changed: PropertyValues<this>) {
    super.updated(changed);
    if (!changed.has("drawer")) return;
    if (!this.drawer) {
      this.navigationDrawer?.destroy();
      this.navigationDrawer = null;
      return;
    }
    const root = this.renderRoot;
    const toggle = root.querySelector<HTMLElement>('[part="drawer-toggle"]');
    const panel = root.querySelector<HTMLDialogElement>('[part="drawer"]');
    const nav = root.querySelector('[part="nav"]');
    if (!toggle || !panel || !nav || this.navigationDrawer) return;
    this.navigationDrawer = attachOverlay({
      toggle, panel, content: [nav],
      onToggle: open => this.dispatchEvent(new CustomEvent("ds-page-drawer", { bubbles: true, composed: true, detail: { open } })),
    });
  }

  private drag: { id: number; handle: HTMLElement; startX: number; startWidth: number; width: number; available: number; unit: number; rtl: boolean } | null = null;
  private splitMetrics() {
    const page = this.renderRoot.querySelector<HTMLElement>('.page')!;
    const style = getComputedStyle(page);
    const handle = this.renderRoot.querySelector<HTMLElement>('.resize');
    const unit = handle?.getBoundingClientRect().width || 20;
    const available = page.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.columnGap) || 0);
    return { unit, available: Math.max(unit, available) };
  }
  private splitWidth(value: number, available: number, unit: number) {
    const minimum = Math.min(10 * unit, Math.floor(available / 2 / unit) * unit);
    const maximum = Math.floor((available - minimum) / unit) * unit;
    return Math.max(minimum, Math.min(maximum, Math.round(value / unit) * unit));
  }
  private resizeTo(value: number) {
    if (this.layout === "sidebar") {
      const {available, unit} = this.splitMetrics();
      this.navWidth = Math.max(4, Math.min(24, Math.floor((available - 10 * unit) / unit), Math.round(value * available / unit)));
      this.dispatchEvent(new CustomEvent("ds-page-resize", {bubbles: true, composed: true, detail: {navWidth: this.navWidth}}));
      return;
    }
    const { available, unit } = this.splitMetrics();
    this.split = this.splitWidth(value * available, available, unit) / available;
    this.dispatchEvent(new CustomEvent('ds-page-resize', { bubbles: true, composed: true, detail: { split: this.split } }));
  }
  private resizePointer(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const minimum = Math.min((this.layout === "sidebar" ? 4 : 10) * drag.unit, Math.floor(drag.available / 2 / drag.unit) * drag.unit);
    const delta = (event.clientX - drag.startX) * (drag.rtl ? -1 : 1);
    drag.width = Math.max(minimum, Math.min((this.layout === "sidebar" ? Math.min(24 * drag.unit, drag.available - 10 * drag.unit) : drag.available - minimum), drag.startWidth + delta));
    // Preview the real columns immediately; only release persists a snapped preference.
    this.renderRoot.querySelector<HTMLElement>('.page')!.style.setProperty('--ds-page-resize-width', `${drag.width}px`);
  }
  private startResize(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    const { available, unit } = this.splitMetrics();
    const width = this.layout === 'sidebar' ? this.navWidth * unit : this.renderRoot.querySelector<HTMLElement>('[part="nav"]')!.getBoundingClientRect().width;
    this.drag = { id: event.pointerId, handle, startX: event.clientX, startWidth: width, width, available, unit, rtl: getComputedStyle(this).direction === 'rtl' };
    handle.setAttribute('data-dragging', '');
  }
  private endResize(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    drag.handle.removeAttribute('data-dragging');
    this.renderRoot.querySelector<HTMLElement>('.page')!.style.removeProperty('--ds-page-resize-width');
    this.drag = null;
    if (event.type === 'pointerup') this.resizeTo(drag.width / drag.available);
  }
  private resizeKey(event: KeyboardEvent) {
    const rtl = getComputedStyle(this).direction === 'rtl';
    const { available, unit } = this.splitMetrics();
    const width = this.layout === 'sidebar' ? this.navWidth * unit : this.renderRoot.querySelector<HTMLElement>('[part="nav"]')!.getBoundingClientRect().width;
    const step = unit * (event.shiftKey ? 5 : 1) / available;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); this.resizeTo(width / available + (event.key === 'ArrowRight' !== rtl ? step : -step));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); this.resizeTo(event.key === 'Home' ? 0 : 1);
    } else if (event.key === 'Enter') { event.preventDefault(); this.resetResize(); }
  }

  private resetResize() {
    if (this.layout === "sidebar") { const {available, unit} = this.splitMetrics(); this.resizeTo(8 * unit / available); }
    else this.resizeTo(0.5);
  }

  /**
   * The divider. A split's stands beside its column, not in it, so a column that scrolls on its own
   * under `fill` cannot cut it off; a sidebar's stands in its column, which holds it visible.
   */
  private resizer() {
    if (!this.resizable) return undefined;
    return html`<div class="resize" part="resize" role="separator" tabindex="0" aria-label=${this.layout === "sidebar" ? "Resize sidebar" : "Resize columns"} aria-orientation="vertical" aria-valuemin=${this.layout === "sidebar" ? 4 : 0} aria-valuemax=${this.layout === "sidebar" ? 24 : 100} aria-valuenow=${this.layout === "sidebar" ? this.navWidth : Math.round(this.split * 100)} @pointerdown=${this.startResize} @pointermove=${this.resizePointer} @pointerup=${this.endResize} @pointercancel=${this.endResize} @lostpointercapture=${this.endResize} @keydown=${this.resizeKey} @dblclick=${() => this.resetResize()}></div>`;
  }

  render() {
    const label = getText(this.drawerLabel || "Menu") || this.drawerLabel || "Menu";
    const close = getText("Close") || "Close";
    return html`
      <div class="page" part="page" style=${ifDefined([measureStyle(this.measure), this.resizable && this.layout === "sidebar" ? `--ds-page-nav: var(--ds-page-resize-width, calc(${Math.max(4, Math.min(24, Math.round(this.navWidth || 12)))} * var(--ds-unit)))` : undefined, this.resizable ? `--ds-page-split: ${Math.max(0.1, Math.min(0.9, Number.isFinite(this.split) ? this.split : 0.5))}` : undefined].filter(Boolean).join("; ") || undefined)}>
        <div class="bar" part="bar" ?hidden=${!this.drawer}>
          <button class="ds-button ds-button--icon" part="drawer-toggle" type="button" aria-label=${label} aria-controls="drawer">
            <ds-icon type="menu" size="large" aria-hidden="true"></ds-icon><ds-icon type="close" size="large" aria-hidden="true"></ds-icon>
          </button>
        </div>
        <dialog class="ds-overlay ds-overlay--screen" part="drawer" id="drawer" aria-label=${label}>
          <div class="ds-overlay__bar"><button class="ds-button ds-button--icon ds-overlay__close" part="drawer-close" type="button" aria-label=${close}>
            <ds-icon type="close" size="large" aria-hidden="true"></ds-icon>
          </button></div>
        </dialog>
        <div class="area nav" part="nav" data-area="nav"><slot name="nav"></slot>${this.layout === 'sidebar' ? this.resizer() : undefined}</div>${this.layout === 'split' ? this.resizer() : undefined}
        <div class="area header" part="header" data-area="header"><slot name="header"></slot></div>
        <div class="area main" part="main" data-area="main" role=${ifDefined(this.landmark ? "main" : undefined)}><slot @slotchange=${this.syncLandmark}></slot></div>
        <div class="area aside" part="aside" data-area="aside"><slot name="aside"></slot></div>
        <div class="area footer" part="footer" data-area="footer"><slot name="footer"></slot></div>
      </div>
    `;
  }

  firstUpdated() {
    // An area with nothing in it takes no room, so a header or footer is optional.
    this.renderRoot.querySelectorAll("slot").forEach(slot => {
      const sync = () => slot.parentElement?.toggleAttribute("data-empty", slot.assignedNodes({ flatten: true }).every(empty));
      slot.addEventListener("slotchange", sync);
      sync();
    });
    this.syncLandmark();
  }
}

/**
 * A measure is a count of squares: 28 is 28 squares, never 28.5 or 28px. A
 * fraction rounds to the nearest square, and anything that is not a positive
 * number is ignored so the layout keeps its own width.
 */
export function measureStyle(measure: number | null | undefined): string | undefined {
  const squares = Math.round(Number(measure));
  return Number.isFinite(squares) && squares >= 1 ? `--ds-page-measure: calc(${squares} * var(--ds-unit))` : undefined;
}

function empty(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE ? !node.textContent?.trim() : node.nodeType !== Node.ELEMENT_NODE;
}

define("ds-page", Page);

declare global {
  interface HTMLElementTagNameMap {
    "ds-page": Page;
  }
}
