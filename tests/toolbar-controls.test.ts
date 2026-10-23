import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createEditor } from '../src/editor'
import { AaToolbarElement, defineAaToolbar, selectionToolbarPosition } from '../src/controls'
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })
test('centres the bar ten scaled pixels above the selected line rather than using bar height as the gap', () => {
 expect(selectionToolbarPosition({ left: 200, top: 200, width: 80, bottom: 220 }, { width: 100, height: 60 }, { left: 0, top: 0, width: 800, height: 600 }, 1)).toEqual({ left: 190, top: 130 })
 expect(selectionToolbarPosition({ left: 0, top: 10, width: 20, bottom: 30 }, { width: 100, height: 60 }, { left: 0, top: 0, width: 800, height: 600 }, 1)).toEqual({ left: 0, top: 40 })
})
test('fills the last desktop grid cell without adding an action', () => {
 defineAaToolbar(); const toolbar = new AaToolbarElement(); toolbar.actions = Array.from({ length: 9 }, (_, index) => ({ id: String(index), label: 'Action', icon: 'bold', run() {} })); document.body.append(toolbar)
 expect(toolbar.querySelectorAll('button')).toHaveLength(9); expect(toolbar.querySelectorAll('.aa-toolbar-spacer')).toHaveLength(1); expect(toolbar.lastElementChild?.getAttribute('aria-hidden')).toBe('true')
})
test('colour choices are icon-only, named by both accessibility and shared tooltips', () => {
 const host = document.createElement('div'); document.body.append(host); const editor = createEditor(host, { value: 'Colour these words', toolbar: true })
 try {
  editor.selectRange(0, 6); host.dispatchEvent(new Event('aa-selectionchange'))
  document.querySelector<HTMLButtonElement>('aa-toolbar [data-action="color"]')!.click()
  const choices = [...document.querySelectorAll<HTMLButtonElement>('.aa-menu[data-palette] .aa-menu-list button')]
  expect(choices).toHaveLength(7)
  for (const choice of choices) { expect(choice.textContent).toBe(''); expect(choice.dataset.tooltip).toBe(choice.getAttribute('aria-label')); expect(choice.querySelector('.aa-icon')).not.toBeNull() }
 } finally { editor.destroy() }
})
test.each(['toolbar', 'colour', 'link'])('Escape closes %s, collapses selection and never edits or reopens it', async mode => {
 vi.useFakeTimers(); const host = document.createElement('div'); document.body.append(host); const editor = createEditor(host, { value: 'Select these words', toolbar: true })
 try {
  editor.selectRange(0, 6); host.dispatchEvent(new Event('aa-selectionchange')); await vi.advanceTimersByTimeAsync(150)
  let target: HTMLElement = host.querySelector('.aa-block')!
  if (mode === 'colour') { document.querySelector<HTMLButtonElement>('aa-toolbar [data-action="color"]')!.click(); target = document.querySelector('.aa-menu button')! }
  if (mode === 'link') { host.dispatchEvent(new CustomEvent('aa-link-request', { detail: { start: 0, end: 6, text: 'Select', url: 'https://example.com' } })); target = document.querySelector('.aa-link-editor input')! }
  const pageShortcut = vi.fn(); window.addEventListener('keydown', pageShortcut)
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(pageShortcut).not.toHaveBeenCalled(); window.removeEventListener('keydown', pageShortcut)
  host.dispatchEvent(new Event('aa-selectionchange')); await vi.advanceTimersByTimeAsync(200)
  expect(editor.selection()?.start).toBe(editor.selection()?.end); expect(editor.value).toBe('Select these words')
  expect(document.querySelector<HTMLElement>('aa-toolbar')!.hidden).toBe(true); expect(document.querySelector<HTMLElement>('.aa-menu')!.hidden).toBe(true); expect(document.querySelector<HTMLElement>('.aa-link-editor')!.hidden).toBe(true)
 } finally { editor.destroy() }
})
test.each(['bold', 'colour'])('%s keeps the formatting toolbar open while closing its completed colour picker', async mode => {
 vi.useFakeTimers(); const host = document.createElement('div'); document.body.append(host); const editor = createEditor(host, { value: 'Select these words', toolbar: true })
 try {
  editor.selectRange(0, 6); host.dispatchEvent(new Event('aa-selectionchange')); await vi.advanceTimersByTimeAsync(150)
  if (mode === 'bold') document.querySelector<HTMLButtonElement>('aa-toolbar [data-action="bold"]')!.click()
  else { document.querySelector<HTMLButtonElement>('aa-toolbar [data-action="color"]')!.click(); document.querySelector<HTMLButtonElement>('.aa-menu [data-command="color-blue"]')!.click() }
  host.dispatchEvent(new Event('aa-selectionchange')); await vi.advanceTimersByTimeAsync(200)
  expect(document.querySelector<HTMLElement>('aa-toolbar')!.hidden).toBe(false); expect(document.querySelector<HTMLElement>('.aa-menu')!.hidden).toBe(true)
  expect(editor.selection()?.start).not.toBe(editor.selection()?.end); expect(editor.value).toContain(mode === 'bold' ? '**Select**' : '<span color="blue">Select</span>')
 } finally { editor.destroy() }
})
