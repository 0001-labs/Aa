/** Register a shared element once; a fresh page picks up changes during HMR. */
export function define(name: string, element: CustomElementConstructor): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(name)) customElements.define(name, element);
}
