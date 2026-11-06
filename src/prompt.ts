/**
 * Asking AI where the words are: Space in an empty block (or on a diagram's
 * board) opens a prompt in its place, written in a live colour so it reads as
 * something said to the AI rather than written into the page; Space again,
 * before anything is written, listens instead, the words heard set in
 * italics as they come. Enter sends
 * it: the prompt glistens while it waits, and so does the writing it is
 * about, then the answer takes the prompt's place, one step to undo. Escape,
 * or Backspace in an empty prompt, puts it away.
 *
 * The product answers (`prompt` in the editor's options): Aa decides when to
 * ask, what it is about and where the answer goes, never which model.
 * Nothing here is part of the document: the prompt stands over the page.
 */

import { breatheDot, listeningFailure, recognition, type SpeechRecognitionLike } from './dictation'
import { glisten, lightness } from './shimmer'
import { word } from './words'

/**
 * Asked with what the person said and what it is about. For writing it
 * answers with edits to what is already written (each an exact passage and
 * what it becomes) and new writing to stand where the prompt is, either or
 * both, or with Markdown alone to put there; for a diagram, with the
 * diagram written again.
 */
export type Prompter = (prompt: string, context: PromptContext) => Promise<string | PromptAnswer>

/**
 * What a prompt about writing does: the whole `document` as it should be
 * afterwards (`PROMPT_HERE` left where new writing would go, or taken out);
 * or `edits` in place and `insert` where the prompt stood.
 */
export type PromptAnswer = { document?: string; edits?: { find: string; replace: string }[]; insert?: string }


export type PromptContext = {
  /** Writing: the answer takes an empty block's place. Diagram: the answer is the diagram written again. */
  kind: 'writing' | 'diagram'
  /** What the prompt is about: the writing around it, or the diagram's words. */
  text: string
  /** For writing: the Markdown before and after the prompt's block. */
  before?: string
  after?: string
  /** For writing: the whole document, `PROMPT_HERE` standing on its own line where the prompt is. */
  document?: string
  signal: AbortSignal
}

export type PromptOptions = {
  /** Where the prompt stands: the empty block's place, or the board's. */
  place: () => DOMRect
  /** How far in its first line starts: at the caret, in a paragraph, so the lines after it start at the paragraph's edge as its own lines do. */
  indent?: number
  /** The element whose type the prompt is set in. */
  type: Element
  /** What to say before anything is written. */
  placeholder?: string
  /** Start listening at once (Space twice). */
  listen?: boolean
  /** The writing to glisten while the answer is awaited. */
  about: () => Element[]
  /** Sends it, and puts the answer in. */
  send: (prompt: string, signal: AbortSignal) => Promise<void>
  /** The prompt's height as it grows, to keep room for it in the page so what is under it moves down; 0 once it is put away. */
  grow?: (height: number) => void
  /** Put away, sent or not; `sent` once the answer is in. */
  close: (sent: boolean) => void
  root?: Element
}

export type OpenPrompt = { readonly element: HTMLElement; close(): void }

