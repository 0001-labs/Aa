/**
 * The keyboard and pointer of a tree of rows, shared by `<ds-sidebar tree>`
 * and the native `.ds-sidebar` classes of `row.css`.
 *
 * A tree is one stop for Tab: the row that has the focus (the selected row
 * at first, otherwise the first) carries `tabindex="0"` and every other row
 * `-1`. Up and Down move between rows that are not disabled, Home and End to
 * the first and last; Right opens a closed row and enters an open one; Left
 * closes an open row and moves to its parent; a printed character moves to
 * the next row whose label starts with it. Space selects the row, Enter
 * selects and activates it, as a double click does.
 *
 * `treeStep()` is that model alone, on the visible rows. `connectSidebar()`
 * puts it on a native tree: rows with `role="treeitem"` and `aria-level`,
 * flat, in order, inside an element with `role="tree"`. It dispatches the
 * same events as `<ds-sidebar tree>` (`sidebar-toggle`, `sidebar-select`,
 * `sidebar-activate`, each with `{ id }`), and unless the page cancels one
 * it does what the event asks: opens or closes the row, hiding the rows
 * inside it, or selects it.
 */

/** A visible row of a tree, as the keyboard sees it. */
export interface TreeRow {
  /** 1 for a row at the root. */
  level: number;
  /** `true` open, `false` closed; a leaf has none. */
  expanded?: boolean;
  disabled?: boolean;
  /** The words the type-ahead matches. */
  label?: string;
}

/** What a key asks of the tree: move the focus to a row, open or close the row, select or activate it. */
export interface TreeStep {
  focus?: number;
  toggle?: boolean;
  select?: boolean;
  activate?: boolean;
}

const available = (rows: readonly TreeRow[], from: number, step: 1 | -1) => {
  for (let index = from; index >= 0 && index < rows.length; index += step) if (!rows[index]!.disabled) return index;
  return undefined;
};

/** The next row after `index` whose label starts with `letter`, from the top again after the last. */
function typeahead(rows: readonly TreeRow[], index: number, letter: string) {
  const wanted = letter.toLocaleLowerCase();
  for (let offset = 1; offset <= rows.length; offset++) {
    const at = (index + offset) % rows.length;
    const row = rows[at]!;
    if (!row.disabled && (row.label ?? "").trim().toLocaleLowerCase().startsWith(wanted)) return at;
  }
  return undefined;
}

/**
 * What `key` does on the row at `index` of the visible `rows`, or
 * `undefined` when the tree leaves the key alone.
 */
export function treeStep(rows: readonly TreeRow[], index: number, key: string): TreeStep | undefined {
  const row = rows[index];
  if (!row) return undefined;
  switch (key) {
    case "ArrowDown": return { focus: available(rows, index + 1, 1) ?? index };
    case "ArrowUp": return { focus: available(rows, index - 1, -1) ?? index };
    case "Home": return { focus: available(rows, 0, 1) ?? index };
    case "End": return { focus: available(rows, rows.length - 1, -1) ?? index };
    case "ArrowRight":
      if (row.expanded === false) return row.disabled ? {} : { toggle: true };
      if (row.expanded && (rows[index + 1]?.level ?? 0) > row.level) return { focus: available(rows, index + 1, 1) ?? index };
      return {};
    case "ArrowLeft": {
      if (row.expanded && !row.disabled) return { toggle: false };
      for (let at = index - 1; at >= 0; at--) if (rows[at]!.level < row.level) return rows[at]!.disabled ? {} : { focus: at };
      return {};
    }
    case "Enter": return row.disabled ? {} : { select: true, activate: true };
    case " ": return row.disabled ? {} : { select: true };
    default: {
      // One printed character, a letter outside the basic plane included; named keys are longer.
      if (!/^\S$/u.test(key)) return undefined;
      const at = typeahead(rows, index, key);
      return at === undefined ? {} : { focus: at };
    }
  }
}

/** The events a tree sends, the same from `<ds-sidebar tree>` and a native tree. */
export interface SidebarEvents {
  "sidebar-toggle": CustomEvent<{ id: string; expanded: boolean }>;
  "sidebar-select": CustomEvent<{ id: string }>;
  "sidebar-activate": CustomEvent<{ id: string }>;
}

const ITEM = '[role="treeitem"]';
const level = (item: Element) => Math.max(1, Number.parseInt(item.getAttribute("aria-level") ?? "1", 10) || 1);
const expandedOf = (item: Element) => {
  const value = item.getAttribute("aria-expanded");
  return value === null ? undefined : value === "true";
};
const disabledOf = (item: Element) => item.getAttribute("aria-disabled") === "true";
const labelOf = (item: Element) => (item.querySelector(".ds-sidebar__label") ?? item).textContent ?? "";
/** A row's name in the events: `data-id`, else its `id`. */
const idOf = (item: HTMLElement) => item.dataset.id ?? item.id;

