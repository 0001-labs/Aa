import { atomPattern } from './markdown'
import './vendor/ds1/2-core/ds-button'

export const BUTTON_STATES = ['default', 'primary', 'secondary', 'active', 'disabled', 'danger'] as const
export type ButtonState = typeof BUTTON_STATES[number]
export type ButtonPartial = { label: string; state: ButtonState }
const pattern = /@Button\(("(?:[^"\\\n]|\\.)*"),\s*"(default|primary|secondary|active|disabled|danger)"\)/

export function readButtonPartial(source: string): ButtonPartial | null {
  const match = pattern.exec(source)
  if (!match || match[0] !== source) return null
  try {
    const label: unknown = JSON.parse(match[1])
    return typeof label === 'string' && !/[\r\n]/.test(label) ? { label, state: match[2] as ButtonState } : null
  } catch { return null }
}
export function writeButtonPartial({ label, state }: ButtonPartial): string {
  return `@Button(${JSON.stringify(label.replace(/[\r\n]/g, ' '))}, "${state}")`
}
export const BUTTON_PARTIAL = atomPattern('button-partial', pattern, match => !!readButtonPartial(match[0]))

export function paintButton(button: HTMLElementTagNameMap['ds-button'], value: ButtonPartial) {
  button.textContent = value.label
  for (const state of BUTTON_STATES) if (state !== 'default') button[state] = value.state === state
  button.literal = true
}

