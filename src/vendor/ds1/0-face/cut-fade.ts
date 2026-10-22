/**
 * Cut words fade, never an ellipsis. Wherever Design system 1 cuts words that do
 * not fit (a row's name, a tag, a menu entry, a calendar's title), they fade out
 * over their last square (`var(--ds-unit)`), a mask on the words, so they fade
 * into whatever is behind them. Words that fit stay crisp: the fade is drawn
 * only while an element is marked `data-cut="end"`, and this module is what
 * measures and marks it.
 *
 * Every stylesheet writes the fade the same way: the element clips
 * (`text-overflow: clip`), and only under `[data-cut="end"]` takes
 * `mask-image: linear-gradient(to right, #000 calc(100% - var(--ds-unit)), transparent)`,
 * the gradient running to the left in a right-to-left page.
 *
 * - `watchCuts()` is the watcher a component owns: it marks the elements it
 *   watches while `scrollWidth > clientWidth + 1`, measures again when they
 *   resize, when `measure()` is called (after a render, since words can change
 *   without the box resizing), once the page's fonts have loaded and, with
 *   `text: true`, when the words inside them change. `disconnect()` lets go.
 * - Every watcher measures in the next frame, together with every other one:
 *   all widths are read, then all marks written, so a page building a few
 *   hundred words lays itself out once for them rather than once each. Read
 *   one by one, after each element connected or updated, the words of Ezo's
 *   landing page laid it out again two hundred times, over half a second.
 *   Elements that resize are measured the same way, in one pass for all.
 * - `CutFades` is the same watcher as a Lit reactive controller: it starts when
 *   its element connects, measures after every update and stops when it
 *   disconnects.
 * - `startCutFades()` is for a page without Lit: it marks DS1's native classes
 *   (`.ds-row__name`, `.ds-sidebar__label`, `.ds-menu__item`, …) in the page,
 *   and keeps marking them as the page changes. It returns a function that
 *   stops it.
 */

/** The attribute a cut element carries: `data-cut="end"`. */
export const CUT_ATTRIBUTE = "data-cut";

/**
 * The native classes DS1's stylesheets fade when they are marked cut, for
 * `startCutFades()` on a page without Lit.
 */
export const CUT_FADE_SELECTOR = [
  ".ds-row__name",
  ".ds-sidebar__label",
  ".ds-menu__item",
  ".ds-badge__label",
  ".ds-notice__title",
  ".ds-notice__text",
  ".ds-progress__label",
  ".ds-stat__figure",
  ".ds-document__toc-list a",
  ".ds-footer__links a",
  ".item-text",
].join(", ");

/** Whether an element's words are wider than its box. */
export function isCut(element: Element): boolean {
  return element.scrollWidth > element.clientWidth + 1;
}

/** Marks an element `data-cut="end"` while its words do not fit, and takes the mark off when they do. Returns whether it is cut. */
export function markCut(element: Element): boolean {
  const cut = isCut(element);
  const mark = element.getAttribute(CUT_ATTRIBUTE);
  if (cut) {
    if (mark !== "end") element.setAttribute(CUT_ATTRIBUTE, "end");
  } else if (mark === "end") element.removeAttribute(CUT_ATTRIBUTE);
  return cut;
}

/** Elements to watch: one, several, or a function that finds them again at each measure. */
export type CutSource = Element | Iterable<Element> | (() => Iterable<Element>);

export type CutWatchOptions = {
  /** Also measure again when the words inside a watched element change (a MutationObserver). */
  text?: boolean;
};

export type CutWatcher = {
  /** Watches these elements and measures them. A function is asked again at each measure, so elements a render adds are taken in. */
  watch(source: CutSource): void;
  /** Watches what matches `selector` inside `root`, found again at each measure. */
  select(root: ParentNode, selector: string): void;
  /** Measures every watched element again: after a render, or when words change. */
  measure(): void;
  /** Stops watching and lets every element go. Marks stay as they are. */
  disconnect(): void;
};

type Watched = {
  /** Finds the elements again and observes the new ones; returns them. */
  refresh(): Set<Element>;
  stopped: boolean;
};

/** Reads every element's widths first, then writes every mark, so the page is laid out once for all of them. */
function markAll(elements: Iterable<Element>) {
  const cuts: [Element, boolean][] = [];
  for (const element of elements) if (element.isConnected) cuts.push([element, isCut(element)]);
  hookFonts();
  for (const [element, cut] of cuts) {
    const mark = element.getAttribute(CUT_ATTRIBUTE);
    if (cut) {
      if (mark !== "end") element.setAttribute(CUT_ATTRIBUTE, "end");
    } else if (mark === "end") element.removeAttribute(CUT_ATTRIBUTE);
  }
}

const live = new Set<Watched>();
const queued = new Set<Watched>();
let frame = false;

const nextFrame = (run: () => void) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
};

function flush() {
  frame = false;
  const watchers = [...queued];
  queued.clear();
  const elements = new Set<Element>();
  for (const watcher of watchers) {
    if (watcher.stopped) continue;
    for (const element of watcher.refresh()) elements.add(element);
  }
  markAll(elements);
}

/** Measures this watcher in the next frame, with every other watcher waiting for it. */
function schedule(watcher: Watched) {
  if (watcher.stopped) return;
  queued.add(watcher);
  if (frame) return;
  frame = true;
  nextFrame(flush);
}

