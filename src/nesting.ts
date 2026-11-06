/**
 * Blocks that hold writing of their own, columns and tabs: each column or tab
 * page is an editor of its own, made by `nested` so it has the page's atoms.
 */
import type { Editor } from './editor'
import { iconElement } from './icons'
import { parseBlocks, readColumns, readTabs, serialize, writeColumns, writeTabs, type Tab } from './markdown'
import { word } from './words'

type Nested = (host: HTMLElement, value: string, onChange: (value: string) => void) => Editor

export function createNesting(nested: Nested, state: () => { readOnly: boolean; placing: boolean }) {
  /**
   * Columns (`<columns>` around a `<column>` each) side by side, each column
   * an editor of its own on the same atoms, so it is written where it stands
   * as any block is. A change in a column hands the whole block back in
   * `aa-atom-change`, one step of undo; the drawing keeps the new source, so
   * the columns and the caret in them stay as they are.
   */
  const columnEditors = new Set<Editor>()
  function drawColumns(element: HTMLElement, source: string) {
    element.classList.add('aa-columns')
    element.setAttribute('data-aa-interactive', '')
    let values = readColumns(source)
    let editors: Editor[] = []
    const changed = () => {
      const written = writeColumns(values)
      element.dataset.source = written
      element.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: written } }))
    }
    const build = () => {
      editors.forEach(editor => { columnEditors.delete(editor); editor.destroy() })
      element.querySelectorAll(':scope > .aa-column').forEach(column => column.remove())
      element.style.setProperty('--aa-columns', String(values.length))
      editors = values.map((value, index) => {
        const column = document.createElement('div')
        column.className = 'aa-column'
        element.append(column)
        // Files are the page's: they land on its line beside the columns, from where they are carried in.
        const editor = nested(column, value, next => { values[index] = next; changed() })
        columnEditors.add(editor)
        return editor
      })
    }
    // A block carried out of its column, let go on another column: alone in its own, the two trade places.
    // Let go in a gap or past either end: it stands there as a column of its own, and the column it left goes
    // when nothing is left in it. Pictures are put in order sideways.
    const carry = (event: Event) => {
      const { from, slot, swap } = (event as CustomEvent<{ from: number; slot?: number; swap?: number }>).detail
      const columns = Array.from(element.querySelectorAll(':scope > .aa-column'))
      const origin = columns.indexOf((event.target as HTMLElement).closest('.aa-column') as Element)
      if (origin < 0 || !state().placing || state().readOnly) return
      event.stopPropagation()
      // Let go on another column, a block alone in its own trades places with it.
      if (swap !== undefined) {
        if (swap === origin || values[swap] === undefined || parseBlocks(values[origin]).length !== 1) return
        const next = [...values]; [next[origin], next[swap]] = [next[swap], next[origin]]
        values = next
        build()
        changed()
        return
      }
      const blocks = parseBlocks(values[origin]), block = blocks[from]
      if (!block || slot === undefined) return
      const rest = serialize(blocks.filter((_, index) => index !== from))
      // The place among the other columns, its own left out when nothing else is in it.
      const next = rest.trim() ? values.map((value, index) => (index === origin ? rest : value)) : values.filter((_, index) => index !== origin)
      next.splice(Math.max(0, Math.min(slot, next.length)), 0, block.source)
      values = next
      build()
      changed()
    }
    element.addEventListener('aa-column-carry', carry)
    build()
    return () => { element.removeEventListener('aa-column-carry', carry); editors.forEach(editor => { columnEditors.delete(editor); editor.destroy() }) }
  }
  /**
   * Tabs (`<tabs>` around a `<tab name="…">` each): a row of Design system 1's
   * text tabs over the open tab's page, an editor of its own on the same atoms,
   * so it is written where it stands. A press on the open tab's name writes it
   * anew in its place; the plus at the row's end adds a tab; Delete on a tab
   * takes it away, its words with it. Each change hands the whole block back in
   * `aa-atom-change`, one step of undo, and the drawing keeps the open tab.
   */
  function drawTabs(element: HTMLElement, source: string) {
    element.classList.add('aa-tabs')
    element.setAttribute('data-aa-interactive', '')
    let tabs: Tab[] = readTabs(source)
    let current = 0
    let page: Editor | null = null
    const row = document.createElement('div')
    row.className = 'aa-tabs-row'
    row.setAttribute('role', 'tablist')
    const panel = document.createElement('div')
    panel.className = 'aa-tab-panel'
    panel.setAttribute('role', 'tabpanel')
    element.append(row, panel)
    const changed = () => {
      const written = writeTabs(tabs)
      element.dataset.source = written
      element.dispatchEvent(new CustomEvent('aa-atom-change', { bubbles: true, detail: { source: written } }))
    }
    const buildRow = () => {
      row.replaceChildren(...tabs.map((tab, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'aa-tab'
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-selected', String(index === current))
        button.tabIndex = index === current ? 0 : -1
        button.dataset.tab = String(index)
        if (tab.icon) { const icon = document.createElement('span'); icon.className = 'aa-tab-icon'; icon.textContent = tab.icon; button.append(icon) }
        const words = document.createElement('span')
        words.className = 'aa-tab-name'
        words.textContent = tab.name || word('Tab {number}', { number: index + 1 })
        button.append(words)
        button.addEventListener('pointerdown', event => { if (index === current && !state().readOnly) event.preventDefault() })
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation()
          if (index === current && !state().readOnly) rename(index, button)
          else show(index, true)
        })
        return button
      }))
      if (!state().readOnly) {
        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'aa-tab aa-tab-add'
        add.setAttribute('aria-label', word('Add tab'))
        add.dataset.tooltip = word('Add tab')
        add.append(iconElement('plus'))
        add.addEventListener('pointerdown', event => event.preventDefault())
        add.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation()
          tabs = [...tabs, { name: word('Tab {number}', { number: tabs.length + 1 }), content: '' }]
          current = tabs.length - 1
          changed(); build()
          const button = row.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`)
          if (button) rename(current, button)
        })
        row.append(add)
      }
    }
    /**
     * The open tab's name written anew where it stands: Enter keeps it, Escape
     * leaves it as it was. The words themselves are edited, not a field laid
     * over them, so nothing moves: a browser sets an input's letters a pixel
     * away from the same letters in the page. A button can hold no caret, so a
     * plain element stands in its place for as long as the name is written.
     */
    const rename = (index: number, button: HTMLButtonElement) => {
      const words = button.querySelector<HTMLElement>('.aa-tab-name')
      if (!words) return
      const writing = document.createElement('span')
      writing.className = button.className
      writing.dataset.tab = String(index)
      writing.append(...Array.from(button.childNodes))
      button.replaceWith(writing)
      words.textContent = tabs[index].name
      try { words.contentEditable = 'plaintext-only' } catch { words.contentEditable = 'true' }
      words.setAttribute('role', 'textbox')
      words.setAttribute('aria-label', word('Tab name'))
      let done = false
      const finish = (keep: boolean) => {
        if (done) return
        done = true
        const name = (words.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (keep && name !== tabs[index].name) { tabs = tabs.map((tab, at) => at === index ? { ...tab, name } : tab); changed() }
        buildRow()
        row.querySelector<HTMLButtonElement>(`[data-tab="${index}"]`)?.focus({ preventScroll: true })
      }
      // What is written here is the row's, and goes no further than the name.
      for (const type of ['beforeinput', 'input', 'paste', 'cut', 'copy', 'pointerdown', 'click']) words.addEventListener(type, event => event.stopPropagation())
      words.addEventListener('keydown', event => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); finish(true) }
        if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      })
      words.addEventListener('blur', () => finish(true))
      words.focus({ preventScroll: true })
      const selection = document.getSelection(), range = document.createRange()
      range.selectNodeContents(words)
      selection?.removeAllRanges(); selection?.addRange(range)
    }
    const show = (index: number, focus = false) => {
      current = Math.max(0, Math.min(tabs.length - 1, index))
      if (page) { columnEditors.delete(page); page.destroy(); page = null }
      panel.replaceChildren()
      buildRow()
      page = nested(panel, tabs[current]?.content ?? '', next => { tabs = tabs.map((tab, at) => at === current ? { ...tab, content: next } : tab); changed() })
      columnEditors.add(page)
      if (focus) row.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`)?.focus({ preventScroll: true })
    }
    const build = () => show(current)
    // The row's keys: arrows step along the tabs, Enter or F2 names the open one, Delete takes it away.
    row.addEventListener('keydown', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.aa-tab[data-tab]')
      if (!button || !row.contains(button)) return
      const index = Number(button.dataset.tab)
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation()
        show((index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true)
      } else if ((event.key === 'Enter' || event.key === 'F2') && !state().readOnly) {
        event.preventDefault(); event.stopPropagation(); rename(index, button)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !state().readOnly && tabs.length > 1) {
        event.preventDefault(); event.stopPropagation()
        tabs = tabs.filter((_, at) => at !== index)
        current = Math.min(index, tabs.length - 1)
        changed(); show(current, true)
      }
    })
    build()
    return () => { if (page) { columnEditors.delete(page); page.destroy(); page = null } }
  }
  return { columnEditors, drawColumns, drawTabs }
}
