// A link wears the colour it is given, in a real browser: the colour has to win the
// cascade over the link's own rule, with or without a product's --aa-link.
import { playwright, serve } from './lib.mjs'

const engines = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit']
const pw = playwright(), server = await serve()
let failed = 0
for (const name of engines) {
  const browser = await pw[name].launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 620, height: 240 }, colorScheme: 'light' })).newPage()
  await page.goto(server.url); await page.waitForFunction(() => window.ready)
  const check = (what, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${what}${detail === '' ? '' : ` (${detail})`}`) }
  const reference = await page.evaluate(() => { window.make('<span color="purple">words</span>'); return getComputedStyle(document.querySelector('#host [data-color]')).color })
  const inks = () => page.evaluate(() => [...document.querySelectorAll('#host a.aa-link')].map(a => { const c = getComputedStyle(a); return [a.textContent, c.color, c.textDecorationColor, c.textDecorationLine] }))
  for (const value of ['<span color="purple">https://using.link</span>', '<span color="purple">[Using](https://using.link)</span>', '[<span color="purple">Using</span>](https://using.link)']) {
    await page.evaluate(v => window.make(v), value)
    const [[, color, line, decoration]] = await inks()
    check(`${value} shows purple`, color === reference && line === reference, color)
    check(`${value} stays underlined`, decoration.includes('underline'), decoration)
    check(`${value} hides its syntax`, await page.evaluate(() => !/[<>\[\]]/.test(window.visible())), await page.evaluate(() => window.visible()))
  }
  await page.evaluate(() => { document.documentElement.style.setProperty('--aa-link', 'rgb(1, 2, 3)'); window.make('[Plain](https://a.b) and <span color="purple">[Purple](https://a.b)</span>') })
  const [plain, purple] = await inks()
  check('--aa-link still colours a plain link', plain[1] === 'rgb(1, 2, 3)', plain[1])
  check('the colour beats --aa-link', purple[1] === reference, purple[1])
  await page.evaluate(() => document.documentElement.style.removeProperty('--aa-link'))
  await page.evaluate(() => { window.make('See https://using.link now'); window.pickWords('https://using.link'); window.editor.color('purple') })
  check('painting a selected address colours it', (await inks())[0]?.[1] === reference, await page.evaluate(() => window.editor.value))
  await page.evaluate(() => { window.pickWords('https://using.link'); window.editor.color(null) })
  check('taking the colour off gives the address back', await page.evaluate(() => window.editor.value === 'See https://using.link now'), await page.evaluate(() => window.editor.value))
  await page.evaluate(() => { window.make('See https://using.link now'); window.pickWords('using'); window.editor.color('purple') })
  const parts = await inks()
  check('part of an address coloured keeps it all a link', parts.map(p => p[0]).join('') === 'https://using.link', await page.evaluate(() => window.editor.value))
  check('only that part wears the colour', parts.filter(p => p[1] === reference).map(p => p[0]).join('') === 'using', parts.map(p => p[0]).join(' / '))
  check('the reader sees only the address', await page.evaluate(() => window.visible() === 'See https://using.link now'), await page.evaluate(() => window.visible()))
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
