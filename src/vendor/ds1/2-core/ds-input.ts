// ds-input.ts
// Input component for text and other input types

import { LitElement, html, unsafeCSS, type CSSResultGroup, type PropertyDeclarations } from "lit";
import { live } from "lit/directives/live.js";
import { styleMap } from "lit/directives/style-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { define } from "../0-face/define";
import seeIcon from "../x-icon/password-see.svg?url";
import unseeIcon from "../x-icon/password-unsee.svg?url";
import { getText, currentLanguage } from "../0-face/i18n";
import "./ds-text";
import styles from "./styles/ds-input.css?inline";

/** The autofill a field's type implies when it names none of its own. */
const TYPE_AUTOCOMPLETE: Partial<Record<string, string>> = {
  email: "email",
  tel: "tel",
  url: "url",
  password: "current-password",
};

export class Input extends LitElement {
  static formAssociated = true;
  private readonly focusFromLabel = (event: MouseEvent) => {
    if (event.composedPath()[0] === this && !this.disabled && !this._formDisabled) this.focus();
  };
  private internals = typeof this.attachInternals === "function" ? this.attachInternals() : null;
  private initialValue: string | undefined;
  static properties: PropertyDeclarations = {
    type: { type: String, reflect: true },
    // A text area: the same field across whole rows.
    multiline: { type: Boolean, reflect: true },
    rows: { type: Number },
    maxRows: { type: Number, attribute: "max-rows" },
    autoGrow: { type: Boolean, attribute: "auto-grow", reflect: true },
    wrap: { type: String },
    inputMode: { type: String, attribute: "inputmode" },
    enterKeyHint: { type: String, attribute: "enterkeyhint" },
    list: { type: String },
    suggestions: { attribute: false },
    ariaLabel: { type: String, attribute: "aria-label" },
    ariaLabelledBy: { type: String, attribute: "aria-labelledby" },
    ariaDescribedBy: { type: String, attribute: "aria-describedby" },
    spellcheckHint: { type: String, attribute: "spellcheck" },
    ariaInvalid: { type: String, attribute: "aria-invalid" },
    revealable: { type: Boolean, reflect: true },
    quietFocus: { type: Boolean, attribute: "quiet-focus", reflect: true },
    _passwordVisible: { type: Boolean, state: true },
    _formDisabled: { type: Boolean, state: true },
    name: { type: String, reflect: true },
    value: { type: String },
    placeholder: { type: String },
    placeholderKey: { type: String, attribute: "placeholder-key" },
    label: { type: String },
    labelText: { type: String, attribute: "label-text" },
    disabled: { type: Boolean, reflect: true },
    readonly: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    autofocus: { type: Boolean },
    autocomplete: { type: String },
    pattern: { type: String },
    minlength: { type: Number },
    maxlength: { type: Number },
    min: { type: String },
    max: { type: String },
    step: { type: String },
    variant: { type: String, reflect: true },
    error: { type: String },
    errorText: { type: String, attribute: "error-text" },
    _focused: { type: Boolean, state: true },
    _placeholder: { type: String, state: true },
    _currentLanguage: { type: String, state: true },
  };

