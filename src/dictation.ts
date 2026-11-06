/** Listening: the browser's speech recognition, and the dot that breathes while it hears. */
import { word } from './words'

export type SpeechRecognitionLike = EventTarget & {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onaudiostart?: (() => void) | null
}

/** Safari asks again, or not at all, for a second use of the microphone beside its dictation: there the dot only breathes. */
const safari = typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent)

/** What went wrong with listening, in plain words, where the person can do something about it. */
export function listeningFailure(error: string | undefined): string | null {
  if (error === 'not-allowed') return word(safari ? 'The microphone is blocked: allow it for this site in Safari › Settings › Websites › Microphone' : 'The microphone is blocked: allow it for this site in the browser’s settings')
  if (error === 'service-not-allowed') return word(safari ? 'Turn on Dictation in System Settings › Keyboard to speak here' : 'Speaking is turned off in this browser')
  if (error === 'audio-capture') return word('No microphone was found')
  if (error === 'network') return word('Speaking needs a connection')
  if (error === 'no-speech') return word('Nothing was heard: press Space twice to try again')
  return null
}

/** The browser's speech recognition, where it has one. */
export function recognition(): SpeechRecognitionLike | null {
  const view = globalThis as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  const Speech = view.SpeechRecognition ?? view.webkitSpeechRecognition
  return Speech ? new Speech() : null
}

/** How long the dot stands still after the words last carried it before it breathes again, in milliseconds. */
export const SETTLE = 500

/**
 * The listening dot's opacity. Carried along by the words as they come, it is
 * steady, so it moves at one size and one strength; standing still, it is a
 * slow pulse (0 to 1) mixed with the voice's level (0 to 1), so it breathes and
 * brightens as the voice does.
 */
export function dotOpacity(moving: boolean, pulse: number, level: number): number {
  return moving ? 0.85 : Math.min(1, 0.55 + 0.3 * pulse + 0.3 * level)
}

/**
 * A listening dot's breath: its opacity, never its size. Standing still, a slow
 * pulse with the voice's level over it once `followVoice` has the microphone
 * (asked for only once dictation has it, never beside it in Safari, where the
 * pulse is alone). While the words carry it along it holds steady, the pulse
 * and the voice set aside, and it breathes again once it has stood still for
 * `SETTLE`, the pulse starting afresh. It eases between the two rather than
 * jumping. Still where less motion is asked for.
 */
export function breatheDot(dot: HTMLElement, view: Window): { followVoice: (() => Promise<void>) | null; stop(): void } {
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return { followVoice: null, stop: () => {} }
  let frame = 0, stopped = false, eased = 0, shown = dotOpacity(false, 0, 0)
  let analyser: AnalyserNode | null = null, stream: MediaStream | undefined, context: AudioContext | undefined
  const samples = new Float32Array(512)
  let start = performance.now(), movedAt = -Infinity, wasMoving = false
  let at: { x: number; y: number } | null = null
  const step = (now: number) => {
    if (stopped) return
    if (analyser) {
      analyser.getFloatTimeDomainData(samples)
      eased += (Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 8) - eased) * 0.15
    }
    // Where it stands: the words heard move it along the line, and down to the next.
    const rect = dot.getBoundingClientRect()
    if (at && (Math.abs(rect.left - at.x) > 0.5 || Math.abs(rect.top - at.y) > 0.5)) movedAt = now
    at = { x: rect.left, y: rect.top }
    const moving = now - movedAt < SETTLE
    // Standing still again, the pulse starts from its faintest, so it rises out of the steady dot.
    if (wasMoving && !moving) start = now
    wasMoving = moving
    const pulse = 0.5 - 0.5 * Math.cos((now - start) / 2400 * 2 * Math.PI)
    shown += (dotOpacity(moving, pulse, eased) - shown) * 0.12
    dot.style.opacity = shown.toFixed(3)
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return {
    followVoice: async () => {
      if (safari || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') return
      try {
        const heard = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (stopped) { heard.getTracks().forEach(track => track.stop()); return }
        stream = heard
        context = new AudioContext()
        analyser = context.createAnalyser()
        analyser.fftSize = samples.length
        context.createMediaStreamSource(heard).connect(analyser)
      } catch { /* the breath alone */ }
    },
    stop: () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); void context?.close() },
  }
}

/** Whether the browser can listen at all. */
export const canDictate = (): boolean => { const view = globalThis as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; return !!(view.SpeechRecognition ?? view.webkitSpeechRecognition) }

/**
 * Listening for a plain field (a comment's reply): everything heard so far, as
 * one run of words, each time more comes, and what went wrong when it ends.
 * Started within the key's own press, so the browser asks for the microphone once.
 */
export function dictate(options: { lang: string; heard: (words: string) => void; end: (failure: string | null) => void; audio?: () => void }): { stop(): void; abort(): void } | null {
  const speech = recognition()
  if (!speech) return null
  let failure: string | null = null, ended = false
  speech.lang = options.lang
  speech.continuous = true
  speech.interimResults = true
  speech.onresult = event => {
    let words = ''
    for (let index = 0; index < event.results.length; index++) words += event.results[index][0]?.transcript ?? ''
    options.heard(words.replace(/\s+/g, ' ').trim())
  }
  const end = () => { if (ended) return; ended = true; options.end(failure) }
  speech.onend = end
  speech.onerror = event => { failure = listeningFailure(event.error) ?? failure; end() }
  if (options.audio) speech.onaudiostart = options.audio
  try { speech.start() } catch { failure = word('Speaking could not start here'); end(); return null }
  return { stop: () => speech.stop(), abort: () => { speech.abort(); end() } }
}
