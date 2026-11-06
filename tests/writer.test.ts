// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createWriter, type DraftStore, type Writer, type WriterState } from '../src/writer'

const memory = (start: Record<string, string> = {}) => {
  const kept = new Map(Object.entries(start))
  return { kept, load: (key: string) => kept.get(key) ?? null, save: (key: string, value: string) => void kept.set(key, value), clear: (key: string) => void kept.delete(key) } satisfies DraftStore & { kept: Map<string, string> }
}

describe('writer mode', () => {
  let host: HTMLElement, writer: Writer
  const foot = (name: 'save' | 'cancel') => host.querySelector<HTMLButtonElement>(`.aa-writer-${name}`)!
  const said = () => host.querySelector('.aa-writer-state')!.textContent
  beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.append(host) })
  afterEach(() => { writer?.destroy(); host.remove(); vi.useRealTimers() })

  it('draws the bar, Save and Cancel, and has nothing to save at first', () => {
    writer = createWriter(host, { value: 'Saved words' })
    expect(host.querySelector('[role=toolbar] [data-action=bold]')).toBeTruthy()
    expect(foot('save').disabled).toBe(true)
    expect(writer.state).toBe('saved')
    expect(writer.dirty).toBe(false)
  })
  it('writes a draft shortly after the words change', () => {
    const drafts = memory()
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts })
    writer.value = 'Saved and more'
    expect(writer.state).toBe('draft')
    expect(foot('save').disabled).toBe(false)
    expect(drafts.kept.has('card')).toBe(false)
    vi.advanceTimersByTime(500)
    expect(drafts.kept.get('card')).toBe('Saved and more')
    expect(said()).toBe('Draft saved')
  })
  it('writes a draft not yet written when it is destroyed', () => {
    const drafts = memory()
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts })
    writer.value = 'Closed quickly'
    writer.destroy()
    expect(drafts.kept.get('card')).toBe('Closed quickly')
  })
  it('opens on a draft left behind', () => {
    const drafts = memory({ card: 'My draft' })
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts })
    expect(writer.value).toBe('My draft')
    expect(writer.saved).toBe('Saved')
    expect(writer.state).toBe('draft')
    expect(said()).toBe('Draft restored')
    expect(foot('save').disabled).toBe(false)
  })
  it('saves, and the draft goes', async () => {
    const drafts = memory({ card: 'My draft' }), saved: string[] = []
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onSave: value => { saved.push(value) } })
    expect(await writer.save()).toBe(true)
    expect(saved).toEqual(['My draft'])
    expect(writer.saved).toBe('My draft')
    expect(drafts.kept.has('card')).toBe(false)
    expect(writer.state).toBe('saved')
    expect(said()).toBe('Saved')
  })
  it('keeps the words and the draft when saving fails, to try again', async () => {
    const drafts = memory({ card: 'My draft' }), states: WriterState[] = []
    let fail = true
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onState: state => states.push(state), onSave: () => { if (fail) throw new Error('offline') } })
    expect(await writer.save()).toBe(false)
    expect(writer.value).toBe('My draft')
    expect(drafts.kept.get('card')).toBe('My draft')
    expect(writer.state).toBe('failed')
    expect(foot('save').disabled).toBe(false)
    fail = false
    expect(await writer.save()).toBe(true)
    expect(states).toEqual(['saving', 'failed', 'saving', 'saved'])
  })
  it('keeps words written during a save as the next draft', async () => {
    const drafts = memory()
    let finish = () => {}
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onSave: () => new Promise<void>(done => { finish = done }) })
    writer.value = 'First'
    const saving = writer.save()
    expect(writer.state).toBe('saving')
    expect(foot('save').disabled).toBe(true)
    writer.value = 'First and second'
    finish(); await saving
    expect(writer.saved).toBe('First')
    expect(writer.value).toBe('First and second')
    expect(writer.state).toBe('draft')
    vi.advanceTimersByTime(500)
    expect(drafts.kept.get('card')).toBe('First and second')
  })
  it('waits for the save, whatever a product says the saved words are meanwhile', async () => {
    const drafts = memory()
    let finish = () => {}, refuse = (_error: Error) => {}
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onSave: () => new Promise<void>((done, fail) => { finish = done; refuse = fail }) })
    writer.value = 'Sent'; vi.advanceTimersByTime(500)
    let saving = writer.save()
    writer.saved = 'Sent'
    expect(writer.state).toBe('saving')
    expect(drafts.kept.get('card')).toBe('Sent')
    refuse(new Error('offline')); await saving
    expect(writer.state).toBe('failed')
    expect(writer.dirty).toBe(true)
    expect(drafts.kept.get('card')).toBe('Sent')
    saving = writer.save()
    writer.saved = 'Sent'
    finish(); await saving
    expect(writer.state).toBe('saved')
    expect(drafts.kept.has('card')).toBe(false)
  })
  it('drops the draft when a save finishes after the writer closed', async () => {
    const drafts = memory()
    let finish = () => {}
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onSave: () => new Promise<void>(done => { finish = done }) })
    writer.value = 'Kept'
    const saving = writer.save()
    writer.destroy()
    expect(drafts.kept.get('card')).toBe('Kept')
    finish(); await saving
    expect(drafts.kept.has('card')).toBe(false)
  })
  it('cancels back to the saved words and drops the draft', () => {
    const drafts = memory({ card: 'My draft' }), cancelled = vi.fn()
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts, onCancel: cancelled })
    foot('cancel').click()
    expect(writer.value).toBe('Saved')
    expect(drafts.kept.has('card')).toBe(false)
    expect(writer.state).toBe('saved')
    expect(cancelled).toHaveBeenCalledOnce()
  })
  it('clears the draft when the words come back to the saved ones', () => {
    const drafts = memory()
    writer = createWriter(host, { value: 'Saved', draft: 'card', drafts })
    writer.value = 'Changed'; vi.advanceTimersByTime(500)
    writer.value = 'Saved'
    expect(drafts.kept.has('card')).toBe(false)
    expect(writer.state).toBe('saved')
  })
  it('shows new saved words in an untouched editor, and leaves words being written', () => {
    writer = createWriter(host, { value: 'One' })
    writer.saved = 'Two'
    expect(writer.value).toBe('Two')
    writer.value = 'Mine'
    writer.saved = 'Three'
    expect(writer.value).toBe('Mine')
    expect(writer.state).toBe('draft')
  })
  it('offers a picture only where the product takes files', () => {
    writer = createWriter(host)
    expect(host.querySelector('[data-action=picture]')).toBeNull()
    writer.destroy()
    writer = createWriter(host, { onFiles: () => {} })
    expect(host.querySelector('[data-action=picture]')).toBeTruthy()
  })
  it('has nothing to press while it cannot be written', () => {
    writer = createWriter(host, { value: 'Saved', readOnly: true })
    expect(host.querySelector('.aa-writer')!.hasAttribute('data-read-only')).toBe(true)
    expect(foot('save').disabled).toBe(true)
  })
})
