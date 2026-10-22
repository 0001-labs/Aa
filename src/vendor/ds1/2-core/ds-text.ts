import { LitElement, html, unsafeCSS } from "lit";
import { getText, currentLanguage } from "../0-face/i18n";
import { define } from "../0-face/define";
import { CutFades } from "../0-face/cut-fade";
import styles from "./styles/ds-text.css?inline";

/**
 * A component for displaying text from translations
 *
 * @element ds-text
 * @prop {string} text - The translation key (optional if using slot content)
 * @prop {boolean} literal - The text is what someone wrote, not a key: show it
 *   as it stands, never looked up, never translated
 * @prop {"muted" | "title" | "warning" | "danger"} tone - A quieter colour, the
 *   title grey, the warning colour for something that needs care, or the
 *   danger colour for a failure or a loss
 * @prop {"small" | "heading" | "display"} size - 10px, a 13px heading on one
 *   square, or a 20px title on two squares
 * @prop {boolean} strong - The medium weight
 * @prop {boolean} wrap - Let the text run over several lines, each one square
 *
 * Literal text that does not fit its width is cut and fades out over its last
 * square, never an ellipsis: the element marks itself `data-cut="end"` while
 * its words are wider than its box, and takes the mark off when they fit.
 *
 * The four work alike for a translation key and for literal text. For a
 * heading, give the element `role="heading"` and `aria-level`.
 *
 * @example
 * // Using slot content as the key (preferred)
 * <ds-text>Welcome to the app</ds-text>
 *
 * // Using text attribute (still supported)
 * <ds-text text="Welcome to the app"></ds-text>
 *
 * // Something a person typed: a list title, an item, a search they saved
 * <ds-text literal text="Marketing plan"></ds-text>
 *
 * // A translated message over several lines, in the danger colour
 * <ds-text wrap tone="danger" role="alert">Couldn't save your changes</ds-text>
 */
export class Text extends LitElement {
  static get properties() {
    return {
      text: { type: String, reflect: true },
      literal: { type: Boolean, reflect: true },
      tone: { type: String, reflect: true },
      size: { type: String, reflect: true },
      strong: { type: Boolean, reflect: true },
      wrap: { type: Boolean, reflect: true },
      _text: { type: String, state: true },
    };
  }

  declare text: string;
  declare literal: boolean;
  declare tone?: "muted" | "title" | "warning" | "danger";
  declare size?: "small" | "heading" | "display";
  declare strong: boolean;
  declare wrap: boolean;
  declare _text: string;
  declare _currentLanguage: string;
  private _slotKey: string = "";
  /** Marks the element cut while its literal words are wider than its box. */
  protected readonly cuts = new CutFades(this, { targets: () => (this.literal && !this.wrap ? [this] : []), text: true });
  private boundHandlers: { languageChanged: EventListener };

  constructor() {
    super();
    this.text = "";
    this.literal = false;
    this.strong = false;
    this.wrap = false;
    this._text = "";
    this._currentLanguage = currentLanguage.value;

    // Create bound event handlers for proper cleanup
    this.boundHandlers = {
      languageChanged: (() => {
        this._currentLanguage = currentLanguage.value;
        this._updateLanguageAttribute();
        this._loadText();
        this.requestUpdate();
      }) as EventListener,
    };
  }

  static styles = unsafeCSS(styles);

  connectedCallback() {
    super.connectedCallback();

    // Capture slot content as the translation key if no text attribute
    if (!this.text && !this.literal) {
      const slotContent = this.textContent?.trim() || "";
      if (slotContent) {
        this._slotKey = slotContent;
        // Clear the slot content - we'll render the translation in shadow DOM
        this.textContent = "";
      }
    }

    this._currentLanguage = currentLanguage.value;
    this._updateLanguageAttribute();
    this._loadText();

    // Listen for language changes
    window.addEventListener(
      "language-changed",
      this.boundHandlers.languageChanged
    );

    // Also listen for translations loaded event
    window.addEventListener(
      "translations-loaded",
      this.boundHandlers.languageChanged
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      "language-changed",
      this.boundHandlers.languageChanged
    );
    window.removeEventListener(
      "translations-loaded",
      this.boundHandlers.languageChanged
    );
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has("text") || changedProperties.has("literal")) {
      this._loadText();
    }
  }

  _updateLanguageAttribute() {
    const lang = this._currentLanguage || currentLanguage.value;
    // Handles "ja", "ja-JP", "zh-Hant", "zh-Hans", etc.
    const parts = (lang || "").toLowerCase().split(/[-_]/).filter(Boolean);
    const primaryLang = parts[0] || "";

    if (primaryLang === "ja") {
      this.setAttribute("data-language", "ja");
      return;
    }

    if (primaryLang === "zh") {
      // Prefer explicit script; otherwise infer from common regions.
      const hasHans =
        parts.includes("hans") || parts.includes("cn") || parts.includes("sg");
      const hasHant =
        parts.includes("hant") ||
        parts.includes("tw") ||
        parts.includes("hk") ||
        parts.includes("mo");

      if (hasHans) this.setAttribute("data-language", "zh-hans");
      else if (hasHant) this.setAttribute("data-language", "zh-hant");
      else this.setAttribute("data-language", "zh");
      return;
    }

    this.removeAttribute("data-language");
  }

  _loadText() {
    // Use text attribute first, then slot content as fallback
    const key = this.text || this._slotKey;

    if (!key) {
      this._text = "";
      this._updateLanguageAttribute();
      return;
    }

    // What someone wrote stands as it is: a list called "Home" stays "Home",
    // and nothing about it reaches the translations.
    if (this.literal) {
      this._text = key;
      this._updateLanguageAttribute();
      return;
    }

    try {
      const translatedText = getText(key);
      this._text = translatedText || key;
    } catch (error) {
      console.error("Error loading text for key:", key, error);
      this._text = key;
    }
    this._updateLanguageAttribute();
  }

  render() {
    if (this.literal && !this.text) return html`<slot></slot>`;
    return html`<span>${this._text || this.text || this._slotKey}</span>`;
  }
}

define("ds-text", Text);

declare global {
  interface HTMLElementTagNameMap {
    "ds-text": Text;
  }
}
