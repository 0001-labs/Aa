import { expect, test, vi } from 'vite-plus/test'
import { openSheet } from '../src/sheet'

test('an opted-in sheet leaves the page modeless and closes with Escape', () => {
  const modal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  const close = openSheet({ title: 'Format', groups: [], root: document.body, nonModal: true })
  const dialog = document.querySelector<HTMLDialogElement>('dialog.aa-sheet')!
  expect(dialog.open).toBe(true)
  expect(modal).not.toHaveBeenCalled()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(dialog.open).toBe(false)
  close(); dialog.remove(); modal.mockRestore()
})
