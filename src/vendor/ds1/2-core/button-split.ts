import { html, nothing } from "lit";
import { getText } from "../0-face/i18n";
import "./ds-icon";
import "./ds-text";
export interface SplitSegment<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface SplitButtonState extends HTMLElement {
  options: string; segments: ReadonlyArray<SplitSegment> | undefined;
  value: string; disabled: boolean; splitDisabled: boolean;
  actions: boolean; literal: boolean; labelled?: boolean; renderRoot: HTMLElement | DocumentFragment;
}
function choices(host: SplitButtonState): ReadonlyArray<SplitSegment> {
    return host.segments ?? host.options.split(",").map(part => part.trim()).filter(Boolean).map(part => {
      const colon = part.indexOf(":");
      if (colon < 0) return { value: part.toLowerCase(), label: part };
      const value = part.slice(0, colon).trim();
      const label = part.slice(colon + 1).trim();
      if (!label.startsWith("@")) return { value, label };
      const end = label.indexOf(":");
      return { value, icon: label.slice(1, end < 0 ? undefined : end).trim(), label: end < 0 ? value : label.slice(end + 1).trim() };
    });
}
function press(host: SplitButtonState, segment: SplitSegment) {
    if (host.splitDisabled || segment.disabled) return;
    if (host.actions) {
      host.dispatchEvent(new CustomEvent("press", { detail: { value: segment.value }, bubbles: true, composed: true }));
    } else if (segment.value !== host.value) {
      const accepted = host.dispatchEvent(new CustomEvent("change", {
        detail: { value: segment.value }, bubbles: true, composed: true, cancelable: true,
      }));
      if (accepted) host.value = segment.value;
    }
}
export function focusSplit(host: SplitButtonState, options?: FocusOptions) {
  const buttons = [...host.renderRoot.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  (buttons.find(button => button.getAttribute("aria-pressed") === "true") ?? buttons[0])?.focus(options);
}
export function renderSplit(host: SplitButtonState) {
    // `labelled` writes a segment's words after its icon; otherwise an icon stands alone and names it.
    const words = (segment: SplitSegment) => html`<ds-text .text=${segment.label} .literal=${host.literal}></ds-text>`;
    return html`${choices(host).map(segment => html`<button
      type="button" part="segment" value=${segment.value}
      aria-pressed=${host.actions ? nothing : String(segment.value === host.value)}
      aria-label=${segment.icon && !host.labelled ? (host.literal ? segment.label : getText(segment.label)) : nothing}
      ?data-icon=${!!segment.icon && !host.labelled}
      ?data-icon-words=${!!segment.icon && !!host.labelled}
      ?data-short=${segment.label.length === 1}
      ?disabled=${host.splitDisabled || segment.disabled}
      @click=${() => press(host, segment)}
    >${segment.icon
      ? host.labelled
        ? html`<ds-icon type=${segment.icon} aria-hidden="true"></ds-icon>${words(segment)}`
        : html`<ds-icon type=${segment.icon} aria-hidden="true"></ds-icon>`
      : words(segment)}</button>`)}`;
}
