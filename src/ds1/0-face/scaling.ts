/**
 * Design system 1's scale, `--sf`: every measure is multiplied by it.
 *
 * A computer stays at 1, however narrow its window. A phone or a tablet (a
 * mobile browser, or a touch screen whose shorter side is at most 820px) is
 * drawn as if the screen were 280 units wide: the scale is the page's width
 * over 280, never under 0.75 or over 2, so a 375px phone draws everything a
 * third larger. The page's width is never taken as more than the screen's, so
 * a page that a phone has widened and zoomed out never scales itself larger.
 *
 * `startScaling()` puts the scale on the page and keeps it there through
 * resizes and turns; `applyScaling()` does it once. Both set `--sf` and, on a
 * phone or tablet, `data-mobile` on the root element. The module imports
 * nothing, so a page without the components copies it alone (Sync 1's `root`
 * export with `"modules": ["scaling"]`). Call it before the page renders, and
 * the first paint is already to scale.
 *
 * A surface, such as a phone drawn on a page, scales to its own width
 * instead: `startScaling({ surface: element })`, or `surface: true` for every
 * `[data-ds-surface]` element. The same rule and snapping apply, on any
 * device, and `--sf` and `--ds-sf` go on the surface alone.
 */
export type ScalingMode = "auto" | "fixed" | "fluid";

/**
 * How the scale is rounded. `"layout"`: a square (20 units) is a whole number
 * of the 1/64px steps browsers lay pages out in, so a long run of rows stays on
 * ruled lines drawn exactly. `"pixel"`: a square is a whole number of device
 * pixels, rounded down, so every grid line and hairline stays sharp.
 * Without it the scale keeps three decimals.
 */
export type ScalingSnap = "layout" | "pixel" | false;

export interface ScalingConfig {
  mode: ScalingMode;
  baseWidth: number;
  minScale: number;
  maxScale: number;
  snap?: ScalingSnap;
}

export interface ScalingOptions extends Partial<ScalingConfig> {
  /**
   * The element that receives `--sf` and `data-mobile`; the document's root by
   * default. With an element `surface`, the element that receives that
   * surface's `--sf` (the surface itself by default).
   */
  root?: HTMLElement;
  /**
   * Scale to a surface's own width rather than the page's: an element (a
   * phone drawn on a page), or `true` for every element marked
   * `data-ds-surface` in the document when the call is made. A surface is
   * measured by its `clientWidth` and scaled on any device, a computer too,
   * with the same rule and snapping; `--sf` and `--ds-sf` (for the shared
   * components inside) go on the surface, the page and `data-mobile` are left
   * alone. Its width must not depend on its own scale.
   */
  surface?: HTMLElement | boolean;
}

// ============================================================================
// Configuration
// ============================================================================

export const defaultScalingConfig: ScalingConfig = {
  mode: "auto",
  baseWidth: 280,
  minScale: 0.75,
  maxScale: 2.0,
};

/** One square in units. */
const SQUARE = 20;
/** Browsers lay pages out in 1/64px steps. */
const LAYOUT_STEPS = 64;

/** The factor, rounded so that a square is a whole number of 1/64px layout steps. */
export function toLayoutStep(factor: number): number {
  return Math.round(factor * SQUARE * LAYOUT_STEPS) / (SQUARE * LAYOUT_STEPS);
}

/** The factor, rounded down so that a square is a whole number of device pixels. */
export function toDevicePixel(factor: number, pixelRatio = 1): number {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  return Math.floor(factor * SQUARE * ratio) / (SQUARE * ratio);
}

export function calculateScalingFactor(viewportWidth: number, config: ScalingConfig = defaultScalingConfig, pixelRatio = 1): number {
  if (config.mode === "fixed") return 1;
  const factor = Math.max(config.minScale, Math.min(config.maxScale, viewportWidth / config.baseWidth));
  if (config.snap === "layout") return toLayoutStep(factor);
  if (config.snap === "pixel") return toDevicePixel(factor, pixelRatio);
  return Number(factor.toFixed(3));
}

// ============================================================================
// Device
// ============================================================================

