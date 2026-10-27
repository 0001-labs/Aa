// The constraints on every page of a site, at every phone width, from inside the browser: the constraint
// panel's Site check (constraint-panel.ts). Each page in the site's sitemap is opened once in a frame of
// the site's own, out of sight, then made as wide as each phone in turn and drawn at that phone's scale,
// and measured with every rule in constraints.ts at each width. Three pages are checked at a time.
// scripts/constraints-phone.ts does the same from a terminal, in WebKit as an iPhone.
import { constraints, measureConstraints, type Constraint } from './constraints';
import { calculateScalingFactor, defaultScalingConfig } from './scaling';

/** The narrowest phone still sold, the common ones and the widest. */
export const PHONE_WIDTHS = [320, 375, 393, 430];
/** Pages checked side by side, each in its own frame. */
export const PAGES_AT_ONCE = 3;

/** A rule broken on a page at a width, said in words, since the element stays in its frame. */
export type SiteFinding = { code: string; rule: string; message: string; element: string; review?: boolean };
/** What one page at one width kept and broke: each rule's count of what it measured, and its findings. */
export type PageCheck = { findings: SiteFinding[]; measured: Record<string, number> };
export type PageResult = PageCheck & { url: string; width: number; error?: string };

/** An element as a person finds it: its tag, id and classes, and the start of its words. */
export function describeElement(element: Element): string {
  const name = element.localName + (element.id ? `#${element.id}` : '') + Array.from(element.classList, c => `.${c}`).join('');
  const words = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return words ? `${name} "${words}"` : name;
}

/** The pages a sitemap lists on the site's own origin, in its order and once each; none when it lists none. */
export function sitemapPages(xml: string, origin: string): string[] {
  const pages = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].flatMap(([, loc]) => {
    try {
      const url = new URL(loc!.replace(/&amp;/g, '&'), origin);
      return url.origin === origin ? [url.href] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(pages)];
}

/** The site's pages: its sitemap's, or else the page itself and every page it links to on the site. */
export async function findSitePages(page: Document = document): Promise<string[]> {
  const { origin } = page.location ?? window.location;
  try {
    const answer = await fetch(new URL('/sitemap.xml', origin));
    if (answer.ok) {
      const pages = sitemapPages(await answer.text(), origin);
      if (pages.length) return pages;
    }
  } catch { /* No sitemap: the links below. */ }
  const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('a[href]'), link => new URL(link.href, origin))
    .filter(url => url.origin === origin && !/\.\w+$/.test(url.pathname))
    .map(url => `${url.origin}${url.pathname}`);
  return [...new Set([`${origin}${(page.location ?? window.location).pathname}`, ...links])];
}

const wait = (ms: number) => new Promise(done => setTimeout(done, ms));

/**
 * Opens a page once in a frame inside `host`, then makes the frame as wide as each width in turn, draws
 * the page at that width's phone scale, and returns what every rule measured and found at each, in the
 * order of `widths`. The page reflows at each width without loading again. The address carries `ph=out`,
 * the analytics opt-out most trackers honour, so the check counts no visits.
 */
