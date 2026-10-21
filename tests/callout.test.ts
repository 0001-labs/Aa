import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type Editor } from '../src/editor'
import { parseBlocks, serialize, readCallout, writeCallout, calloutIsBox, CALLOUT_COLORS } from '../src/markdown'
import { fromMarkdown, setCallout, toggleCallout, turnInto } from '../src/document'
import { readBlock, renderBlock } from '../src/render'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let editor: Editor | undefined, host: HTMLElement | undefined
function setup(value: string, options = {}) {
  host = document.createElement('div'); document.body.append(host)
  editor = createEditor(host, { value, ...options }); editor.selectRange(0)
  return editor
}
afterEach(() => { editor?.destroy(); host?.remove(); editor = undefined; host = undefined; window.getSelection()?.removeAllRanges() })

describe('a callout as Notion draws it', () => {
  it('reads its brackets: an icon, a colour, a type word, in any order', () => {
    expect(readCallout('> [!💡] Words')).toMatchObject({ kind: '', icon: '💡', color: undefined, folded: false, length: 8 })
    expect(readCallout('> [!💡 yellow] Words')).toMatchObject({ kind: '', icon: '💡', color: 'yellow' })
    expect(readCallout('> [!yellow 💡]- Words')).toMatchObject({ icon: '💡', color: 'yellow', folded: true })
    expect(readCallout('> [!https://www.notion.so/icons/calendar_gray.svg blue] Words')).toMatchObject({ icon: 'https://www.notion.so/icons/calendar_gray.svg', color: 'blue' })
    expect(readCallout('> [!] Words')).toMatchObject({ kind: '', icon: undefined, color: undefined })
    expect(readCallout('> [!note] Words')).toMatchObject({ kind: 'note', icon: undefined, color: undefined })
    expect(readCallout('> [!NOTE]- Words')).toMatchObject({ kind: 'note', folded: true })
    expect(readCallout('> Words')).toBeNull()
    expect(calloutIsBox({ kind: 'note' })).toBe(false)
    expect(calloutIsBox({ kind: '' })).toBe(true)
    expect(calloutIsBox({ kind: 'note', color: 'red' })).toBe(true)
    expect(writeCallout({ kind: '', icon: '💡', color: 'yellow', folded: false })).toBe('> [!💡 yellow]')
    expect(writeCallout({ kind: 'note', folded: true })).toBe('> [!note]-')
    expect(writeCallout({ kind: '', folded: false })).toBe('> [!]')
    expect(CALLOUT_COLORS).toContain('gray')
  })

  it('is a block with its icon, colour and box, its Markdown kept as written', () => {
    const value = '> [!📅 blue] Proposed period\n> The second week of March.'
    const [block] = parseBlocks(value)
    expect(block).toMatchObject({ kind: 'callout', callout: '', icon: '📅', color: 'blue', box: true, folded: false, prefix: 13 })
    expect(serialize(parseBlocks(value))).toBe(value)
    expect(parseBlocks('> [!] Words')[0]).toMatchObject({ kind: 'callout', box: true, prefix: 6 })
    expect(parseBlocks('> [!] Words')[0].icon).toBeUndefined()
    // A type word alone is the alert it was: no box.
    const alert = parseBlocks('> [!tip] Words')[0]
    expect(alert).toMatchObject({ kind: 'callout', callout: 'tip' })
    expect(alert.box).toBeUndefined()
    expect(alert.icon).toBeUndefined()
    // A toggle heading is still read as one.
    expect(parseBlocks('> [!note]- ## Title\n> Body')[0]).toMatchObject({ kind: 'callout', folded: true, level: 2 })
  })

  it('lets a written fill win over the grey: the box rule only falls back to it', () => {
    const css = readFileSync(join(process.cwd(), 'src/aa.css'), 'utf8')
    const box = css.slice(css.indexOf('.aa-block[data-kind="callout"][data-box] {'), css.indexOf('}', css.indexOf('.aa-block[data-kind="callout"][data-box] {')))
    expect(box).not.toMatch(/--aa-callout-fill:/)
    expect(box).toContain('background: var(--aa-callout-fill, var(--aa-callout-grey))')
    for (const color of CALLOUT_COLORS) expect(css).toContain(`[data-fill="${color}"] { --aa-callout-fill:`)
  })

  it('is drawn as a box with its emoji, its picture or no icon, and its fill', () => {
    const node = document.createElement('div')
    renderBlock(node, parseBlocks('> [!💡 yellow] Words\n> More')[0], null)
    expect(node.hasAttribute('data-box')).toBe(true)
    expect(node.dataset.icon).toBe('💡')
    expect(node.dataset.fill).toBe('yellow')
    expect(node.hasAttribute('data-picture')).toBe(false)
    expect(node.style.getPropertyValue('--aa-callout-icon')).toBe('')
    expect(readBlock(node)).toBe('> [!💡 yellow] Words\n> More')
    expect(node.querySelector('.aa-callout-body')?.textContent).toBe('> More')

    renderBlock(node, parseBlocks('> [!https://www.notion.so/icons/calendar_gray.svg] Words')[0], null)
    expect(node.hasAttribute('data-picture')).toBe(true)
    expect(node.dataset.icon).toBeUndefined()
    expect(node.style.getPropertyValue('--aa-callout-picture')).toBe('url("https://www.notion.so/icons/calendar_gray.svg")')
    expect(node.dataset.fill).toBeUndefined()

    renderBlock(node, parseBlocks('> [!] Words')[0], null)
    expect(node.hasAttribute('data-box')).toBe(true)
    expect(node.dataset.icon).toBeUndefined()
    expect(node.hasAttribute('data-picture')).toBe(false)
    expect(node.style.getPropertyValue('--aa-callout-picture')).toBe('')

    // An alert keeps the library's icon and no box.
    renderBlock(node, parseBlocks('> [!tip] Words')[0], null)
    expect(node.hasAttribute('data-box')).toBe(false)
    expect(node.dataset.icon).toBeUndefined()
    expect(node.dataset.fill).toBeUndefined()
    expect(node.style.getPropertyValue('--aa-callout-icon')).toContain('data:image/svg+xml')

    // Turned into a paragraph, nothing of the callout stays on the element.
    renderBlock(node, parseBlocks('Words')[0], null)
    expect(node.hasAttribute('data-box')).toBe(false)
    expect(node.dataset.callout).toBeUndefined()
  })

  it('takes another icon or colour by rewriting its brackets alone', () => {
    const blocks = fromMarkdown('> [!💡] Words\n> Body')
    expect(serialize(setCallout(blocks, 0, { color: 'yellow' })!.blocks)).toBe('> [!💡 yellow] Words\n> Body')
    expect(serialize(setCallout(blocks, 0, { icon: '📅' })!.blocks)).toBe('> [!📅] Words\n> Body')
    expect(serialize(setCallout(blocks, 0, { icon: null })!.blocks)).toBe('> [!] Words\n> Body')
    const coloured = setCallout(blocks, 0, { color: 'red', icon: 'https://example.com/i.png' })!.blocks
    expect(serialize(coloured)).toBe('> [!https://example.com/i.png red] Words\n> Body')
    expect(coloured[0]).toMatchObject({ icon: 'https://example.com/i.png', color: 'red', box: true, prefix: 35 })
    // Grey chosen is written, so a product reading the Markdown knows; null takes the word away, grey too.
    expect(serialize(setCallout(coloured, 0, { color: 'gray' })!.blocks)).toBe('> [!https://example.com/i.png gray] Words\n> Body')
    expect(serialize(setCallout(coloured, 0, { color: null })!.blocks)).toBe('> [!https://example.com/i.png] Words\n> Body')
    // A folded one stays folded; an alert given a colour becomes a box and its type word goes.
    expect(serialize(setCallout(fromMarkdown('> [!💡]- Words'), 0, { color: 'blue' })!.blocks)).toBe('> [!💡 blue]- Words')
    expect(serialize(setCallout(fromMarkdown('> [!note] Words'), 0, { color: 'pink' })!.blocks)).toBe('> [!pink] Words')
    expect(serialize(setCallout(fromMarkdown('> [!note] Words'), 0, { icon: '🚀' })!.blocks)).toBe('> [!🚀] Words')
    expect(setCallout(fromMarkdown('Words'), 0, { icon: '🚀' })).toBeNull()
  })

  it('folds and opens with its icon and colour kept, and Enter writes a line of its body', () => {
    const blocks = fromMarkdown('> [!💡 yellow] Title\n> Body')
    expect(serialize(toggleCallout(blocks, 0)!.blocks)).toBe('> [!💡 yellow]- Title\n> Body')
    expect(serialize(toggleCallout(toggleCallout(blocks, 0)!.blocks, 0)!.blocks)).toBe('> [!💡 yellow] Title\n> Body')
    const e = setup('> [!💡 yellow] Title')
    e.selectRange(e.value.length)
    host!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }))
    expect(e.value).toBe('> [!💡 yellow] Title\n> ')
  })

  it('is what the slash menu makes, with Notion\'s own icon, and the editor changes it in place', () => {
    const turned = turnInto(fromMarkdown('Words'), { anchor: 0, focus: 0 }, 'callout')
    expect(serialize(turned.blocks)).toBe('> [!💡] Words')
    expect(turned.blocks[0]).toMatchObject({ box: true, icon: '💡' })
    expect(serialize(turnInto(fromMarkdown('Words'), { anchor: 0, focus: 0 }, 'toggle').blocks)).toBe('> [!note]- Words')
    const e = setup('# Aa\n\n> [!💡] Words')
    e.selectRange(e.value.length)
    e.callout({ color: 'green' })
    expect(e.value).toBe('# Aa\n\n> [!💡 green] Words')
    e.callout({ icon: null }, 1)
    expect(e.value).toBe('# Aa\n\n> [!green] Words')
    expect((host!.children[1] as HTMLElement).dataset.fill).toBe('green')
    expect((host!.children[1] as HTMLElement).dataset.icon).toBeUndefined()
    e.undo()
    expect(e.value).toBe('# Aa\n\n> [!💡 green] Words')
    // Not a callout: nothing happens.
    e.callout({ icon: '🚀' }, 0)
    expect(e.value).toBe('# Aa\n\n> [!💡 green] Words')
  })
})
