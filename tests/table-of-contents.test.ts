import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Editor } from '../src/editor'
import { blockRuns, parseBlocks, serialize } from '../src/markdown'
import { readBlock } from '../src/render'

const marker = '<table_of_contents/>'
const source = `${marker}\n\n# Start\n\n## **Details** and [links](https://example.com)\n\n### Finish`
let editor: Editor | undefined, host: HTMLElement | undefined
const setup = (value = source, readOnly = false) => {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, readOnly })
  return editor
}
const entries = () => [...host!.querySelectorAll<HTMLAnchorElement>('.aa-toc a')]
const disclosure = () => host!.querySelector<HTMLDetailsElement>('.aa-toc details')!
afterEach(() => { editor?.destroy(); host?.remove(); vi.restoreAllMocks() })

describe('table of contents', () => {
  it('keeps its exact source as a block, including beside paragraphs and inside code', () => {
    const blocks = parseBlocks(`Before\n${marker}\nAfter`)
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'toc', 'paragraph'])
    expect(blockRuns(blocks[1])).toEqual([{ kind: 'atom', atom: 'toc', from: 0, to: marker.length }])
    expect(serialize(parseBlocks(source))).toBe(source)
    expect(parseBlocks('```\n' + marker + '\n```')[0].kind).toBe('code')
    expect(parseBlocks('<table_of_contents />')[0].kind).toBe('toc')
    expect(parseBlocks('Words ' + marker)[0].kind).toBe('paragraph')
  })

  it('starts collapsed, uses visible words and heading levels, and never saves the generated list', () => {
    const e = setup()
    expect(disclosure().open).toBe(false)
    expect(entries().map(entry => entry.textContent)).toEqual(['Start', 'Details and links', 'Finish'])
    expect(entries().map(entry => entry.dataset.depth)).toEqual(['0', '1', '2'])
    disclosure().open = true
    expect(e.value).toBe(source)
    expect(readBlock(host!.firstElementChild as HTMLElement)).toBe(marker)
  })

  it('updates on edits, undo, redo, heading conversion and external changes while keeping the disclosure open', () => {
    const e = setup()
    disclosure().open = true
    const start = e.value.indexOf('Start')
    e.replace(start, start + 5, 'Welcome')
    expect(entries()[0].textContent).toBe('Welcome')
    expect(disclosure().open).toBe(true)
    e.undo(); expect(entries()[0].textContent).toBe('Start')
    e.redo(); expect(entries()[0].textContent).toBe('Welcome')
    e.value = `${marker}\n\nPlain text\n\n## New section`
    expect(entries().map(entry => entry.textContent)).toEqual(['New section'])
    expect(entries()[0].dataset.depth).toBe('0')
    expect(disclosure().open).toBe(true)
  })

  it('follows browser input after composition, without touching the outline during composition', () => {
    setup()
    const heading = host!.children[1] as HTMLElement
    heading.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    heading.textContent = '# New title'
    heading.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    expect(entries()[0].textContent).toBe('Start')
    heading.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(entries()[0].textContent).toBe('New title')
  })

  it('handles no headings and ignores code, empty headings and nested writing surfaces', () => {
    const e = setup(`${marker}\n\n# \n\n\x60\x60\x60\n# Code\n\x60\x60\x60\n\n<columns>\n<column>\n# Nested\n</column>\n</columns>`)
    expect(entries()).toHaveLength(0)
    expect(host!.querySelector('.aa-toc-empty')?.textContent).toBe('Add headings to show them here.')
    e.value = `${marker}\n\n# Added`
    expect(entries()[0].textContent).toBe('Added')
    e.value = marker
    expect(entries()).toHaveLength(0)
  })

  it.each([false, true])('navigates duplicate headings by their own block, readOnly=%s', readOnly => {
    const e = setup(`${marker}\n\n# Same\n\n## Same`, readOnly)
    disclosure().open = true
    const target = host!.children[2] as HTMLElement
    const scroll = vi.spyOn(target, 'scrollIntoView')
    entries()[1].click()
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
    expect(document.activeElement).toBe(target)
    expect(e.value).toBe(`${marker}\n\n# Same\n\n## Same`)
    if (!readOnly) expect(e.selection()?.start).toBe(e.value.lastIndexOf('Same'))
  })

  it('inserts from the slash menu as one undoable block', () => {
    const e = setup('')
    e.selectRange(0)
    e.replace(0, 0, '/toc')
    host!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(e.value).toBe(marker)
    expect(host!.querySelector('.aa-toc')).not.toBeNull()
    e.undo()
    expect(e.value).toBe('/toc')
    e.redo()
    expect(e.value).toBe(marker)
  })

  it('keeps distinct destinations when headings are inserted before retained blocks', () => {
    const e = setup(`${marker}\n\n# First\n\n# Last`)
    e.replace(marker.length + 2, marker.length + 2, '# New\n\n')
    const ids = [...host!.querySelectorAll(':scope > [data-kind="heading"]')].map(heading => heading.id)
    expect(new Set(ids).size).toBe(3)
    expect(entries().map(link => link.hash.slice(1))).toEqual(ids)
  })

  it('keeps multiple contents blocks independent and headings as text, never HTML', () => {
    setup(`${marker}\n\n# <img src=x onerror=alert(1)>\n\n${marker}`)
    const disclosures = host!.querySelectorAll('details')
    disclosures[0].open = true
    expect(disclosures[1].open).toBe(false)
    expect(host!.querySelector('.aa-toc img')).toBeNull()
    expect(entries()).toHaveLength(2)
  })
})
