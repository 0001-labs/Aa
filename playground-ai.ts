import type { Corrector, PromptAnswer, Prompter } from './src/index'

// The playground's and the documentation's AI: neither has a sign-in, so Ezo's server answers them
// within one small allowance everyone shares. A product makes these calls with its own backend.

/**
 * The playground has no sign-in, so its words are corrected by Ezo's server
 * within one small allowance everyone here shares (`aiCorrection:playground`).
 */
export const correct: Corrector = async (text, { before, after, signal }) => {
  const response = await fetch('https://first-impala-987.convex.cloud/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ path: 'aiCorrection:playground', args: { text, before, after }, format: 'json' }),
  })
  const result = await response.json() as { status?: string; value?: unknown }
  if (result.status !== 'success' || typeof result.value !== 'string') throw new Error('Not corrected')
  return result.value
}

/**
 * Asking AI the same way: Ezo's server answers the playground within one
 * allowance everyone here shares (`aiPrompt:playground`), with the whole
 * document as it should be for writing, and the diagram written again for a diagram.
 */
export const prompt: Prompter = async (said, { kind, text, before = '', after = '', document, signal }) => {
  const response = await fetch('https://first-impala-987.convex.cloud/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ path: 'aiPrompt:playground', args: { kind, prompt: said, text: text.slice(0, 8000), before: before.slice(-4000), after: after.slice(0, 4000), ...(document !== undefined && document.length <= 24000 ? { document } : {}) }, format: 'json' }),
  })
  const result = await response.json() as { status?: string; value?: unknown }
  if (result.status !== 'success' || !result.value || (typeof result.value !== 'string' && typeof result.value !== 'object')) throw new Error('Not answered')
  return result.value as string | PromptAnswer
}
