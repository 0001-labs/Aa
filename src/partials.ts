import type { Editor } from './editor'
import type { Atom } from './atoms'
import type { Block } from './markdown'
import { BUTTON_PARTIAL, readButtonPartial } from './button-partial'
import { lazy } from './lazy'

/** Design system 1's components, on their own: a file beside aa.js, loaded the first time a document needs one. */
const components = lazy(() => import('./components'))
export const loadComponents = components.get
const whenLoaded = components.when

/** A real component used as an illustration; its label stands in until the component has loaded. */
export const buttonPartialAtom = (canWrite: () => boolean): Atom => ({ ...BUTTON_PARTIAL, draw(element, source) {
  element.textContent = readButtonPartial(source)?.label ?? ''
  return whenLoaded(({ drawButtonPartial }) => { element.textContent = ''; return drawButtonPartial(element, source, canWrite) })
} })

export const createPartialPicker = (editor: Editor) => whenLoaded(({ createPartialPicker }) => createPartialPicker(editor))

/** A document-local outline, drawn once its component has loaded; the update it gives waits with it. */
export function createTableOfContents(element: HTMLElement, blocks: () => readonly Block[], target: HTMLElement, navigate: (index: number) => void): () => void {
  let update = () => {}
  whenLoaded(({ createTableOfContents }) => { update = createTableOfContents(element, blocks, target, navigate); update() })
  return () => update()
}