export async function inspectInFrame(host: Element | ShadowRoot, url: string, widths: number[] = PHONE_WIDTHS, height = 844): Promise<PageCheck[]> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:absolute;top:0;left:-1000px;width:${widths[0]}px;height:${height}px;border:0;visibility:hidden;pointer-events:none`;
  const address = new URL(url);
  address.searchParams.set('ph', 'out');
  try {
    const loaded = new Promise<void>((done, fail) => {
      frame.addEventListener('load', () => done(), { once: true });
      setTimeout(() => fail(new Error('did not load in 30 seconds')), 30_000);
    });
    frame.src = address.href;
    host.appendChild(frame);
    await loaded;
    const page = frame.contentDocument;
    if (!page?.documentElement) throw new Error('could not be read');
    await page.fonts?.ready;
    const root = page.documentElement;
    const checks: PageCheck[] = [];
    for (const width of widths) {
      frame.style.width = `${width}px`;
      // The phone's scale for this width, whichever browser draws the frame: a computer's would draw it
      // at 1, and a page that scales once on load would keep the first width's.
      root.style.setProperty('--sf', String(calculateScalingFactor(width, { ...defaultScalingConfig, snap: 'layout' })));
      root.setAttribute('data-mobile', '');
      void root.scrollWidth;
      // Room for what follows a resize on its own: resize observers, a carousel measuring its slides.
      await wait(80);
      checks.push(checkPage(page));
    }
    return checks;
  } finally {
    frame.remove();
  }
}

/** Every rule on a page: what it measured, and each place it is broken, said in words. */
export function checkPage(page: ParentNode): PageCheck {
  const measured: Record<string, number> = {};
  const findings: SiteFinding[] = [];
  for (const { constraint, measured: count, findings: found } of measureConstraints(page)) {
    measured[constraint.code] = count;
    for (const { message, element, review } of found) findings.push({ code: constraint.code, rule: constraint.rule, message, element: describeElement(element), ...(review ? { review } : {}) });
  }
  return { findings, measured };
}

/**
 * Checks every page at every width, `PAGES_AT_ONCE` pages side by side, and reports each page's result at
 * each width as it comes. Stops starting pages when `signal` aborts. Whatever the pages store in this
 * browser while they are checked is put back afterwards.
 */
export async function checkSite({ pages, widths = PHONE_WIDTHS, inspect, onResult, signal, atOnce = PAGES_AT_ONCE }: {
  pages: string[];
  widths?: number[];
  /** One page at every width, in the order of `widths`. */
  inspect: (url: string, widths: number[]) => Promise<PageCheck[]>;
  onResult: (result: PageResult, done: number, total: number) => void;
  signal?: AbortSignal;
  atOnce?: number;
}): Promise<PageResult[]> {
  const kept = storedNow();
  const results: PageResult[] = [];
  const total = pages.length * widths.length;
  const queue = [...pages];
  const next = async (): Promise<void> => {
    for (let url = queue.shift(); url && !signal?.aborted; url = queue.shift()) {
      const checks = await inspect(url, widths).catch((error: Error) => error);
      for (const [index, width] of widths.entries()) {
        const result: PageResult = checks instanceof Error
          ? { url, width, findings: [], measured: {}, error: checks.message }
          : { url, width, ...(checks[index] ?? { findings: [], measured: {} }) };
        results.push(result);
        if (!signal?.aborted) onResult(result, results.length, total);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, atOnce) }, next));
  } finally {
    putBack(kept);
  }
  return results;
}

/** This site's storage in this browser, to put back after the check. */
function storedNow(): Map<string, string> | null {
  try {
    return new Map(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)!]));
  } catch {
    return null;
  }
}

function putBack(kept: Map<string, string> | null): void {
  if (!kept) return;
  try {
    for (const key of Object.keys(localStorage)) if (!kept.has(key)) localStorage.removeItem(key);
    for (const [key, value] of kept) if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
  } catch { /* Storage blocked: nothing was kept either. */ }
}

/** A rule over a check: how many things it measured, on how many of the page views, and how often it broke. */
export type RuleSummary = { constraint: Constraint; measured: number; views: number; broken: number };

export function summarizeRules(results: PageCheck[]): RuleSummary[] {
  return constraints.map(constraint => {
    const counts = results.map(result => result.measured[constraint.code] ?? 0);
    return {
      constraint,
      measured: counts.reduce((sum, count) => sum + count, 0),
      views: counts.filter(count => count > 0).length,
      broken: results.reduce((sum, result) => sum + result.findings.filter(finding => finding.code === constraint.code && !finding.review).length, 0),
    };
  });
}

const count = (n: number, [one, many]: [string, string]) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** What a rule did, in a sentence: kept, broken, or nothing on the pages for it to measure. `views` is how many page views were checked; one is this page. */
export function ruleLine({ constraint, measured, views, broken }: RuleSummary, total: number): string {
  if (!measured) return `Nothing to measure: no ${constraint.measures[1]} ${total === 1 ? 'on this page' : 'on these pages'}.`;
  const where = total === 1 ? 'on this page' : `on ${views.toLocaleString('en')} of ${total.toLocaleString('en')} page views`;
  return broken
    ? `Broken ${broken === 1 ? 'once' : `${broken.toLocaleString('en')} times`}, among ${count(measured, constraint.measures)} measured ${where}.`
    : `Kept by ${count(measured, constraint.measures)} measured ${where}.`;
}

/** Every page checked, in the order checked, with how much it broke at each width. */
export function summarizePages(results: PageResult[]): { url: string; widths: { width: number; broken: number; error?: string }[] }[] {
  const pages = new Map<string, { width: number; broken: number; error?: string }[]>();
  for (const { url, width, findings, error } of results) {
    pages.set(url, [...(pages.get(url) ?? []), { width, broken: findings.filter(finding => !finding.review).length, error }].sort((a, b) => a.width - b.width));
  }
  return [...pages].map(([url, widths]) => ({ url, widths }));
}
