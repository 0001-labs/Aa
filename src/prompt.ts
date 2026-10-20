/**
 * Asking AI where the words are: Space in an empty block (or on a diagram's
 * board) opens a prompt in its place, written in a live colour so it reads as
 * something said to the AI rather than written into the page; Space twice
 * listens instead, the words heard set in italics as they come. Enter sends
 * it: the prompt glistens while it waits, and so does the writing it is
 * about, then the answer takes the prompt's place, one step to undo. Escape,
 * or Backspace in an empty prompt, puts it away.
 *
 * The product answers (`prompt` in the editor's options): Aa decides when to
 * ask, what it is about and where the answer goes, never which model.
 * Nothing here is part of the document: the prompt stands over the page.
 */

import { lightness } from './shimmer'

/** Asked with what the person said and what it is about; answers with Markdown for writing, or a diagram's words for a diagram. */
export type Prompter = (prompt: string, context: PromptContext) => Promise<string>

export type PromptContext = {
  /** Writing: the answer takes an empty block's place. Diagram: the answer is the diagram written again. */
  kind: 'writing' | 'diagram'
  /** What the prompt is about: the writing around it, or the diagram's words. */
  text: string
  /** For writing: the Markdown before and after the prompt's block. */
  before?: string
  after?: string
  signal: AbortSignal
}

/** How long a second Space has to follow the first to listen instead. */
const TWICE = 400

type SpeechRecognitionLike = EventTarget & {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

/** The browser's speech recognition, where it has one. */
function recognition(): SpeechRecognitionLike | null {
  const view = globalThis as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  const Speech = view.SpeechRecognition ?? view.webkitSpeechRecognition
  return Speech ? new Speech() : null
}

export type PromptOptions = {
  /** Where the prompt stands: the empty block's place, or the board's. */
  place: () => DOMRect
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
  field.setAttribute('aria-label', 'Ask AI')
  field.dataset.placeholder = options.placeholder ?? 'Ask AI to write, or press Space again to speak'
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
  const place = () => {
    const rect = options.place()
    Object.assign(field.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${Math.max(rect.width, 80)}px`, minHeight: `${rect.height}px` })
  }
  place()
  field.focus({ preventScroll: true })
  const opened = Date.now()

  let closed = false
  let sending: AbortController | null = null
  let stopGlisten = () => {}
  let listening: SpeechRecognitionLike | null = null
  let heard: HTMLElement | null = null
  /**
   * While listening, the caret is a dot a space after the words heard, where
   * typing would go on: a mark in the line itself, so it follows the words as
   * they come, and it stays still while they do. Resting before any words,
   * it breathes in hue, a second hue laid over it fading in and out with a
   * slow breath and the microphone's level, by opacity alone; still where
   * less motion is asked for.
   */
  let dot: HTMLElement | null = null
  let level: { stream?: MediaStream; context?: AudioContext; frame: number } | null = null
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
    if (level) { cancelAnimationFrame(level.frame); level.stream?.getTracks().forEach(track => track.stop()); void level.context?.close(); level = null }
  }
  const breathe = async () => {
    if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !dot) return
    const shift = dot.querySelector<HTMLElement>('.aa-prompt-caret-hue')!
    level = { frame: 0 }
    let analyser: AnalyserNode | null = null
    const samples = new Float32Array(512)
    let eased = 0
    const start = performance.now()
    const step = (now: number) => {
      if (!dot || !level) return
      let opacity = 0
      if (!text()) {
        if (analyser) {
          analyser.getFloatTimeDomainData(samples)
          eased += (Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 8) - eased) * 0.15
        }
        // A slow breath, and the voice's level, each shifting the hue a little.
        opacity = 0.25 * (0.5 - 0.5 * Math.cos((now - start) / 2400 * 2 * Math.PI)) + 0.55 * eased
      }
      shift.style.opacity = opacity.toFixed(3)
      level.frame = requestAnimationFrame(step)
    }
    level.frame = requestAnimationFrame(step)
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!dot || !level) { stream.getTracks().forEach(track => track.stop()); return }
      const context = new AudioContext()
      analyser = context.createAnalyser()
      analyser.fftSize = samples.length
      context.createMediaStreamSource(stream).connect(analyser)
      Object.assign(level, { stream, context })
    } catch { /* the breath alone */ }
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
    if (!speech) { field.dataset.placeholder = 'Speaking is not available in this browser'; return }
    listening = speech
    field.dataset.listening = ''
    dot = Object.assign(doc.createElement('span'), { className: 'aa-prompt-caret', contentEditable: 'false' })
    dot.setAttribute('aria-hidden', 'true')
    dot.append(Object.assign(doc.createElement('span'), { className: 'aa-prompt-caret-hue' }))
    field.append(dot)
    worded()
    caretAtDot()
    void breathe()
    field.dataset.placeholder = 'Listening…'
    speech.lang = doc.documentElement.lang || navigator.language
    speech.continuous = true
    speech.interimResults = true
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
    speech.onend = () => { listening = null; stopDot(); delete field.dataset.listening; field.dataset.placeholder = options.placeholder ?? 'Ask AI to write' }
    speech.onerror = () => speech.onend?.()
    try { speech.start() } catch { speech.onend?.() }
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
    // Space twice, at once: listen rather than type.
    if (event.key === ' ' && !field.textContent && !listening && Date.now() - opened < TWICE) { event.preventDefault(); listen() }
  })
  for (const type of ['keyup', 'keypress', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'pointerdown', 'click'] as const) field.addEventListener(type, event => event.stopPropagation())
  field.addEventListener('blur', () => { if (!sending && !listening && !text()) close() })
  view.addEventListener('scroll', place, true)
  view.addEventListener('resize', place)
  if (options.listen) listen()
  return { element: field, close: () => close() }
}

/**
 * A light passing again and again through elements' letters while something
 * is worked on, as Ezo's harness glistens through an item's name: a band of
 * the accent blended onto the page, moved by transform alone. Gives back
 * what stops it.
 */
export function glisten(elements: readonly Element[], root?: Element): () => void {
  const pieces: HTMLElement[] = []
  for (const element of elements) {
    if (!element.isConnected) continue
    const doc = element.ownerDocument, view = doc.defaultView
    if (!view || view.matchMedia?.('(forced-colors: active)').matches) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const style = view.getComputedStyle(element)
    const piece = doc.createElement('div')
    piece.className = 'aa-glisten'
    piece.setAttribute('aria-hidden', 'true')
    const light = lightness(style.color)
    if (light !== null && light > 0.5) piece.dataset.dark = ''
    Object.assign(piece.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, animationDelay: `${(pieces.length % 6) * 120}ms` })
    ;(root ?? element.closest('dialog') ?? doc.body).append(piece)
    pieces.push(piece)
  }
  if (!pieces.length) return () => {}
  const view = pieces[0].ownerDocument.defaultView!
  // It is drawn where the words stood: a scroll or a new size moves them, so it goes.
  const done = () => {
    view.removeEventListener('scroll', done, true)
    view.removeEventListener('resize', done)
    for (const piece of pieces) piece.remove()
  }
  view.addEventListener('scroll', done, true)
  view.addEventListener('resize', done)
  return done
}
