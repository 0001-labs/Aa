import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

const css = readFileSync('src/aa.css', 'utf8')
const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0]
const luminance = (hex: string) => {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map(channel => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('AI text contrast', () => {
  it('uses text ink independent of a workspace focus colour, passing 4.5:1 on light and dark paper', () => {
    const prompt = rule('.aa-prompt')
    expect(prompt).not.toContain('--ds-focus-ring')
    const colors = /light-dark\((#[a-f\d]+), (#[a-f\d]+)\)/i.exec(prompt)!
    expect(colors).not.toBeNull()
    for (const paper of ['#ffffff', '#fafafa', '#f3f3f3']) expect(contrast(colors[1], paper)).toBeGreaterThanOrEqual(4.5)
    for (const paper of ['#2a2a2a', '#333333']) expect(contrast(colors[2], paper)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps placeholder and interim speech fully opaque, and uses the same ink while waiting', () => {
    for (const selector of ['.aa-prompt:empty::before', '.aa-prompt .aa-prompt-heard']) {
      expect(rule(selector)).not.toMatch(/opacity:\s*0\./)
    }
    expect(rule('[data-aa-glisten]')).not.toContain('--ds-accent-color')
    expect(rule('[data-aa-glisten]')).toContain('--aa-prompt')
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-aa-glisten\][^}]+/)![0]).toContain('animation: none')
  })
})
