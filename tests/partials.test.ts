import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { BUTTON_PARTIAL, BUTTON_STATES, readButtonPartial, writeButtonPartial } from '../src/partials'
import { blockRuns, parseBlocks } from '../src/markdown'
import { readBlock } from '../src/render'
import { renderPartials } from '../src/partial-reader'

let editor: Editor, host: HTMLElement
function setup(value: string, readOnly = false) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, partials: true, readOnly })
  return editor
}
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
afterEach(() => { editor?.destroy(); host?.remove() })

describe('inline button partials', () => {
  it('round trips quoted labels safely and leaves invalid syntax, links and code literal', () => {
    const value = { label: 'Save "this" \\ <script> & 日本語', state: 'primary' as const }
    expect(readButtonPartial(writeButtonPartial(value))).toEqual(value)
    expect(readButtonPartial('@Button("Bad\\q", "primary")')).toBeNull()
    expect(readButtonPartial('@Button("x", "execute")')).toBeNull()
    for (const source of ['`@Button("x", "primary")`', '[@Button("x", "primary")](https://example.com)', '```\n@Button("x", "primary")\n```']) {
      expect(blockRuns(parseBlocks(source)[0], [BUTTON_PARTIAL]).some(run => run.kind === 'atom')).toBe(false)
    }
  })
  it.each(BUTTON_STATES)('draws the real DS1 %s button within prose and saves only source', async state => {
    const source = `Press ${writeButtonPartial({ label: '<Save>', state })} to continue.`
    setup(source); await flush()
    const face = host.querySelector('ds-button')!
    expect(face.shadowRoot?.querySelector('button')).not.toBeNull()
    expect(face.textContent).toBe('<Save>')
    expect(face.querySelector('save')).toBeNull()
    if (state !== 'default') expect(face[state]).toBe(true)
    expect(face.inert).toBe(true)
    expect(readBlock(host.firstElementChild as HTMLElement)).toBe(source)
  })
  it('inserts at @button with a chosen state, keeping surrounding text and undo', async () => {
    const e = setup('Press @button to continue.')
    e.selectRange(13); host.dispatchEvent(new Event('aa-change')); await flush()
    const menu = document.querySelector<HTMLElementTagNameMap['ds-menu']>('ds-menu[aria-label="Button state"]')!
    expect(menu.open).toBe(true)
    ;(menu.children[1] as HTMLElement).click()
    expect(e.value).toBe('Press @Button("Button", "primary") to continue.')
    e.undo(); expect(e.value).toBe('Press @button to continue.')
    e.redo(); expect(host.querySelector('.aa-partial')).not.toBeNull()
  })
  it('edits a disabled specimen twice, then undoes and reloads both properties', async () => {
    const source = 'Press @Button("Save", "disabled") now.'
    const e = setup(source); await flush()
    for (const label of ['Save changes', 'Keep changes']) {
      host.querySelector<HTMLElement>('.aa-partial')!.click(); await flush()
      const panel = document.querySelector('.aa-partial-properties')!
      expect(panel).not.toBeNull()
      panel.querySelector('ds-input')!.value = label
      panel.querySelector('select')!.value = 'primary'
      Array.from(panel.querySelectorAll('ds-button')).find(button => button.textContent === 'Apply')!.click()
      await flush()
      expect(e.value).toBe(`Press @Button("${label}", "primary") now.`)
      expect(host.querySelector('ds-button')!.textContent).toBe(label)
    }
    e.undo(); expect(e.value).toBe('Press @Button("Save changes", "primary") now.')
    e.undo(); expect(e.value).toBe(source)
    e.value = 'New @Button("Cancel", "secondary") sentence.'
    expect(host.querySelector('ds-button')!.secondary).toBe(true)
  })
  it('does not edit in read-only mode and refuses an open draft after permission changes', async () => {
    const source = '@Button("Save", "default")', e = setup(source, true)
    await flush(); host.querySelector<HTMLElement>('.aa-partial')!.click()
    expect(document.querySelector('.aa-partial-properties')).toBeNull()
    e.readOnly = false; await flush(); host.querySelector<HTMLElement>('.aa-partial')!.click(); await flush()
    e.readOnly = true
    const panel = document.querySelector('.aa-partial-properties')!
    panel.querySelector('ds-input')!.value = 'Changed'
    Array.from(panel.querySelectorAll('ds-button')).find(button => button.textContent === 'Apply')!.click()
    expect(e.value).toBe(source)
  })
  it('deletes and restores a selected partial without leaving pieces of its source', () => {
    const source = 'A @Button("Save", "primary") B', e = setup(source)
    e.selectRange(2, source.length - 2)
    host.firstElementChild!.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }))
    expect(e.value).toBe('A  B')
    e.undo(); expect(e.value).toBe(source)
  })
  it('offers states by keyboard and leaves ordinary mentions and code alone', async () => {
    const e = setup('Press @button')
    e.selectRange(e.value.length); host.dispatchEvent(new Event('aa-change')); await flush()
    host.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    host.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(e.value).toBe('Press @Button("Button", "primary")')
    for (const source of ['hello@button', '@person', '`@button`', '```\n@button\n```']) {
      e.value = source; e.selectRange(source.indexOf('@button') + 7); host.dispatchEvent(new Event('aa-change')); await flush()
      expect(document.querySelector<HTMLElementTagNameMap['ds-menu']>('ds-menu[aria-label="Button state"]')!.open).toBe(false)
    }
  })
  it('publishes only inert illustrations and leaves code and unknown partials as text', async () => {
    setup('')
    const prose = document.createElement('p')
    prose.append('Press @Button("Save", "primary") now. @Other("x") ')
    const code = document.createElement('code'); code.textContent = '@Button("Cancel", "default")'; prose.append(code)
    host.append(prose); renderPartials(prose); renderPartials(prose); await flush()
    expect(prose.querySelectorAll('.aa-partial')).toHaveLength(1)
    expect(prose.querySelector('ds-button')!.primary).toBe(true)
    expect(prose.querySelector('ds-button')!.inert).toBe(true)
    expect(prose.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Button: Save, primary')
    expect(code.textContent).toBe('@Button("Cancel", "default")')
    expect(prose.textContent).toContain('@Other("x")')
  })
})
