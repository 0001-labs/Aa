/** Round named area heights up to the shared unit without clipping their content. */
export function initGridFit(): void {
  const scopes = Array.from(document.querySelectorAll<HTMLElement>('[data-ds-grid-fit]'));
  if (!scopes.length || document.documentElement.hasAttribute('data-ds-grid-fit-ready')) return;
  document.documentElement.setAttribute('data-ds-grid-fit-ready', '');

  const measure = document.createElement('div');
  measure.setAttribute('aria-hidden', 'true');
  measure.style.cssText = 'position:fixed;left:0;top:0;width:0;height:var(--ds-grid-unit,20px);visibility:hidden;pointer-events:none;contain:strict';
  document.body.appendChild(measure);
  const originalMinimums = new Map<HTMLElement, string>();
  const observed = new Set<HTMLElement>();
  let frame = 0;

  const fit = () => {
    frame = 0;
    const unit = measure.getBoundingClientRect().height;
    if (unit <= 0) return;
    const elements = scopes.flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>('[data-ds-area]')));
    const current = new Set(elements);
    for (const [element, minimum] of originalMinimums) {
      if (!current.has(element)) {
        element.style.minHeight = minimum;
        originalMinimums.delete(element);
      }
    }
    // Restore natural heights first, allowing containers to shrink after a
    // translation, font, or viewport change as well as grow.
    elements.forEach((element) => {
      if (!originalMinimums.has(element)) originalMinimums.set(element, element.style.minHeight);
      element.style.minHeight = originalMinimums.get(element)!;
    });
    // Fit children before their containing areas so nested measurements agree.
    [...elements].reverse().forEach((element) => {
      const height = element.getBoundingClientRect().height;
      if (!height || getComputedStyle(element).display === 'none') return;
      const rounded = Math.max(1, Math.ceil((height - 0.02) / unit)) * unit;
      element.style.minHeight = `${rounded}px`;
    });

    const targets = new Set<HTMLElement>([measure, ...scopes, ...elements]);
    elements.forEach((element) => {
      for (const child of element.children) if (child instanceof HTMLElement) targets.add(child);
    });
    for (const element of observed) {
      if (!targets.has(element)) { resize.unobserve(element); observed.delete(element); }
    }
    for (const element of targets) {
      if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    }
    window.dispatchEvent(new CustomEvent('design-system-layout-sized'));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
  const resize = new ResizeObserver(schedule);
  const changes = new MutationObserver(schedule);
  scopes.forEach((scope) => changes.observe(scope, { subtree: true, childList: true, characterData: true }));
  window.addEventListener('resize', schedule);
  window.addEventListener('scaling-changed', schedule);
  window.addEventListener('language-changed', schedule);
  document.fonts.addEventListener('loadingdone', schedule);
  void document.fonts.ready.then(schedule);
  fit();
}
