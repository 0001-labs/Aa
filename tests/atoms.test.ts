import { describe, expect, it, vi } from 'vite-plus/test'
import { createEditor, type Atom } from '../src/editor'
import { atomPattern, blockRuns, parseBlocks } from '../src/markdown'
import { offsetIn, pointAt, readBlock, renderBlock } from '../src/render'

const mention = atomPattern('mention', /@\[(item|list):([A-Za-z0-9]+)\]/)
const runs = (source: string, atoms = [mention]) => blockRuns(parseBlocks(source)[0], atoms).map(run => [run.kind, source.slice(run.from, run.to), run.atom])

describe('reading atoms', () => {
  it('reads a picture as one atom by default, not as a link', () => {
    expect(blockRuns(parseBlocks('see ![cat](https://a.b/c.png) here')[0]).map(run => run.kind)).toEqual(['text', 'atom', 'text'])
  })
  it('reads the atoms it is given, inside marks too, never in code', () => {
    expect(runs('a @[item:ab12cd] b')).toEqual([['text', 'a ', undefined], ['atom', '@[item:ab12cd]', 'mention'], ['text', ' b', undefined]])
    expect(runs('**@[list:x1]**').map(run => run[0])).toEqual(['syntax', 'atom', 'syntax'])
    expect(runs('`@[item:ab12cd]`').map(run => run[0])).toEqual(['syntax', 'text', 'syntax'])
  })
  it('lets an atom decline what its pattern found', () => {
    const own = atomPattern('own', /!\[[^\]]*\]\(([^)]*)\)/, found => found[1].startsWith('https://own/'))
    expect(runs('![a](https://own/1)', [own])[0][0]).toBe('atom')
    expect(runs('![a](https://else/1)', [own]).some(run => run[0] === 'atom')).toBe(false)
  })
})

describe('drawing atoms', () => {
  const draw = (name: string, source: string) => {
    const element = document.createElement('span')
    element.className = 'aa-atom'
    element.contentEditable = 'false'
    element.dataset.atom = name
    element.dataset.source = source
    element.textContent = 'Drawn title'
    return element
  }
  const block = (source: string, element = document.createElement('div')) => {
    renderBlock(element, parseBlocks(source)[0], null, [mention], draw)
    return element
  }
  it('reads back the atom as its source, not its drawing', () => {
    const element = block('a @[item:ab12cd] b')
    expect(element.querySelector('.aa-atom')?.textContent).toBe('Drawn title')
    expect(readBlock(element)).toBe('a @[item:ab12cd] b')
  })
  it('counts an atom as its source when placing and reading the caret', () => {
    const element = block('a @[item:ab12cd] b')
    const atom = element.querySelector('.aa-atom')!
    expect(offsetIn(element, atom.firstChild!, 3)).toBe(16)
    expect(offsetIn(element, element, 2)).toBe(16)
    const after = pointAt(element, 16)
    expect(offsetIn(element, after.node, after.offset)).toBe(16)
    expect(pointAt(element, 9)).toEqual({ node: element, offset: 2 })
  })
  it('keeps an atom already drawn when the block is drawn again', () => {
    const element = block('a @[item:ab12cd] **b**')
    const atom = element.querySelector('.aa-atom')
    renderBlock(element, parseBlocks('a @[item:ab12cd] **b**')[0], { from: 19, to: 19 }, [mention], draw)
    expect(element.querySelector('.aa-atom')).toBe(atom)
  })
})

describe('an editor with atoms', () => {
  const setup = (value: string) => {
    const stop = vi.fn()
    const atom: Atom = { ...mention, draw: element => { element.textContent = 'Title'; return stop } }
    const host = document.createElement('div')
    document.body.append(host)
    const changes: string[] = []
    const editor = createEditor(host, { value, atoms: [atom], onChange: value => changes.push(value) })
    return { editor, host, stop, changes }
  }
  it('draws atoms, and stops them once they leave', () => {
    const { editor, host, stop } = setup('a @[item:ab12cd]')
    expect(host.querySelector('.aa-atom')?.textContent).toBe('Title')
    editor.value = 'nothing'
    expect(stop).toHaveBeenCalledTimes(1)
    editor.destroy()
  })
  it('replaces by offsets into the Markdown, across blocks and bullets', () => {
    const { editor, changes } = setup('one\n\n- a\n- b')
    editor.replace(7, 7, 'x')
    expect(editor.value).toBe('one\n\n- xa\n- b')
    const value = editor.value
    editor.replace(value.indexOf('b'), value.indexOf('b') + 1, '@[item:ab12cd] ')
    expect(editor.value).toBe('one\n\n- xa\n- @[item:ab12cd] ')
    expect(changes).toHaveLength(2)
    editor.undo()
    expect(editor.value).toBe('one\n\n- xa\n- b')
    editor.destroy()
  })
  it('says where the selection is in the Markdown', () => {
    const { editor, host } = setup('one\n\n- a\n- b')
    const bullet = host.children[2] as HTMLElement
    bullet.focus()
    window.getSelection()!.setBaseAndExtent(bullet.lastChild!, 1, bullet.lastChild!, 1)
    expect(editor.selection()).toEqual({ start: 12, end: 12 })
    editor.destroy()
  })
})
