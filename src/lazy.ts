/** Code in a file of its own, beside aa.js, loaded the first time it is needed; from then on it is here at once. */
export function lazy<T>(load: () => Promise<T>) {
  let loaded: T | undefined
  const get = async () => loaded ??= await load()
  return {
    get, here: () => loaded,
    /** Runs `start` as soon as the code is here; what it returns stops it, and stopping first means it never starts. */
    when(start: (code: T) => (() => void) | void): () => void {
      if (loaded) return start(loaded) ?? (() => {})
      let stop: (() => void) | void, stopped = false
      void get().then(code => { if (!stopped) stop = start(code) })
      return () => { stopped = true; stop?.() }
    },
  }
}
