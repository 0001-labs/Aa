import { LitElement, html, css } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { define } from "../0-face/define";

/** A colour sample, composed with ds-button for selectable library choices. */
export class Swatch extends LitElement {
  static properties = { value: { type: String }, selected: { type: Boolean, reflect: true } };
  declare value: string;
  declare selected: boolean;
  constructor() { super(); this.value = "transparent"; this.selected = false; }
  static styles = css`
    :host { display: inline-block; flex: 0 0 auto; width: calc(var(--ds-08) * var(--ds-sf)); height: calc(var(--ds-08) * var(--ds-sf)); vertical-align: middle; }
    :host([hidden]) { display: none !important; }
    span { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 1px solid var(--ds-border-color); }
    :host([selected]) span { outline: 2px solid var(--ds-text-color); outline-offset: 0; }
  `;
  render() { return html`<span style=${styleMap({ backgroundColor: this.value })}></span>`; }
}
define("ds-swatch", Swatch);
declare global { interface HTMLElementTagNameMap { "ds-swatch": Swatch } }