  declare type:
    | "text"
    | "password"
    | "email"
    | "number"
    | "tel"
    | "url"
    | "search"
    | "date"
    | "month"
    | "week"
    | "time"
    | "datetime-local";
  declare multiline: boolean;
  declare rows: number;
  declare maxRows: number;
  declare autoGrow: boolean;
  declare wrap: "soft" | "hard" | "off";
  private resizeFrame = 0;
  private measuredWidth = 0;
  private resizeObserver?: ResizeObserver;
  private readonly fontsChanged = () => this.resizeToContent();
  declare inputMode: string;
  /** The return key's label on a touch keyboard: enter, done, go, next, previous, search or send. */
  declare enterKeyHint: string;
  /**
   * The id of a `<datalist>` beside the field. A shadow root keeps the inner
   * input from reaching it, so its options are mirrored inside, and kept in step.
   */
  declare list: string;
  /** Suggestions offered while typing, as a datalist would. Wins over `list`. */
  declare suggestions: readonly (string | { value: string; label?: string })[];
  private listObserver?: MutationObserver;
  declare ariaLabel: string;
  declare ariaLabelledBy: string;
  declare ariaDescribedBy: string;
  declare spellcheckHint: string;
  declare ariaInvalid: string;
  declare revealable: boolean;
  declare quietFocus: boolean;
  declare _passwordVisible: boolean;
  declare _formDisabled: boolean;
  declare name: string;
  declare value: string;
  declare placeholder: string;
  declare placeholderKey: string;
  declare label: string;
  declare labelText: string;
  declare disabled: boolean;
  declare readonly: boolean;
  declare required: boolean;
  declare autofocus: boolean;
  declare autocomplete: string;
  declare pattern: string;
  declare minlength: number;
  declare maxlength: number;
  declare min: string;
  declare max: string;
  declare step: string;
  declare variant: "default" | "filled" | "outlined" | "row" | "field" | "plain";
  declare error: string;
  declare errorText: string;
  declare _focused: boolean;
  declare _placeholder: string;
  declare _currentLanguage: string;
  private boundHandlers: { languageChanged: EventListener };

  constructor() {
    super();
    this.type = "text";
    this.multiline = false;
    this.rows = 3;
    this.maxRows = 10;
    this.autoGrow = false;
    this.wrap = "soft";
    this.inputMode = "";
    this.enterKeyHint = "";
    this.list = "";
    this.suggestions = [];
    this.ariaLabel = "";
    this.ariaLabelledBy = "";
    this.ariaDescribedBy = "";
    this.spellcheckHint = "";
    this.ariaInvalid = "";
    this.revealable = false;
    this.quietFocus = false;
    this._passwordVisible = false;
    this._formDisabled = false;
    this.name = "";
    this.value = "";
    this.placeholder = "";
    this.placeholderKey = "";
    this.label = "";
    this.labelText = "";
    this.disabled = false;
    this.readonly = false;
    this.required = false;
    this.autofocus = false;
    this.autocomplete = "";
    this.pattern = "";
    this.minlength = 0;
    this.maxlength = -1;
    this.min = "";
    this.max = "";
    this.step = "";
    this.variant = "default";
    this.error = "";
    this.errorText = "";
    this._focused = false;
    this._placeholder = "";
    this._currentLanguage = currentLanguage.value;

    // Create bound event handlers for proper cleanup
    this.boundHandlers = {
      languageChanged: (() => {
        this._currentLanguage = currentLanguage.value;
        this._loadPlaceholder();
        this.requestUpdate();
      }) as EventListener,
    };
  }

  static styles: CSSResultGroup = unsafeCSS(styles);

