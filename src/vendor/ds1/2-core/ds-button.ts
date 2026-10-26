// ds-button.ts
// Core button component

import { html, unsafeCSS } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import "./ds-text";
import { Control } from "../0-face/control";
import { define } from "../0-face/define";
import hostStyles from "./styles/ds-button-host.css?inline";
import styles from "./styles/ds-button.css?inline";

import { renderSplit, focusSplit, type SplitSegment } from "./button-split";
import splitStyles from "./styles/ds-button-split.css?inline";
export type { SplitSegment } from "./button-split";

export class Button extends Control {
  static formAssociated = true;
  static properties = {
    split: { type: Boolean, reflect: true },
    options: { type: String },
    segments: { attribute: false },
    value: { type: String, reflect: true },
    actions: { type: Boolean, reflect: true },
    labelled: { type: Boolean, reflect: true },
    literal: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    plain: { type: Boolean, reflect: true },
    _fieldsetDisabled: { state: true },
    primary: { type: Boolean, reflect: true },
    secondary: { type: Boolean, reflect: true },
    control: { type: String, reflect: true, noAccessor: true },
    active: { type: Boolean, reflect: true },
    choice: { type: Boolean, reflect: true },
    icon: { type: Boolean, reflect: true },
    wide: { type: Boolean, reflect: true },
    fixed: { type: Boolean, reflect: true },
    fit: { type: Boolean, reflect: true },
    danger: { type: Boolean, reflect: true },
    menuItem: { type: Boolean, reflect: true, attribute: "menu-item" },
    blank: { type: Boolean, reflect: true },
    language: { type: String },
    text: { type: String },
    label: { type: String },
    href: { type: String },
    target: { type: String },
    rel: { type: String },
    _loading: { type: Boolean, state: true },
  };

  declare split: boolean;
  declare options: string;
  declare segments: ReadonlyArray<SplitSegment> | undefined;
  declare value: string;
  declare actions: boolean;
  /** A split's segments with an icon show their words after it too. */
  declare labelled: boolean;
  declare literal: boolean;
  declare compact: boolean;
  /** A plain split: its segments' words and icons alone, on no ground in any state, as text tabs are. */
  declare plain: boolean;
  declare private _fieldsetDisabled: boolean;
  private splitRole = false;
  get splitDisabled(): boolean { return this.disabled || this._fieldsetDisabled; }
  private splitLanguageChanged = () => { if (this.split) this.requestUpdate(); };

  // Public properties
  declare primary: boolean;
  declare secondary: boolean;
  declare active: boolean;
  declare choice: boolean;
  declare icon: boolean;
  declare wide: boolean;
  declare fixed: boolean;
  declare fit: boolean;
  declare danger: boolean;
  declare menuItem: boolean;
  private _control = "native";
  get control(): string { return this._control; }
  set control(value: string) {
    const old = this._control;
    this._control = value;
    this.syncControl();
    this.requestUpdate("control", old);
  }
  protected get hostControl(): boolean { return this.control === "host" && !this.split; }
  declare blank: boolean;
  declare language: string;
  declare text: string;
  /**
   * The control's accessible name, as given, for a face that does not say
   * what the button does on its own: a value, a number or an icon. Pass words
   * already in the page's language.
   */
  declare label: string;
  /**
   * With `href` the face is a real link (`<a part="control">`): the browser
   * navigates, so middle-click, ⌘- or Ctrl-click, Copy link and Enter work as
   * on any link. `target` and `rel` go on the link; `blank` is `target="_blank"`,
   * which gets `rel="noopener noreferrer"` unless `rel` says otherwise. A
   * disabled link has no `href`, so it cannot navigate.
   */
  declare href: string;
  declare target: string;
  declare rel: string;

  // Private state
  declare _loading: boolean;

  constructor() {
    super();
    if (typeof this.attachInternals === "function") this.attachInternals();
    this.split = false; this.options = ""; this.value = "";
    this.actions = false; this.labelled = false; this.literal = false; this.compact = false; this.plain = false; this._fieldsetDisabled = false;
    this.addEventListener("click", event => {
      if (this._fieldsetDisabled) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true });
    this.active = false;
    this.choice = false;
    this.icon = false;
    this.wide = false;
    this.fixed = false;
    this.fit = false;
    this.danger = false;
    this.menuItem = false;
    this.primary = false; // Default to no-background (no attribute)
    this.secondary = false;
    this.disabled = false;
    this.blank = false;
    this.language = "en-US";
    this.text = "";
    this.label = "";
    this.href = "";
    this.target = "";
    this.rel = "";
    this._loading = false;
  }

