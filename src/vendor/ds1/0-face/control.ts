import { LitElement, type PropertyDeclarations } from "lit";

/**
 * The element is the control.
 *
 * A host control carries the role,
 * takes focus, answers Enter and Space, and reports itself disabled. React's
 * handlers, the accessibility tree and Testing Library then all meet one node
 * in the light DOM, and there is no second interactive element nested inside
 * the first.
 *
 * The role defaults to `button`; an element that is a tab, an option or a menu
 * item says so with its own `role` attribute, which is left as written.
 */
export abstract class Control extends LitElement {
    static properties: PropertyDeclarations = {
      // The accessor is our own: disabled changes what the element does and
      // what assistive technology hears, so it reaches the DOM at once rather
      // than on Lit's next update.
      disabled: { type: Boolean, reflect: true, noAccessor: true },
    };

    #disabled = false;
    #enabledTabIndex: string | null | undefined;
    protected get hostControl(): boolean { return true; }
    protected syncControl(): void { if (this.isConnected) this.#syncDisabled(); }

    get disabled(): boolean {
      return this.#disabled;
    }

    set disabled(value: boolean) {
      const old = this.#disabled;
      this.#disabled = Boolean(value);
      // An element may not gain attributes before it is in a document; React
      // sets properties first, and connectedCallback catches up.
      if (this.isConnected) this.#syncDisabled();
      this.requestUpdate("disabled", old);
    }

    constructor() {
      super();
      this.addEventListener("keydown", this.#onKeyDown);
      this.addEventListener("keyup", this.#onKeyUp);
      // Registered on the element itself so it runs before the click reaches
      // React's root listener.
      this.addEventListener("click", this.#onClick, { capture: true });
    }

    connectedCallback(): void {
      super.connectedCallback();
      if (this.hostControl && !this.hasAttribute("role")) this.setAttribute("role", "button");
      this.#syncDisabled();
    }

    #syncDisabled(): void {
      this.toggleAttribute("disabled", this.#disabled);
      if (!this.hostControl) return;
      if (!this.hasAttribute("role")) this.setAttribute("role", "button");
      if (this.#disabled) {
        if (this.#enabledTabIndex === undefined) this.#enabledTabIndex = this.getAttribute("tabindex");
        this.setAttribute("aria-disabled", "true");
        this.setAttribute("tabindex", "-1");
      } else {
        this.removeAttribute("aria-disabled");
        if (this.#enabledTabIndex !== undefined) {
          if (this.#enabledTabIndex === null) this.setAttribute("tabindex", "0");
          else this.setAttribute("tabindex", this.#enabledTabIndex);
          this.#enabledTabIndex = undefined;
        } else if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
      }
    }

    #onClick = (event: Event): void => {
      if (!this.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    #onKeyDown = (event: KeyboardEvent): void => {
      if (!this.hostControl || this.disabled || event.target !== this) return;
      if (event.key === "Enter") {
        event.preventDefault();
        this.click();
      } else if (event.key === " ") {
        // Space clicks on release, as a native button does; stop the page from
        // scrolling in the meantime.
        event.preventDefault();
      }
    };

    #onKeyUp = (event: KeyboardEvent): void => {
      if (!this.hostControl || this.disabled || event.target !== this) return;
      if (event.key === " ") {
        event.preventDefault();
        this.click();
      }
    };
}
