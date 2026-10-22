import { html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from "lit";
import { define } from "../0-face/define";
import { shortcutLabel } from "../0-face/keys";
import down from "../x-icon/chevron-down.svg?raw";
import check from "../x-icon/check.svg?raw";
import menuStyles from "./styles/ds-menu.css?inline";
import styles from "./styles/ds-select.css?inline";
import "../2-core/ds-swatch";
import "../2-core/ds-icon";
import { Menu } from "./ds-menu";

/** Keys that open a field's list, as they would open the platform's own picker. */
const OPENING = new Set(["ArrowDown", "ArrowUp", "Enter", " ", "F4"]);
let lists = 0;

/**
 * Select: every menu that opens from a button.
 *
 * Around a native `<select>` it is a field: the select keeps the value, labels,
 * validation, FormData, reset and disabled fieldsets, and DS1 draws the field
 * and, in place of the platform's picker, its own list, one square a choice,
 * the chosen one checked and focused on opening. Options may carry
 * `data-details` (muted words after the name), `data-shortcut` (a shortcut
 * written as the platform does, `"mod+k"`) and `data-icon` (a library icon on
 * the first square); `<optgroup>` labels head their groups. Choosing sets the
 * select's value and sends `input` and `change`. `native` keeps the platform's
 * picker; a `multiple` select or one with `size` above 1 stays a native list.
 *
 * Without a `<select>` it is an action menu, the shared menu engine: entries
 * (`ds-button menu-item`, or `button`/`a` with a menu role) one square a row,
 * separators (`hr data-ds-menu-separator`) and labels (`data-ds-menu-label`),
 * opened by the button named by `for` (or `trigger`), placed half a square from
 * it on whole squares, with the keyboard, typeahead and nested menus. Without
 * an opener it is a list in place.
 */
export class Select extends Menu {
  static properties = {
    ...Menu.properties,
    swatch: { type: String, reflect: true },
    native: { type: Boolean, reflect: true },
  };
  static styles = [unsafeCSS(menuStyles), unsafeCSS(styles), unsafeCSS(`:host { --ds-select-arrow: url("data:image/svg+xml,${encodeURIComponent(down)}"); --ds-select-check: url("data:image/svg+xml,${encodeURIComponent(check)}"); }`)];
  declare swatch: string | undefined;
  /** Keep the platform's own picker for a field. */
  declare native: boolean;
  private listbox = false;
  private fieldDisabled = false;
  private listOpen = false;
  private listId = `ds-select-list-${++lists}`;
  private fieldObserver = new MutationObserver(() => this.syncRows());
  /** A select can arrive after the host connects (parsing, a framework's children): watch for it. */
  private childObserver = new MutationObserver(() => { if (this.control() !== this.bound) this.observeControl(); });

  constructor() {
    super();
    this.swatch = undefined;
    this.native = false;
  }

  /** The native select a field wraps; none for an action menu. */
  private control() {
    const select = this.querySelector(":scope > select");
    return select instanceof HTMLSelectElement ? select : null;
  }
  /** A field: a select drawn by DS1. */
  get field() { return Boolean(this.control()); }
  /** A field whose choices DS1 lists in place of the platform's picker. */
  private get listed() { return this.field && !this.native && !this.listbox; }

  connectedCallback() {
    // A field is a form control, not a list; an action menu is a menu unless told otherwise.
    if (!this.field && !this.hasAttribute("role")) this.setAttribute("role", "menu");
    super.connectedCallback();
    this.childObserver.observe(this, { childList: true });
    this.observeControl();
  }
  disconnectedCallback() {
    this.childObserver.disconnect();
    this.fieldObserver.disconnect();
    this.unbindControl();
    super.disconnectedCallback();
  }
  protected willUpdate(changed: PropertyValues) {
    // An action menu with an opener floats; one without stays in place.
    if (!this.field && !this.hasAttribute("floating") && (this.trigger || this.for)) this.floating = true;
    // A field's suggestions (a controller steering it) close when the field says so.
    this.closesOnChoice = !this.field && !this.controller;
    // A menu from a button fits its words, on whole squares.
    this.toggleAttribute("data-ds-hug", !this.field && this.triggerMode !== "submenu" && !this.controller);
    super.willUpdate(changed);
  }
  focus(options?: FocusOptions) {
    const select = this.control();
    if (select) select.focus(options); else super.focus(options);
  }

  private bound: HTMLSelectElement | null = null;
  private unbindControl() {
    this.bound?.removeEventListener("keydown", this.onFieldKey);
    this.bound = null;
    this.removeEventListener("click", this.onFieldClick);
  }
  private syncRows() {
    const select = this.control();
    this.style.setProperty("--ds-select-rows", String(select ? select.size || (select.multiple ? 4 : 1) : 1));
    this.listbox = Boolean(select && (select.multiple || select.size > 1));
    this.toggleAttribute("data-listbox", this.listbox);
    this.toggleAttribute("data-field", Boolean(select));
    this.toggleAttribute("data-listed", this.listed);
    this.fieldDisabled = Boolean(select?.matches(":disabled"));
    if (select && this.listed) {
      select.setAttribute("aria-haspopup", "listbox");
      select.setAttribute("aria-expanded", String(this.listOpen));
      select.setAttribute("aria-controls", this.listId);
    } else if (select) {
      for (const name of ["aria-haspopup", "aria-expanded", "aria-controls"]) select.removeAttribute(name);
    }
    this.requestUpdate();
  }
  private observeControl = () => {
    this.fieldObserver.disconnect();
    this.unbindControl();
    const select = this.control();
    if (select) {
      this.fieldObserver.observe(select, { attributes: true, attributeFilter: ["size", "multiple", "disabled"], childList: true, subtree: true, characterData: true });
      this.bound = select;
      select.addEventListener("keydown", this.onFieldKey);
      this.addEventListener("click", this.onFieldClick);
      // The menu engine names its host a list; a field is the select's.
      if (this.getAttribute("role") === "menu" || this.getAttribute("role") === "listbox") this.removeAttribute("role");
    }
    for (let parent = this.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName === "fieldset") this.fieldObserver.observe(parent, { attributes: true, attributeFilter: ["disabled"] });
    }
    this.syncRows();
  };

  /** A press anywhere on the field opens its list; the select itself takes no pointer, so no platform picker opens. */
  private onFieldClick = (event: MouseEvent) => {
    if (!this.listed || this.fieldDisabled || event.defaultPrevented) return;
    if (event.composedPath().some(node => node instanceof HTMLElement && node.classList.contains("list"))) return;
    event.preventDefault();
    this.control()?.focus({ preventScroll: true });
    this.setList(!this.listOpen);
  };
  private onFieldKey = (event: KeyboardEvent) => {
    if (!this.listed || this.fieldDisabled || event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey) return;
    if (!OPENING.has(event.key) && !(event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp"))) return;
    event.preventDefault();
    this.setList(true);
  };
  private setList(open: boolean) {
    if (this.listOpen === open) return;
    this.listOpen = open;
    this.control()?.setAttribute("aria-expanded", String(open));
    this.requestUpdate();
  }
  private onListClose = (event: Event) => {
    if (event.target !== this.shadowRoot?.querySelector(".list")) return;
    this.setList(false);
  };
  private choose(option: HTMLOptionElement) {
    const select = this.control();
    if (!select || option.disabled) return;
    if (!option.selected) {
      option.selected = true;
      select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.setList(false);
  }

  private renderOption(option: HTMLOptionElement, index: number): TemplateResult | typeof nothing {
    if (option.hidden) return nothing;
    const label = option.label || option.text;
    const { details, shortcut, icon } = option.dataset;
    return html`<button type="button" role="option" class="choice" id=${`${this.listId}-${index}`} aria-selected=${option.selected ? "true" : "false"}
      ?disabled=${option.disabled || this.fieldDisabled} data-text-value=${label} @click=${(event: Event) => { event.stopPropagation(); this.choose(option); }}>${icon ? html`<ds-icon class="mark" type=${icon} aria-hidden="true"></ds-icon>` : nothing}<span class="name">${label}</span>${details ? html`<span class="details">${details}</span>` : nothing}${shortcut ? html`<span class="shortcut" aria-hidden="true">${shortcut.includes("+") || shortcut.startsWith("mod") ? shortcutLabel(shortcut) : shortcut}</span>` : nothing}<span class="check" aria-hidden="true"></span></button>`;
  }
  private renderChoices() {
    const select = this.control();
    if (!select) return nothing;
    let index = 0;
    return [...select.children].map((child, group) => {
      if (child instanceof HTMLOptionElement) return this.renderOption(child, index++);
      if (!(child instanceof HTMLOptGroupElement) || child.hidden) return nothing;
      const id = `${this.listId}-group-${group}`;
      return html`<div role="group" class="group" aria-labelledby=${id}><div class="group-label" id=${id}>${child.label}</div>${[...child.children].map(option => option instanceof HTMLOptionElement ? this.renderOption(option, index++) : nothing)}</div>`;
    });
  }

  /** The list's name: the select's own, or its label's words without the field inside it. */
  private fieldName(select: HTMLSelectElement | null) {
    if (!select) return "";
    const own = select.getAttribute("aria-label");
    if (own) return own;
    const label = select.labels?.[0];
    if (!label) return "";
    return [...label.childNodes].filter(node => !node.contains(this)).map(node => node.textContent ?? "").join("").trim();
  }

  render() {
    if (!this.field) return super.render();
    const select = this.control();
    const label = this.fieldName(select);
    const disabled = this.fieldDisabled ? "disabled" : "";
    return html`<slot @slotchange=${this.observeControl}></slot><span aria-hidden="true" ?hidden=${this.listbox || Boolean(this.swatch)} class="arrow ${disabled}"></span>${this.swatch && !this.listbox ? html`<ds-swatch aria-hidden="true" .value=${this.swatch} class=${disabled}></ds-swatch>` : null}${this.listed ? html`<ds-menu class="list" id=${this.listId} floating data-ds-hug role="listbox" trigger-mode="manual" aria-label=${label || nothing} .anchor=${this} ?open=${this.listOpen} @ds-menu-close=${this.onListClose}>${this.listOpen ? this.renderChoices() : nothing}</ds-menu>` : nothing}`;
  }
}

define("ds-select", Select);
declare global { interface HTMLElementTagNameMap { "ds-select": Select } }
