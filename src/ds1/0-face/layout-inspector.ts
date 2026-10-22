/**
 * Inspect a page's layout without changing its size, opacity, or interaction:
 * named areas in dashed outlines with their name and size, text and fields in
 * green boxes, and every component (a custom element) outlined with its tag name.
 */
export function createLayoutInspector() {
  const root = document.documentElement;
  const overlay = document.createElement('div');
  overlay.setAttribute('data-ds-layout-overlay', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  const shadow = overlay.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host {
      all: initial !important;
      display: block !important;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483646 !important;
      pointer-events: none !important;
      color-scheme: inherit !important;
    }
    :host([hidden]) { display: none !important; }
    .boxes { position: absolute; inset: 0; overflow: hidden; }
    .box {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid var(--tint);
    }
    .area { --tint: #efc9dc; border-style: dashed; }
    .text { --tint: #bfe0cd; background: color-mix(in srgb, var(--tint) 18%, transparent); }
    .field { --tint: #bfe0cd; background: color-mix(in srgb, var(--tint) 45%, transparent); }
    .component { --tint: #d5c9ef; }
    .tag {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      gap: 6px;
      padding: 0 4px;
      background: var(--tint);
      color: #2a2530;
      font: 400 12px/16px var(--font-regular, var(--typeface-regular, sans-serif));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .area > .tag { top: -1px; right: -1px; }
    .component > .tag { bottom: 100%; left: -1px; }
    .component[data-inside] > .tag { bottom: auto; top: -1px; }
    .measure { opacity: 0.7; }
    @media print { :host { display: none !important; } }
  </style><div class="boxes"></div>`;
  document.body.appendChild(overlay);
  const layer = shadow.querySelector<HTMLDivElement>('.boxes')!;
  type Kind = 'area' | 'text' | 'field' | 'component';
  // A page of thousands of words draws its first boxes and stops.
  const limit = 2000;
  const fields = new Set(['input', 'textarea', 'select', 'img', 'picture', 'svg', 'video', 'canvas', 'iframe']);
  const skipped = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta', 'slot']);
  // Primitives drawn as what they show rather than named: words, an icon,
  // and a gap with nothing to see.
  const primitives: Record<string, Kind | 'none'> = { 'ds-text': 'text', 'ds-icon': 'field', 'ds-gap': 'none' };
  let frame = 0;
  let visible = false;
  const observed = new Set<HTMLElement>();
  const observedRoots = new Set<ShadowRoot>();
  const collect = () => {
    const areas: HTMLElement[] = [];
    const words: [HTMLElement, Kind][] = [];
    const components: HTMLElement[] = [];
    const visit = (parent: Element | ShadowRoot, inText: boolean) => {
      for (const element of Array.from(parent.children) as HTMLElement[]) {
        const name = element.localName;
        if (skipped.has(name) || element.hasAttribute('data-ds-layout-overlay') || element.hasAttribute('data-ds-grid-overlay')) continue;
        if (element.hasAttribute('data-ds-area')) areas.push(element);
        const primitive = primitives[name];
        if (primitive === 'none') continue;
        const component = !primitive && name.includes('-');
        if (component) components.push(element);
        if (fields.has(name) || primitive === 'field') {
          if (!inText) words.push([element, 'field']);
          continue;
        }
        const text = !inText && !component && (primitive === 'text' || Array.from(element.childNodes).some((node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== ''));
        if (text) words.push([element, 'text']);
        // A design system component is drawn whole; an app's own component is
        // opened, so what it holds is drawn too.
        const content = element.shadowRoot;
        if (content && !primitive && (!name.startsWith('ds-') || element.hasAttribute('data-ds-layout-root'))) {
          if (!observedRoots.has(content)) {
            mutations.observe(content, { subtree: true, childList: true, characterData: true });
            observedRoots.add(content);
          }
          visit(content, inText || text);
        }
        visit(element, inText || text);
      }
    };
    visit(document.querySelector<HTMLElement>('[data-ds-inspect-active]') ?? document.body, false);
    // Semantic fallback for pages that have not supplied their own area names.
    const named = areas.length ? areas : Array.from(document.querySelectorAll<HTMLElement>('header, main, section, footer, one-footer'))
      .filter((element) => !element.querySelector('section, header, footer, one-footer'));
    return { areas: named, words, components };
  };

  const tag = (name: string, ...measures: string[]) => {
    const label = document.createElement('span');
    label.className = 'tag';
    label.textContent = name;
    for (const measure of measures) {
      const part = document.createElement('span');
      part.className = 'measure';
      part.textContent = measure;
      label.appendChild(part);
    }
    return label;
  };
  const box = (element: HTMLElement, kind: Kind, rect: DOMRect) => {
    const panel = document.createElement('div');
    panel.className = `box ${kind}`;
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
    if (kind === 'area') {
      const areaName = element.dataset.dsArea || element.getAttribute('aria-label') ||
        (element.localName === 'one-footer' ? 'footer' : element.localName);
      // Reduce dimensions measured to a tenth of a CSS pixel; use a decimal
      // for fluid shapes whose exact fraction would be too long to read.
      const width = Math.max(1, Math.round(rect.width * 10));
      const height = Math.max(1, Math.round(rect.height * 10));
      let divisor = width;
      let remainder = height;
      while (remainder) {
        [divisor, remainder] = [remainder, divisor % remainder];
      }
      const horizontal = width / divisor;
      const vertical = height / divisor;
      panel.appendChild(tag(
        areaName.replace(/[-_]/g, ' ').replace(/^./, (letter) => letter.toUpperCase()),
        `${Number(rect.width.toFixed(1))} × ${Number(rect.height.toFixed(1))}`,
        horizontal <= 100 && vertical <= 100 ? `${horizontal}:${vertical}` : `≈ ${Number((rect.width / rect.height).toFixed(2))}:1`,
      ));
    } else if (kind === 'component') {
      // A name with no room above the component stands inside it.
      panel.toggleAttribute('data-inside', rect.top < 16);
      panel.appendChild(tag(element.localName));
    }
    return panel;
  };
  const render = () => {
    frame = 0;
    if (!visible) return;
    const { areas, words, components } = collect();
    const watched = new Set([...areas, ...components]);
    for (const element of observed) {
      if (!watched.has(element)) { resize.unobserve(element); observed.delete(element); }
    }
    for (const element of watched) {
      if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    }
    // Areas first, then words, then components, so component names lie on top.
    const drawn: HTMLElement[] = [];
    const draw = (element: HTMLElement, kind: Kind) => {
      if (drawn.length >= limit) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return;
      if (getComputedStyle(element).visibility === 'hidden') return;
      drawn.push(box(element, kind, rect));
    };
    areas.forEach((element) => draw(element, 'area'));
    words.forEach(([element, kind]) => draw(element, kind));
    components.forEach((element) => draw(element, 'component'));
    layer.replaceChildren(...drawn);
  };
  const schedule = () => { if (visible && !frame) frame = requestAnimationFrame(render); };
  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  const setVisible = (next: boolean) => {
    if (next === visible) return;
    visible = next;
    overlay.hidden = !visible;
    root.toggleAttribute('data-ds-layout-visible', visible);
    if (visible) {
      resize.observe(document.body);
      mutations.observe(document.body, { subtree: true, childList: true, characterData: true });
      window.addEventListener('scroll', schedule, { passive: true, capture: true });
      window.addEventListener('resize', schedule);
      window.addEventListener('scaling-changed', schedule);
      window.addEventListener('design-system-layout-sized', schedule);
      window.addEventListener('design-system-layout-ready', schedule);
      schedule();
    } else {
      resize.disconnect();
      observed.clear();
      mutations.disconnect();
      observedRoots.clear();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scaling-changed', schedule);
      window.removeEventListener('design-system-layout-sized', schedule);
      window.removeEventListener('design-system-layout-ready', schedule);
      cancelAnimationFrame(frame);
      frame = 0;
      layer.replaceChildren();
    }
    window.dispatchEvent(new CustomEvent('design-system-layout-changed', { detail: { visible } }));
  };
  return { toggle: () => setVisible(!visible), hide: () => setVisible(false) };
}
