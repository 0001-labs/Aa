/**
 * The site header's script for pages without Lit: plain TypeScript, no
 * framework. Loading it starts every `.ds-header` on the page (1-root/header.css
 * draws them); call `startHeaders()` again for one added later.
 *
 * Each header's menu button (`.ds-header__toggle`) opens its navigation and
 * actions in a drawer (`0-face/attach-overlay.ts`): a panel over the screen with focus
 * kept inside, closed by Escape, its close button, a link or the screen
 * widening, the page's scroll held behind it. The close button is named by the
 * toggle's `data-close-label`, "Close" without one; the page writes both names
 * in its own language. A navigation where no link is marked `aria-current`
 * gets `aria-current="page"` on the link to the address being read.
 *
 * @example
 * <header class="ds-header">
 *   <a class="ds-header__brand" href="/">Name</a>
 *   <nav class="ds-header__nav" id="site-nav" aria-label="Main">
 *     <a href="/">Home</a> <a href="/help">Help</a>
 *   </nav>
 *   <button class="ds-button ds-button--icon ds-header__toggle" type="button"
 *     aria-label="Menu" aria-controls="site-nav" data-close-label="Close">
 *     <span class="ds-icon" style="--ds-icon: url(/ds1/icons/menu.svg)" aria-hidden="true"></span>
 *     <span class="ds-icon" style="--ds-icon: url(/ds1/icons/close.svg)" aria-hidden="true"></span>
 *   </button>
 * </header>
 * <script type="module">import "/ds1/0-face/header.ts";</script>
 */
import { attachOverlay, type Drawer } from "./attach-overlay";

const started = new WeakMap<Element, Drawer>();

/** A path without a trailing slash or an index file, for comparing addresses. */
function normalise(path: string): string {
  return path.replace(/\/index\.html?$/, "/").replace(/\.html?$/, "").replace(/\/+$/, "") || "/";
}

/**
 * Marks the link to the address being read with `aria-current="page"`, unless
 * one of the links is marked already. Returns the marked link, if any.
 */
export function markCurrentLink(links: Iterable<HTMLAnchorElement>, location: { href: string } = globalThis.location): HTMLAnchorElement | null {
  const all = [...links];
  const marked = all.find(link => link.hasAttribute("aria-current") && link.getAttribute("aria-current") !== "false");
  if (marked || !location) return marked ?? null;
  const here = new URL(location.href);
  const match = all.find(link => {
    if (!link.getAttribute("href") || link.getAttribute("href")!.startsWith("#")) return false;
    const target = new URL(link.href, here);
    return target.origin === here.origin && normalise(target.pathname) === normalise(here.pathname);
  });
  match?.setAttribute("aria-current", "page");
  return match ?? null;
}

/** Starts every `.ds-header` inside `root` that has not started yet, and returns their drawers. */
export function startHeaders(root: ParentNode = document): Drawer[] {
  const drawers: Drawer[] = [];
  for (const header of root.querySelectorAll<HTMLElement>(".ds-header")) {
    const nav = header.querySelector<HTMLElement>(":scope > .ds-header__nav");
    if (nav) markCurrentLink(nav.querySelectorAll<HTMLAnchorElement>("a[href]"));
    if (started.has(header)) continue;
    const toggle = header.querySelector<HTMLElement>(":scope > .ds-header__toggle");
    if (!toggle) continue;
    const drawer = attachOverlay({
      toggle,
      content: () => [...header.querySelectorAll(":scope > :is(.ds-header__nav, .ds-header__actions)")],
      closeLabel: toggle.dataset.closeLabel,
    });
    started.set(header, drawer);
    drawers.push(drawer);
  }
  return drawers;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => startHeaders(), { once: true });
  else startHeaders();
}
