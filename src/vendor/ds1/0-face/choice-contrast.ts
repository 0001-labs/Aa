import { colorReader, composite, contrastRatio, paintedParent, TEXT_CONTRAST_MINIMUM, type RGBA } from "./text-contrast";

/** Selected joined controls keep a library's ink when readable, otherwise use black or white.
 * Resolve the painted fill, not an assumed accent or theme. No per-frame polling. */
export class ChoiceContrast {
  private observer?: MutationObserver;
  private frame = 0;
  constructor(private readonly host: HTMLElement, private readonly controls: () => HTMLElement[]) {}
  private queue = () => {
    const view = this.host.ownerDocument.defaultView!;
    if (!this.frame) this.frame = view.requestAnimationFrame(() => { this.frame = 0; this.resolve(); });
  };
  connect() {
    if (this.observer) return;
    const view = this.host.ownerDocument.defaultView!;
    this.observer = new view.MutationObserver(this.queue);
    for (let node: Element | null = this.host; node; node = paintedParent(node)) {
      this.observer.observe(node, { attributes: true, attributeFilter: ["class", "style", "data-theme", "theme"] });
    }
    view.addEventListener("load", this.queue, true);
  }
  disconnect() {
    this.observer?.disconnect(); this.observer = undefined;
    const view = this.host.ownerDocument.defaultView!;
    view.cancelAnimationFrame(this.frame); this.frame = 0;
    view.removeEventListener("load", this.queue, true);
  }
  resolve() {
    const view = this.host.ownerDocument.defaultView!;
    const read = colorReader(this.host.ownerDocument);
    for (const control of this.controls()) {
      control.style.removeProperty("--_ds-choice-ink");
      let background: RGBA = [0, 0, 0, 0];
      for (let node: Element | null = control; node && background[3] < 1; node = paintedParent(node)) {
        const fill = read(view.getComputedStyle(node).backgroundColor);
        if (fill) background = composite(background, fill);
      }
      if (background[3] < 1) continue; // The page must declare its paper; the contrast constraint checks it.
      const preferred = read(view.getComputedStyle(control).color);
      if (preferred && contrastRatio(composite(preferred, background), background) >= TEXT_CONTRAST_MINIMUM) continue;
      const black: RGBA = [0, 0, 0, 1], white: RGBA = [1, 1, 1, 1];
      control.style.setProperty("--_ds-choice-ink", contrastRatio(black, background) >= contrastRatio(white, background) ? "#000000" : "#ffffff");
    }
  }
}