/** A prompt over the page, focused, until it is sent or put away. */
export function openPrompt(options: PromptOptions): OpenPrompt {
  const doc = options.type.ownerDocument
  const view = doc.defaultView!
  const field = doc.createElement('div')
  field.className = 'aa-prompt'
  field.setAttribute('role', 'textbox')
  field.setAttribute('aria-label', word('Ask AI'))
  field.dataset.placeholder = options.placeholder ?? word('Ask AI or press space to speak')
  field.spellcheck = false
  try { field.contentEditable = 'plaintext-only' } catch { field.contentEditable = 'true' }
  if (field.contentEditable !== 'plaintext-only') field.contentEditable = 'true'
  const style = view.getComputedStyle(options.type)
  for (const property of ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height']) field.style.setProperty(property, style.getPropertyValue(property))
  const light = lightness(style.color)
  if (light !== null && light > 0.5) field.dataset.dark = ''
  const root = options.root ?? doc.body
  root.append(field)
  // The page makes room for the prompt as it grows, so nothing under it is covered.
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => options.grow?.(field.offsetHeight))
  resize?.observe(field)
  // In the page the prompt stands on the page itself, so it goes with its
  // block as the page scrolls, under a phone's keyboard too, where what is
  // fixed to the viewport drifts; in a dialog it is fixed, as the dialog is.
  const inPage = root === doc.body
  if (inPage) field.dataset.placed = 'page'
  const origin = () => {
    if (!inPage) return { x: 0, y: 0 }
    if (view.getComputedStyle(root).position !== 'static') { const box = root.getBoundingClientRect(); return { x: -box.left - root.clientLeft, y: -box.top - root.clientTop } }
    return { x: view.scrollX, y: view.scrollY }
  }
  const place = () => {
    const rect = options.place(), at = origin()
    Object.assign(field.style, { left: `${rect.left + at.x}px`, top: `${rect.top + at.y}px`, width: `${Math.max(rect.width, 80)}px`, minHeight: `${rect.height}px`, textIndent: options.indent ? `${options.indent}px` : '' })
  }
  place()
  field.focus({ preventScroll: true })

  let closed = false
  let sending: AbortController | null = null
  let stopGlisten = () => {}
  let listening: SpeechRecognitionLike | null = null
  let heard: HTMLElement | null = null
  /**
   * While listening, the caret is a dot a space after the words heard, where
   * typing would go on: a mark in the line itself, so it follows the words as
   * they come. Standing still it breathes, very slightly: a slow pulse of its
   * opacity mixed with the microphone's level, never its size; carried along
   * by the words it holds steady (`breatheDot`); still where less motion is
   * asked for.
   */
  let dot: HTMLElement | null = null
  let level: { frame: number; stop: () => void } | null = null
  /** The caret just before the dot, so what is typed goes on from the words heard. */
  const caretAtDot = () => {
    if (!dot) return
    const range = doc.createRange(); range.setStartBefore(dot); range.collapse(true)
    const selection = view.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  }
  /** Whether words have come: then a space stands before the dot and it rests. */
  const worded = () => { if (dot) dot.toggleAttribute('data-after', !!text()) }
  const stopDot = () => {
    dot?.remove(); dot = null
    if (level) { level.stop(); level = null }
  }
  /** The dot's breath at once, and the voice's level once listening has the microphone. */
  const breathe = () => {
    if (!dot) return null
    const breath = breatheDot(dot, view)
    level = { frame: 0, stop: breath.stop }
    return breath.followVoice
  }

  const text = () => (field.textContent ?? '').replace(/\s+/g, ' ').trim()
  const close = (sent = false) => {
    if (closed) return
    closed = true
    sending?.abort()
    listening?.abort()
    stopDot()
    stopGlisten()
    resize?.disconnect()
    field.remove()
    options.grow?.(0)
    view.removeEventListener('scroll', place, true)
    view.removeEventListener('resize', place)
    options.close(sent)
  }

  /** Words heard as they come, in italics: the last ones still being heard, fainter. */
  const listen = () => {
    const speech = recognition()
    if (!speech) { field.dataset.placeholder = word('Speaking is not available in this browser'); return }
    listening = speech
    field.dataset.listening = ''
    dot = Object.assign(doc.createElement('span'), { className: 'aa-prompt-caret', contentEditable: 'false' })
    dot.setAttribute('aria-hidden', 'true')
    field.append(dot)
    worded()
    caretAtDot()
    field.dataset.placeholder = word('Listening…')
    speech.lang = doc.documentElement.lang || navigator.language
    speech.continuous = true
    speech.interimResults = true
    let failure: string | null = null
    speech.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const words = result[0]?.transcript ?? ''
        // Words still arriving are locked; what has been heard is the person's to change.
        heard ??= Object.assign(doc.createElement('i'), { className: 'aa-prompt-heard', contentEditable: 'false' })
        if (!heard.isConnected) dot ? dot.before(heard) : field.append(heard)
        // Never a space of its own at the end: the dot keeps exactly one after the last word.
        heard.textContent = `${heard.previousSibling && !/\s$/.test(heard.previousSibling.textContent ?? '') ? ' ' : ''}${words.trim()}`
        if (result.isFinal) {
          heard.removeAttribute('class')
          heard.removeAttribute('contenteditable')
          heard.textContent = `${text() && !/\s$/.test(field.textContent ?? '') && heard.previousSibling ? ' ' : ''}${words.trim()}`
          heard = null
        }
      }
      worded()
      // A caret left at the dot stays after the words heard; a selection elsewhere in the prompt is the person's, and stays.
      const selection = view.getSelection()
      const away = !!selection?.rangeCount && field.contains(selection.anchorNode) && !(selection.isCollapsed && dot && selection.anchorNode === field && field.childNodes[selection.anchorOffset] === dot)
      if (!away) caretAtDot()
    }
    speech.onend = () => { listening = null; stopDot(); delete field.dataset.listening; field.dataset.placeholder = failure ?? options.placeholder ?? word('Ask AI to write') }
    // Never failing silently: what went wrong is said where the words would be.
    speech.onerror = event => { failure = listeningFailure(event.error) ?? failure; speech.onend?.() }
    // Started first and alone, within the key's own press, so the browser asks for the microphone once.
    try { speech.start() } catch { failure = word('Speaking could not start here'); speech.onend?.(); return }
    const followVoice = breathe()
    if (followVoice) speech.onaudiostart = () => { void followVoice() }
  }

  const send = async () => {
    const prompt = text()
    if (!prompt || sending) return
    listening?.stop()
    sending = new AbortController()
    field.contentEditable = 'false'
    field.dataset.loading = ''
    field.setAttribute('aria-busy', 'true')
    // The prompt glistens as it waits, and so does what it is about.
    stopGlisten = glisten([field, ...options.about()])
    try {
      await options.send(prompt, sending.signal)
      close(true)
    } catch {
      if (closed) return
      // Not answered: the prompt stays, to send again or put away.
      stopGlisten()
      sending = null
      delete field.dataset.loading
      field.removeAttribute('aria-busy')
      field.dataset.failed = ''
      field.contentEditable = 'plaintext-only'
      if (field.contentEditable !== 'plaintext-only') field.contentEditable = 'true'
      field.focus({ preventScroll: true })
    }
  }

  field.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.isComposing) return
    delete field.dataset.failed
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); return }
    if (event.key === 'Backspace' && !field.textContent) { event.preventDefault(); close(); return }
    // Space again, before anything is written: listen rather than type.
    if (event.key === ' ' && !field.textContent && !listening) { event.preventDefault(); listen() }
  })
  // A phone's keyboard may say the Space in beforeinput alone, its keydown unnamed: the same there.
  field.addEventListener('beforeinput', event => {
    event.stopPropagation()
    if (event.isComposing || listening || field.textContent) return
    if (event.inputType === 'insertText' && (event.data === ' ' || event.data === '\u00a0')) { event.preventDefault(); listen() }
  })
  for (const type of ['keyup', 'keypress', 'input', 'paste', 'cut', 'copy', 'pointerdown', 'click'] as const) field.addEventListener(type, event => event.stopPropagation())
  field.addEventListener('blur', () => { if (!sending && !listening && !text()) close() })
  view.addEventListener('scroll', place, true)
  view.addEventListener('resize', place)
  if (options.listen) listen()
  return { element: field, close: () => close() }
}

