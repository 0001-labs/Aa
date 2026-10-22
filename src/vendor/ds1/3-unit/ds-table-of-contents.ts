import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { define } from '../0-face/define';
import { CutFades } from '../0-face/cut-fade';
import { getText } from '../0-face/i18n';
import '../0-face/tooltips';
import '../2-core/ds-text';
import styles from './styles/ds-table-of-contents.css?inline';

export interface TableOfContentsItem { href: string; label: string; depth?: number; }

/** A page's section links. Placement belongs to the page, not this Unit.
 * Supply items or slot native anchors with data-depth. Same-page links track
 * their headings inside the actual scrolling container, including a shadow root.
 * @element ds-table-of-contents
 * @fires toc-change - { href }: the section in view changed.
 */
export class TableOfContents extends LitElement {
  static properties = {
    items: { attribute: false }, label: { type: String }, literal: { type: Boolean },
    target: { attribute: false }, current: { state: true },
  };
  static styles = unsafeCSS(styles);
  /** A cut label fades over its last square, never an ellipsis: marks it `data-cut="end"` while it does not fit. */
  protected readonly cuts = new CutFades(this, { selector: 'a', targets: () => this.querySelectorAll(':scope > a'), text: true });
  declare items: TableOfContentsItem[];
  declare label: string;
  declare literal: boolean;
  /** Optional content scope, especially when the contents stand inside another component's shadow. */
  declare target?: HTMLElement;
  declare current: string;
  private links: HTMLAnchorElement[] = [];
  private sections: { link: HTMLAnchorElement; heading: HTMLElement }[] = [];
  private scroller: HTMLElement | null = null;
  private frame = 0;
  private observer?: MutationObserver;
  private resize?: ResizeObserver;
  private readonly relabel = () => this.requestUpdate();
  constructor() {
    super(); this.items = []; this.label = 'Contents'; this.literal = false; this.current = '';
  }
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.follow);
    window.addEventListener('scroll', this.schedule, { passive: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    window.addEventListener('hashchange', this.schedule);
    window.addEventListener('language-changed', this.relabel);
    window.addEventListener('translations-loaded', this.relabel);
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(this, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-depth'] });
    if (typeof ResizeObserver !== 'undefined') this.resize = new ResizeObserver(this.schedule);
    void this.updateComplete.then(() => { if (this.isConnected) this.refresh(); });
    void this.ownerDocument.fonts?.ready.then(this.schedule);
  }
  disconnectedCallback() {
    this.removeEventListener('click', this.follow);
    window.removeEventListener('scroll', this.schedule);
    this.scroller?.removeEventListener('scroll', this.schedule);
    window.removeEventListener('resize', this.schedule);
    window.removeEventListener('hashchange', this.schedule);
    window.removeEventListener('language-changed', this.relabel);
    window.removeEventListener('translations-loaded', this.relabel);
    this.observer?.disconnect(); this.resize?.disconnect(); cancelAnimationFrame(this.frame);
    super.disconnectedCallback();
  }
  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('items') || changed.has('target')) this.refresh();
  }
  private destination(link: HTMLAnchorElement): HTMLElement | null {
    try {
      const url = new URL(link.href, this.ownerDocument.baseURI);
      const page = new URL(this.ownerDocument.URL);
      if (!url.hash || url.origin !== page.origin || url.pathname !== page.pathname || url.search !== page.search) return null;
      const id = decodeURIComponent(url.hash.slice(1));
      if (this.target) return [...this.target.querySelectorAll<HTMLElement>('[id]')].find(node => node.id === id) ?? null;
      const root = this.getRootNode() as Document | ShadowRoot;
      return root.getElementById(id) ?? null;
    } catch { return null; }
  }
  /** Read links and targets again after replacing content or moving the Unit. */
  refresh() {
    if (!this.isConnected) return;
    this.links = this.items.length ? [...this.renderRoot.querySelectorAll<HTMLAnchorElement>('a')]
      : [...this.querySelectorAll<HTMLAnchorElement>('a[href]')];
    this.sections = this.links.flatMap(link => {
      const heading = this.destination(link);
      return heading ? [{ link, heading }] : [];
    });
    for (const link of this.links) {
      const depth = Number(link.dataset.depth ?? 0);
      link.style.setProperty('--toc-depth', String(Number.isFinite(depth) ? Math.max(0, depth) : 0));
    }
    this.scroller?.removeEventListener('scroll', this.schedule);
    this.scroller = null;
    const parentOf = (node: Element): HTMLElement | null => node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host as HTMLElement : null);
    for (let parent = this.sections[0] ? parentOf(this.sections[0].heading) : null; parent; parent = parentOf(parent)) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) { this.scroller = parent; break; }
    }
    this.scroller?.addEventListener('scroll', this.schedule, { passive: true });
    this.resize?.disconnect();
    this.resize?.observe(this);
    if (this.target) this.resize?.observe(this.target);
    if (this.scroller) this.resize?.observe(this.scroller);
    this.schedule();
  }
  private schedule = () => {
    if (!this.isConnected) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.track());
  };
  private track() {
    for (const link of this.links) {
      if (link.scrollWidth > link.clientWidth) link.setAttribute('data-tooltip', link.textContent?.trim() ?? '');
      else link.removeAttribute('data-tooltip');
    }
    if (!this.sections.length) { this.mark(''); return; }
    const box = this.scroller?.getBoundingClientRect();
    const top = box?.top ?? 0;
    const height = this.scroller?.clientHeight ?? window.innerHeight;
    const scrollTop = this.scroller?.scrollTop ?? window.scrollY;
    const scrollHeight = this.scroller?.scrollHeight ?? this.ownerDocument.documentElement.scrollHeight;
    const end = scrollTop > 0 && scrollTop + height >= scrollHeight - 1;
    // The rendered row resolves nested scale and calc() tokens to actual pixels.
    const unit = this.renderRoot.querySelector<HTMLElement>('.title')?.getBoundingClientRect().height || 20;
    const line = top + (end ? height : unit);
    let current = this.sections[0].link.getAttribute('href')!;
    for (const { link, heading } of this.sections) {
      if (heading.getBoundingClientRect().top <= line) current = link.getAttribute('href')!;
      else break;
    }
    this.mark(current);
  }
  private mark(href: string) {
    for (const link of this.links) {
      if (link.getAttribute('href') === href) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    if (this.current === href) return;
    this.current = href;
    this.dispatchEvent(new CustomEvent('toc-change', { detail: { href }, bubbles: true, composed: true }));
  }
  private follow = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
    if (!link || !this.links.includes(link) || link.target === '_blank' || link.hasAttribute('download')) return;
    const heading = this.destination(link); if (!heading) return;
    event.preventDefault();
    heading.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    history.pushState(history.state, '', link.href);
    this.mark(link.getAttribute('href')!);
  };
  render() {
    const words = this.label || 'Contents';
    const label = this.literal ? words : getText(words) || words;
    return html`<nav aria-label=${label} part="navigation">
      <div class="title"><ds-text literal strong role="heading" aria-level="2" part="title">${label}</ds-text></div>
      <div class="links" part="links"><slot @slotchange=${() => this.refresh()}>
        ${this.items.map(item => html`<a href=${item.href} data-depth=${item.depth ?? 0} aria-current=${this.current === item.href ? 'location' : nothing} part="link">${item.label}</a>`)}
      </slot></div>
    </nav>`;
  }
}
define('ds-table-of-contents', TableOfContents);
declare global { interface HTMLElementTagNameMap { 'ds-table-of-contents': TableOfContents; } }
