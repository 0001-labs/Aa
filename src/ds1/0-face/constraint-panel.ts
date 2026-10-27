import { paintFaultLines } from './fault-lines';
import { measureConstraints, type Constraint, type Finding } from './constraints';
import { VIEWPORT_WIDTHS, checkSite, findSitePages, inspectInFrame, ruleLine, summarizePages, summarizeRules, type PageResult } from './constraint-site';

// appendChild, not append: a Worker project's types redefine append for its HTML rewriter.

/** The presses of C, each within 800ms of the last, that toggle the panel. */
export const CONSTRAINT_PRESSES = 5;

/**
 * A panel at the page's end edge listing every small rule the page breaks
 * (constraints.ts), each with its code, what is wrong and the element ringed
 * on the page; pressing one scrolls to it. It measures the page as drawn when
 * it opens and again with Page. Site measures every page of the site at every
 * phone width (constraint-site.ts) and lists what each breaks, with a link to
 * the page. Under what is broken it says what each rule measured and kept,
 * and after a Site check every page it checked. It draws over the page and
 * changes nothing in it.
 */
export function createConstraintPanel() {
  const panel = document.createElement('div');
  panel.setAttribute('data-ds-constraint-panel', '');
  panel.hidden = true;
  const shadow = panel.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host {
      all: initial !important;
      display: block !important;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483645 !important;
      pointer-events: none !important;
      color-scheme: inherit !important;
      --u: calc(20px * var(--sf, 1));
      --paper: var(--ds-background-color, light-dark(#f9f6ef, #1e1e1e));
      --ink: var(--ds-text-color, light-dark(#2a2a2a, #e8e8e8));
      --muted: var(--ds-text-color-muted, light-dark(#797979, #a0a0a0));
      --line: var(--ds-border-color, light-dark(#e8e8e8, #3c3c3c));
      --danger: var(--ds-danger-color, light-dark(#de0331, #ff5f5f));
    }
    :host([hidden]) { display: none !important; }
    .fault-lines { z-index: 0 !important; }
    .rings { z-index: 1; position: absolute; inset: 0; overflow: hidden; }
    .frames { position: absolute; width: 0; height: 0; overflow: hidden; }
    .ring {
      position: absolute;
      box-sizing: border-box;
      border: 2px solid var(--danger);
    }
    .ring[data-current] { background: color-mix(in srgb, var(--danger) 12%, transparent); }
    .ring span {
      position: absolute;
      top: -2px;
      left: -2px;
      min-width: var(--u);
      padding: 0 4px;
      box-sizing: border-box;
      background: var(--danger);
      color: #fff;
      font: 400 12px/16px var(--ds-typeface-regular, sans-serif);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    aside {
      z-index: 2;
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: min(calc(16 * var(--u)), 100vw);
      padding: var(--u);
      overflow: auto;
      background: var(--paper);
      box-shadow: -1px 0 0 var(--line);
      color: var(--ink);
      font: 400 14px/var(--u) var(--ds-typeface-regular, sans-serif);
      pointer-events: auto;
    }
    header { display: flex; align-items: flex-end; gap: var(--u); height: var(--u); margin-bottom: var(--u); }
    header strong { flex: 1; font-weight: 400; font-family: var(--ds-typeface-medium, inherit); }
    button {
      all: unset;
      height: var(--u);
      color: var(--muted);
      cursor: pointer;
    }
    button:hover { color: var(--ink); }
    button:focus-visible { outline: 2px solid var(--ds-focus-ring, var(--ink)); outline-offset: -2px; }
    ol { margin: 0; padding: 0; list-style: none; }
    li + li { border-top: 1px solid var(--line); }
    li > :is(button, a, div) { display: block; width: 100%; height: auto; padding-block: calc(var(--u) / 2); color: var(--ink); text-decoration: none; }
    li > a:hover .page { color: var(--ink); }
    li > a:focus-visible { outline: 2px solid var(--ds-focus-ring, var(--ink)); outline-offset: -2px; }
    .page { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
    .element { color: var(--muted); overflow-wrap: anywhere; }
    [data-status] { color: var(--muted); margin-bottom: calc(var(--u) / 2); }
    section { margin-top: var(--u); }
    section[hidden] { display: none; }
    h3 { margin: 0; height: var(--u); font: inherit; font-family: var(--ds-typeface-medium, inherit); border-bottom: 1px solid var(--line); }
    li.rule-row > div { padding-block: calc(var(--u) / 2); }
    li.page-row > a { display: flex; justify-content: space-between; align-items: flex-end; gap: calc(var(--u) / 2); padding-block: 0; min-height: var(--u); }
    li.page-row .page { text-decoration: none; }
    li.page-row > a:hover .page { text-decoration: underline; }
    .kept { color: var(--muted); white-space: nowrap; }
    .broke { color: var(--danger); white-space: nowrap; }
    .code { display: flex; gap: calc(var(--u) / 2); color: var(--muted); font-variant-numeric: tabular-nums; }
    .code b { color: var(--danger); font-weight: 400; }
    .rule { color: var(--muted); }
    p { margin: 0; }
    :host([data-lines-only]) aside { inset-block: 0 auto; width: auto; padding: calc(var(--u) / 2); }
    :host([data-lines-only]) aside > :not(header), :host([data-lines-only]) header > :not([data-lines], [data-close]) { display: none; }
    :host([data-lines-only]) header { margin: 0; }
    @media print { :host { display: none !important; } }
  </style><svg class="fault-lines" aria-hidden="true"></svg><div class="rings"></div><div class="frames"></div><aside aria-label="Constraints">
    <header><strong>Constraints</strong><button type="button" data-run>Page</button><button type="button" data-site>Site</button><button type="button" data-lines>Lines</button><button type="button" data-close aria-label="Close">Close</button></header>
    <p data-status aria-live="polite"></p><p class="rule">Fault lines: dashed reference · red drift</p>
    <ol data-findings></ol>
    <section data-rules hidden><h3>Rules</h3><ol></ol></section>
    <section data-pages hidden><h3>Pages</h3><ol></ol></section>
  </aside>`;
  const faultLines = shadow.querySelector<SVGSVGElement>('.fault-lines')!;
  const rings = shadow.querySelector<HTMLDivElement>('.rings')!;
  const list = shadow.querySelector<HTMLOListElement>('[data-findings]')!;
  const rulesSection = shadow.querySelector<HTMLElement>('[data-rules]')!;
  const rulesList = rulesSection.querySelector('ol')!;
  const pagesSection = shadow.querySelector<HTMLElement>('[data-pages]')!;
  const pagesList = pagesSection.querySelector('ol')!;
  const status = shadow.querySelector<HTMLElement>('[data-status]')!;
  const title = shadow.querySelector('strong')!;
  const frames = shadow.querySelector<HTMLDivElement>('.frames')!;
  const linesButton = shadow.querySelector<HTMLButtonElement>('[data-lines]')!;
  const setLinesOnly = (enabled: boolean) => { panel.toggleAttribute('data-lines-only', enabled); linesButton.textContent = enabled ? 'Results' : 'Lines'; };
  linesButton.addEventListener('click', () => setLinesOnly(!panel.hasAttribute('data-lines-only')));
  const siteButton = shadow.querySelector<HTMLButtonElement>('[data-site]')!;
  let site: AbortController | null = null;
  let findings: (Finding & { constraint: Constraint })[] = [];
  let current = -1;
  let frame = 0;

  const place = () => {
    frame = 0;
    paintFaultLines(document, faultLines);
    rings.replaceChildren(...findings.map(({ element }, index) => {
      const rect = element.getBoundingClientRect();
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.toggleAttribute('data-current', index === current);
      ring.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      ring.appendChild(number);
      return ring;
    }));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
  const layoutChanges = new MutationObserver(schedule);
  const sizeChanges = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);

  const stopSite = () => {
    site?.abort();
    site = null;
    siteButton.textContent = 'Site';
  };

  /** What each rule measured and kept, over `total` page views (one: this page). */
  const showRules = (summaries: ReturnType<typeof summarizeRules>, total: number) => {
    rulesSection.hidden = false;
    rulesList.replaceChildren(...summaries.map(summary => {
      const item = document.createElement('li');
      item.className = 'rule-row';
      const box = document.createElement('div');
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = summary.constraint.code;
      const line = document.createElement('p');
      line.textContent = ruleLine(summary, total);
      const rule = document.createElement('p');
      rule.className = 'rule';
      rule.textContent = summary.constraint.rule;
      for (const part of [code, line, rule]) box.appendChild(part);
      item.appendChild(box);
      return item;
    }));
  };

  /** Every page the Site check opened, a row each: kept at every width, or how much it broke and where. */
  const showPages = (results: PageResult[]) => {
    const pages = summarizePages(results);
    pagesSection.hidden = !pages.length;
    pagesList.replaceChildren(...pages.map(({ url, widths }) => {
      const item = document.createElement('li');
      item.className = 'page-row';
      const link = document.createElement('a');
      const address = new URL(url);
      address.searchParams.set('constraints', '1');
      link.href = address.href;
      const path = document.createElement('span');
      path.className = 'page';
      path.textContent = decodeURI(new URL(url).pathname);
      const state = document.createElement('span');
      const failed = widths.filter(width => width.broken || width.error);
      state.className = failed.length ? 'broke' : 'kept';
      state.textContent = failed.length
        ? failed.map(({ width, broken, error }) => (error ? `${width}px not checked` : `${broken} at ${width}px`)).join(', ')
        : `kept at ${widths.length} widths`;
      link.appendChild(path);
      link.appendChild(state);
      item.appendChild(link);
      return item;
    }));
  };

  const run = () => {
    stopSite();
    const measured = measureConstraints(document);
    findings = measured.flatMap(({ constraint, findings: found }) => found.map(finding => ({ ...finding, constraint })));
    showRules(measured.map(({ constraint, measured: count, findings: found }) => ({ constraint, measured: count, views: count ? 1 : 0, broken: found.length })), 1);
    pagesSection.hidden = true;
    current = -1;
    title.textContent = findings.length ? `Constraints · ${findings.length} broken` : 'Constraints';
    status.textContent = findings.length ? `This page at ${Math.round(document.documentElement.clientWidth)}px.` : 'This page keeps every constraint.';
    list.replaceChildren(...findings.map(({ constraint, message, element }, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const code = document.createElement('span');
      code.className = 'code';
      const number = document.createElement('b');
      number.textContent = String(index + 1);
      code.appendChild(number);
      code.appendChild(document.createTextNode(constraint.code));
      const what = document.createElement('p');
      what.textContent = message;
      const rule = document.createElement('p');
      rule.className = 'rule';
      rule.textContent = constraint.rule;
      for (const part of [code, what, rule]) button.appendChild(part);
      button.addEventListener('click', () => {
        current = index;
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        schedule();
      });
      item.appendChild(button);
      return item;
    }));
    place();
  };

  /** One broken rule on another page: its number, code and width, what is wrong, and a link to the page. */
  const siteItem = (index: number, { url, width }: PageResult, code: string, message: string, detail: string) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const address = new URL(url);
    address.searchParams.set('constraints', '1');
    link.href = address.href;
    const head = document.createElement('span');
    head.className = 'code';
    const number = document.createElement('b');
    number.textContent = String(index);
    head.appendChild(number);
    head.appendChild(document.createTextNode(`${code} · ${width}px`));
    const what = document.createElement('p');
    what.textContent = message;
    const page = document.createElement('p');
    page.className = 'page';
    page.textContent = decodeURI(new URL(url).pathname);
    const element = document.createElement('p');
    element.className = 'element';
    element.textContent = detail;
    for (const part of [head, what, page, element]) link.appendChild(part);
    item.appendChild(link);
    return item;
  };

  /** Every page of the site at every phone width, listed as each comes in. */
  const runSite = async () => {
    if (site) { stopSite(); status.textContent = 'Stopped.'; return; }
    const controller = new AbortController();
    site = controller;
    siteButton.textContent = 'Stop';
    findings = [];
    current = -1;
    place();
    list.replaceChildren();
    rulesSection.hidden = true;
    pagesSection.hidden = true;
    title.textContent = 'Constraints';
    status.textContent = 'Finding the pages…';
    const pages = await findSitePages();
    const widths = `${VIEWPORT_WIDTHS.slice(0, -1).join(', ')} and ${VIEWPORT_WIDTHS[VIEWPORT_WIDTHS.length - 1]}px`;
    let broken = 0;
    const results = await checkSite({
      pages,
      inspect: (url, widths) => inspectInFrame(frames, url, widths),
      signal: controller.signal,
      onResult(result, done, total) {
        const found = result.error ? [{ code: 'page', message: `It could not be checked: ${result.error}.`, element: '' }] : result.findings;
        for (const { code, message, element } of found) list.appendChild(siteItem(++broken, result, code, message, element));
        title.textContent = broken ? `Constraints · ${broken} broken` : 'Constraints';
        status.textContent = `Checking ${done} of ${total}: ${pages.length} pages at ${widths}…`;
      },
    });
    if (controller.signal.aborted) return;
    showRules(summarizeRules(results), results.length);
    showPages(results);
    site = null;
    siteButton.textContent = 'Site';
    status.textContent = broken
      ? `${pages.length} pages at ${widths}: ${broken} broken.`
      : `Every page keeps every constraint at ${widths} (${results.length} checks).`;
  };

  const show = (mode: 'page' | 'site' = 'page') => {
    if (!panel.isConnected) document.body.appendChild(panel);
    panel.hidden = false;
    setLinesOnly(window.innerWidth < 640);
    if (mode === 'site') void runSite(); else run();
    layoutChanges.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['style','class','hidden','data-ds-fault-lines','data-ds-fault-axis']});
    sizeChanges?.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
  };
  const hide = () => {
    stopSite();
    panel.hidden = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    faultLines.replaceChildren();
    layoutChanges.disconnect();
    sizeChanges?.disconnect();
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
  };
  shadow.querySelector('[data-run]')!.addEventListener('click', run);
  siteButton.addEventListener('click', () => void runSite());
  shadow.querySelector('[data-close]')!.addEventListener('click', hide);

  return {
    show,
    hide,
    run,
    runSite,
    toggle: () => (panel.hidden ? show() : hide()),
    get findings() { return findings; },
  };
}

/** The device switch a site without sign-in has instead: `?ds-owner=on` once in a browser, `?ds-owner=off` to forget it. */
export const OWNER_DEVICE_KEY = 'ds-owner';

/** Takes `?ds-owner=on` or `off` from the address into this browser's storage for the site. */
function rememberOwnerDevice(): void {
  const asked = new URLSearchParams(window.location.search).get('ds-owner');
  if (asked !== 'on' && asked !== 'off') return;
  try {
    if (asked === 'on') localStorage.setItem(OWNER_DEVICE_KEY, 'on');
    else localStorage.removeItem(OWNER_DEVICE_KEY);
  } catch { /* Storage blocked: the switch lasts this page alone. */ }
}

/** A browser switched on as the owner's with `?ds-owner=on`. */
const isOwnerDevice = () => {
  try { return localStorage.getItem(OWNER_DEVICE_KEY) === 'on'; } catch { return false; }
};

/**
 * Whether the viewer owns the page: `<html data-ds-owner>`, which a site with
 * sign-in sets from its own server-checked owner, or a browser switched on as
 * the owner's (`?ds-owner=on`) on a site without sign-in.
 */
export const isPageOwner = () => document.documentElement.hasAttribute('data-ds-owner') || isOwnerDevice()
  || new URLSearchParams(window.location.search).get('ds-owner') === 'on';

/** What the address asks the panel to show on load: `?constraints=1` this page, `?constraints=site` every page. */
export function askedConstraints(search = window.location.search): 'page' | 'site' | null {
  const asked = new URLSearchParams(search).get('constraints');
  if (asked === 'site') return 'site';
  return asked === '1' || asked === 'page' || asked === '' ? 'page' : null;
}

/**
 * Five presses of C toggle the constraint panel, for the page's owner only
 * (`isPageOwner`): for anyone else the presses do nothing. `?constraints=1` in
 * the address opens it for anyone once the page has loaded, since it only
 * measures; `?constraints=site` opens it on the whole site's check. Escape
 * hides it. Presses typed into a field, with a modifier or held down never
 * count, and any other key starts the count again.
 */
export function initConstraintShortcut(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.hasAttribute('data-ds-constraints-ready')) return;
  root.setAttribute('data-ds-constraints-ready', '');
  rememberOwnerDevice();
  let panel: ReturnType<typeof createConstraintPanel> | null = null;
  const open = () => (panel ??= createConstraintPanel());

  const asked = askedConstraints();
  // Not in a frame of the site's own check, and only once the page and its pictures have drawn.
  if (asked && window.parent === window) {
    if (document.readyState === 'complete') open().show(asked);
    else window.addEventListener('load', () => open().show(asked), { once: true });
  }

  let presses = 0;
  let lastPress = 0;
  const reset = () => { presses = 0; };
  window.addEventListener('blur', reset);
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    const editing = document.designMode === 'on' || event.composedPath().some(target =>
      target instanceof HTMLElement && (
        target.isContentEditable || target.matches('input, textarea, select, [role="textbox"], [role="combobox"]')
      )
    );
    if (editing || event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      reset();
      return;
    }
    if (event.key === 'Escape') panel?.hide();
    if (event.key.toLowerCase() !== 'c') {
      reset();
      return;
    }
    const now = performance.now();
    presses = now - lastPress <= 800 ? presses + 1 : 1;
    lastPress = now;
    if (presses === CONSTRAINT_PRESSES) {
      reset();
      if (isPageOwner()) open().toggle();
      else panel?.hide();
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConstraintShortcut, { once: true });
  } else {
    initConstraintShortcut();
  }
}