/**
 * Gives a native tree its keyboard and pointer. Returns a function that
 * takes them away again.
 *
 *   <ul class="ds-sidebar" role="tree" aria-label="Files">
 *     <li class="ds-sidebar__item" role="treeitem" aria-level="1" aria-expanded="true" data-id="src">
 *       <span class="ds-sidebar__disclosure" aria-hidden="true"></span>
 *       <span class="ds-sidebar__label">src</span>
 *     </li>
 *     <li class="ds-sidebar__item" role="treeitem" aria-level="2" data-id="main">…</li>
 *   </ul>
 */
export function connectSidebar(tree: HTMLElement): () => void {
  const items = () => [...tree.querySelectorAll<HTMLElement>(ITEM)];
  const visible = () => items().filter(item => !item.hidden && !item.closest("[hidden]"));

  /** Exactly one visible row is the Tab stop: the focused one, else the selected one, else the first available. */
  const rove = (focus?: HTMLElement) => {
    const rows = visible();
    const current = focus ?? rows.find(item => item.tabIndex === 0 && !disabledOf(item)) ?? rows.find(item => item.getAttribute("aria-selected") === "true") ?? rows.find(item => !disabledOf(item)) ?? rows[0];
    for (const item of items()) item.tabIndex = item === current ? 0 : -1;
    return current;
  };

  const send = <K extends keyof SidebarEvents>(name: K, detail: SidebarEvents[K]["detail"]) =>
    tree.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true }));

  /** Opens or closes a row and shows or hides the rows inside it, keeping closed rows inside it closed. */
  const toggle = (item: HTMLElement, expanded: boolean) => {
    if (!send("sidebar-toggle", { id: idOf(item), expanded })) return;
    item.setAttribute("aria-expanded", String(expanded));
    const all = items();
    const own = level(item);
    let closedAt = Infinity;
    for (const row of all.slice(all.indexOf(item) + 1)) {
      const depth = level(row);
      if (depth <= own) break;
      if (depth <= closedAt) closedAt = Infinity;
      row.hidden = !expanded || depth > closedAt;
      if (expanded && !row.hidden && row.getAttribute("aria-expanded") === "false") closedAt = depth;
    }
    rove(item);
  };

  const select = (item: HTMLElement) => {
    if (!send("sidebar-select", { id: idOf(item) })) return;
    for (const row of items()) if (row.hasAttribute("aria-selected") || row === item) row.setAttribute("aria-selected", String(row === item));
  };

  const focus = (item: HTMLElement) => { rove(item); item.focus(); };

  const keydown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEM);
    if (!item || !tree.contains(item)) return;
    const rows = visible();
    const step = treeStep(rows.map(row => ({ level: level(row), expanded: expandedOf(row), disabled: disabledOf(row), label: labelOf(row) })), rows.indexOf(item), event.key);
    if (!step) return;
    event.preventDefault();
    if (step.toggle !== undefined) toggle(item, step.toggle);
    if (step.select) select(item);
    if (step.activate) send("sidebar-activate", { id: idOf(item) });
    if (step.focus !== undefined && rows[step.focus]) focus(rows[step.focus]!);
  };

  const click = (event: MouseEvent) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEM);
    if (!item || !tree.contains(item) || disabledOf(item)) return;
    const disclosure = (event.target as Element).closest(".ds-sidebar__disclosure");
    if (disclosure && expandedOf(item) !== undefined) toggle(item, !expandedOf(item));
    else select(item);
    focus(item);
  };

  const dblclick = (event: MouseEvent) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEM);
    if (!item || !tree.contains(item) || disabledOf(item) || (event.target as Element).closest(".ds-sidebar__disclosure")) return;
    send("sidebar-activate", { id: idOf(item) });
  };

  if (!tree.hasAttribute("role")) tree.setAttribute("role", "tree");
  rove();
  // Rows the page adds or removes keep one Tab stop.
  const observer = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(() => { if (!items().some(item => item.tabIndex === 0 && !item.hidden)) rove(); });
  observer?.observe(tree, { childList: true, subtree: true });
  tree.addEventListener("keydown", keydown);
  tree.addEventListener("click", click);
  tree.addEventListener("dblclick", dblclick);
  return () => {
    observer?.disconnect();
    tree.removeEventListener("keydown", keydown);
    tree.removeEventListener("click", click);
    tree.removeEventListener("dblclick", dblclick);
  };
}