  static styles = [unsafeCSS(styles), unsafeCSS(hostStyles), unsafeCSS(splitStyles)];

  /**
   * A button holding only an icon — every close button — says so on its host,
   * so its styles can make it a 16-unit square with the icon filling it.
   */
  _reflectIcon() {
    if (this.control !== "native" || this.split) return;
    const only = this.firstElementChild;
    const icon = !this.text && this.childElementCount === 1 && only?.localName === 'ds-icon' && !(this.textContent ?? '').trim();
    this.toggleAttribute('icon', !!icon);
  }

  private syncSlottedControl() {
    if (this.control !== "slotted" || this.split) return;
    const button = this.querySelector<HTMLButtonElement>(":scope > button");
    if (button) button.disabled = this.splitDisabled;
  }

  /** A split is a named group from the moment it is in the document, before its first render. */
  private syncSplitRole() {
    if (this.split && !this.hasAttribute("role")) { this.setAttribute("role", "group"); this.splitRole = true; }
    else if (!this.split && this.splitRole) { this.removeAttribute("role"); this.splitRole = false; this.syncControl(); }
  }

  updated() {
    this.syncSplitRole();
    this.syncSlottedControl();
  }

  focus(options?: FocusOptions) {
    if (this.split) { focusSplit(this, options); return; }
    if (this.control === "slotted") this.querySelector<HTMLElement>(":scope > :is(button, a)")?.focus(options);
    else if (this.hostControl) super.focus(options);
    else this.shadowRoot?.querySelector<HTMLElement>('[part="control"]')?.focus(options);
  }

  connectedCallback() {
    super.connectedCallback();
    this.syncSplitRole();
    this._reflectIcon();
    this.syncSlottedControl();
    window.addEventListener("language-changed", this.splitLanguageChanged);
    window.addEventListener("translations-loaded", this.splitLanguageChanged);
  }

  disconnectedCallback() {
    window.removeEventListener("language-changed", this.splitLanguageChanged);
    window.removeEventListener("translations-loaded", this.splitLanguageChanged);
    super.disconnectedCallback();
  }
  formDisabledCallback(disabled: boolean) { this._fieldsetDisabled = disabled; this.syncSlottedControl(); }

  render() {
    if (this.split) return renderSplit(this);
    const hasTextProps = this.text;
    if (this.control === "slotted") return html`<slot @slotchange=${this.syncSlottedControl}></slot>`;
    if (this.hostControl) return html`<slot name="icon"></slot><slot></slot><slot name="trailing"></slot>`;

    const content = hasTextProps
      ? html`<ds-text .text=${this.text}></ds-text>`
      : html`<slot @slotchange=${this._reflectIcon}></slot>`;

    if (this.href) {
      const disabled = this.splitDisabled;
      const target = this.target || (this.blank ? "_blank" : "");
      const rel = this.rel || (target === "_blank" ? "noopener noreferrer" : "");
      return html`<a
        part="control"
        ?primary=${this.primary}
        ?secondary=${this.secondary}
        href=${ifDefined(disabled ? undefined : this.href)}
        target=${ifDefined(disabled || !target ? undefined : target)}
        rel=${ifDefined(disabled || !rel ? undefined : rel)}
        role=${ifDefined(disabled ? "link" : undefined)}
        aria-disabled=${ifDefined(disabled ? "true" : undefined)}
        aria-label=${ifDefined(this.label || undefined)}
        @click=${this._handleClick}
      >${content}</a>`;
    }

    return html`
      <button
        part="control"
        type="button"
        ?primary=${this.primary}
        ?secondary=${this.secondary}
        ?disabled=${this.splitDisabled}
        aria-label=${ifDefined(this.label || undefined)}
        @click=${this._handleClick}
      >
        ${content}
      </button>
    `;
  }

  private _handleClick(e: Event) {
    // Prevent any action if disabled and stop event propagation
    if (this.splitDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Otherwise the native click bubbles from the inner <button> or <a>
    // through the shadow boundary to consumers of <ds-button>, and a link
    // navigates as the browser does. Nothing is re-dispatched or redirected.
  }
}

define("ds-button", Button);

declare global {
  interface HTMLElementTagNameMap {
    "ds-button": Button;
  }
}
