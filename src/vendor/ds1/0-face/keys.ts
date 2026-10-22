/**
 * Keyboard shortcuts on every platform: the platform's command key, a guard
 * that leaves typing alone, the label a shortcut is written with, and one call
 * that binds a shortcut. Plain TypeScript with no framework and no language
 * runtime, for any page.
 *
 * A shortcut is written once, in lower case, its parts joined with `+`:
 * `"mod+shift+d"`, `"mod+enter"`, `"alt+arrowup"`, `"escape"`, `"?"`. `mod`
 * is ⌘ on a Mac, iPhone or iPad and Ctrl everywhere else; `ctrl`, `meta`,
 * `alt` and `shift` name a key as it is. The key is a letter, a digit, a
 * symbol or one of the named keys (`enter`, `escape`, `tab`, `space`,
 * `backspace`, `delete`, `home`, `end`, `pageup`, `pagedown`, the arrows
 * `arrowup` … `arrowright`, `f1` … `f12`; `plus` for `+`).
 *
 * - `modKey()` is the command key's label: ⌘, or Ctrl.
 * - `isTyping(event)` is true while focus is in a text field, a select, a
 *   contenteditable or a textbox, or a composition (an input method) is open.
 * - `shortcutLabel("mod+shift+d")` writes it as the platform does: ⇧⌘D on
 *   Apple platforms, in Apple's order (⌃ ⌥ ⇧ ⌘), and Ctrl+Shift+D elsewhere.
 *   Arrows are drawn as arrows (↑), which every DS1 typeface sets in Inter.
 * - `ariaKeyShortcuts("mod+shift+d")` is the value for `aria-keyshortcuts`
 *   on the control the shortcut presses: Meta+Shift+D or Control+Shift+D.
 * - `matchesShortcut(event, "mod+d")` reads a keydown; a letter matches by
 *   its physical key too, so it works on other layouts and with ⌥ held.
 * - `onShortcut("mod+k", handler)` listens for it on the document (or a
 *   `target`), leaves it alone while typing unless `typing: true`, prevents
 *   the browser's own action, and returns the function that unbinds it.
 *
 * The key names written as words (Ctrl, Shift, Alt, Enter, Esc, Tab, Space,
 * Backspace, Del, Home, End, PgUp, PgDn) are the shared words (`key.ctrl` …)
 * in the page's language where the page loads the language module with
 * `configureI18n({ sharedWords: true })`, and English otherwise;
 * `setKeyWords()` gives a product's own.
 */

export type KeyPlatform = "apple" | "other";

export interface ShortcutOptions {
  /** The platform to write or read the shortcut for; the device's own by default. */
  platform?: KeyPlatform;
}

/** A shortcut taken apart: its modifiers as keys on this platform, and its key. */
export interface Shortcut {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** The key, in lower case as written (`d`, `enter`, `arrowup`, `?`). */
  key: string;
}

/** The ids of the key names written as words, each a shared word. */
export type KeyWord =
  | "key.ctrl" | "key.shift" | "key.alt" | "key.enter" | "key.escape" | "key.tab" | "key.space"
  | "key.backspace" | "key.delete" | "key.home" | "key.end" | "key.pageup" | "key.pagedown";
/** A table of the words to change, or a function that gives each word. */
export type KeyWords = Partial<Record<KeyWord, string>> | ((word: KeyWord) => string);

const ENGLISH: Record<KeyWord, string> = {
  "key.ctrl": "Ctrl", "key.shift": "Shift", "key.alt": "Alt", "key.enter": "Enter", "key.escape": "Esc",
  "key.tab": "Tab", "key.space": "Space", "key.backspace": "Backspace", "key.delete": "Del",
  "key.home": "Home", "key.end": "End", "key.pageup": "PgUp", "key.pagedown": "PgDn",
};

/** Where the language module leaves its `translate()`; on `globalThis`, so every copy of either module finds it. */
const TRANSLATOR = Symbol.for("design-system-1.translate");
let words: KeyWords | null = null;

/** Give the key names of a product's own, or `null` to go back to the shared words (or English). */
export function setKeyWords(next: KeyWords | null): void {
  words = next;
}

/** A key's name as a word, in the page's language. */
export function keyWord(word: KeyWord): string {
  if (typeof words === "function") return words(word);
  const own = words?.[word];
  if (own !== undefined) return own;
  const translate = (globalThis as unknown as Record<symbol, unknown>)[TRANSLATOR];
  if (typeof translate === "function") {
    const text = String(translate(word));
    // Without the shared words the language module answers with the id itself.
    if (text && text !== word) return text;
  }
  return ENGLISH[word];
}

