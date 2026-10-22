import { LitElement, html, unsafeCSS } from "lit";
import { define } from "../0-face/define";
import "./ds-button";
import styles from "./styles/ds-file-picker.css?inline";

/** Native file selection, forms and focus, with one shared Button face. */
export class FilePicker extends LitElement {
  static properties = {
    label: { type: String },
    icon: { type: Boolean, reflect: true },
    preview: { type: Boolean, reflect: true },
    area: { type: Boolean, reflect: true },
    dragging: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    primary: { type: Boolean, reflect: true },
    secondary: { type: Boolean, reflect: true },
  };
  static styles = unsafeCSS(styles);
  declare label: string;
  declare icon: boolean;
  declare preview: boolean;
  declare area: boolean;
  declare dragging: boolean;
  declare compact: boolean;
  declare primary: boolean;
  declare secondary: boolean;
  private controlDisabled = false;
  private observer = new MutationObserver(() => this.syncDisabled());
  constructor() {
    super();
    this.label = "";
    this.icon = this.preview = this.area = this.dragging = this.compact = this.primary = this.secondary = false;
  }
  private control() { return this.querySelector<HTMLInputElement>(":scope > input[type=file]"); }
  private syncDisabled() {
    if (!this.isConnected) return;
    const control = this.control();
    this.toggleAttribute("data-menu-item", control?.getAttribute("role") === "menuitem");
    this.controlDisabled = !control || control.matches(":disabled");
    this.toggleAttribute("data-disabled", this.controlDisabled);
    if (this.controlDisabled) this.clearDrag();
    this.requestUpdate();
  }
  private showDrag = (event: DragEvent) => {
    const control = this.control();
    if (control && !control.matches(":disabled") && event.dataTransfer?.types.includes("Files")) {
      this.setAttribute("data-dragging", "");
    }
  };
  private clearDrag = () => { this.removeAttribute("data-dragging"); };
  private observeControl() {
    this.observer.disconnect();
    if (!this.isConnected) return;
    const control = this.control();
    if (control) this.observer.observe(control, { attributes: true, attributeFilter: ["disabled", "role"] });
    for (let parent = this.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName === "fieldset") this.observer.observe(parent, { attributes: true, attributeFilter: ["disabled"] });
    }
    this.syncDisabled();
  }
  connectedCallback() {
    super.connectedCallback(); this.observeControl();
    this.addEventListener("dragenter", this.showDrag);
    this.addEventListener("dragleave", this.clearDrag);
    this.addEventListener("drop", this.clearDrag);
  }
  disconnectedCallback() {
    this.observer.disconnect(); this.clearDrag();
    this.removeEventListener("dragenter", this.showDrag);
    this.removeEventListener("dragleave", this.clearDrag);
    this.removeEventListener("drop", this.clearDrag);
    super.disconnectedCallback();
  }
  focus(options?: FocusOptions) { this.control()?.focus(options); }
  render() {
    return html`<ds-button control="host" inert aria-hidden="true" tabindex="-1"
      .icon=${!this.area && (this.icon || this.preview)} .primary=${this.primary} .secondary=${this.secondary || this.area}
      .disabled=${this.controlDisabled}><slot name="content">${this.label}</slot></ds-button>
      <slot @slotchange=${this.observeControl}></slot>`;
  }
}
define("ds-file-picker", FilePicker);
declare global { interface HTMLElementTagNameMap { "ds-file-picker": FilePicker } }
