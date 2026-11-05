/**
 * Contrast watch: the `color.text-contrast` rule, run in the product on the theme the
 * person is using. Visible text under 4.5:1 is reported once per session as a
 * `contrast.<theme>.<component>` failure through `reportFailure`, which the Feedback loop
 * turns into an issue. The message names colours, ratio, component, element and path;
 * it never carries the page's text.
 *
 * Load it with a dynamic import once the page has loaded and gone idle, then call
 * `startContrastWatch()`; it does nothing per frame.
 */
import { measureTextContrast, paintedParent, TEXT_CONTRAST_MINIMUM } from './text-contrast';
import { reportFailure, type Failure } from './failures';

export type ContrastWatchOptions = {
  /** What is measured; the whole document by default. */
  root?: ParentNode;
  /** The least ratio, 4.5 by default. */
  minimum?: number;
  /** Findings reported by one run, 10 by default. */
  maxPerRun?: number;
  /** Where findings go; `reportFailure` by default. */
  report?: (failure: Failure) => void;
  /** Remembers what was reported this session; sessionStorage by default, null for memory only. */
  storage?: Storage | null;
  now?: () => number;
  /** Also warns in the console with the element; on in a Vite development build. */
  debug?: boolean;
  /** The least time between two runs, 10 s by default. */
  interval?: number;
  /** How long the page stays unchanged after mutations before a run, 2 s by default. */
  quiet?: number;
};

const STORAGE_KEY = 'ds1:contrast-watch';
const MAX_KEYS = 200;
/** A page with more pieces of text than this is left alone: measuring it would cost too much. */
const MAX_TEXTS = 4000;

/** `light` or `dark`, as theme-bootstrap.js marks the root, else the system's. */
export function contrastTheme(document: Document): 'light' | 'dark' {
  const root = document.documentElement;
  if (root.classList.contains('dark-theme')) return 'dark';
  if (root.classList.contains('light-theme')) return 'light';
  const marked = root.getAttribute('data-theme') ?? root.getAttribute('theme');
  if (marked === 'dark' || marked === 'light') return marked;
  try { return document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

/** The DS1 component text sits in: the nearest `ds-*` element across shadow roots, else the nearest `ds-*` class, else its own tag. */
export function contrastComponent(element: Element): string {
  for (let p: Element | null = element; p; p = paintedParent(p)) if (p.localName.startsWith('ds-')) return p.localName;
  for (let p: Element | null = element; p; p = paintedParent(p)) {
    const name = Array.from(p.classList).find(c => c.startsWith('ds-') && c.length > 3);
    if (name) return name.slice(3);
  }
  return element.localName;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 60) || 'text';
// An id on a heading is often made from its words, so a heading is named by its class instead.
const elementLabel = (e: Element) => {
  const id = e.id && !/^h[1-6]$/.test(e.localName) ? `#${e.id.slice(0, 40)}` : '';
  const name = e.classList[0];
  return e.localName + (id || (name ? `.${name.slice(0, 40)}` : ''));
};

function hasTooMuchText(root: ParentNode) {
  const document = (root as Node).ownerDocument ?? root as Document;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  let count = 0;
  while (walker.nextNode()) if (/\S/.test((walker.currentNode as Text).data) && ++count > MAX_TEXTS) return true;
  return false;
}

function developing() {
  try {
    const env = (import.meta as { env?: { DEV?: boolean } }).env;
    return typeof env !== 'undefined' && env.DEV === true;
  } catch { return false; }
}

/** Starts watching; returns the function that stops it. */
export function startContrastWatch(options: ContrastWatchOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const now = options.now ?? Date.now;
  const root = options.root ?? document;
  const minimum = options.minimum ?? TEXT_CONTRAST_MINIMUM;
  const maxPerRun = options.maxPerRun ?? 10;
  const interval = options.interval ?? 10_000;
  const quiet = options.quiet ?? 2_000;
  const report = options.report ?? reportFailure;
  const debug = options.debug ?? developing();
  let storage: Storage | null = null;
  if (options.storage !== undefined) storage = options.storage;
  else try { storage = window.sessionStorage; } catch { /* Storage can be blocked. */ }

  let reported: string[] = [];
  try { const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]'); if (Array.isArray(saved)) reported = saved.filter(k => typeof k === 'string'); } catch { /* Unreadable: start afresh. */ }
  const known = new Set(reported);
  const remember = (key: string) => {
    known.add(key);
    reported.push(key);
    if (reported.length > MAX_KEYS) known.delete(reported.shift()!);
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(reported)); } catch { /* Memory still holds it. */ }
  };

  const ran = new Set<string>();
  let lastRun = -Infinity;
  let lastTheme = '';
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let burstStart = 0;

  function run() {
    if (stopped || document.visibilityState !== 'visible') return;
    const theme = contrastTheme(document);
    const path = location.pathname;
    const page = `${theme} ${path}`;
    // One run per theme and path, unless the theme changed since the last run.
    if (ran.has(page) && theme === lastTheme) return;
    if (now() < lastRun + interval) { schedule(); return; }
    lastRun = now();
    lastTheme = theme;
    ran.add(page);
    if (hasTooMuchText(root)) return;
    let count = 0;
    for (const result of measureTextContrast(root)) {
      if (count >= maxPerRun) break;
      if (result.ratio === undefined || result.ratio >= minimum || !result.foreground || !result.background) continue;
      const component = contrastComponent(result.element);
      const key = [theme, path, component, result.foreground, result.background].join('|');
      if (known.has(key)) continue;
      remember(key);
      count++;
      // Rounded down, so a ratio just under the minimum never reads as meeting it.
      const ratio = (Math.floor(result.ratio * 10) / 10).toFixed(1);
      const message = `${result.foreground} on ${result.background}, ${ratio}:1 (${component} · ${elementLabel(result.element)}) on ${path}`.slice(0, 200);
      report({ code: `contrast.${theme}.${slug(component)}`, message });
      if (debug) console.warn(`[DS1 contrast] ${message}`, result.element);
    }
  }

  function schedule() {
    if (stopped || timer !== undefined || cancelIdle || document.visibilityState !== 'visible') return;
    timer = setTimeout(() => {
      timer = undefined;
      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(() => { cancelIdle = undefined; run(); }, { timeout: 5_000 });
        cancelIdle = () => window.cancelIdleCallback(id);
      } else {
        const id = setTimeout(() => { cancelIdle = undefined; run(); }, 1);
        cancelIdle = () => clearTimeout(id);
      }
    }, Math.max(0, lastRun + interval - now()));
  }

  // A burst of changes runs once it has been quiet for a moment; a page that never
  // stops changing still runs after five quiet periods.
  const observer = new MutationObserver(() => {
    const at = now();
    if (settle === undefined) burstStart = at;
    else if (at - burstStart > quiet * 5) return;
    clearTimeout(settle);
    settle = setTimeout(() => { settle = undefined; schedule(); }, quiet);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'theme'] });
  let media: MediaQueryList | null = null;
  try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { /* No media queries. */ }
  window.addEventListener('theme-changed', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', schedule);
  media?.addEventListener?.('change', schedule);
  schedule();

  return () => {
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    clearTimeout(settle);
    cancelIdle?.();
    window.removeEventListener('theme-changed', schedule);
    window.removeEventListener('popstate', schedule);
    document.removeEventListener('visibilitychange', schedule);
    media?.removeEventListener?.('change', schedule);
  };
}
