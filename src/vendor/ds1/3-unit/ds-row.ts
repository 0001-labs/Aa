import { LitElement, html, unsafeCSS } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import styles from "./styles/ds-row.css?inline";
import { define } from "../0-face/define";
import { CutFades } from "../0-face/cut-fade";

/** The values `aria-current` takes besides `page`. */
const CURRENT = new Set(["page", "step", "location", "date", "time", "true"]);

/**
 * A horizontal run of elements one row (`--ds-row-height`) tall.
 *
 * With `href` the whole row is one link, with `interactive` one button: it
 * shows the pointer over it, the press and the focus ring across the row,
 * and its content keeps the row's layout. Controls in the `end` slot stay
 * separately pressable. `current` marks the destination being shown
 * (`aria-current="page"`); `nav` draws the row as a navigation row.
 *
 * @element ds-row
 * @attr subgrid - Share the parent grid tracks through the row and its press target.
 * @attr defer-offscreen - Defer rendering fixed-height rows outside the viewport.
 * @attr fill - Spread the children from edge to edge.
 * @attr centered - Centre the children.
 * @attr end - Push the children to the end.
 * @attr auto - Size to the content instead of one row.
 * @attr stacked - Stack the children, each on its own line, sized to them (a tile or a card).
 * @attr href - Make the row a link to this address.
 * @attr interactive - Make the row a button.
 * @attr disabled - Keep the row from being pressed.
 * @attr current - The destination being shown: `aria-current="page"`, or the value given (`step`, `location`, …).
 * @attr open - Whether this row’s details are open; controlled by the caller, with aria-expanded on its target.
 * @attr nav - Draw a navigation row: corners of two pixels, as the sidebar's rows.
 * @attr label - The accessible name, when the row's words do not say it.
 * @attr target - Where a link opens (`_blank`, …).
 * @attr rel - The link's relationship (`noopener`, …).
 * A record's row puts its parts in classes: `ds-row__name` for the words,
 * which hug and give way first, and `ds-row__value` for the figure or date at
 * the row's end; a 16px picture (an avatar tile, a large icon) before the
 * name stands on its square with the row's gap putting the words on the next.
 * The element measures each name and marks it `data-cut="end"` while its
 * words do not fit, so the stylesheet fades them over the last square, never
 * an ellipsis; a `ds-text literal` name fades the same way.
 *
 * @slot - The row's content, inside its press target.
 * @slot end - Controls of their own after the content, outside the press target.
 * @fires ds-row-press - `{ href }`: the row was pressed. Cancel it to route a link yourself; a modified click on a link is left to the browser.
 * @csspart target - The link or button that is the row's press target.
 */
export class Row extends LitElement {
  static properties = {
    subgrid: { type: Boolean, reflect: true },
    deferOffscreen: { type: Boolean, reflect: true, attribute: "defer-offscreen" },
    fill: { type: Boolean, reflect: true },
    centered: { type: Boolean, reflect: true },
    end: { type: Boolean, reflect: true },
    auto: { type: Boolean, reflect: true },
    stacked: { type: Boolean, reflect: true },
    href: { type: String, reflect: true },
    interactive: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    current: { type: String, reflect: true },
    open: { type: Boolean, reflect: true },
    nav: { type: Boolean, reflect: true },
    label: { type: String },
    target: { type: String },
    rel: { type: String },
  };

  declare subgrid: boolean;
  declare deferOffscreen: boolean;
  declare fill: boolean;
  declare centered: boolean;
  declare end: boolean;
  declare auto: boolean;
  declare stacked: boolean;
  declare href: string | undefined;
  declare interactive: boolean;
  declare disabled: boolean;
  declare current: string | null | undefined;
  declare open: boolean | undefined;
  declare nav: boolean;
  declare label: string | undefined;
  declare target: string | undefined;
  declare rel: string | undefined;

  constructor() {
    super();
    this.subgrid = false;
    this.deferOffscreen = false;
    this.fill = false;
    this.centered = false;
    this.end = false;
    this.auto = false;
    this.stacked = false;
    this.href = undefined;
    this.interactive = false;
    this.disabled = false;
    this.current = undefined;
    this.open = undefined;
    this.nav = false;
    this.label = undefined;
    this.target = undefined;
    this.rel = undefined;
  }

  static styles = unsafeCSS(styles);

  /** Marks each `.ds-row__name` `data-cut="end"` while its words are wider than its box, measured again as they resize or change. */
  protected readonly cuts = new CutFades(this, { targets: () => this.querySelectorAll(":scope > .ds-row__name"), text: true });

  /** Measures the names again, as when the slotted content changes. */
  private measureNames = () => this.cuts.measure();

  /** The `aria-current` value, or none. */
  private get currentValue(): string | undefined {
    const value = this.current;
    if (value === null || value === undefined || value === "false") return undefined;
    return CURRENT.has(value) ? value : "page";
  }

  /** Focuses the press target, so `row.focus()` lands on the link or button. */
  focus(options?: FocusOptions) {
    const target = this.renderRoot?.querySelector<HTMLElement>(".target");
    if (target) target.focus(options);
    else super.focus(options);
  }

  private press(event: MouseEvent) {
    if (this.disabled) { event.preventDefault(); return; }
    // A link keeps the browser's new tab, download and context menu.
    if (this.href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    const go = this.dispatchEvent(new CustomEvent("ds-row-press", { detail: { href: this.href || undefined }, bubbles: true, composed: true, cancelable: true }));
    if (!go) event.preventDefault();
  }

  render() {
    if (!this.href && !this.interactive) return html`<slot @slotchange=${this.measureNames}></slot>`;
    const current = this.currentValue;
    const label = this.label || undefined;
    const content = html`<slot @slotchange=${this.measureNames}></slot>`;
    const target = this.href
      ? this.disabled
        ? html`<a class="target" part="target" role="link" aria-disabled="true" aria-label=${ifDefined(label)}>${content}</a>`
        : html`<a class="target" part="target" href=${this.href} target=${ifDefined(this.target || undefined)} rel=${ifDefined(this.rel || undefined)}
            aria-expanded=${ifDefined(this.open === undefined ? undefined : String(this.open))} aria-current=${ifDefined(current)} aria-label=${ifDefined(label)} @click=${this.press}>${content}</a>`
      : html`<button class="target" part="target" type="button" ?disabled=${this.disabled}
          aria-expanded=${ifDefined(this.open === undefined ? undefined : String(this.open))} aria-current=${ifDefined(current)} aria-label=${ifDefined(label)} @click=${this.press}>${content}</button>`;
    return html`${target}<slot name="end"></slot>`;
  }
}

define("ds-row", Row);

declare global {
  interface HTMLElementTagNameMap {
    "ds-row": Row;
  }
}