/** True on a Mac, iPhone or iPad, where ⌘ is the command key and Ctrl-click is the right click. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod|ios/i.test(platform);
}

const platformOf = (options?: ShortcutOptions): KeyPlatform => options?.platform ?? (isApplePlatform() ? "apple" : "other");

/** The command key's label: ⌘ on Apple platforms, Ctrl (in the page's language) elsewhere. */
export function modKey(options?: ShortcutOptions): string {
  return platformOf(options) === "apple" ? "⌘" : keyWord("key.ctrl");
}

/** True when the command key is held: ⌘ on Apple platforms, Ctrl elsewhere. */
export function isModKey(event: { metaKey: boolean; ctrlKey: boolean }, options?: ShortcutOptions): boolean {
  return platformOf(options) === "apple" ? event.metaKey : event.ctrlKey;
}

/** Input types a person types into; a checkbox or a button leaves shortcuts alone. */
const TEXT_INPUTS = new Set(["", "text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week"]);

/** The element an event started on, inside open shadow roots too. */
function origin(event: Event): Element | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path.find(node => node instanceof Element) ?? event.target;
  return first instanceof Element ? first : null;
}

/**
 * True while a person is typing: focus is in a text field, a textarea, a
 * select, a contenteditable or an element with a textbox, searchbox or
 * combobox role, or an input method is composing. A shortcut ignores it.
 */
export function isTyping(event: Event): boolean {
  const keyboard = event as KeyboardEvent;
  if (keyboard.isComposing || keyboard.keyCode === 229) return true;
  let element = origin(event);
  // The event's origin is the field; a host that forwards focus has it in its shadow root.
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  if (!element) return false;
  if (element instanceof HTMLInputElement) return TEXT_INPUTS.has(element.type.toLowerCase()) && !element.readOnly;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  // Some DOMs (and tests) leave isContentEditable unset; read the attribute along the way up.
  if (element.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  return Boolean(element.closest('[role="textbox"], [role="searchbox"], [role="combobox"]'));
}

const ALIASES: Record<string, string> = {
  esc: "escape", return: "enter", del: "delete", up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright",
  spacebar: "space", " ": "space", pgup: "pageup", pgdn: "pagedown", cmd: "meta", command: "meta", control: "ctrl", option: "alt", opt: "alt",
};

/** Take a shortcut apart; `mod` becomes ⌘ (meta) on Apple platforms and Ctrl elsewhere. */
export function parseShortcut(shortcut: string, options?: ShortcutOptions): Shortcut {
  const apple = platformOf(options) === "apple";
  const parts = shortcut.trim().toLowerCase().split("+").map(part => part.trim());
  // "mod++" and a trailing "+" name the plus key.
  const raw = parts[parts.length - 1] === "" ? "plus" : parts.pop()!;
  const result: Shortcut = { ctrl: false, meta: false, alt: false, shift: false, key: ALIASES[raw] ?? raw };
  for (const part of parts) {
    const name = ALIASES[part] ?? part;
    if (name === "mod") result[apple ? "meta" : "ctrl"] = true;
    else if (name === "ctrl" || name === "meta" || name === "alt" || name === "shift") result[name] = true;
    else if (name !== "") throw new Error(`Unknown modifier in shortcut "${shortcut}": ${part}`);
  }
  if (!result.key) throw new Error(`A shortcut names a key: "${shortcut}"`);
  return result;
}

/** Named keys as KeyboardEvent.key gives them. */
const EVENT_KEYS: Record<string, string> = {
  enter: "Enter", escape: "Escape", tab: "Tab", space: " ", backspace: "Backspace", delete: "Delete",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown", insert: "Insert",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", plus: "+",
};

/** Keys whose character already needs Shift on most layouts, so Shift is not asked of them. */
const shifted = (key: string) => key.length === 1 && !/[a-z0-9]/.test(key);

/** True when a keydown is the shortcut. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string | Shortcut, options?: ShortcutOptions): boolean {
  const wanted = typeof shortcut === "string" ? parseShortcut(shortcut, options) : shortcut;
  if (event.ctrlKey !== wanted.ctrl || event.metaKey !== wanted.meta || event.altKey !== wanted.alt) return false;
  if (!shifted(wanted.key) && event.shiftKey !== wanted.shift) return false;
  if (shifted(wanted.key) && wanted.shift && !event.shiftKey) return false;
  const key = wanted.key;
  if (/^[a-z]$/.test(key)) return event.key.toLowerCase() === key || event.code === `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return event.key === key || event.code === `Digit${key}`;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) return event.key.toLowerCase() === key;
  const named = EVENT_KEYS[key];
  if (named) return event.key === named || (key === "space" && event.code === "Space");
  return event.key.toLowerCase() === key;
}

/** Apple's symbols for its modifiers and keys, as its menus write them. */
const APPLE_KEYS: Record<string, string> = {
  enter: "↩", escape: "⎋", tab: "⇥", backspace: "⌫", delete: "⌦", home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟",
};
const ARROWS: Record<string, string> = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" };
const WORDS: Record<string, KeyWord> = {
  enter: "key.enter", escape: "key.escape", tab: "key.tab", space: "key.space", backspace: "key.backspace",
  delete: "key.delete", home: "key.home", end: "key.end", pageup: "key.pageup", pagedown: "key.pagedown",
};

function keyLabel(key: string, apple: boolean): string {
  if (ARROWS[key]) return ARROWS[key]!;
  if (key === "plus") return "+";
  if (apple && APPLE_KEYS[key]) return APPLE_KEYS[key]!;
  if (WORDS[key]) return keyWord(WORDS[key]!);
  if (/^f\d{1,2}$/.test(key)) return key.toUpperCase();
  if (key === "insert") return "Ins";
  return key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1);
}

