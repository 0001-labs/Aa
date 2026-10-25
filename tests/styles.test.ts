import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createEditor } from '../src/editor'
import { createPlainEditor } from '../src/plain'

const sheets = (root: ParentNode) => root.querySelectorAll('style[data-aa-styles]')

describe('Aa brings its own styles', () => {
  afterEach(() => { for (const style of document.querySelectorAll('style[data-aa-styles]')) style.remove(); document.body.replaceChildren() })

  it('puts aa.css first in the head before the first editor draws, once however many editors there are', () => {
    const product = document.createElement('style')
    product.textContent = '.aa-block { color: red }'
    document.head.append(product)
    const first = document.createElement('div'), second = document.createElement('div')
    document.body.append(first, second)
    const one = createEditor(first, { value: '## Decision\n\nEdits are **immediate**.', readOnly: true })
    const two = createPlainEditor(second, { value: 'Words' })
    expect(sheets(document.head)).toHaveLength(1)
    const style = sheets(document.head)[0]
    // First, so the product's own rules come after it.
    expect(document.head.firstElementChild).toBe(style)
    expect(style.textContent).toContain('.aa-syntax')
    expect(style.textContent).toContain('Aa Mono')
    // The Design system 1 sheets aa.css imports are in it, not left as imports.
    expect(style.textContent).not.toContain('@import')
    expect(style.textContent).toContain('.ds-context--bar')
    one.destroy(); two.destroy(); product.remove()
  })

  it('draws an editor in a shadow root inside that root', () => {
    const outer = document.createElement('div')
    document.body.append(outer)
    const shadow = outer.attachShadow({ mode: 'open' })
    const host = document.createElement('div')
    shadow.append(host)
    const editor = createEditor(host, { value: 'Words' })
    expect(sheets(shadow)).toHaveLength(1)
    expect(sheets(document.head)).toHaveLength(0)
    editor.destroy()
  })

  it('draws an editor in another document (a frame) in that document', () => {
    const other = document.implementation.createHTMLDocument('frame')
    const host = other.createElement('div')
    other.body.append(host)
    const editor = createPlainEditor(host, { value: 'Words' })
    expect(sheets(other.head)).toHaveLength(1)
    expect(sheets(document.head)).toHaveLength(0)
    editor.destroy()
  })
})

describe('a page that imports aa.css itself', () => {
  it('keeps its own sheet and gets no second copy', () => {
    const imported = document.createElement('style')
    imported.textContent = ':root { --aa-sheet: 1; }'
    document.head.append(imported)
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: 'Words' })
    expect(sheets(document.head)).toHaveLength(0)
    editor.destroy(); imported.remove(); host.remove()
  })
})
