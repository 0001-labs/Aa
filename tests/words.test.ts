import { afterEach, expect, test } from 'vite-plus/test'
import { createEditor } from '../src/editor'
import { commentsLabel, relativeTime } from '../src/comments'
import { setAaWords, word } from '../src/words'
import { da } from '../src/translations/da'

const TRANSLATOR = Symbol.for('design-system-1.translate')
afterEach(() => { document.documentElement.lang = ''; setAaWords(null); delete (globalThis as unknown as Record<symbol, unknown>)[TRANSLATOR]; document.body.replaceChildren() })

test('reads English without a language, and the page’s language when Aa has its words', () => {
 expect(word('Bold')).toBe('Bold')
 document.documentElement.lang = 'da'
 expect(word('Bold')).toBe('Fed')
 expect(word('React with {emoji}', { emoji: '👍' })).toBe('Reagér med 👍')
 document.documentElement.lang = 'da-DK'
 expect(word('Reply')).toBe('Svar')
 document.documentElement.lang = 'fi'
 expect(word('Reply')).toBe('Reply')
})

test('a product’s own words come first, then Design system 1’s translate, then Aa’s table', () => {
 document.documentElement.lang = 'da'
 ;(globalThis as unknown as Record<symbol, unknown>)[TRANSLATOR] = (key: string) => key === 'Cancel' ? 'Fortryd' : key
 expect(word('Cancel')).toBe('Fortryd')
 expect(word('Bold')).toBe('Fed')
 setAaWords({ Bold: 'Tyk' })
 expect(word('Bold')).toBe('Tyk')
 setAaWords((words, language) => language === 'da' && words === 'Italic' ? 'Skrå' : undefined)
 expect(word('Italic')).toBe('Skrå')
 expect(word('Bold')).toBe('Fed')
})

test('a Danish page draws the editor’s own words in Danish', () => {
 document.documentElement.lang = 'da'
 const host = document.createElement('div'); document.body.append(host)
 const editor = createEditor(host, { value: 'Fed tekst', toolbar: true })
 try {
  editor.selectRange(0, 3); host.dispatchEvent(new Event('aa-selectionchange'))
  const labels = [...document.querySelectorAll('aa-toolbar button')].map(button => button.getAttribute('aria-label'))
  expect(labels).toContain('Fed'); expect(labels).toContain('Kursiv'); expect(labels).not.toContain('Bold')
  expect(document.querySelector('aa-toolbar')?.getAttribute('aria-label')).toBe('Tekstformatering')
  expect(host.style.getPropertyValue('--aa-heading-word')).toBe('"Overskrift"')
 } finally { editor.destroy() }
})

test('tells times and counts in the page’s language', () => {
 const now = new Date(2026, 9, 26, 12).getTime()
 expect(relativeTime(now - 3 * 60000, now)).toBe('3 minutes ago')
 document.documentElement.lang = 'da'
 expect(relativeTime(now - 3 * 60000, now)).toBe('for 3 minutter siden')
 expect(relativeTime(now - 26 * 3600000, now)).toBe('i går')
 expect(commentsLabel(2, 1)).toBe('2 kommentarer · 1 løst')
})

test('every Danish word keeps the placeholders of its English key', () => {
 for (const [english, danish] of Object.entries(da)) expect(danish.match(/\{\w+\}/g)?.sort(), english).toEqual(english.match(/\{\w+\}/g)?.sort())
})
