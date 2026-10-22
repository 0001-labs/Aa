import { inspectConstraints } from './constraints';

/** The presses of C, each within 800ms of the last, that toggle the panel. */
export const CONSTRAINT_PRESSES = 5;

/**
 * A panel at the page's end edge listing every small rule the page breaks
 * (constraints.ts), each with its code, what is wrong and the element ringed
 * on the page; pressing one scrolls to it. It measures the page as drawn when
 * it opens and again with Check. It draws over the page and changes nothing
 * in it.
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
    .rings { position: absolute; inset: 0; overflow: hidden; }
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
    li button { display: block; width: 100%; height: auto; padding-block: calc(var(--u) / 2); color: var(--ink); }
    .code { display: flex; gap: calc(var(--u) / 2); color: var(--muted); font-variant-numeric: tabular-nums; }
    .code b { color: var(--danger); font-weight: 400; }
    .rule { color: var(--muted); }
    p { margin: 0; }
    @media print { :host { display: none !important; } }
  </style><div class="rings"></div><aside aria-label="Constraints">
    <header><strong>Constraints</strong><button type="button" data-run>Check</button><button type="button" data-close aria-label="Close">Close</button></header>
    <p data-empty hidden>This page keeps every constraint.</p>
    <ol></ol>
  </aside>`;
  const rings = shadow.querySelector<HTMLDivElement>('.rings')!;
  const list = shadow.querySelector('ol')!;
  const empty = shadow.querySelector<HTMLElement>('[data-empty]')!;
  const title = shadow.querySelector('strong')!;
  let findings: ReturnType<typeof inspectConstraints> = [];
  let current = -1;
  let frame = 0;

  const place = () => {
    frame = 0;
    rings.replaceChildren(...findings.map(({ element }, index) => {
      const rect = element.getBoundingClientRect();
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.toggleAttribute('data-current', index === current);
      ring.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      ring.append(number);
      return ring;
    }));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

  const run = () => {
    findings = inspectConstraints(document);
    current = -1;
    title.textContent = findings.length ? `Constraints · ${findings.length} broken` : 'Constraints';
    empty.hidden = findings.length > 0;
    list.replaceChildren(...findings.map(({ constraint, message, element }, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const code = document.createElement('span');
      code.className = 'code';
      const number = document.createElement('b');
      number.textContent = String(index + 1);
      code.append(number, constraint.code);
      const what = document.createElement('p');
      what.textContent = message;
      const rule = document.createElement('p');
      rule.className = 'rule';
      rule.textContent = constraint.rule;
      button.append(code, what, rule);
      button.addEventListener('click', () => {
        current = index;
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        schedule();
      });
      item.append(button);
      return item;
    }));
    place();
  };

  const show = () => {
    if (!panel.isConnected) document.body.appendChild(panel);
    panel.hidden = false;
    run();
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
  };
  const hide = () => {
    panel.hidden = true;
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
  };
  shadow.querySelector('[data-run]')!.addEventListener('click', run);
  shadow.querySelector('[data-close]')!.addEventListener('click', hide);

  return {
    show,
    hide,
    run,
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

/**
 * Five presses of C toggle the constraint panel, for the page's owner only
 * (`isPageOwner`): for anyone else the presses do nothing. `?constraints=1` opens it on load for the
 * owner too. Escape hides it. Presses typed into a field, with a modifier or
 * held down never count, and any other key starts the count again.
 */
export function initConstraintShortcut(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.hasAttribute('data-ds-constraints-ready')) return;
  root.setAttribute('data-ds-constraints-ready', '');
  rememberOwnerDevice();
  let panel: ReturnType<typeof createConstraintPanel> | null = null;
  const open = () => (panel ??= createConstraintPanel());

  if (new URLSearchParams(window.location.search).get('constraints') === '1') {
    // The owner is often known a moment after load, once the site has asked.
    const observer = new MutationObserver(() => { if (isPageOwner()) { observer.disconnect(); open().show(); } });
    if (isPageOwner()) open().show(); else observer.observe(root, { attributes: true, attributeFilter: ['data-ds-owner'] });
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