  connectedCallback() {
    super.connectedCallback();
    this._currentLanguage = currentLanguage.value;
    this._loadPlaceholder();
    this.addEventListener("click", this.focusFromLabel);

    // Listen for language changes
    window.addEventListener("language-changed", this.boundHandlers.languageChanged);

    // Also listen for translations loaded event
    window.addEventListener("translations-loaded", this.boundHandlers.languageChanged);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        if (this.clientWidth !== this.measuredWidth || entries.some(entry => entry.target !== this)) {
          this.measuredWidth = this.clientWidth;
          this.resizeToContent();
        }
      });
      this.resizeObserver.observe(this);
      const metric = this.shadowRoot?.querySelector(".row-metric");
      if (metric) this.resizeObserver.observe(metric);
    }
    document.fonts?.addEventListener("loadingdone", this.fontsChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.focusFromLabel);
    window.removeEventListener("language-changed", this.boundHandlers.languageChanged);
    window.removeEventListener("translations-loaded", this.boundHandlers.languageChanged);
    this.listObserver?.disconnect();
    this.listObserver = undefined;
    this.resizeObserver?.disconnect();
    document.fonts?.removeEventListener("loadingdone", this.fontsChanged);
    cancelAnimationFrame(this.resizeFrame);
  }

  firstUpdated(): void {
    if (this.autofocus) this.focus();
    // A fixed-width field can change scale without changing its width. Measure
    // one shared row separately from the content height that we set ourselves.
    const metric = this.shadowRoot?.querySelector(".row-metric");
    if (metric) this.resizeObserver?.observe(metric);
  }

  willUpdate(changed: Map<string, unknown>): void {
    // A multiline field stands on its own by default, in the field treatment.
    if (changed.has("multiline") && this.multiline && this.variant === "default" && !this.hasAttribute("variant")) this.variant = "field";
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    if (changedProperties.has("placeholder") || changedProperties.has("placeholderKey")) {
      this._loadPlaceholder();
    }
    if (this.initialValue === undefined) this.initialValue = this.value;
    if (changedProperties.has("type") && this.type !== "password") this._passwordVisible = false;
    if (this.multiline) this.resizeToContent();
    if (changedProperties.has("list")) this.observeList();
    this.syncForm();
  }

  private listSource(): HTMLDataListElement | null {
    if (!this.list) return null;
    const root = this.getRootNode() as Document | ShadowRoot;
    const source = root.getElementById?.(this.list);
    return source instanceof HTMLDataListElement ? source : null;
  }

  private observeList(): void {
    this.listObserver?.disconnect();
    this.listObserver = undefined;
    const source = this.listSource();
    if (!source || typeof MutationObserver === "undefined") return;
    this.listObserver = new MutationObserver(() => this.requestUpdate());
    this.listObserver.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  /** The options the field offers, from `suggestions` or the named datalist. */
  protected suggestionOptions(): { value: string; label?: string }[] {
    if (this.suggestions?.length) return this.suggestions.map((option) => (typeof option === "string" ? { value: option } : option));
    const source = this.listSource();
    return source ? [...source.options].map((option) => ({ value: option.value, label: option.label !== option.value ? option.label : undefined })) : [];
  }

  protected renderSuggestions(options: { value: string; label?: string }[]) {
    return options.length
      ? html`<datalist id="suggestions">${options.map((option) => html`<option value=${option.value} label=${ifDefined(option.label)}></option>`)}</datalist>`
      : null;
  }

  protected get input(): HTMLInputElement | HTMLTextAreaElement | null {
    return this.shadowRoot?.querySelector("input, textarea") ?? null;
  }
  protected get isMultiline(): boolean {
    return this.multiline;
  }
  get selectionStart(): number | null {
    return this.input?.selectionStart ?? null;
  }
  get selectionEnd(): number | null {
    return this.input?.selectionEnd ?? null;
  }
  setSelectionRange(start: number, end: number, direction?: "forward" | "backward" | "none"): void {
    this.input?.setSelectionRange(start, end, direction);
  }
  get valueAsNumber(): number {
    const input = this.input;
    return input instanceof HTMLInputElement ? input.valueAsNumber : NaN;
  }
  get labels(): NodeList | undefined {
    return this.internals?.labels;
  }
  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null;
  }
  get validity(): ValidityState | undefined {
    return this.input?.validity;
  }
  get validationMessage(): string {
    return this.input?.validationMessage ?? "";
  }
  get willValidate(): boolean {
    return this.input?.willValidate ?? false;
  }

  private syncForm(): void {
    const input = this.input;
    if (!input) return;
    this.internals?.setFormValue(this.disabled || this._formDisabled ? null : this.value);
    const message = this.errorText ? getText(this.errorText) : this.error;
    input.setCustomValidity(message || "");
    this.internals?.setValidity(input.validity, input.validationMessage, input);
  }

  checkValidity(): boolean {
    this.syncForm();
    return this.input?.checkValidity() ?? true;
  }
  reportValidity(): boolean {
    this.syncForm();
    return this.input?.reportValidity() ?? true;
  }
  formDisabledCallback(disabled: boolean): void {
    this._formDisabled = disabled;
    // The browser can deliver this reaction while Lit reflects `disabled`,
    // after render has already read the old state. Schedule a fresh render
    // after that update so native inputs and inherited textareas re-enable.
    queueMicrotask(() => { if (this.isConnected) this.requestUpdate(); });
  }
  formResetCallback(): void {
    this.value = this.getAttribute("value") ?? this.initialValue ?? "";
    this._passwordVisible = false;
    this.internals?.setFormValue(this.value);
    this.dispatchEvent(new Event("input-reset", { bubbles: true, composed: true }));
  }
  formStateRestoreCallback(state: string | File | FormData): void {
    if (typeof state === "string") {
      this.value = state;
      this.internals?.setFormValue(state);
    }
  }

  /**
   * What the browser may fill in. Without `autocomplete` an email, phone,
   * web address or password field says what it holds (a sign-up's password
   * sets "new-password"), and any other field is left to the browser, as a
   * native input is; "off" still turns it off.
   */
  protected resolvedAutocomplete(): string | undefined {
    if (this.autocomplete) return this.autocomplete;
    if (this.multiline) return undefined;
    return TYPE_AUTOCOMPLETE[this.type];
  }

  protected accessibleLabel(): string | undefined {
    if (this.ariaLabel) return this.ariaLabel;
    const root = this.getRootNode() as Document | ShadowRoot;
    const label = (this.ariaLabelledBy ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const element = root.getElementById?.(id);
        const key = element?.getAttribute("text");
        return key ? getText(key) : (element?.textContent?.trim() ?? "");
      })
      .join(" ")
      .trim();
    if (label) return label;
    return (
      Array.from(this.internals?.labels ?? [])
        .map((label) => label.textContent?.trim() ?? "")
        .join(" ")
        .trim() || undefined
    );
  }

  private togglePassword(): void {
    const input = this.input;
    if (!(input instanceof HTMLInputElement) || this.disabled || this._formDisabled) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    this._passwordVisible = !this._passwordVisible;
    // Change only display. The field's public type stays password for forms and adapters.
    input.type = this._passwordVisible ? "text" : "password";
    if (start !== null && end !== null) input.setSelectionRange(start, end);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    // Trusted browser events may run a microtask checkpoint between listeners.
    // Wait until the complete dispatch so an outer application handler can cancel.
    setTimeout(() => {
      const form = this.form;
      if (event.defaultPrevented || !form || this.disabled || this._formDisabled) return;
      const controls = Array.from(form.elements);
      const submit = controls.find(
        (element) =>
          (element instanceof HTMLButtonElement && element.type === "submit") ||
          (element instanceof HTMLInputElement && element.type === "submit"),
      ) as HTMLButtonElement | HTMLInputElement | undefined;
      if (submit) {
        if (!submit.disabled) submit.click();
        return;
      }
      const blockingTypes = new Set([
        "text",
        "search",
        "url",
        "tel",
        "email",
        "password",
        "date",
        "month",
        "week",
        "time",
        "datetime-local",
        "number",
      ]);
      const fields = controls.filter(
        (element) =>
          (element instanceof HTMLInputElement || element instanceof Input) &&
          blockingTypes.has(element.type),
      );
      if (fields.length === 1) form.requestSubmit();
    }, 0);
  }

  protected handleChange(event: Event): void {
    event.stopPropagation();
    this.value = (event.target as HTMLInputElement).value;
    this.syncForm();
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  private _loadPlaceholder() {
    const placeholderText = this.placeholderKey || this.placeholder;
    if (!placeholderText) {
      this._placeholder = "";
      this.requestUpdate();
      return;
    }

    try {
      const translatedText = getText(placeholderText);
      this._placeholder = translatedText || placeholderText;
    } catch (error) {
      // Fallback to original text if translation fails
      this._placeholder = placeholderText;
    }
    this.requestUpdate();
  }

  protected _handleInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.value = target.value;
    this.syncForm();
    this.dispatchEvent(
      new CustomEvent("input-change", {
        detail: { value: this.value, name: this.name },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected _handleFocus(): void {
    this._focused = true;
    this.dispatchEvent(new CustomEvent("input-focus", { bubbles: true }));
  }

  protected _handleBlur(): void {
    this._focused = false;
    this.dispatchEvent(new CustomEvent("input-blur", { bubbles: true }));
  }

  /**
   * Focus the input element
   */
  /** Render the native field within the tap that opens a phone keyboard. */
  renderNow(): void { this.performUpdate(); }

  focus(options?: FocusOptions): void {
    this.input?.focus(options);
  }

  /**
   * Blur the input element
   */
  blur(): void {
    this.input?.blur();
  }

  /**
   * Select all text in the input
   */
  select(): void {
    this.input?.select();
  }

  /** Grow on the row grid, bounded by maxRows; the remainder scrolls. */
  private resizeToContent(): void {
    cancelAnimationFrame(this.resizeFrame);
    const control = this.input;
    if (!control || !this.multiline) return;
    if (!this.autoGrow) {
      control.style.height = "";
      control.style.overflowY = "";
      return;
    }
    this.resizeFrame = requestAnimationFrame(() => {
      if (!this.isConnected) return;
      const computed = getComputedStyle(control);
      const row =
        parseFloat(computed.getPropertyValue("--ds-row-height")) ||
        20 * (parseFloat(computed.getPropertyValue("--ds-sf")) || 1);
      const minimum = Math.max(1, Math.floor(this.rows || 1)) * row;
      const maximum = Math.max(minimum, Math.floor(this.maxRows || this.rows || 1) * row);
      control.style.height = "0px";
      const border = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
      const needed = Math.ceil((control.scrollHeight + border) / row) * row;
      control.style.height = `${Math.max(minimum, Math.min(maximum, needed))}px`;
      control.style.overflowY = needed > maximum ? "auto" : "hidden";
    });
  }

  /** The multiline field: a native textarea across whole rows. */
  protected renderMultiline(hasError: boolean, description: string) {
    const rows = Math.max(1, Math.floor(this.rows || 1));
    return html`<span class="row-metric" aria-hidden="true"></span><textarea
      id="input"
      part="input"
      aria-label=${ifDefined(this.accessibleLabel())}
      aria-invalid=${ifDefined(this.ariaInvalid || (hasError ? "true" : undefined))}
      aria-describedby=${ifDefined([description ? "description" : "", hasError ? "error" : ""].filter(Boolean).join(" ") || undefined)}
      inputmode=${ifDefined(this.inputMode || undefined)}
      enterkeyhint=${ifDefined(this.enterKeyHint || undefined)}
      spellcheck=${ifDefined(this.spellcheckHint || undefined)}
      .name=${this.name}
      .value=${live(this.value)}
      .placeholder=${this._placeholder || this.placeholder}
      ?disabled=${this.disabled || this._formDisabled}
      ?readonly=${this.readonly}
      ?required=${this.required}
      ?autofocus=${this.autofocus}
      autocomplete=${ifDefined(this.resolvedAutocomplete())}
      minlength=${ifDefined(this.minlength || undefined)}
      maxlength=${ifDefined(this.maxlength >= 0 ? this.maxlength : undefined)}
      rows=${rows}
      wrap=${this.wrap || "soft"}
      style=${styleMap({ "--ds-textarea-rows": String(rows) })}
      class=${hasError ? "has-error" : ""}
      @input=${this._handleInput}
      @change=${this.handleChange}
      @focus=${this._handleFocus}
      @blur=${this._handleBlur}
    ></textarea>`;
  }

  protected renderControl(hasError: boolean, description: string) {
    if (this.multiline) return this.renderMultiline(hasError, description);
    const suggestions = this.suggestionOptions();
    return html`<input
      id="input"
      part="input"
      .type=${this.type === "password" && this._passwordVisible ? "text" : this.type}
      aria-label=${ifDefined(this.accessibleLabel())}
      aria-invalid=${ifDefined(this.ariaInvalid || (hasError ? "true" : undefined))}
      aria-describedby=${ifDefined([description ? "description" : "", hasError ? "error" : ""].filter(Boolean).join(" ") || undefined)}
      inputmode=${ifDefined(this.inputMode || undefined)}
      enterkeyhint=${ifDefined(this.enterKeyHint || undefined)}
      list=${ifDefined(suggestions.length ? "suggestions" : undefined)}
      spellcheck=${ifDefined(this.spellcheckHint || undefined)}
      .name=${this.name}
      .value=${live(this.value)}
      .placeholder=${this._placeholder || this.placeholder}
      ?disabled=${this.disabled || this._formDisabled}
      ?readonly=${this.readonly}
      ?required=${this.required}
      ?autofocus=${this.autofocus}
      autocomplete=${ifDefined(this.resolvedAutocomplete())}
      pattern=${ifDefined(this.pattern || undefined)}
      minlength=${ifDefined(this.minlength || undefined)}
      maxlength=${ifDefined(this.maxlength >= 0 ? this.maxlength : undefined)}
      min=${ifDefined(this.min || undefined)}
      max=${ifDefined(this.max || undefined)}
      step=${ifDefined(this.step || undefined)}
      class=${[hasError ? "has-error" : "", this.revealable && this.type === "password" ? "has-reveal" : ""].join(" ")}
      @input=${this._handleInput}
      @change=${this.handleChange}
      @keydown=${this.handleKeyDown}
      @focus=${this._handleFocus}
      @blur=${this._handleBlur}
    />${this.renderSuggestions(suggestions)}`;
  }

  render() {
    const hasError = Boolean(this.error || this.errorText);
    const root = this.getRootNode() as Document | ShadowRoot;
    const description = (this.ariaDescribedBy ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => root.getElementById?.(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");

    return html`
      <div class=${hasError ? "input-wrapper has-error" : "input-wrapper"}>
        ${
          this.label || this.labelText
            ? html`
                <label for="input">
                  ${this.labelText ? html`<ds-text .text=${this.labelText}></ds-text>` : this.label}
                </label>
              `
            : null
        }

        <div class="input-container">
          ${this.renderControl(hasError, description)}
          ${
            !this.isMultiline && this.revealable && this.type === "password"
              ? html`
                  <button
                    class="password-visibility"
                    part="reveal"
                    type="button"
                    aria-label=${getText(this._passwordVisible ? "Hide password" : "Show password")}
                    aria-pressed=${String(this._passwordVisible)}
                    ?disabled=${this.disabled || this._formDisabled}
                    @pointerdown=${(event: PointerEvent) => event.preventDefault()}
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                    }}
                    @click=${this.togglePassword}
                  >
                    <span
                      aria-hidden="true"
                      style=${`--eye-icon: url("${this._passwordVisible ? unseeIcon : seeIcon}")`}
                    ></span>
                  </button>
                `
              : null
          }
        </div>

        ${description ? html`<span id="description" hidden>${description}</span>` : null}
        ${
          hasError
            ? html`
                <div id="error" class="error-message" role="status">
                  ${this.errorText ? html`<ds-text wrap .text=${this.errorText}></ds-text>` : this.error}
                </div>
              `
            : null
        }
      </div>
    `;
  }
}

define("ds-input", Input);

declare global {
  interface HTMLElementTagNameMap {
    "ds-input": Input;
  }
}