// One observer for every watched element: the sizes of a frame arrive in one
// call, read in one pass. An element two watchers hold (a row's name, which the
// row and its ds-text both watch) is let go when the last one does.
let sizes: ResizeObserver | undefined;
const holders = new Map<Element, number>();
function observe(element: Element) {
  if (typeof ResizeObserver === "undefined") return;
  sizes ??= new ResizeObserver(entries => markAll(entries.map(entry => entry.target)));
  const held = holders.get(element) ?? 0;
  if (!held) sizes.observe(element);
  holders.set(element, held + 1);
}
function unobserve(element: Element) {
  const held = holders.get(element);
  if (!held) return;
  if (held > 1) { holders.set(element, held - 1); return; }
  holders.delete(element);
  sizes?.unobserve(element);
}

// Words drawn in a fallback face are narrower or wider once the page's fonts
// arrive. Asking for `document.fonts.ready` lays out a page that has changed,
// so it is asked once, while a measure has just laid the page out anyway.
let fontsHooked = false;
function hookFonts() {
  if (fontsHooked || typeof document === "undefined") return;
  fontsHooked = true;
  const again = () => { for (const watcher of live) schedule(watcher); };
  const fonts = document.fonts;
  fonts?.ready?.then(again, () => {});
  fonts?.addEventListener?.("loadingdone", again);
}

/** A watcher that marks the elements it watches `data-cut="end"` while their words do not fit. */
export function watchCuts(options: CutWatchOptions = {}): CutWatcher {
  const sources: CutSource[] = [];
  let watched = new Set<Element>();
  const words = options.text && typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => schedule(self))
    : undefined;

  const collect = () => {
    const found = new Set<Element>();
    for (const source of sources) {
      const elements = typeof source === "function" ? source() : source instanceof Element ? [source] : source;
      for (const element of elements) found.add(element);
    }
    return found;
  };

  const self: Watched = {
    stopped: false,
    refresh() {
      const next = collect();
      let changed = next.size !== watched.size;
      for (const element of watched) {
        if (!next.has(element)) { unobserve(element); changed = true; }
      }
      for (const element of next) {
        if (!watched.has(element)) { observe(element); changed = true; }
      }
      // A MutationObserver cannot let one element go, so it starts again when the set changes.
      if (words && changed) {
        words.disconnect();
        for (const element of next) words.observe(element, { childList: true, characterData: true, subtree: true });
      }
      watched = next;
      return watched;
    },
  };
  live.add(self);

  return {
    watch(source) { sources.push(source); schedule(self); },
    select(root, selector) { sources.push(() => root.querySelectorAll(selector)); schedule(self); },
    measure() { schedule(self); },
    disconnect() {
      self.stopped = true;
      live.delete(self);
      queued.delete(self);
      for (const element of watched) unobserve(element);
      words?.disconnect();
      watched = new Set();
      sources.length = 0;
    },
  };
}


/**
 * The part of a Lit element `CutFades` uses, so this module needs nothing from
 * Lit. The render root is read as a node to search; it is typed loosely so an
 * element type-checks in every product, whichever DOM library it compiles with.
 */
type ControllerHost = Element & {
  addController(controller: { hostConnected?(): void; hostUpdated?(): void; hostDisconnected?(): void }): void;
  readonly renderRoot?: unknown;
};

export type CutFadeOptions = {
  /** What to measure in the element's render root (its shadow root), found again after every update. */
  selector?: string;
  /** Other elements to measure, asked again after every update: the host itself, its slotted children. */
  targets?: () => Iterable<Element>;
  /** Also measure again when the element's own children or words change (the words slotted into it). */
  text?: boolean;
};

/**
 * The cut-words watcher as a Lit reactive controller:
 * `protected readonly cuts = new CutFades(this, { selector: ".label" })`. It watches from
 * when the element connects to when it disconnects, and measures after every
 * update; call `measure()` when words change outside an update.
 */
export class CutFades {
  private watcher: CutWatcher | undefined;
  private words: MutationObserver | undefined;
  private readonly host: ControllerHost;
  private readonly options: CutFadeOptions;

  constructor(host: ControllerHost, options: CutFadeOptions) {
    this.host = host;
    this.options = options;
    host.addController(this);
  }

  hostConnected() {
    this.hostDisconnected();
    const watcher = watchCuts();
    const { selector, targets, text } = this.options;
    if (selector) watcher.watch(() => ((this.host.renderRoot as ParentNode | undefined) ?? this.host).querySelectorAll(selector));
    if (targets) watcher.watch(targets);
    this.watcher = watcher;
    // Words slotted into the element can change without an update or a resize.
    if (text && typeof MutationObserver !== "undefined") {
      this.words = new MutationObserver(() => this.measure());
      this.words.observe(this.host, { childList: true, characterData: true, subtree: true });
    }
  }

  hostUpdated() { this.measure(); }

  hostDisconnected() {
    this.words?.disconnect();
    this.words = undefined;
    this.watcher?.disconnect();
    this.watcher = undefined;
  }

  /** Measures again, as after an update. */
  measure() { this.watcher?.measure(); }
}

/**
 * Marks DS1's native classes cut on a page without Lit, so their words fade
 * where they are cut, and keeps marking them as the page changes. Returns a
 * function that stops it.
 *
 * @example
 * // A module script on the page, beside one.css and controls.css (Sync 1 `root` `"modules": ["cut-fade"]`):
 * startCutFades();
 */
export function startCutFades(root: ParentNode = document, selector: string = CUT_FADE_SELECTOR): () => void {
  const watcher = watchCuts();
  watcher.select(root, selector);
  // The page is marked as it starts, in one pass; its changes are measured in the frame after them.
  markAll(root.querySelectorAll(selector));
  const changes = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(() => watcher.measure());
  const node = root instanceof Document ? root.documentElement : (root as Node);
  changes?.observe(node, { childList: true, characterData: true, subtree: true });
  return () => {
    changes?.disconnect();
    watcher.disconnect();
  };
}
