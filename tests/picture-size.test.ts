import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor'
import { blockRuns, parseBlocks, readPicture, writePicture } from '../src/markdown'

describe('a picture\'s width', () => {
  it('is written in squares as the picture\'s title, and read back', () => {
    expect(writePicture('A lake', 'lake.jpg', 12)).toBe('![A lake](lake.jpg "w12")')
    expect(writePicture('A lake', 'lake.jpg', null)).toBe('![A lake](lake.jpg)')
    expect(readPicture('![A lake](lake.jpg "w12")')).toEqual({ alt: 'A lake', src: 'lake.jpg', width: 12 })
    expect(readPicture('![A lake](lake.jpg)')).toEqual({ alt: 'A lake', src: 'lake.jpg', width: null })
    // One picture, drawn whole, with or without a width.
    expect(blockRuns(parseBlocks('![A lake](lake.jpg "w12")')[0]).filter(run => run.kind === 'atom').map(run => run.atom)).toEqual(['image'])
  })

  it('is drawn in squares, and a new one handed back from the grip is one step to undo', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = createEditor(host, { value: 'Above\n\n![A lake](lake.jpg)' })
    const atom = host.querySelector<HTMLElement>('.aa-atom[data-atom="image"]')!
    expect(atom.hasAttribute('data-width')).toBe(false)
    expect(atom.querySelector('.aa-picture-grip')).not.toBeNull()
    atom.dispatchEvent(new CustomEvent('aa-atom-source', { bubbles: true, detail: { source: '![A lake](lake.jpg "w8")' } }))
    expect(editor.value).toBe('Above\n\n![A lake](lake.jpg "w8")')
    const sized = host.querySelector<HTMLElement>('.aa-atom[data-atom="image"]')!
    expect(sized.dataset.width).toBe('8')
    expect(sized.style.getPropertyValue('--aa-picture-width')).toBe('8')
    editor.undo()
    expect(editor.value).toBe('Above\n\n![A lake](lake.jpg)')
    editor.destroy()
    host.remove()
  })
})
