/** What Aa draws as one thing out of the box: pictures, and people tagged by name. */
import { IMAGE, readPicture, writePicture, type AtomSyntax } from './markdown'
import { word } from './words'

/**
 * An atom the editor reads and draws: what it is in the text, and how it is
 * drawn into the element Aa gives it. What `draw` returns is called once the
 * atom leaves the page, to stop whatever it started.
 */
export type Atom = AtomSyntax & {
  draw?(element: HTMLElement, source: string): void | (() => void)
  /** A person tagged: Backspace takes the space written after it along with it, so one press removes the tag however it was made. */
  tag?: true
  /** A block that starts one, offered in the toolbar and the slash menu: its name, icon and first source. */
  insert?: { label: string; icon: string; source: string; keywords?: string; preview?(element: HTMLElement, context: { input: 'pointer' | 'keyboard' }): void | (() => void) }
}

/**
 * A person tagged by name, `@Name`: words in the document, drawn and removed as
 * one thing. `people` says who can be tagged, read each time so it can change;
 * the longest name that fits wins, and letters after it make it plain words.
 */
export function personAtom(people: () => readonly string[], colour?: (name: string) => string): Atom {
  return {
    name: 'person', tag: true,
    match(line, at) {
      if (line[at] !== '@' || (at > 0 && !/[\s([{>*_~]/.test(line[at - 1]))) return 0
      const rest = line.slice(at + 1).toLocaleLowerCase()
      const names = people().map(name => name.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
      const name = names.find(each => rest.startsWith(each.toLocaleLowerCase()) && !/[\p{L}\p{N}_-]/u.test(rest[each.length] ?? ''))
      return name ? name.length + 1 : 0
    },
    draw(element, source) {
      element.textContent = source
      const color = colour?.(source.slice(1))
      if (color) element.style.setProperty('--aa-person', color)
    },
  }
}

/** The narrowest a picture is sized to, in squares. */
const PICTURE_MIN = 4

/** One square in pixels where it is drawn, at the page's scale. */
export function squareIn(element: HTMLElement): number {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--aa-unit, 20px)'
  element.append(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()
  return width || 20
}

/**
 * The grip on a picture's end edge: pulled, the picture is a whole number of squares wide, from four
 * to as many as its line holds, and let go, its width is written into its Markdown as one step to undo
 * (`aa-atom-source`, handed to the editor). A double press gives the picture back its own size.
 */
function pictureGrip(element: HTMLElement, alt: string, src: string) {
  const grip = document.createElement('span')
  grip.className = 'aa-picture-grip'
  grip.setAttribute('data-aa-interactive', '')
  grip.setAttribute('role', 'separator')
  grip.setAttribute('aria-orientation', 'vertical')
  grip.setAttribute('aria-label', word('Picture width'))
  grip.contentEditable = 'false'
  const written = () => Number(element.dataset.width) || null
  const write = (squares: number | null) => element.dispatchEvent(new CustomEvent('aa-atom-source', { bubbles: true, detail: { source: writePicture(alt, src, squares) } }))
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0 || element.closest('.aa-block')?.getAttribute('data-readonly') === 'true') return
    event.preventDefault(); event.stopPropagation()
    const unit = squareIn(element)
    const start = event.clientX, from = element.getBoundingClientRect().width
    const line = (element.closest('.aa-block') as HTMLElement | null)?.clientWidth ?? from
    const most = Math.max(PICTURE_MIN, Math.floor(line / unit))
    const before = written()
    let squares = Math.round(from / unit)
    grip.setPointerCapture(event.pointerId)
    element.setAttribute('data-sizing', '')
    const set = (width: number) => { element.style.setProperty('--aa-picture-width', String(width)); element.dataset.width = String(Math.round(width)) }
    // The edge follows the pointer exactly; the squares are where it lands.
    const move = (moved: PointerEvent) => {
      const width = Math.min(most, Math.max(PICTURE_MIN, (from + moved.clientX - start) / unit))
      squares = Math.round(width)
      set(width)
    }
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up)
      element.removeAttribute('data-sizing')
      element.setAttribute('data-settling', '')
      void element.getBoundingClientRect()
      set(squares)
      if (squares !== before) write(squares)
      setTimeout(() => element.removeAttribute('data-settling'), 160)
    }
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up)
  })
  grip.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); if (written() !== null) write(null) })
  element.append(grip)
}

/**
 * A drawn picture made sizable: as wide as its Markdown says in squares (`![caption](address "w12")`),
 * or its own size up to sixteen, with the grip that sizes it. For a product's own picture atom too.
 */
export function sizePicture(element: HTMLElement, source: string) {
  const { alt, src, width } = readPicture(source)
  if (width) { element.dataset.width = String(width); element.style.setProperty('--aa-picture-width', String(width)) }
  pictureGrip(element, alt, src)
}

/** A picture drawn as itself, as wide as its Markdown says in squares, or its own size up to sixteen. */
export const imageAtom: Atom = {
  ...IMAGE,
  draw(element, source) {
    const { alt, src } = readPicture(source)
    const extension = src.split(/[?#]/)[0].split('.').pop()?.toLowerCase()
    if (/^data:(audio|video)\//.test(src) || (extension && /^(mp4|webm|mov|mp3|wav|ogg|m4a)$/.test(extension))) {
      const media = document.createElement(/^data:video\//.test(src) || /^(mp4|webm|mov)$/.test(extension ?? '') ? 'video' : 'audio')
      media.src = src; media.controls = true; media.preload = 'metadata'
      media.setAttribute('aria-label', alt)
      element.append(media)
    } else {
      const image = document.createElement('img')
      image.src = src; image.alt = alt; image.loading = 'lazy'; image.draggable = false
      element.append(image)
      sizePicture(element, source)
    }
    const caption = document.createElement('span'); caption.className = 'aa-caption'; caption.textContent = alt; caption.contentEditable = 'true'; caption.dataset.placeholder = word('Add a caption'); element.append(caption)
  },
}