/**
 * Whether the page is on a phone or a tablet, the screens that scale: the
 * browser says it is mobile, or the screen takes touch and its shorter side
 * is at most 820px. A computer is never one, however narrow its window.
 */
export function detectMobileDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const agent = navigator.userAgent || navigator.vendor || "";
  const byAgent = /Mobile|Android|iP(ad|hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)|Windows Phone|Phone|Tablet/i.test(agent);
  const touch = (navigator.maxTouchPoints || 0) > 1;
  const narrow = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
  return byAgent || (touch && narrow);
}

// ============================================================================
// Applying the scale
// ============================================================================

/** The surfaces a call scales: the element given, or every `[data-ds-surface]` for `true`. */
function surfacesOf(surface: ScalingOptions["surface"]): HTMLElement[] {
  if (!surface) return [];
  if (surface === true) return Array.from(document.querySelectorAll<HTMLElement>("[data-ds-surface]"));
  return [surface];
}

/** Scales one surface to its own width, whatever the device. */
function applySurface(surface: HTMLElement, target: HTMLElement, config: Partial<ScalingConfig>): number {
  const factor = calculateScalingFactor(surface.clientWidth || 0, { ...defaultScalingConfig, ...config }, window.devicePixelRatio || 1);
  // Shared components inside read --ds-sf, resolved at their own host, so they draw at the surface's scale too.
  target.style.setProperty("--sf", String(factor));
  target.style.setProperty("--ds-sf", String(factor));
  return factor;
}

/**
 * Puts the scale on the page once: `--sf`, and `data-mobile` on a phone or
 * tablet. With `surface`, puts each surface's own scale on it instead. Returns
 * the factor (the first surface's, or 1 when there is none).
 */
export function applyScaling(options: ScalingOptions = {}): number {
  if (typeof document === "undefined" || typeof window === "undefined") return 1;
  const { root, surface, ...config } = options;
  if (surface) {
    const factors = surfacesOf(surface).map(element => applySurface(element, (surface !== true && root) || element, config));
    return factors[0] ?? 1;
  }
  return applyPage(root ?? document.documentElement, config);
}

/**
 * The screen's own width as it is held, in CSS pixels: the widest a page on it
 * is laid out at, or 0 when the browser does not say. iOS gives the screen's
 * upright width whichever way it is turned, so the side is taken by the turn.
 */
export function screenWidth(): number {
  const { width = 0, height = 0 } = window.screen ?? {};
  if (!width || !height) return 0;
  const turn = window.screen.orientation?.type;
  const landscape = turn ? turn.startsWith("landscape") : window.matchMedia?.("(orientation: landscape)").matches ?? width > height;
  return landscape ? Math.max(width, height) : Math.min(width, height);
}

function applyPage(root: HTMLElement, config: Partial<ScalingConfig>): number {
  const mobile = detectMobileDevice();
  // The page's width without its scroll bar, never more than the screen's: when something reaches
  // past the edge, a phone's browser widens the page and zooms out, and a scale read from that
  // width would draw everything larger, which keeps the page too wide and zoomed out.
  const page = document.documentElement.clientWidth || window.innerWidth || 0;
  const held = mobile ? screenWidth() : 0;
  const width = held ? Math.min(page, held) : page;
  const factor = mobile ? calculateScalingFactor(width, { ...defaultScalingConfig, ...config }, window.devicePixelRatio || 1) : 1;
  root.style.setProperty("--sf", String(factor));
  root.toggleAttribute("data-mobile", mobile);
  return factor;
}

/**
 * Puts the scale on the page now and again on every resize and turn; a
 * surface is followed as its own size changes. Returns a function that stops
 * following.
 */
export function startScaling(options: ScalingOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const { root, surface, ...config } = options;
  // Surfaces are found once, so the same ones are followed until stopped.
  const surfaces = surfacesOf(surface);
  const apply = surface
    ? () => { for (const element of surfaces) applySurface(element, (surface !== true && root) || element, config); }
    : () => { applyPage(root ?? document.documentElement, config); };
  apply();
  const observer = surfaces.length && typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null;
  for (const element of surfaces) observer?.observe(element);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
  };
}