/**
 * A shortcut as the platform writes it: ⇧⌘D on Apple platforms (⌃ ⌥ ⇧ ⌘,
 * then the key, with no space between), Ctrl+Shift+D elsewhere (Ctrl, Alt,
 * Shift, then the key, joined with +).
 */
export function shortcutLabel(shortcut: string, options?: ShortcutOptions): string {
  const apple = platformOf(options) === "apple";
  const parts = parseShortcut(shortcut, options);
  const key = keyLabel(parts.key, apple);
  if (apple) return `${parts.ctrl ? "⌃" : ""}${parts.alt ? "⌥" : ""}${parts.shift ? "⇧" : ""}${parts.meta ? "⌘" : ""}${key}`;
  return [
    parts.meta ? "Meta" : "",
    parts.ctrl ? keyWord("key.ctrl") : "",
    parts.alt ? keyWord("key.alt") : "",
    parts.shift ? keyWord("key.shift") : "",
    key,
  ].filter(Boolean).join("+");
}

/** The value for `aria-keyshortcuts`: the modifiers and key by their KeyboardEvent names, `Meta+Shift+D`. */
export function ariaKeyShortcuts(shortcut: string, options?: ShortcutOptions): string {
  const parts = parseShortcut(shortcut, options);
  const key = parts.key === "space" ? "Space" : EVENT_KEYS[parts.key] ?? parts.key.toUpperCase();
  return [parts.ctrl && "Control", parts.alt && "Alt", parts.shift && "Shift", parts.meta && "Meta", key].filter(Boolean).join("+");
}

export interface OnShortcutOptions extends ShortcutOptions {
  /** Where to listen: the document by default; a panel or a field listens to its own keys. */
  target?: EventTarget;
  /** Also while typing in a field (a save shortcut, say); left alone by default. */
  typing?: boolean;
  /** Prevent the browser's own action for the shortcut; on by default. */
  preventDefault?: boolean;
  /** Also on a held key's repeats; on by default. */
  repeat?: boolean;
  /** Listen in the capture phase, before the page's own handlers. */
  capture?: boolean;
  /** Unbind when this signal aborts. */
  signal?: AbortSignal;
}

/**
 * Run `handler` when a shortcut, or one of several, is pressed. A keydown
 * already handled (`defaultPrevented`) is left alone. Returns the function
 * that unbinds it.
 */
export function onShortcut(shortcut: string | string[], handler: (event: KeyboardEvent) => void, options: OnShortcutOptions = {}): () => void {
  const target = options.target ?? (typeof document === "undefined" ? undefined : document);
  if (!target) return () => {};
  const shortcuts = (Array.isArray(shortcut) ? shortcut : [shortcut]).map(text => text.trim());
  const listener = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.defaultPrevented) return;
    if (keyboard.repeat && options.repeat === false) return;
    if (!options.typing && isTyping(keyboard)) return;
    // Read the platform per press, so a test or a product that sets it later is followed.
    if (!shortcuts.some(text => matchesShortcut(keyboard, text, options))) return;
    if (options.preventDefault !== false) keyboard.preventDefault();
    handler(keyboard);
  };
  const capture = Boolean(options.capture);
  target.addEventListener("keydown", listener, { capture });
  const off = () => {
    target.removeEventListener("keydown", listener, { capture });
    options.signal?.removeEventListener("abort", off);
  };
  options.signal?.addEventListener("abort", off, { once: true });
  if (options.signal?.aborted) off();
  return off;
}
