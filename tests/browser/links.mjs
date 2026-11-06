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
  await page.evaluate(() => { window.make('See https://using.link now'); window.pickWords('using') })
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => { window.pickWords('https://using.link'); window.editor.color('purple') })
  check('painting a selected address colours it', (await inks())[0]?.[1] === reference, await page.evaluate(() => window.editor.value))
  await page.evaluate(() => { window.pickWords('https://using.link'); window.editor.color(null) })
  check('taking the colour off gives the address back', await page.evaluate(() => window.editor.value === 'See https://using.link now'), await page.evaluate(() => window.editor.value))
  await page.evaluate(() => { window.make('See https://using.link now'); window.pickWords('using'); window.editor.color('purple') })
  const parts = await inks()
  check('part of an address coloured keeps it all a link', parts.map(p => p[0]).join('') === 'https://using.link', await page.evaluate(() => window.editor.value))
  check('only that part wears the colour', parts.filter(p => p[1] === reference).map(p => p[0]).join('') === 'using', parts.map(p => p[0]).join(' / '))
  check('the reader sees only the address', await page.evaluate(() => window.visible() === 'See https://using.link now'), await page.evaluate(() => window.visible()))
  // The message that showed an address three times over, as Trello writes it.
  const blog = 'https://thailandtours.webirium.com/rejseblog/phuket-eller-krabi-hvilken-destination-er-den-rigtige-for-dig/'
  const pull = 'https://github.com/Pankado-kk/thailandtours/pull/143'
  const message = `Kan du tjekke det her?\n\n[${blog}](${blog} "‌")\n\nPR: [${pull}](${pull} "")\n\nSig til, hvis det må sættes live…`
  await page.evaluate(v => window.make(v), message)
  const read = () => page.evaluate(() => [...document.querySelectorAll('#host .aa-block')].map(block => block.innerText.trim()))
  const more = () => page.evaluate(() => getComputedStyle(document.querySelector('#host a.aa-link'), '::after').content === '"…"')
  const reads = await read()
  check('a long address reads short, on one link', reads[1].replace(/…$/, '') === 'thailandtours.webirium.com/rejseblog/phuket-eller-krabi' && await more(), reads[1])
  check('a link after words reads as its address', reads[2] === 'PR: github.com/Pankado-kk/thailandtours/pull/143', reads[2])
  check('no syntax shows', !/[\[\]()"]/.test(reads.join('')), reads.join(' | '))
  check('each is one link', await page.evaluate(() => document.querySelectorAll('#host a.aa-link').length) === 2)
  check('the document is untouched by the drawing', await page.evaluate(v => window.editor.value === v, message))
  check('the pointer reads the whole address', await page.evaluate(v => document.querySelector('#host a.aa-link').title === v, blog))
  const short = await page.evaluate(() => document.querySelector('#host a.aa-link').getBoundingClientRect().height)
  await page.locator('#host a.aa-link').first().click()
  check('the caret in a link brings the whole address back', (await read())[1] === blog, (await read())[1])
  check('the other link stays short', (await read())[2] === 'PR: github.com/Pankado-kk/thailandtours/pull/143', (await read())[2])
  await page.keyboard.press('ControlOrMeta+k')
  check('the link field shows the address alone', await page.evaluate(v => [...document.querySelectorAll('input')].some(input => input.value === v), blog))
  await page.keyboard.press('Escape')
  await page.locator('#host .aa-block').nth(0).click()
  check('leaving a link folds it again', /krabi…?$/.test((await read())[1]) && await more(), (await read())[1])
  check('the link stands no taller than it was', await page.evaluate(() => document.querySelector('#host a.aa-link').getBoundingClientRect().height) === short)
  await page.locator('#host .aa-block').nth(3).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Tak')
  check('typing elsewhere keeps the links as they are', await page.evaluate(() => window.editor.value.endsWith('live… Tak') && window.editor.value.includes('""')), await page.evaluate(() => window.editor.value.slice(-30)))
  await page.evaluate(() => window.make('Se https://example.com/side/ tak'))
  check('a bare address reads short too', (await read())[0] === 'Se example.com/side tak', (await read())[0])
  await page.locator('#host .aa-block').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('Home')
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.evaluate(() => new Promise(requestAnimationFrame)) }
  check('the arrow keys walk into an address and bring it back', (await read())[0] === 'Se https://example.com/side/ tak', (await read())[0])
  await page.keyboard.type('x')
  check('a letter typed in an address lands where the caret shows', await page.evaluate(() => window.editor.value === 'Se httxps://example.com/side/ tak'), await page.evaluate(() => window.editor.value))
  await page.evaluate(() => window.make('| Side | Adresse |\n| --- | --- |\n| Blog | https://www.example.com/ |'))
  check('an address in a table reads short', (await page.evaluate(() => document.querySelector('#host a.aa-link').innerText)) === 'example.com', await page.evaluate(() => document.querySelector('#host a.aa-link').innerText))
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nAll sturdy')
process.exit(failed ? 1 : 0)
