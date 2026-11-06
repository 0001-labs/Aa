import { describe, expect, it } from 'vite-plus/test'
import { createImageAtom, imageAtom } from '../src/atoms'

for (const [name, atom, caption] of [
  ['default', imageAtom, true],
  ['factory default', createImageAtom(), true],
  ['captionless', createImageAtom({ caption: false }), false],
] as const) describe(name, () => {
  it('preserves image alt and authored width', () => {
    const element = document.createElement('span')
    atom.draw?.(element, '![Harbour view](https://example.invalid/photo.png "w12")')
    expect(element.querySelector('img')?.alt).toBe('Harbour view')
    expect(element.dataset.width).toBe('12')
    expect(Boolean(element.querySelector('.aa-caption'))).toBe(caption)
    expect(element.querySelector('.aa-picture-grip')).not.toBeNull()
  })
  it('preserves media accessible labels', () => {
    const element = document.createElement('span')
    atom.draw?.(element, '![Harbour view](https://example.invalid/video.mp4)')
    expect(element.querySelector('video')?.getAttribute('aria-label')).toBe('Harbour view')
    expect(Boolean(element.querySelector('.aa-caption'))).toBe(caption)
  })
})
