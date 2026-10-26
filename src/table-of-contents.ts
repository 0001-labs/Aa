import { blockRuns, type Block } from './markdown'
import './vendor/ds1/3-unit/ds-table-of-contents'
import { configureI18n } from './vendor/ds1/0-face/i18n'
import { word } from './words'

// This library's copy must not fetch product translations or change its page's language.
configureI18n({ autoLoad: false, persist: false, langTarget: false })

/** A document-local outline. Generated words never become part of the Markdown. */
export function createTableOfContents(element: HTMLElement, blocks: () => readonly Block[], target: HTMLElement, navigate: (index: number) => void): () => void {
  element.classList.add('aa-toc')
  element.setAttribute('data-aa-interactive', '')
  const navigation = document.createElement('ds-table-of-contents')
  navigation.label = word('Table of contents')
  navigation.literal = true
  navigation.target = target
  const empty = document.createElement('span')
  empty.className = 'aa-toc-empty'
  empty.textContent = word('Add headings to show them here.')
  element.append(navigation, empty)
  const prefix = `aa-heading-${crypto.randomUUID()}`
  let nextId = 0
  let previous = ''
  const update = () => {
    const headings = blocks().flatMap((block, index) => {
      if (block.kind !== 'heading') return []
      const text = blockRuns(block).filter(run => run.kind === 'text').map(run => block.source.slice(run.from, run.to)).join('').trim()
      if (!text) return []
      const heading = target.children[index] as HTMLElement | undefined
      if (!heading) return []
      // Multiple contents blocks share a heading's existing ID. Separate
      // editor instances get distinct IDs, even for identical heading names.
      if (!heading.id) heading.id = `${prefix}-${nextId++}`
      return [{ index, text, level: block.level ?? 1, id: heading.id }]
    })
    const signature = JSON.stringify(headings)
    if (signature !== previous) {
      previous = signature
      const base = Math.min(...headings.map(heading => heading.level))
      navigation.replaceChildren(...headings.map(heading => {
        const link = document.createElement('a')
        link.href = `#${heading.id}`
        link.dataset.depth = String(heading.level - base)
        link.textContent = heading.text
        link.addEventListener('click', event => {
          // The editor owns its caret and the host app owns the URL.
          event.preventDefault(); event.stopPropagation(); navigate(heading.index)
        })
        return link
      }))
      empty.hidden = !!headings.length
    }
    navigation.refresh?.()
  }
  return update
}
