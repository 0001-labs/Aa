import { describe, expect, it } from 'vite-plus/test'
import { createEditor } from '../src/editor'
import { readBlock, renderBlock, offsetIn, pointAt } from '../src/render'
import { parseBlocks } from '../src/markdown'

const block = (source: string, reveal: { from: number; to: number } | null = null) => {
  const element = document.createElement('div')
  renderBlock(element, parseBlocks(source)[0], reveal)
  return element
}

describe('renderBlock', () => {
  it('keeps syntax hidden while editing and reads Markdown straight back', () => {
    const quiet = block('a **b** c')
    expect(quiet.querySelectorAll('.aa-syntax[data-hidden]')).toHaveLength(2)
    expect(quiet.querySelector('.aa-b')?.textContent).toBe('b')
    expect(readBlock(quiet)).toBe('a **b** c')
    const inside = block('a **b** c', { from: 4, to: 4 })
    expect(inside.querySelectorAll('.aa-syntax[data-hidden]')).toHaveLength(2)
    const after = block('a **b** c', { from: 8, to: 8 })
    expect(after.querySelectorAll('.aa-syntax[data-hidden]')).toHaveLength(2)
  })
  it('never shows a heading\'s # while writing in it, and keeps its offsets', () => {
    expect(block('## T').querySelector('.aa-syntax')?.hasAttribute('data-hidden')).toBe(true)
    const active = block('## T', { from: 3, to: 3 })
    const prefix = active.querySelector('.aa-syntax')!
    expect(prefix.hasAttribute('data-hidden')).toBe(true)
    expect(readBlock(active)).toBe('## T')
    // The caret's first place in the heading is after its hidden #.
    const words = active.lastChild!.firstChild!
    expect(pointAt(active, 0)).toEqual({ node: words, offset: 0 })
    expect(offsetIn(active, words, 0)).toBe(3)
    expect(block('- T', { from: 2, to: 2 }).querySelector('.aa-syntax')?.hasAttribute('data-hidden')).toBe(true)
    expect(block('## T').dataset).toMatchObject({ kind: 'heading', level: '2' })
  })
  it('marks a heading with no words yet, so it can name its level', () => {
    expect(block('## ', { from: 3, to: 3 }).hasAttribute('data-empty')).toBe(true)
    expect(block('## T').hasAttribute('data-empty')).toBe(false)
    expect(block('').hasAttribute('data-empty')).toBe(false)
  })
  it('gives an empty block a line to stand on', () => {
    expect(block('').querySelector('br[data-filler]')).not.toBeNull()
    expect(block('## ').querySelector('br[data-filler]')).not.toBeNull()
    expect(readBlock(block(''))).toBe('')
  })
  it('maps offsets both ways, skipping hidden syntax', () => {
    const element = block('a **b** c')
    const bold = element.querySelector('.aa-b')!.firstChild!
    expect(offsetIn(element, bold, 1)).toBe(5)
    expect(pointAt(element, 5)).toEqual({ node: bold, offset: 1 })
    expect(pointAt(element, 7)).toEqual({ node: element.lastChild!.firstChild, offset: 0 })
    const lines = block('a\nb')
    expect(readBlock(lines)).toBe('a\nb')
    expect(offsetIn(lines, lines.lastChild!.firstChild!, 1)).toBe(3)
  })
})

describe('createEditor', () => {
  it('draws a block an element and gives the Markdown back', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: '# T\n\n- a\n- b', placeholder: 'Write' })
    expect(host.querySelectorAll('.aa-block')).toHaveLength(3)
    expect(host.children[0].getAttribute('contenteditable')).toBe('true')
    expect(editor.value).toBe('# T\n\n- a\n- b')
    editor.value = ''
    expect(host.children[0].getAttribute('data-placeholder')).toBe('Write')
    editor.readOnly = true
    expect(host.children[0].getAttribute('contenteditable')).toBe('false')
    editor.destroy()
  })
})
