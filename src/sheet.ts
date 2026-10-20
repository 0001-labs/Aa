/**
 * A sheet from the foot of the screen, for touch: Design system 1's sheet
 * (ds1/overlay.css, the native frame `dialog.ds-overlay--sheet`, copied with
 * Sync 1), as wide as the screen up to 32 squares and as high as its rows up
 * to two squares below the top, with its handle, slid in from its edge and
 * swiped away (ds1/0-face/overlay-swipe.ts). Its title stands on the first
 * row with Cancel at the row's end; then its groups, each a label in the
 * muted ink on one square and rows one square high: the icon on the first
 * sixteen of its square, the words on the next square, and at the row's end
 * the Markdown that would write the same. A row chosen closes the sheet and
 * runs once it is away, so the editor has its focus back by then.
 */
import { bindOverlaySwipe } from './ds1/0-face/overlay-swipe'
import { icons } from './icons'

export type SheetRow = { id: string; label: string; icon?: string; key?: string; run(): void }
export type SheetGroup = { label?: string; rows: readonly SheetRow[] }
export type SheetOptions = {
  title: string
  groups: readonly SheetGroup[]
  /** Where the sheet is appended: the page's body, or the dialog the editor is in. */
  root: Element
  /** Called once it has closed, with the row chosen, if any, before that row runs. */
  onClose?(chosen: SheetRow | null): void
}

/** How long the sheet takes to slide out, in milliseconds (ds1/overlay.css's exit), before it is taken out of the page. */
const EXIT = 400

export function openSheet(options: SheetOptions): () => void {
  const doc = options.root.ownerDocument
  const dialog = doc.createElement('dialog')
  dialog.className = 'aa-sheet ds-overlay ds-overlay--sheet'
  dialog.setAttribute('aria-label', options.title)
  const head = doc.createElement('div'); head.className = 'aa-sheet-head'
  const title = doc.createElement('h2'); title.className = 'aa-sheet-title'; title.textContent = options.title
  const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.className = 'aa-sheet-cancel'; cancel.textContent = 'Cancel'
  head.append(title, cancel); dialog.append(head)
  let chosen: SheetRow | null = null
  for (const group of options.groups) {
    if (!group.rows.length) continue
    const section = doc.createElement('div'); section.className = 'aa-sheet-group'; section.setAttribute('role', 'group')
    if (group.label) {
      const label = doc.createElement('div'); label.className = 'aa-sheet-label'; label.textContent = group.label
      section.append(label); section.setAttribute('aria-label', group.label)
    }
    for (const row of group.rows) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'aa-sheet-row'; button.dataset.command = row.id
      const picture = doc.createElement('span'); picture.className = 'aa-icon'
      const svg = row.icon ? icons[`./icons/${row.icon}.svg`] : undefined
      if (svg) picture.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/currentColor/g, 'black'))}")`
      const words = doc.createElement('span'); words.className = 'aa-sheet-words'; words.textContent = row.label
      button.append(picture, words)
      if (row.key) { const key = doc.createElement('span'); key.className = 'aa-sheet-key'; key.setAttribute('aria-hidden', 'true'); key.textContent = row.key; button.append(key) }
      button.addEventListener('click', () => { chosen = row; dialog.close() })
      section.append(button)
    }
    dialog.append(section)
  }
  cancel.addEventListener('click', () => dialog.close())
  // A press on the backdrop, beside the sheet, puts it away.
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() })
  const unbind = bindOverlaySwipe(dialog)
  dialog.addEventListener('close', () => {
    unbind()
    const row = chosen; chosen = null
    // It slides out first; the row runs at once, the editor having its focus back.
    setTimeout(() => dialog.remove(), EXIT)
    options.onClose?.(row)
    row?.run()
  }, { once: true })
  options.root.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '')
  // The sheet itself holds the focus at first, so no row or Cancel opens ringed; Tab reaches them.
  dialog.tabIndex = -1; dialog.focus()
  return () => { if (dialog.open) dialog.close(); else dialog.remove() }
}
