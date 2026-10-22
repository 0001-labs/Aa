import { LitElement, html, unsafeCSS } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import styles from "./styles/ds-icon.css?inline";
import type { IconName } from "./generated/ds-icon-map";
import { icons as immediateIcons, deferredIconNames } from "./generated/icons-immediate";
import { define } from "../0-face/define";

const iconNameToSvgMap: Record<string, string> = { ...immediateIcons }
const deferred = new Set<string>(deferredIconNames)

/**
 * Make library drawings available at once, outside the immediate set: a
 * component that always draws one icon (ds-avatar's person) ships that
 * drawing with itself, so it never waits for the deferred chunk.
 */
export function provideIcons(icons: Readonly<Record<string, string>>): void {
  for (const [name, svg] of Object.entries(icons)) iconNameToSvgMap[name.toLowerCase()] ??= svg
}
let extraReady = false
let extraLoading: Promise<void> | undefined
function loadExtraIcons(): Promise<void> {
  return (extraLoading ??= import('./generated/icons-extra')
    .then(({ icons }) => {
      Object.assign(iconNameToSvgMap, icons)
      extraReady = true
    })
    .catch((error) => {
      extraLoading = undefined
      throw error
    }))
}


/**
 * The ink an icon was drawn in, whatever the file happens to say.
 *
 * DS one's icons are exported with the design's own dark ink baked into every
 * path — #1E1E1E, #2A2A2A, plain black — so on dark paper they disappear. A
 * one-colour icon is turned over to `currentColor` here, where the component
 * puts it on the page, so it takes the colour of the text around it.
 *
 * An icon with colours of its own is left exactly as drawn. The block and
 * pattern tiles set dark ink on a coloured ground, and a brand mark keeps
 * the colours that make it that brand. `white` never counts as a colour: in
 * this set it is the rectangle inside a `<clipPath>`.
 */
const INK = /(fill|stroke)=("|')(#1E1E1E|#2A2A2A|#000000|#000|black)\2/gi;
const PAINT = /(?:fill|stroke)=("|')([^"']+)\1/gi;
const NOT_A_COLOUR = /^(none|currentColor|white|#fff|#ffffff|url\(.*\))$/i;
const INK_VALUE = /^(#1E1E1E|#2A2A2A|#000000|#000|black)$/i;

const themed = new Map<string, string>();

function hasOwnColours(svg: string): boolean {
  for (const [, , value] of svg.matchAll(PAINT)) {
    if (!NOT_A_COLOUR.test(value) && !INK_VALUE.test(value)) return true;
  }
  return false;
}

export function themeIconSvg(svg: string): string {
  const known = themed.get(svg);
  if (known !== undefined) return known;
  const next = hasOwnColours(svg) ? svg : svg.replace(INK, '$1="currentColor"');
  themed.set(svg, next);
  return next;
}

export type IconVariant = "glyph" | "primary" | "secondary";

/**
 * Icon component that renders SVG icons from the design system icon set.
 *
 * Usage:
 *   <ds-icon type="close"></ds-icon>
 *   <ds-icon type="home" variant="primary"></ds-icon>
 *
 * Variants:
 *   - glyph (default): No background, inherits text color. Like text.
 *   - primary: Accent color background with contrasting icon color.
 *   - secondary: Subtle background with icon color.
 *
 * An icon that is not in the set can be given as content instead:
 *   <ds-icon><svg>…</svg></ds-icon>
 *
 * Size is `--ds-icon-size` (14px by default) times `--ds-sf`; `size="small"`
 * draws it at 12px and `size="large"` at 16px. Colour is `--ds-icon-color`,
 * which follows the text.
 */
export class Icon extends LitElement {
  static properties = {
    type: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
  };

  private _type: IconName | "" = "";
  private _iconsReady: Promise<void> | undefined;
  private _failedType: string | undefined;
  declare variant: IconVariant;
  declare size: "small" | "large" | undefined;

  constructor() {
    super();
    this.variant = "glyph";
  }

  get type(): IconName | "" {
    return this._type;
  }

  set type(val: IconName | "") {
    const oldVal = this._type;
    this._type = val;
    this.requestUpdate("type", oldVal);
  }

  /** Awaiting an icon also waits for its requested artwork and final render. */
  protected async getUpdateComplete(): Promise<boolean> {
    await super.getUpdateComplete()
    await this._iconsReady
    return super.getUpdateComplete()
  }

  static styles = unsafeCSS(styles);

  render() {
    if (!this._type) {
      return html`<slot></slot>`;
    }

    const svg = iconNameToSvgMap[this._type.toLowerCase() as IconName];
    if (svg) {
      return html`${unsafeHTML(themeIconSvg(svg))}`;
    }

    if (
      !extraReady &&
      deferred.has(this._type.toLowerCase()) &&
      !this._iconsReady &&
      this._failedType !== this._type
    ) {
      const requested = this._type
      this._iconsReady = loadExtraIcons()
        .then(() => {
          this._failedType = undefined
          this.requestUpdate()
        })
        .catch(() => {
          this._failedType = requested
        })
        .finally(() => {
          this._iconsReady = undefined
        })
    }

    // Fallback to slot if icon not found
    return html`<slot></slot>`;
  }
}

define("ds-icon", Icon);

declare global {
  interface HTMLElementTagNameMap {
    "ds-icon": Icon;
  }
}

export type { IconName };
