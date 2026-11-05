// How fast Aa is, in a real browser on the built library. Main-thread time per
// key comes from Chromium's own counters, so it holds everything a key costs:
// handlers, style, layout and the selectionchange work that follows.
// `node tests/browser/bench.mjs [--dist=path] [--json=path]`
import { playwright, serve } from './lib.mjs'

const line = i => `Sentence ${i} has **bold words**, some *italic*, a [link](https://example.com/${i}) and \`code\` among plain words that fill out the line as writing does, then go on a little longer so the block wraps.`
export function document(blocks) {
  const out = []
  for (let i = 0; i < blocks; i++) {
    const kind = i % 10
    if (kind === 0) out.push(`## Heading ${i}`)
    else if (kind < 5) out.push(line(i))
    else if (kind < 8) out.push(`- Bullet ${i} with **some** words`)
    else if (kind === 8) out.push(`> A quote ${i} with <span color="blue">colour</span>`)
    else out.push(`- [ ] A task ${i}`)
  }
  return out.join('\n\n')
}

const dist = process.argv.find(a => a.startsWith('--dist='))?.slice(7)
const json = process.argv.find(a => a.startsWith('--json='))?.slice(7)
const SIZES = [200, 2000, 10000]
const KEYS = 120, BUDGET = 25000
const pw = playwright(), server = await serve(dist)
const browser = await pw.chromium.launch({ headless: true })
const page = await (await browser.newContext()).newPage()
await page.goto(server.url)
await page.waitForFunction(() => window.ready)
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const median = values => [...values].sort((a, b) => a - b)[values.length >> 1]
const worst = values => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)]

/** Main-thread milliseconds a key costs, over `count` presses. */
async function cost(press, wanted) {
  const before = await metric(), started = Date.now()
  let count = 0
  // A document too slow to finish still gets its number: it stops at the budget.
  while (count < wanted && Date.now() - started < BUDGET) await press(count++)
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => setTimeout(done))))
  const after = await metric()
  return { presses: count, task: (after.TaskDuration - before.TaskDuration) * 1000 / count, script: (after.ScriptDuration - before.ScriptDuration) * 1000 / count, layout: ((after.LayoutDuration - before.LayoutDuration) + (after.RecalcStyleDuration - before.RecalcStyleDuration)) * 1000 / count }
}
const load = value => page.evaluate(value => { const t = performance.now(); window.make(value); document.documentElement.offsetHeight; return performance.now() - t }, value)
const row = ({ name, ...r }) => console.log(name.padEnd(22), Object.entries(r).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(1) : v}`).join('  '))

async function measure(name, value, caretBlock) {
  const loads = []
  for (let i = 0; i < 2; i++) loads.push(await load(value))
  await page.evaluate(index => { const block = document.querySelectorAll('#host .aa-block')[index]; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(range); window.__t = []; if (!window.__timed) { window.__timed = true; let t0 = 0; window.addEventListener('keydown', () => { t0 = performance.now() }, true); window.addEventListener('input', () => { document.documentElement.offsetHeight; window.__t.push(performance.now() - t0) }) } }, caretBlock)
  await page.waitForTimeout(50)
  const keys = await cost(async i => page.keyboard.press(i % 7 === 6 ? 'Space' : 'a'), KEYS)
  const held = await page.evaluate(() => window.__t.slice())
  const arrows = await cost(async i => page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'), 60)
  const enter = await cost(async i => page.keyboard.press(i % 2 ? 'Backspace' : 'Enter'), 40)
  return { name, load: median(loads), key: keys.task, keyScript: keys.script, keyLayout: keys.layout, keyP50: median(held), keyP95: worst(held), keys: keys.presses, arrow: arrows.task, enter: enter.task, enters: enter.presses }
}

const results = []
for (const size of SIZES) { results.push(await measure(`${size} blocks`, document(size), Math.floor(size / 2) + 1)); row(results.at(-1)) }
results.push(await measure('one 200 kB paragraph', Array.from({ length: 1000 }, (_, i) => line(i)).join(' '), 0)); row(results.at(-1))
if (json) (await import('node:fs')).writeFileSync(json, JSON.stringify(results, null, 2))
await browser.close(); server.close(); process.exit(0)
